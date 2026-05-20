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
