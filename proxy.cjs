'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const UPSTREAM_BASE = 'https://animetsu.live/v2';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://animetsu.live/';
const ORIGIN = 'https://animetsu.live';

// In-memory key cache: keyUrl -> Buffer(16)
const keyCache = {};

// ─── AniList → Animetsu ID Mapping ──────────────────────────────────────────
// The frontend uses AniList numeric IDs, but the upstream animetsu streaming
// endpoint requires its own internal hex IDs. This cache + resolver bridges
// the gap.
const _anilistToAnimetsuCache = {}; // anilistId -> animetsuId

/**
 * Resolves an AniList numeric ID to the upstream animetsu internal ID.
 * Steps:
 *   1. Check in-memory cache
 *   2. Get the anime title from AniList
 *   3. Search upstream animetsu by that title
 *   4. For each search result, fetch upstream info to find anilist_id match
 *   5. Cache and return the animetsu ID
 * @param {string|number} anilistId - AniList numeric ID
 * @returns {Promise<string|null>} animetsu internal ID or null if not found
 */
async function resolveAnimetsuId(anilistId) {
  const id = String(anilistId);
  if (_anilistToAnimetsuCache[id]) return _anilistToAnimetsuCache[id];

  try {
    // Step 1: Get anime title from AniList
    const anilistData = await fetchAniList(`
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          title { romaji english }
        }
      }
    `, { id: parseInt(id, 10) });

    const title = anilistData?.Media?.title?.romaji || anilistData?.Media?.title?.english;
    if (!title) {
      console.error(`[ID Resolve] No title found on AniList for ID ${id}`);
      return null;
    }

    // Step 2: Search upstream animetsu by title
    const searchUrl = `${UPSTREAM_BASE}/api/anime/search?query=${encodeURIComponent(title)}`;
    const searchBuf = await curlFetchRaw(searchUrl);
    let searchData;
    try {
      searchData = JSON.parse(searchBuf.toString('utf8'));
    } catch (e) {
      console.error(`[ID Resolve] Failed to parse upstream search response`);
      return null;
    }

    const results = searchData?.results || [];
    if (results.length === 0) {
      console.warn(`[ID Resolve] No upstream results for title "${title}"`);
      return null;
    }

    // Step 3: Check each result's info for matching anilist_id
    // Try exact title match first to minimize info fetches
    const titleLower = title.toLowerCase();
    const sortedResults = results.sort((a, b) => {
      const aMatch = (a.title?.romaji || '').toLowerCase() === titleLower ? 0 : 1;
      const bMatch = (b.title?.romaji || '').toLowerCase() === titleLower ? 0 : 1;
      return aMatch - bMatch;
    });

    for (const result of sortedResults.slice(0, 5)) {
      const infoUrl = `${UPSTREAM_BASE}/api/anime/info/${result.id}`;
      const infoBuf = await curlFetchRaw(infoUrl);
      let infoData;
      try {
        infoData = JSON.parse(infoBuf.toString('utf8'));
      } catch (e) {
        continue;
      }

      if (String(infoData?.anilist_id) === id) {
        console.log(`[ID Resolve] Mapped AniList ${id} → animetsu ${result.id} ("${title}")`);
        _anilistToAnimetsuCache[id] = result.id;
        return result.id;
      }
    }

    // Fallback: if no anilist_id match, use the first result with matching title
    const fallback = results.find(r =>
      (r.title?.romaji || '').toLowerCase() === titleLower ||
      (r.title?.english || '').toLowerCase() === titleLower
    );
    if (fallback) {
      console.warn(`[ID Resolve] Fallback title match: AniList ${id} → animetsu ${fallback.id} ("${title}")`);
      _anilistToAnimetsuCache[id] = fallback.id;
      return fallback.id;
    }

    console.error(`[ID Resolve] Could not map AniList ${id} to any upstream animetsu ID`);
    return null;
  } catch (err) {
    console.error(`[ID Resolve] Error resolving AniList ${id}:`, err.message);
    return null;
  }
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Range');
}

