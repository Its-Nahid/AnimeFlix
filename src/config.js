// Application configuration for Animetsu API
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const ENDPOINTS = {
  home: `${API_BASE_URL}/api/home`,
  trending: `${API_BASE_URL}/api/trending`,
  season: `${API_BASE_URL}/api/season`,
  popular: `${API_BASE_URL}/api/popular`,
  topRated: `${API_BASE_URL}/api/top-rated`,
  upcoming: `${API_BASE_URL}/api/upcoming`,
  recent: `${API_BASE_URL}/api/recent`,
  search: `${API_BASE_URL}/api/search`,
  animeInfo: (id) => `${API_BASE_URL}/api/anime/${id}`,
  animeEpisodes: (id) => `${API_BASE_URL}/api/anime/${id}/episodes`,
  watch: (id, ep, server = 'auto', sourceType = 'sub') => 
    `${API_BASE_URL}/api/anime/${id}/watch/${ep}?server=${server}&source_type=${sourceType}`,
};

/**
 * Returns a proxied image URL for episode thumbnails.
 * Episode img paths like "/img/ep/..." are blocked by Cloudflare when fetched directly
 * from animetsu.cc. This routes them through our local proxy server instead.
 * @param {string} imgPath - Relative path (e.g. /img/ep/...) or absolute URL
 * @param {string} fallback - Fallback image URL if imgPath is empty
 */
export function proxyImage(imgPath, fallback = '') {
  if (!imgPath) return fallback;
  // Already a full external URL that's not animetsu → use as-is
  if (imgPath.startsWith('http') && !imgPath.includes('animetsu')) return imgPath;
  // Relative path or animetsu URL → route through local image proxy
  const path = imgPath.startsWith('/') ? imgPath : `/${imgPath}`;
  return `${API_BASE_URL}/api/proxy/image?path=${encodeURIComponent(path)}`;
}

// ─── Watched-episode tracking (localStorage) ───────────────────────────────
// Persists which episodes a user has watched so they can be grayed out.
// Storage shape: { [animeId]: { [epNum]: true } }
const WATCHED_KEY = 'animeflix_watched';

function readWatched() {
  try {
    return JSON.parse(localStorage.getItem(WATCHED_KEY)) || {};
  } catch {
    return {};
  }
}

function writeWatched(data) {
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify(data));
    // Notify listeners in the same tab (storage event only fires cross-tab)
    window.dispatchEvent(new Event('watched-updated'));
  } catch (err) {
    console.error('Failed to persist watched episodes:', err);
  }
}

/** Returns a Set of watched episode-number strings for the given anime id. */
export function getWatchedEpisodes(animeId) {
  const data = readWatched();
  return new Set(Object.keys(data[String(animeId)] || {}));
}

/** Marks an episode as watched for the given anime id. */
export function markEpisodeWatched(animeId, epNum) {
  const id = String(animeId);
  const epKey = String(epNum);
  const data = readWatched();
  if (!data[id]) data[id] = {};
  if (data[id][epKey]) return; // already recorded
  data[id][epKey] = true;
  writeWatched(data);
}

/** True if the given episode has been watched. */
export function isEpisodeWatched(animeId, epNum) {
  const data = readWatched();
  return !!data[String(animeId)]?.[String(epNum)];
}

// ─── Zenshin API (episode details & thumbnails) ────────────────────────────
// https://github.com/hitarth-gg/zenshin-API
const ZENSHIN_BASE = 'https://zenshin-supabase-api.onrender.com';

// Simple in-memory cache so we don't hammer the free-tier API
const _zenshinCache = {};

/**
 * Fetches episode details from the zenshin-API using the MyAnimeList ID.
 * Returns a map of episode number → episode data, or an empty object on failure.
 * Each episode contains: title (en), image (TVDB screenshot), overview, airDate, runtime, etc.
 * @param {number|string} malId - MyAnimeList ID of the anime
 * @returns {Promise<Object>} episodes map keyed by episode number string
 */
export async function fetchZenshinEpisodes(malId) {
  if (!malId) return {};
  // Return from cache if available
  if (_zenshinCache[malId]) return _zenshinCache[malId];
  try {
    const res = await fetch(`${ZENSHIN_BASE}/mappings?mal_id=${malId}`);
    if (!res.ok) return {};
    const data = await res.json();
    const episodes = data?.episodes || {};
    _zenshinCache[malId] = episodes;
    return episodes;
  } catch (err) {
    console.error("Error fetching zenshin episodes:", err);
    return {};
  }
}
