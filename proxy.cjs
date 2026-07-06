'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const pathLib = require('path');

const PORT = process.env.PORT || 8080;
const UPSTREAM_BASE = 'https://animetsu.live/v2';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = 'https://animetsu.live/';
const ORIGIN = 'https://animetsu.live';

// In-memory key cache: keyUrl -> Buffer(16)
const keyCache = {};


// ─── Local Database (anikoto_db.json) ─────────────────────────────────────────
let db = [];
const DB_PATH = pathLib.join(__dirname, 'anikoto_db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      db = JSON.parse(data);
      console.log(`[DB Load] Loaded ${db.length} items from anikoto_db.json`);
    } else {
      console.warn(`[DB Load] anikoto_db.json not found!`);
    }
  } catch (err) {
    console.error(`[DB Load] Failed to load DB:`, err.message);
  }
}

async function syncDB() {
  console.log('[DB Sync] Fetching recent updates...');
  try {
    const res = await fetch('https://anikotoapi.site/recent-anime');
    if (!res.ok) throw new Error(`Failed to fetch sync data: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      let updatedCount = 0;
      for (const item of data) {
        const index = db.findIndex(x => String(x.ani_id) === String(item.ani_id) || String(x.id) === String(item.id));
        if (index !== -1) {
          db[index] = { ...db[index], ...item };
          updatedCount++;
        } else {
          db.unshift(item);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        console.log(`[DB Sync] Updated ${updatedCount} items and saved to disk.`);
      }
    }
  } catch (err) {
    console.error('[DB Sync Error]:', err.message);
  }
}

setInterval(syncDB, 10 * 60 * 1000);

function getMediaById(id) {
  return db.find(m => String(m.ani_id) === String(id) || String(m.id) === String(id));
}

function formatStartDateAnikoto(airedStr, yearNum) {
  if (airedStr && airedStr.includes(' to ')) {
    return airedStr.split(' to ')[0];
  }
  return yearNum ? String(yearNum) : null;
}

function mapAnikotoMedia(media) {
  if (!media) return null;
  return {
    id: media.ani_id || media.id,
    mal_id: media.mal_id || media.id,
    title: {
      english: media.title,
      romaji: media.alternative || media.title,
      native: media.native || media.title
    },
    cover_image: {
      large: media.poster || ''
    },
    banner: media.background_image || media.poster || '',
    average_score: media.score ? parseFloat(media.score) * 10 : null,
    mean_score: media.score ? parseFloat(media.score) * 10 : null,
    year: media.year || null,
    format: media.terms_by_type?.type?.[0] || 'TV',
    isAdult: false,
    status: media.status === 'Currently Airing' ? 'RELEASING' : (media.status === 'Finished Airing' ? 'FINISHED' : 'NOT_YET_RELEASED'),
    total_eps: parseInt(media.episodes, 10) || null,
    genres: media.terms_by_type?.genre || [],
    duration: media.duration ? parseInt(media.duration) : null,
    description: media.description || '',
    season: media.season ? media.season.toUpperCase() : null,
    start_date: formatStartDateAnikoto(media.aired, media.year),
    next_airing_ep: (media.next_air_schedule_time && media.next_air_ep) ? {
      ep_num: media.next_air_ep,
      time_left: Math.max(0, media.next_air_schedule_time - Math.floor(Date.now() / 1000))
    } : null,
    characters: [],
    staff: [],
    relations: [],
    recommendations: []
  };
}

const _anilistToAnimetsuCache = {}; // anilistId -> animetsuId

async function resolveAnimetsuId(anilistId) {
  const id = String(anilistId);
  if (_anilistToAnimetsuCache[id]) return _anilistToAnimetsuCache[id];

  try {
    const media = getMediaById(id);
    const title = media?.title || media?.alternative;
    if (!title) {
      console.error(`[ID Resolve] No title found in DB for ID ${id}`);
      return null;
    }

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
      console.warn(`[ID Resolve] No upstream results for title '${title}'`);
      return null;
    }

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
        console.log(`[ID Resolve] Mapped AniList ${id} -> animetsu ${result.id} ('${title}')`);
        _anilistToAnimetsuCache[id] = result.id;
        return result.id;
      }
    }

    const fallback = results.find(r =>
      (r.title?.romaji || '').toLowerCase() === titleLower ||
      (r.title?.english || '').toLowerCase() === titleLower
    );
    if (fallback) {
      console.warn(`[ID Resolve] Fallback title match: AniList ${id} -> animetsu ${fallback.id} ('${title}')`);
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
  const protocol = req.headers['x-forwarded-proto'] || 'http';
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
              const proxied = `${protocol}://${req.headers.host}/api/proxy/hls?url=${encodeURIComponent(abs)}`;
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
        let segUrl = `${protocol}://${req.headers.host}/api/proxy/hls?url=${encodeURIComponent(abs)}`;
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
      const page = parseInt(parsedUrl.searchParams.get('page'), 10) || 1;
      const perPage = parseInt(parsedUrl.searchParams.get('per_page'), 10) || (path === '/api/recent' ? 16 : 12);
      
      let filteredDb = [...db];
      
      if (path === '/api/recent') {
        filteredDb = filteredDb.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        const start = (page - 1) * perPage;
        const sliced = filteredDb.slice(start, start + perPage);
        const list = sliced.map(item => {
          const mapped = mapAnikotoMedia(item);
          mapped.ep_num = item.next_air_ep ? item.next_air_ep - 1 : null;
          return mapped;
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            results: list,
            current_page: page,
            last_page: Math.ceil(filteredDb.length / perPage) || 1
          }
        }));
        return;
      } else {
        if (path === '/api/popular' || path === '/api/top-rated') {
          filteredDb = filteredDb.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
        } else if (path === '/api/upcoming') {
          filteredDb = filteredDb.filter(x => x.status === 'Not yet aired' || x.status === 'Not Yet Aired');
        } else if (path === '/api/season') {
          const month = new Date().getMonth();
          let currentSeason = 'winter';
          if (month >= 2 && month <= 5) currentSeason = 'spring';
          else if (month >= 6 && month <= 8) currentSeason = 'summer';
          else if (month >= 9 && month <= 10) currentSeason = 'fall';
          const currentYear = new Date().getFullYear();
          filteredDb = filteredDb.filter(x => (x.season || '').toLowerCase() === currentSeason && x.year === currentYear);
        } else {
          filteredDb = filteredDb.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
        }
        
        const start = (page - 1) * perPage;
        const sliced = filteredDb.slice(start, start + perPage);
        const list = sliced.map(mapAnikotoMedia);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: list }));
        return;
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
      const q = (parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('query') || '').toLowerCase();
      const genresStr = parsedUrl.searchParams.get('genres') || '';
      const page = parseInt(parsedUrl.searchParams.get('page'), 10) || 1;
      const perPage = 24;
      
      const genres = genresStr ? genresStr.split(',').map(g => g.trim().toLowerCase()) : [];
      
      let filteredDb = db.filter(item => {
        let match = true;
        if (q) {
          const t1 = (item.title || '').toLowerCase();
          const t2 = (item.alternative || '').toLowerCase();
          const t3 = (item.native || '').toLowerCase();
          match = t1.includes(q) || t2.includes(q) || t3.includes(q);
        }
        if (match && genres.length > 0) {
          const itemGenres = (item.terms_by_type?.genre || []).map(g => g.toLowerCase());
          match = genres.every(g => itemGenres.includes(g));
        }
        return match;
      });
      
      const start = (page - 1) * perPage;
      const list = filteredDb.slice(start, start + perPage).map(mapAnikotoMedia);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: list }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Anime info
  const animeInfoMatch = path.match(/^\/api\/anime\/([^/]+)$/);
  if (animeInfoMatch) {
    try {
      const id = animeInfoMatch[1];
      const media = getMediaById(id);
      
      if (!media) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Anime not found' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: mapAnikotoMedia(media) }));
    } catch (err) {
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
          .filter(ep => ep.type === 'Regular Episode' || ep.type === 'Special')
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
      try {
        const media = getMediaById(id);
        const count = media ? parseInt(media.episodes, 10) || 12 : 12;
        const fallbackList = [];
        for (let i = 1; i <= count; i++) {
          fallbackList.push({
            id: `fallback-${i}`,
            ep_num: i,
            name: `Episode ${i}`,
            img: media?.background_image || media?.poster || '',
            desc: 'Episode description is currently unavailable.',
            created_at: null
          });
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: fallbackList }));
      } catch (fallbackErr) {
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
      
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const selfBase = `${protocol}://${req.headers.host}`;
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
  loadDB();
  
});