// ─── Fetch raw bytes via curl (no -i, pure body) ────────────────────────────
function curlFetchRaw(targetUrl) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s', '--max-time', '15',
      '-H', `User-Agent: ${USER_AGENT}`,
      '-H', `Referer: ${REFERER}`,
      '-H', `Origin: ${ORIGIN}`,
      '--http2',
      targetUrl
    ];
    const curl = spawn('curl', args);
    const chunks = [];
    curl.stdout.on('data', c => chunks.push(c));
    curl.stdout.on('end', () => resolve(Buffer.concat(chunks)));
    curl.stderr.on('data', () => {}); // suppress
    curl.on('error', reject);
  });
}

// ─── Fetch and cache the 16-byte AES key ────────────────────────────────────
async function fetchKey(keyUrl) {
  if (keyCache[keyUrl]) return keyCache[keyUrl];
  const buf = await curlFetchRaw(keyUrl);
  if (buf.length !== 16) throw new Error(`Bad key length ${buf.length} for ${keyUrl}`);
  keyCache[keyUrl] = buf;
  return buf;
}

// ─── Decrypt one TS segment buffer with AES-128-CBC ─────────────────────────
function decryptSegment(encBuf, keyBuf, ivHex) {
  const iv = Buffer.from(ivHex.padStart(32, '0'), 'hex');
  const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(encBuf), decipher.final()]);
}

