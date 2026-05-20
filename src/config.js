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
