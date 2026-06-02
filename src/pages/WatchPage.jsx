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
    <div className="watch-page-wrapper" style={{ minHeight: "100vh", backgroundColor: "#141414" }}>
      <Navbar />
      <div className="layout-with-sidebar watch-page" style={{ paddingTop: "80px" }}>
        <div className="main-content watch-layout">

        {/* LEFT COLUMN: PLAYER */}
        <div className="player-col">
          <button className="btn-back-details" onClick={() => navigate(`/anime/${id}`)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back to details
          </button>

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

          <div className="player-meta">
            <div className="ep-title-row">
              <div className="ep-titles">
                <div className="ep-num-label">EP {ep}</div>
                <h1 className="ep-main-title">{currentEpisode?.name || `Episode ${ep}`}</h1>
                <h3 className="anime-sub-title">{animeTitle?.toUpperCase()}</h3>
              </div>
              <button className="btn-download">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download
              </button>
            </div>

            <div className="server-controls">
              <div className="audio-toggles">
                <button className={`audio-btn ${sourceType === "sub" ? "active" : ""}`} onClick={() => setSourceType("sub")}>
                  文A SUB
                </button>
                {!checkingDub && hasDub && (
                  <button className={`audio-btn ${sourceType === "dub" ? "active" : ""}`} onClick={() => setSourceType("dub")}>
                    🎤 DUB
                  </button>
                )}
              </div>

              <div className="servers-list">
                <span className="server-label">Servers</span>
                <button className={`server-btn ${selectedServer === "auto" ? "active" : ""}`} onClick={() => setSelectedServer("auto")}>⚡ Auto</button>
                <button className={`server-btn ${selectedServer === "kite" ? "active" : ""}`} onClick={() => setSelectedServer("kite")}>kite <span className="ping">208ms</span></button>
                <button className={`server-btn ${selectedServer === "dio" ? "active" : ""}`} onClick={() => setSelectedServer("dio")}>dio <span className="ping">211ms</span></button>
                <button className={`server-btn ${selectedServer === "kiss" ? "active" : ""}`} onClick={() => setSelectedServer("kiss")}>kiss <span className="ping">331ms</span></button>
                <button className={`server-btn ${selectedServer === "meg" ? "active" : ""}`} onClick={() => setSelectedServer("meg")}>meg <span className="ping">339ms</span></button>
                <button className={`server-btn ${selectedServer === "pahe" ? "active" : ""}`} onClick={() => setSelectedServer("pahe")}>pahe <span className="ping">350ms</span></button>
              </div>
            </div>

            <p className="ep-desc" dangerouslySetInnerHTML={{ __html: currentEpisode?.desc || anime.description }}></p>
          </div>
        </div>

        {/* RIGHT COLUMN: EPISODES */}
        <div className="sidebar-right-col">
          <h3 className="section-title">EPISODES</h3>
          <div className="watch-episodes-list">
            {episodes.map(episode => (
              <div 
                key={episode.id} 
                className={`watch-ep-card ${episode.ep_num.toString() === ep ? "active" : ""}`}
                onClick={() => navigate(`/anime/${id}/watch/${episode.ep_num}`)}
              >
                <span className="ep-number-list">{episode.ep_num}</span>
                <div className="ep-thumb-small">
                  <img src={proxyImage(episode.img, anime.cover_image?.large)} alt={episode.name} />
                </div>
                <div className="ep-info-small">
                  <h4>{episode.name || `Episode ${episode.ep_num}`}</h4>
                  <span>{episode.created_at ? 'Several days ago' : 'Unknown date'}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="section-title mt-4">MORE LIKE THIS</h3>
          <div className="watch-recommendations-grid">
            {anime.recommendations?.slice(0, 4).map(rec => (
              <AnimeCard key={rec.id} anime={rec} />
            ))}
          </div>
        </div>

      </div>
    </div>
    </div>
  );
}

export default WatchPage;