// ─── Main curl streaming proxy ───────────────────────────────────────────────
// keyUrl / ivHex: when set, buffer the whole segment, decrypt, then send.
function makeCurlRequest(target, incomingHeaders, res, req, keyUrl, ivHex) {
  const args = [
    '-s', '-i', '-N',
    '-H', `User-Agent: ${USER_AGENT}`,
    '-H', `Referer: ${REFERER}`,
    '-H', `Origin: ${ORIGIN}`,
    '--http2'
  ];
  if (incomingHeaders['range']) args.push('-H', `Range: ${incomingHeaders['range']}`);
  args.push(target);

  const curl = spawn('curl', args);
  let isClosed = false;
  req.on('close', () => { isClosed = true; curl.kill('SIGKILL'); });

  let headerBuffer = Buffer.alloc(0);
  let parsedHeaders = false;
  let responseStatusCode = 200;
  let responseHeaders = {};
  let bodyBuffer = Buffer.alloc(0);
  let determinedType = false;
  let isPlaylist = false;

  // Decide type; for encrypted segments we always buffer everything
  const needsDecrypt = !!(keyUrl && ivHex);

  function flushHeaders() {
    const ct = responseHeaders['content-type'] || '';
    const isM3U8ct = ct.includes('mpegurl') || ct.includes('m3u8');
    const isM3U8ext = target.includes('.m3u8') || target.includes('m3u8');
    const magic = bodyBuffer.length >= 7
      ? bodyBuffer.slice(0, 7).toString('utf8') === '#EXTM3U'
      : false;
    isPlaylist = isM3U8ct || isM3U8ext || magic;
    determinedType = true;

    if (!isPlaylist && !needsDecrypt) {
      // Stream through immediately
      const outH = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'content-type': 'video/mp2t'
      };
      if (responseHeaders['content-length']) outH['content-length'] = responseHeaders['content-length'];
      if (responseHeaders['cache-control']) outH['cache-control'] = responseHeaders['cache-control'];
      res.writeHead(responseStatusCode, outH);
      if (bodyBuffer.length > 0) res.write(bodyBuffer);
    }
    // For playlists and decrypt-mode we keep buffering until end
  }

  curl.stdout.on('data', (chunk) => {
    if (isClosed || res.writableEnded) return;

    if (!parsedHeaders) {
      headerBuffer = Buffer.concat([headerBuffer, chunk]);
      while (true) {
        const idx = headerBuffer.indexOf('\r\n\r\n');
        if (idx === -1) break;
        const blockText = headerBuffer.slice(0, idx).toString('utf8');
        const lines = blockText.split('\r\n');
        const statusLine = lines[0] || '';
        if (statusLine.toUpperCase().startsWith('HTTP/')) {
          const m = statusLine.match(/HTTP\/[^\s]+ (\d+)/);
          const code = m ? parseInt(m[1], 10) : 200;
          if (code >= 100 && code < 200) { headerBuffer = headerBuffer.slice(idx + 4); continue; }
          responseStatusCode = code;
          responseHeaders = {};
          for (let i = 1; i < lines.length; i++) {
            const ci = lines[i].indexOf(':');
            if (ci !== -1) responseHeaders[lines[i].slice(0, ci).trim().toLowerCase()] = lines[i].slice(ci + 1).trim();
          }
          headerBuffer = headerBuffer.slice(idx + 4);
          parsedHeaders = true;
          break;
        } else { parsedHeaders = true; break; }
      }
      if (parsedHeaders && headerBuffer.length > 0) {
        bodyBuffer = Buffer.concat([bodyBuffer, headerBuffer]);
        headerBuffer = Buffer.alloc(0);
      }
      // For non-decrypt streams, flush headers once we have ≥ 1024 bytes or it looks like a playlist
      if (parsedHeaders && !determinedType && !needsDecrypt) {
        if (bodyBuffer.length >= 1024) flushHeaders();
        else if (bodyBuffer.length >= 7) {
          const magic = bodyBuffer.slice(0, 7).toString('utf8') === '#EXTM3U';
          if (magic) flushHeaders();
        }
      } else if (parsedHeaders && !determinedType && needsDecrypt) {
        determinedType = true; // just keep buffering
      }
    } else {
      // Headers already parsed
      if (!determinedType) {
        bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
        if (!needsDecrypt) {
          if (bodyBuffer.length >= 1024) flushHeaders();
        }
      } else if (isPlaylist || needsDecrypt) {
        // Still buffering
        bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
      } else {
        // Streaming segment through
        res.write(chunk);
      }
    }
  });

  curl.stdout.on('end', async () => {
    if (isClosed || res.writableEnded) return;

    if (!determinedType) flushHeaders();

    if (isPlaylist) {
      // ── Rewrite playlist ─────────────────────────────────────────────────
      const text = bodyBuffer.toString('utf8');
      const baseUrl = target.substring(0, target.lastIndexOf('/') + 1);

      let currentRawKeyUrl = null;
      let mediaSequence = 0;
      let segIdx = 0;
      let seqParsed = false;

      // First pass: get MEDIA-SEQUENCE
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (t.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
          mediaSequence = parseInt(t.slice('#EXT-X-MEDIA-SEQUENCE:'.length), 10) || 0;
          segIdx = mediaSequence;
          seqParsed = true;
          break;
        }
      }
      if (!seqParsed) segIdx = 0;

      const rewritten = text.split('\n').map((line) => {
        const trimmed = line.trim();
        if (trimmed === '') return line;

        if (trimmed.startsWith('#')) {
          // Remove EXT-X-KEY (we handle decryption server-side)
          if (trimmed.startsWith('#EXT-X-KEY:') && trimmed.includes('METHOD=AES-128')) {
            const uriMatch = trimmed.match(/URI="([^"]+)"/);
            if (uriMatch) {
              let kUri = uriMatch[1];
              if (!kUri.startsWith('http://') && !kUri.startsWith('https://')) {
                try { kUri = new URL(kUri, baseUrl).toString(); } catch (e) { kUri = baseUrl + kUri; }
              }
              currentRawKeyUrl = kUri;
            }
            return null; // strip line
          }
          // Rewrite URI= inside other tags (e.g. EXT-X-MAP)
          if (trimmed.includes('URI="')) {
            const us = trimmed.indexOf('URI="') + 5;
            const ue = trimmed.indexOf('"', us);
            if (us > 4 && ue > us) {
              const orig = trimmed.substring(us, ue);
              let abs = orig;
              if (!orig.startsWith('http://') && !orig.startsWith('https://')) {
                try { abs = new URL(orig, baseUrl).toString(); } catch (e) { abs = baseUrl + orig; }
              }
              const proxied = `http://${req.headers.host}/api/proxy/hls?url=${encodeURIComponent(abs)}`;
              return trimmed.substring(0, us) + proxied + trimmed.substring(ue);
            }
          }
          return line;
        }

        // Segment URL
        let abs = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          try { abs = new URL(trimmed, baseUrl).toString(); } catch (e) { abs = baseUrl + trimmed; }
        }
        let segUrl = `http://${req.headers.host}/api/proxy/hls?url=${encodeURIComponent(abs)}`;
        if (currentRawKeyUrl) {
          const iv = segIdx.toString(16).padStart(32, '0');
          segUrl += `&keyUrl=${encodeURIComponent(currentRawKeyUrl)}&iv=${iv}`;
        }
        segIdx++;
        return segUrl;
      }).filter(l => l !== null).join('\n');

      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(rewritten);

    } else if (needsDecrypt) {
      // ── Decrypt segment server-side ──────────────────────────────────────
      try {
        const keyBuf = await fetchKey(keyUrl);
        const decrypted = decryptSegment(bodyBuffer, keyBuf, ivHex);
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'content-type': 'video/mp2t',
          'content-length': String(decrypted.length),
          'cache-control': responseHeaders['cache-control'] || 'max-age=3600'
        });
        res.end(decrypted);
      } catch (err) {
        console.error('[Decrypt Error]', err.message, 'keyUrl:', keyUrl, 'iv:', ivHex);
        if (!res.headersSent) res.writeHead(502);
        res.end('Decryption failed: ' + err.message);
      }

    } else {
      res.end();
    }
  });

  curl.on('error', (err) => {
    console.error('curl spawn error:', err);
    if (isClosed || res.writableEnded) return;
    if (!res.headersSent) { res.writeHead(502); res.end('Proxy error: ' + err.message); }
  });
}

