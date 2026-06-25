import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import axios from "axios";
import AnimeCard from "../components/AnimeCard";
import Navbar from "../components/Navbar";
import { API_BASE_URL, ENDPOINTS, proxyImage, fetchZenshinEpisodes } from "../config";

function WatchPage() {
  const { id, ep } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [watchData, setWatchData] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [sourceType, setSourceType] = useState("sub");
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedServer, setSelectedServer] = useState("auto");
  const [hasDub, setHasDub] = useState(false);
  const [checkingDub, setCheckingDub] = useState(true);
  const watchDataRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [infoRes, epsRes] = await Promise.all([
          axios.get(ENDPOINTS.animeInfo(id)),
          axios.get(ENDPOINTS.animeEpisodes(id))
        ]);

        const infoData = infoRes.data?.success ? infoRes.data.data : infoRes.data;
        const epsData = epsRes.data?.success ? epsRes.data.data : epsRes.data;

        if (isMounted) {
          setAnime(infoData);
          const sortedEps = Array.isArray(epsData) ? epsData.sort((a, b) => a.ep_num - b.ep_num) : [];
          setEpisodes(sortedEps);

          // Fetch zenshin-API episodes in parallel to enrich episode name & thumbnail
          if (infoData?.mal_id && sortedEps.length > 0) {
            fetchZenshinEpisodes(infoData.mal_id).then((zenshinEps) => {
              if (isMounted && Object.keys(zenshinEps).length > 0) {
                const enriched = sortedEps.map((ep) => {
                  const zEp = zenshinEps[String(ep.ep_num)];
                  if (zEp) {
                    return {
                      ...ep,
                      name: zEp.title?.en || zEp.nameTvdb || ep.name,
                      img: zEp.image || ep.img,
                    };
                  }
                  return ep;
                });
                setEpisodes(enriched);
              }
            }).catch(e => console.error("Zenshin enrichment failed:", e));
          }

          // Background check for DUB availability on the first episode
          if (sortedEps.length > 0) {
            setCheckingDub(true);
            const firstEpNum = sortedEps[0].ep_num;
            const checkUrl = `${API_BASE_URL}/api/anime/${id}/watch/${firstEpNum}?server=auto&source_type=dub`;
            axios.get(checkUrl).then((checkRes) => {
              const checkData = checkRes.data?.success ? checkRes.data.data : checkRes.data;
              if (isMounted) {
                setHasDub(!!(checkData?.sources && checkData.sources.length > 0));
              }
            }).catch(() => {
              if (isMounted) setHasDub(false);
            }).finally(() => {
              if (isMounted) setCheckingDub(false);
            });
          } else {
            setCheckingDub(false);
            setHasDub(false);
          }
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError("Failed to load anime details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, [id]);

  useEffect(() => {
    if (!ep) return;
    let isMounted = true;
    async function fetchStreamSources() {
      setPlayerLoading(true);
      setPlayerError(null);
      setWatchData(null);
      watchDataRef.current = null;
      setSelectedQuality("");

      try {
        const watchUrl = `${API_BASE_URL}/api/anime/${id}/watch/${ep}?server=${selectedServer}&source_type=${sourceType}`;
        const res = await axios.get(watchUrl);
        const data = res.data?.success ? res.data.data : res.data;

        if (isMounted) {
          if (!data?.sources || data.sources.length === 0) {
            throw new Error("No playable sources found.");
          }
          setWatchData(data);
          watchDataRef.current = data;
          setSelectedQuality(data.sources[0].proxy_url);
        }
      } catch (err) {
        console.error("Error loading stream sources:", err);
        if (isMounted) setPlayerError("Streaming sources are temporarily unavailable.");
      } finally {
        if (isMounted) setPlayerLoading(false);
      }
    }
    fetchStreamSources();
    return () => { isMounted = false; };
  }, [id, ep, selectedServer, sourceType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedQuality) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let originalUrl = selectedQuality;
    try {
      const urlObj = new URL(selectedQuality);
      const targetUrl = urlObj.searchParams.get("url");
      if (targetUrl) originalUrl = targetUrl;
    } catch (e) {}

    const source = watchDataRef.current?.sources?.find(s => s.proxy_url === selectedQuality);
    const isHlsStream = 
      originalUrl.includes(".m3u8") || 
      originalUrl.includes("m3u8") || 
      selectedQuality.includes("/api/proxy/hls") || 
      selectedQuality.toLowerCase().includes("mpegurl") ||
      !!(source && source.type && source.type.includes("mpegurl"));

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(selectedQuality);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = selectedQuality;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}));
    } else {
      video.src = selectedQuality;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedQuality]);

  if (loading || !anime) {
    return (
      <div className="watch-page-wrapper" style={{ minHeight: "100vh", backgroundColor: "#141414" }}>
        <Navbar />
        <div className="layout-with-sidebar" style={{ paddingTop: "80px" }}>
          <div className="main-content loading-screen">
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  const currentEpisode = episodes.find(e => e.ep_num.toString() === ep);
  const animeTitle = anime.title?.english || anime.title?.romaji;

  return (
    <div className="watch-page-wrapper">
      <Navbar />
      <div className="watch-3col-layout">

        {/* LEFT COLUMN: EPISODES LIST */}
        <div className="watch-left-sidebar">
          <div className="ep-sidebar-header">
            <div className="ep-sidebar-toggles">
              <button className={`ep-sidebar-type-btn ${sourceType === "sub" ? "active" : ""}`} onClick={() => setSourceType("sub")}>Sub & Dub</button>
            </div>
            <span className="ep-sidebar-range">{episodes.length > 0 ? `001-${String(episodes.length).padStart(3, '0')}` : '—'}</span>
          </div>
          <div className="ep-sidebar-list">
            {episodes.map(episode => (
              <div 
                key={episode.id} 
                className={`ep-sidebar-item ${episode.ep_num.toString() === ep ? "active" : ""}`}
                onClick={() => navigate(`/anime/${id}/watch/${episode.ep_num}`)}
              >
                <span className="ep-sidebar-num">{episode.ep_num}</span>
                <span className="ep-sidebar-name">{episode.name || `Episode ${episode.ep_num}`}</span>
                {episode.ep_num.toString() === ep && <span className="ep-sidebar-playing">▶</span>}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER COLUMN: PLAYER + INFO */}
        <div className="watch-center-col">
          <div className="video-wrapper">
            <div className="server-status-badge">
              <span className="status-dot"></span>
              Auto • {selectedServer}
            </div>
            {playerLoading ? (
              <div className="player-loading">
                <div className="spinner"></div>
              </div>
            ) : playerError ? (
              <div className="player-error">{playerError}</div>
            ) : (
              <video ref={videoRef} controls crossOrigin="anonymous" className="html-video">
                {watchData?.subtitles?.map((sub, idx) => (
                  <track key={idx} kind="subtitles" src={sub.url} label={sub.label} srcLang={sub.lang || "en"} default={sub.default} />
                ))}
              </video>
            )}
          </div>

          {/* Server Controls Row */}
          <div className="watch-server-row">
            <div className="watch-server-group">
              <span className="watch-server-type-label">SUB</span>
              <div className="watch-server-btns">
                <button className={`watch-srv-btn ${selectedServer === "auto" ? "active" : ""}`} onClick={() => setSelectedServer("auto")}>⚡ Auto</button>
                <button className={`watch-srv-btn ${selectedServer === "kite" ? "active" : ""}`} onClick={() => setSelectedServer("kite")}>Kite</button>
                <button className={`watch-srv-btn ${selectedServer === "dio" ? "active" : ""}`} onClick={() => setSelectedServer("dio")}>Dio</button>
                <button className={`watch-srv-btn ${selectedServer === "kiss" ? "active" : ""}`} onClick={() => setSelectedServer("kiss")}>Kiss</button>
                <button className={`watch-srv-btn ${selectedServer === "meg" ? "active" : ""}`} onClick={() => setSelectedServer("meg")}>Meg</button>
                <button className={`watch-srv-btn ${selectedServer === "pahe" ? "active" : ""}`} onClick={() => setSelectedServer("pahe")}>Pahe</button>
              </div>
            </div>
            {!checkingDub && hasDub && (
              <div className="watch-server-group">
                <span className="watch-server-type-label">DUB</span>
                <div className="watch-server-btns">
                  <button className={`watch-srv-btn ${sourceType === "dub" ? "active" : ""}`} onClick={() => setSourceType("dub")}>🎤 DUB</button>
                </div>
              </div>
            )}
          </div>

          {/* Episode Info Notice */}
          <div className="watch-ep-notice">
            <span>You're watching <strong>Episode {ep}.</strong> If current servers don't work, please try other servers beside.</span>
          </div>

          {/* Anime Info Section */}
          <div className="watch-anime-info">
            <div className="watch-anime-poster">
              <img src={proxyImage(anime.cover_image?.large || anime.cover_image?.medium)} alt={animeTitle} />
            </div>
            <div className="watch-anime-details">
              <h2 className="watch-anime-title">{animeTitle}</h2>
              {anime.title?.romaji && anime.title?.english && (
                <p className="watch-anime-alt-title">{anime.title.romaji}</p>
              )}
              <div className="watch-anime-tags">
                {anime.rating && <span className="watch-tag">{anime.rating}</span>}
                {anime.quality && <span className="watch-tag">HD</span>}
                <span className="watch-tag cc-tag">CC</span>
              </div>
              <p className="watch-anime-desc" dangerouslySetInnerHTML={{ __html: anime.description }}></p>
              <div className="watch-anime-meta-grid">
                <div className="meta-item"><span className="meta-label">Type:</span> <span className="meta-value">{anime.type || 'TV'}</span></div>
                <div className="meta-item"><span className="meta-label">Episodes:</span> <span className="meta-value">{anime.total_episodes || episodes.length}</span></div>
                <div className="meta-item"><span className="meta-label">Status:</span> <span className="meta-value">{anime.status || 'Unknown'}</span></div>
                <div className="meta-item"><span className="meta-label">Duration:</span> <span className="meta-value">{anime.duration || '24 min'}</span></div>
                {anime.genres && anime.genres.length > 0 && (
                  <div className="meta-item full-width"><span className="meta-label">Genres:</span> <span className="meta-value">{anime.genres.join(', ')}</span></div>
                )}
              </div>
            </div>
            {anime.average_score && (
              <div className="watch-anime-score">
                <div className="score-number">{(anime.average_score / 10).toFixed(1)} <span className="score-max">/10</span></div>
                <div className="score-stars">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`star ${s <= Math.round(anime.average_score / 20) ? 'filled' : ''}`}>★</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: RELATED ANIME */}
        <div className="watch-right-sidebar">
          <h3 className="related-title">Related</h3>
          <div className="related-list">
            {anime.recommendations?.slice(0, 10).map(rec => (
              <div key={rec.id} className="related-item" onClick={() => navigate(`/anime/${rec.id}`)}>
                <div className="related-thumb">
                  <img src={proxyImage(rec.cover_image?.large || rec.cover_image?.medium)} alt={rec.title?.english || rec.title?.romaji} />
                </div>
                <div className="related-info">
                  <h4>{rec.title?.english || rec.title?.romaji}</h4>
                  <span className="related-meta">{rec.type || 'TV'}</span>
                </div>
              </div>
            ))}
          </div>
          {anime.recommendations?.length > 10 && (
            <button className="related-view-all">View all ({anime.recommendations.length}) →</button>
          )}
        </div>

      </div>
    </div>
  );
}

export default WatchPage;