// ─── Upstream JSON helper ────────────────────────────────────────────────────
// ─── AniList GraphQL Integration ─────────────────────────────────────────────

// In-memory cache: cacheKey -> { data, expiry }
const _anilistCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function anilistCacheKey(query, variables) {
  return JSON.stringify({ q: query.trim().replace(/\s+/g, ' '), v: variables });
}

async function fetchAniList(query, variables = {}) {
  const key = anilistCacheKey(query, variables);

  // Return from cache if still fresh
  const cached = _anilistCache[key];
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  // Retry with backoff on 429
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s backoff
    }
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    });
    if (res.status === 429) {
      lastErr = new Error('AniList rate limited (429)');
      continue; // retry
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AniList error ${res.status}: ${errText}`);
    }
    const json = await res.json();
    // Store in cache
    _anilistCache[key] = { data: json.data, expiry: Date.now() + CACHE_TTL_MS };
    return json.data;
  }
  throw lastErr;
}

function formatStartDate(sd) {
  if (!sd || !sd.year) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!sd.month) return `${sd.year}`;
  if (!sd.day) return `${months[sd.month - 1]} ${sd.year}`;
  return `${months[sd.month - 1]} ${sd.day}, ${sd.year}`;
}

function mapAniListMedia(media) {
  if (!media) return null;
  return {
    id: media.id,
    mal_id: media.idMal || media.id,
    title: {
      english: media.title.english || media.title.romaji,
      romaji: media.title.romaji,
      native: media.title.native
    },
    cover_image: {
      large: media.coverImage?.large || media.coverImage?.extraLarge || ''
    },
    banner: media.bannerImage || media.coverImage?.extraLarge || '',
    average_score: media.averageScore || null,
    mean_score: media.averageScore || null,
    year: media.seasonYear || null,
    format: media.format || 'TV',
    isAdult: media.isAdult || false,
    status: media.status || 'FINISHED',
    total_eps: media.episodes || null,
    genres: media.genres || [],
    duration: media.duration || null,
    description: media.description || '',
    season: media.season || null,
    start_date: formatStartDate(media.startDate),
    next_airing_ep: media.nextAiringEpisode ? {
      ep_num: media.nextAiringEpisode.episode,
      time_left: media.nextAiringEpisode.timeUntilAiring
    } : null,
    characters: media.characters?.edges?.map(edge => ({
      name: edge.node.name.full,
      role: edge.role,
      image: edge.node.image?.large || edge.node.image?.medium || ''
    })) || [],
    staff: media.staff?.edges?.map(edge => ({
      name: edge.node.name.full,
      role: edge.role,
      image: edge.node.image?.large || edge.node.image?.medium || ''
    })) || [],
    relations: media.relations?.edges?.map(edge => {
      const relNode = edge.node;
      if (!relNode) return null;
      // Only include anime relations (sequels, prequels, side stories, etc.)
      if (relNode.type !== 'ANIME') return null;
      return {
        id: relNode.id,
        mal_id: relNode.idMal || relNode.id,
        title: {
          english: relNode.title?.english || relNode.title?.romaji,
          romaji: relNode.title?.romaji
        },
        cover_image: {
          large: relNode.coverImage?.large || '',
          medium: relNode.coverImage?.medium || ''
        },
        relation_type: edge.relationType,
        format: relNode.format || 'TV',
        status: relNode.status || 'FINISHED',
        episodes: relNode.episodes || null
      };
    }).filter(Boolean) || [],
    recommendations: media.recommendations?.edges?.map(edge => {
      const recMedia = edge.node.mediaRecommendation;
      if (!recMedia) return null;
      return {
        id: recMedia.id,
        mal_id: recMedia.idMal || recMedia.id,
        title: {
          english: recMedia.title.english || recMedia.title.romaji,
          romaji: recMedia.title.romaji
        },
        cover_image: {
          large: recMedia.coverImage?.large || ''
        }
      };
    }).filter(Boolean) || []
  };
}

function getCurrentSeason() {
  const date = new Date();
  const month = date.getMonth(); // 0-11
  // Spring: March (2) to June (5)
  if (month >= 2 && month <= 5) return { season: 'SPRING', year: date.getFullYear() };
  // Summer: July (6) to September (8)
  if (month >= 6 && month <= 8) return { season: 'SUMMER', year: date.getFullYear() };
  // Fall: October (9) to November (10)
  if (month >= 9 && month <= 10) return { season: 'FALL', year: date.getFullYear() };
  // Winter: December (11), January (0), February (1)
  const year = month === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return { season: 'WINTER', year };
}

const ANIME_DETAILS_QUERY = `
  query ($id: Int) {
    Media (id: $id, type: ANIME) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      averageScore
      seasonYear
      format
      isAdult
      status
      episodes
      genres
      duration
      description
      season
      startDate {
        year
        month
        day
      }
      nextAiringEpisode {
        episode
        timeUntilAiring
      }
      characters (sort: [ROLE, RELEVANCE, ID]) {
        edges {
          role
          node {
            name {
              full
            }
            image {
              large
              medium
            }
          }
        }
      }
      staff {
        edges {
          role
          node {
            name {
              full
            }
            image {
              large
              medium
            }
          }
        }
      }
      relations {
        edges {
          relationType
          node {
            id
            idMal
            type
            format
            status
            episodes
            title {
              romaji
              english
            }
            coverImage {
              large
              medium
            }
          }
        }
      }
      recommendations (sort: [RATING_DESC, ID]) {
        edges {
          node {
            mediaRecommendation {
              id
              idMal
              title {
                romaji
                english
              }
              coverImage {
                large
              }
            }
          }
        }
      }
    }
  }
`;

const ANIME_LIST_QUERY = `
  query ($search: String, $genres: [String], $format: MediaFormat, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $page: Int, $perPage: Int) {
    Page (page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media (search: $search, genre_in: $genres, format: $format, sort: $sort, season: $season, seasonYear: $seasonYear, status: $status, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        averageScore
        seasonYear
        format
        isAdult
        status
        episodes
        genres
        duration
        description
        startDate {
          year
          month
          day
        }
      }
    }
  }
`;

const RECENT_EPISODES_QUERY = `
  query ($page: Int, $perPage: Int, $now: Int) {
    Page (page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        lastPage
      }
      airingSchedules (airingAt_lesser: $now, sort: TIME_DESC) {
        episode
        media {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            extraLarge
          }
          bannerImage
          averageScore
          seasonYear
          format
          isAdult
          status
          episodes
          genres
          duration
          description
          startDate {
            year
            month
            day
          }
        }
      }
    }
  }
`;

// ─── HTTP Server ─────────────────────────────────────────────────────────────
let lastBaseUrl = '';

const server = http.createServer(async (req, res) => {
  console.log(`[Proxy Request]: ${req.method} ${req.url}`);
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const path = parsedUrl.pathname;

  // Browser log relay
  if (path === '/api/log') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      console.log(`[Browser Log]: ${body}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Health checks
  if (path === '/health' || path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'animetsu-api-node', version: '2.0.0' }));
    return;
  }

  // ── Discover rails ──────────────────────────────────────────────────────
  const rails = {
    '/api/home':      'home',
    '/api/trending':  'trending',
    '/api/season':    'season',
    '/api/popular':   'popular',
    '/api/top-rated': 'top-rated',
    '/api/upcoming':  'upcoming',
    '/api/recent':    'recent',
  };
  
  if (rails[path]) {
    try {
      if (path === '/api/recent') {
        const page = parseInt(parsedUrl.searchParams.get('page'), 10) || 1;
        const perPage = parseInt(parsedUrl.searchParams.get('per_page'), 10) || 16;
        const now = Math.floor(Date.now() / 1000);
        const data = await fetchAniList(RECENT_EPISODES_QUERY, { page, perPage, now });
        
        const list = data?.Page?.airingSchedules?.map(sched => {
          const item = mapAniListMedia(sched.media);
          if (item) {
            item.ep_num = sched.episode;
          }
          return item;
        }).filter(Boolean) || [];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            results: list,
            current_page: data?.Page?.pageInfo?.currentPage || page,
            last_page: data?.Page?.pageInfo?.lastPage || 1
          }
        }));
      } else {
        let sort = ['TRENDING_DESC'];
        let status = undefined;
        let season = undefined;
        let seasonYear = undefined;
        
        if (path === '/api/popular') {
          sort = ['POPULARITY_DESC'];
        } else if (path === '/api/top-rated') {
          sort = ['SCORE_DESC'];
        } else if (path === '/api/upcoming') {
          sort = ['POPULARITY_DESC'];
          status = 'NOT_YET_RELEASED';
        } else if (path === '/api/season') {
          const curSeason = getCurrentSeason();
          sort = ['POPULARITY_DESC'];
          season = curSeason.season;
          seasonYear = curSeason.year;
        }
        
        const data = await fetchAniList(ANIME_LIST_QUERY, {
          sort,
          status,
          season,
          seasonYear,
          page: 1,
          perPage: 12
        });
        
        const list = data?.Page?.media?.map(mapAniListMedia) || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: list }));
      }
    } catch (err) {
      console.error('[Error fetching rail:', path, ']', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Search
  if (path === '/api/search') {
    try {
      const q = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('query') || '';
      const genresStr = parsedUrl.searchParams.get('genres') || '';
      const format = parsedUrl.searchParams.get('format') || undefined;
      const sortVal = parsedUrl.searchParams.get('sort') || 'POPULARITY_DESC';
      const page = parseInt(parsedUrl.searchParams.get('page'), 10) || 1;
      
      const genres = genresStr ? genresStr.split(',').map(g => g.trim()) : undefined;
      
      // Map sort value
      let sort = ['POPULARITY_DESC'];
      if (sortVal === 'SCORE_DESC') sort = ['SCORE_DESC'];
      else if (sortVal === 'TRENDING_DESC') sort = ['TRENDING_DESC'];
      else if (sortVal === 'UPDATED_AT_DESC') sort = ['UPDATED_AT_DESC'];
      else if (sortVal === 'START_DATE_DESC') sort = ['START_DATE_DESC'];
      
      const variables = {
        search: q || undefined,
        genres,
        format: format || undefined,
        sort,
        page,
        perPage: 24
      };
      
      const data = await fetchAniList(ANIME_LIST_QUERY, variables);
      const list = data?.Page?.media?.map(mapAniListMedia) || [];
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: list }));
    } catch (err) {
      console.error('[Search Error]:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Anime info
  const animeInfoMatch = path.match(/^\/api\/anime\/([^/]+)$/);
  if (animeInfoMatch) {
    try {
      const id = parseInt(animeInfoMatch[1], 10);
      const data = await fetchAniList(ANIME_DETAILS_QUERY, { id });
      
      if (!data?.Media) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Anime not found' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: mapAniListMedia(data.Media) }));
    } catch (err) {
      console.error('[Info Error]:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Episodes
  const epsMatch = path.match(/^\/api\/anime\/([^/]+)\/episodes$/);
  if (epsMatch) {
    const id = parseInt(epsMatch[1], 10);
    try {
      const zenshinRes = await fetch(`https://zenshin-supabase-api.onrender.com/mappings?anilist_id=${id}`);
      if (zenshinRes.ok) {
        const mappingData = await zenshinRes.json();
        const rawEpisodes = mappingData.episodes || {};
        const episodesList = Object.values(rawEpisodes)
          .filter(ep => ep.type === "Regular Episode" || ep.type === "Special")
          .map(ep => ({
            id: ep.tvdbId || ep.anidbEid || ep.episode,
            ep_num: parseInt(ep.episode, 10) || ep.episode,
            name: ep.title?.en || ep.nameTvdb || `Episode ${ep.episode}`,
            img: ep.image || '',
            desc: ep.overview || '',
            created_at: ep.airDate || ep.airdate || null
          }))
          .sort((a, b) => {
            const aNum = typeof a.ep_num === 'number' ? a.ep_num : parseFloat(a.ep_num);
            const bNum = typeof b.ep_num === 'number' ? b.ep_num : parseFloat(b.ep_num);
            return aNum - bNum;
          });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: episodesList }));
      } else {
        throw new Error(`Zenshin returned status ${zenshinRes.status}`);
      }
    } catch (err) {
      console.warn(`[Episodes Warning] Failed to fetch episodes from Zenshin: ${err.message}. Using AniList fallback.`);
      // Fallback to fetching AniList episodes count
      try {
        const data = await fetchAniList(`
          query ($id: Int) {
            Media (id: $id) {
              episodes
              bannerImage
              coverImage {
                large
              }
            }
          }
        `, { id });
        
        const media = data?.Media;
        const count = media?.episodes || 12; // Fallback to 12 if count is null
        const fallbackList = [];
        for (let i = 1; i <= count; i++) {
          fallbackList.push({
            id: `fallback-${i}`,
            ep_num: i,
            name: `Episode ${i}`,
            img: media?.bannerImage || media?.coverImage?.large || '',
            desc: 'Episode description is currently unavailable.',
            created_at: null
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: fallbackList }));
      } catch (fallbackErr) {
        console.error('[Episodes Error] Fallback failed:', fallbackErr.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to fetch episodes list' }));
      }
    }
    return;
  }

  // Watch resolver
  const watchMatch = path.match(/^\/api\/anime\/([^/]+)\/watch\/([^/]+)$/);
  if (watchMatch) {
    const anilistId = watchMatch[1];
    const ep = watchMatch[2];
    const serverParam = parsedUrl.searchParams.get('server') || 'auto';
    const sourceType = parsedUrl.searchParams.get('source_type') || 'sub';

    // Resolve AniList ID to upstream animetsu ID
    let upstreamId = anilistId;
    try {
      const resolved = await resolveAnimetsuId(anilistId);
      if (resolved) {
        upstreamId = resolved;
      } else {
        console.warn(`[Watch] Could not resolve animetsu ID for AniList ${anilistId}, trying raw ID`);
      }
    } catch (resolveErr) {
      console.warn(`[Watch] ID resolve failed for ${anilistId}, trying raw ID:`, resolveErr.message);
    }

    const watchPath = `/api/anime/oppai/${upstreamId}/${ep}?server=${serverParam}&source_type=${sourceType}`;
    const targetUrl = UPSTREAM_BASE + watchPath;
    
    curlFetchRaw(targetUrl).then((buf) => {
      let upstreamWatch;
      try {
        upstreamWatch = JSON.parse(buf.toString('utf8'));
      } catch (e) {
        throw new Error('Invalid JSON response from upstream watch solver');
      }
      
      const selfBase = `http://${req.headers.host}`;
      const response = {
        id: anilistId, episode: parseInt(ep, 10) || 1,
        server: upstreamWatch.server || serverParam,
        source_type: sourceType,
        skips: upstreamWatch.skips || null,
        from: upstreamWatch.from || '',
        sources: [], subtitles: []
      };
      if (Array.isArray(upstreamWatch.sources)) {
        response.sources = upstreamWatch.sources.map((s) => {
          let absUrl = s.url;
          if (!absUrl.startsWith('http://') && !absUrl.startsWith('https://')) {
            absUrl = 'https://swiftstream.top/proxy/' + absUrl.replace(/^\//, '');
          }
          return {
            quality: s.quality,
            url: absUrl,
            type: s.type || 'application/vnd.apple.mpegurl',
            old_hls: s.old_hls || false,
            need_proxy: true,
            proxy_url: `${selfBase}/api/proxy/hls?url=${encodeURIComponent(absUrl)}`
          };
        });
      }
      if (Array.isArray(upstreamWatch.subs)) {
        response.subtitles = upstreamWatch.subs.map((sub, i) => ({
          url: `${selfBase}/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}`,
          lang: sub.lang, label: sub.lang || 'Sub', default: i === 0
        }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: response }));
    }).catch((err) => {
      console.error('[Watch Proxy Error]:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Streaming source resolution failed: ' + err.message }));
    });
    return;
  }

  // ── HLS Proxy ────────────────────────────────────────────────────────────
  if (path === '/api/proxy/hls') {
    const target = parsedUrl.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url parameter'); return; }

    const keyUrl = parsedUrl.searchParams.get('keyUrl') || null;
    const ivHex = parsedUrl.searchParams.get('iv') || null;

    const lastSlash = target.lastIndexOf('/');
    if (lastSlash !== -1) lastBaseUrl = target.substring(0, lastSlash + 1);

    makeCurlRequest(target, req.headers, res, req, keyUrl, ivHex);
    return;
  }

  // ── Subtitle Proxy ───────────────────────────────────────────────────────
  if (path === '/api/proxy/subtitle') {
    const target = parsedUrl.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url parameter'); return; }
    makeCurlRequest(target, req.headers, res, req, null, null);
    return;
  }

  // ── Image Proxy (for episode thumbnails blocked by Cloudflare) ───────────
  if (path === '/api/proxy/image') {
    const imgPath = parsedUrl.searchParams.get('path'); // e.g. /img/ep/...
    if (!imgPath) { res.writeHead(400); res.end('Missing path parameter'); return; }
    const imgUrl = imgPath.startsWith('http') ? imgPath : `https://animetsu.live${imgPath}`;
    curlFetchRaw(imgUrl).then((imgBuf) => {
      if (!imgBuf || imgBuf.length === 0) {
        res.writeHead(404); res.end('Image not found'); return;
      }
      // Detect content type from first bytes
      let contentType = 'image/jpeg';
      if (imgBuf[0] === 0x89 && imgBuf[1] === 0x50) contentType = 'image/png';
      else if (imgBuf[0] === 0x47 && imgBuf[1] === 0x49) contentType = 'image/gif';
      else if (imgBuf[0] === 0x52 && imgBuf[1] === 0x49) contentType = 'image/webp';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(imgBuf);
    }).catch(() => { res.writeHead(500); res.end('Image proxy error'); });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Node-Animetsu-API CORS Proxy is listening on port ${PORT} at http://0.0.0.0:${PORT}`);
});
