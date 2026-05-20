import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import axios from "axios";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AnimeCard from "../components/AnimeCard";
import { API_BASE_URL, ENDPOINTS } from "../config";

function AnimeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // States
  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Streaming player states
  const [activeEpisode, setActiveEpisode] = useState(null); // holds entire episode object
  const [watchData, setWatchData] = useState(null); // holds sources and subtitles
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [sourceType, setSourceType] = useState("sub"); // "sub" or "dub"
  const [selectedQuality, setSelectedQuality] = useState(""); // selected proxy_url quality
  const [selectedServer, setSelectedServer] = useState("auto"); // chosen stream server
  const watchDataRef = useRef(null);

  // Scroll to player when active episode updates
  const playerSectionRef = useRef(null);

  // Fetch anime info & episodes
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      setActiveEpisode(null);
      setWatchData(null);
      watchDataRef.current = null;
      try {
        const infoRes = await axios.get(ENDPOINTS.animeInfo(id));
        const infoData = infoRes.data?.success ? infoRes.data.data : infoRes.data;

        // Fetch episodes list
        const epsRes = await axios.get(ENDPOINTS.animeEpisodes(id));
        const epsData = epsRes.data?.success ? epsRes.data.data : epsRes.data;

        if (isMounted) {
          setAnime(infoData);
          setEpisodes(Array.isArray(epsData) ? epsData.sort((a, b) => a.ep_num - b.ep_num) : []);
        }
      } catch (err) {
        console.error("Error loading anime details:", err);
        if (isMounted) {
          setError("Failed to load anime details. Make sure your local Animetsu API proxy server is running.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [id]);

  // Fetch stream sources when episode, server, or source type (sub/dub) changes
  useEffect(() => {
    if (!activeEpisode) return;

    let isMounted = true;
    async function fetchStreamSources() {
      setPlayerLoading(true);
      setPlayerError(null);
      setWatchData(null);
      watchDataRef.current = null;
      setSelectedQuality("");

      try {
        const watchUrl = `${API_BASE_URL}/api/anime/${id}/watch/${activeEpisode.ep_num}?server=${selectedServer}&source_type=${sourceType}`;
        const res = await axios.get(watchUrl);
        const data = res.data?.success ? res.data.data : res.data;

        if (isMounted) {
          if (!data?.sources || data.sources.length === 0) {
            throw new Error("No playable sources found.");
          }
          setWatchData(data);
          watchDataRef.current = data;
          // Set default quality to first source
          setSelectedQuality(data.sources[0].proxy_url);
        }
      } catch (err) {
        console.error("Error loading stream sources:", err);
        if (isMounted) {
          setPlayerError("Streaming sources are temporarily unavailable for this server/audio combo.");
        }
      } finally {
        if (isMounted) setPlayerLoading(false);
      }
    }

    fetchStreamSources();
    return () => {
      isMounted = false;
    };
  }, [id, activeEpisode, selectedServer, sourceType]);

  // Bind Hls.js to video player when selected stream quality (proxy_url) changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedQuality) return;

    // Destroy previous HLS instance if any
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let originalUrl = selectedQuality;
    try {
      const urlObj = new URL(selectedQuality);
      const targetUrl = urlObj.searchParams.get("url");
      if (targetUrl) {
        originalUrl = targetUrl;
      }
    } catch (e) {}

    const source = watchDataRef.current?.sources?.find(s => s.proxy_url === selectedQuality);
    const isHlsStream = 
      originalUrl.includes(".m3u8") || 
      originalUrl.includes("m3u8") || 
      selectedQuality.includes("/api/proxy/hls") || 
      selectedQuality.toLowerCase().includes("mpegurl") ||
      !!(source && source.type && source.type.includes("mpegurl"));

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({ 
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30
      });
      hlsRef.current = hls;
      hls.loadSource(selectedQuality);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log("Auto-play blocked by browser. Press play manually.", e));
      });

      let mediaErrorCount = 0;
      hls.on(Hls.Events.ERROR, function (event, data) {
        console.error("Hls.js Error Encountered:", data.type, data.details, data);
        
        axios.post(`${API_BASE_URL}/api/log`, {
          type: "HLS_ERROR",
          errorType: data.type,
          details: data.details,
          fatal: data.fatal,
          response: data.response ? { code: data.response.code, text: data.response.text } : null
        }).catch(() => {});

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("fatal network error encountered, try to recover");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("fatal media error encountered, try to recover");
              mediaErrorCount++;
              if (mediaErrorCount <= 3) {
                hls.recoverMediaError();
              } else {
                console.log("Cannot recover after 3 media errors, destroying player.");
                hls.destroy();
                setPlayerError("Playback failed due to video decoding errors.");
              }
              break;
            default:
              console.log("fatal player error encountered, destroying player.");
              hls.destroy();
              setPlayerError("Playback failed due to streaming server or player error.");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari support
      video.src = selectedQuality;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(e => console.log("Auto-play blocked.", e));
      });
    } else {
      // Normal MP4 fallback
      video.src = selectedQuality;
      video.play().catch(e => console.log("Auto-play blocked.", e));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedQuality]);

  // Handler to initiate watch state
  const handlePlayEpisode = (episode) => {
    setActiveEpisode(episode);
    setTimeout(() => {
      playerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleNextEpisode = () => {
    if (!activeEpisode) return;
    const currentIndex = episodes.findIndex((ep) => ep.ep_num === activeEpisode.ep_num);
    if (currentIndex < episodes.length - 1) {
      handlePlayEpisode(episodes[currentIndex + 1]);
    }
  };

  const handlePrevEpisode = () => {
    if (!activeEpisode) return;
    const currentIndex = episodes.findIndex((ep) => ep.ep_num === activeEpisode.ep_num);
    if (currentIndex > 0) {
      handlePlayEpisode(episodes[currentIndex - 1]);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading AnimeFlix cinema...</p>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="error-screen">
        <Navbar />
        <div className="error-body">
          <p className="error-icon">📺</p>
          <h2>Unable to Connect to API</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/")} className="btn-back">Return Home</button>
        </div>
        <Footer />
      </div>
    );
  }

  const title = anime.title?.english || anime.title?.romaji || (typeof anime.title === "string" ? anime.title : "Anime details");
  const subTitle = anime.title?.romaji !== title ? anime.title?.romaji : anime.title?.native;
  const rating = anime.average_score || anime.mean_score;
  let banner = anime.banner || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop";
  let poster = anime.cover_image?.large || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop";

  if (typeof banner === 'string' && banner.startsWith('/')) banner = `https://animetsu.cc${banner}`;
  if (typeof poster === 'string' && poster.startsWith('/')) poster = `https://animetsu.cc${poster}`;

  return (
    <div className="details-container">
      <Navbar />

      {/* Hero Backdrop Banner */}
      <div
        className="details-hero"
        style={{
          backgroundImage: `linear-gradient(to top, #141414 8%, rgba(20, 20, 20, 0.4) 60%, rgba(20, 20, 20, 0.8) 95%), url(${banner})`,
        }}
      >
        <div className="details-hero-content">
          <div className="details-poster-container">
            <img src={poster} alt={title} className="details-poster" referrerPolicy="no-referrer" />
          </div>
          <div className="details-info-container">
            <h1 className="details-title">{title}</h1>
            {subTitle && <h3 className="details-subtitle">{subTitle}</h3>}
            
            <div className="details-meta">
              {rating && <span className="meta-badge rating-badge">⭐ {rating}% Score</span>}
              {anime.year && <span className="meta-badge">{anime.year}</span>}
              {anime.format && <span className="meta-badge format-badge">{anime.format}</span>}
              {anime.status && <span className="meta-badge status-badge">{anime.status}</span>}
              {anime.total_eps && <span className="meta-badge">{anime.total_eps} Episodes</span>}
            </div>

            <div className="genres-container">
              {anime.genres?.map((g, idx) => (
                <span key={idx} className="genre-badge">{g}</span>
              ))}
            </div>

            <p className="details-synopsis">{anime.description || "No synopsis available."}</p>
            
            {episodes.length > 0 && (
              <button 
                onClick={() => handlePlayEpisode(episodes[0])} 
                className="btn-watch-spotlight"
              >
                ▶ Start Watching Ep 1
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Theater View Streaming Area */}
      <div ref={playerSectionRef} className="theater-anchor">
        {activeEpisode && (
          <div className="theater-container">
            <div className="theater-player-header">
              <h2>Playing: <span className="highlight">Episode {activeEpisode.ep_num} &mdash; {activeEpisode.name}</span></h2>
              <button onClick={() => setActiveEpisode(null)} className="btn-close-theater">&times; Close Player</button>
            </div>

            <div className="player-aspect-container">
              {playerLoading ? (
                <div className="player-state-overlay">
                  <div className="spinner"></div>
                  <p>Resolving secure streaming sources...</p>
                </div>
              ) : playerError ? (
                <div className="player-state-overlay error-state">
                  <p className="state-icon">⚠️</p>
                  <p>{playerError}</p>
                  <p className="state-sub">Try toggling Server or Audio Sub/Dub options below.</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  controls
                  crossOrigin="anonymous"
                  className="theater-video-element"
                >
                  {/* Append subtitles dynamically */}
                  {watchData?.subtitles?.map((sub, idx) => (
                    <track
                      key={idx}
                      kind="subtitles"
                      src={sub.url}
                      label={sub.label}
                      srcLang={sub.lang || "en"}
                      default={sub.default}
                    />
                  ))}
                  Your browser does not support HTML5 video streaming.
                </video>
              )}
            </div>

            {/* Video Controls & Options Bar */}
            <div className="player-options-bar">
              <div className="option-col">
                <label>Audio Mode</label>
                <div className="audio-toggle-group">
                  <button 
                    onClick={() => setSourceType("sub")} 
                    className={`btn-toggle ${sourceType === "sub" ? "active" : ""}`}
                  >
                    🇯🇵 JP Subbed
                  </button>
                  <button 
                    onClick={() => setSourceType("dub")} 
                    className={`btn-toggle ${sourceType === "dub" ? "active" : ""}`}
                  >
                    🇺🇸 EN Dubbed
                  </button>
                </div>
              </div>

              <div className="option-col">
                <label>Server Stream</label>
                <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} className="select-stream-input">
                  <option value="auto">Auto Select (Fastest)</option>
                  <option value="pahe">Pahe (Direct)</option>
                  <option value="kite">Kite (Mirror)</option>
                </select>
              </div>

              {watchData?.sources && watchData.sources.length > 1 && (
                <div className="option-col">
                  <label>Resolution</label>
                  <select 
                    value={selectedQuality} 
                    onChange={(e) => setSelectedQuality(e.target.value)} 
                    className="select-stream-input"
                  >
                    {watchData.sources.map((s, idx) => (
                      <option key={idx} value={s.proxy_url}>
                        {s.quality}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="option-col player-nav-col">
                <label>Navigation</label>
                <div className="player-nav-buttons">
                  <button 
                    onClick={handlePrevEpisode} 
                    disabled={episodes.findIndex((e) => e.ep_num === activeEpisode.ep_num) === 0}
                    className="btn-nav-ep"
                  >
                    ⏮ Prev
                  </button>
                  <button 
                    onClick={handleNextEpisode} 
                    disabled={episodes.findIndex((e) => e.ep_num === activeEpisode.ep_num) === episodes.length - 1}
                    className="btn-nav-ep"
                  >
                    Next ⏭
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Episode Catalog Section */}
      {episodes.length > 0 ? (
        <div className="episodes-section">
          <h2>Episode List &mdash; <span className="highlight">{episodes.length} Episodes</span></h2>
          <div className="episodes-grid">
            {episodes.map((ep) => (
              <div 
                key={ep.id} 
                onClick={() => handlePlayEpisode(ep)}
                className={`episode-card ${activeEpisode?.ep_num === ep.ep_num ? "playing" : ""}`}
              >
                <div className="episode-thumbnail-container">
                  <img 
                    src={ep.img ? (ep.img.startsWith('/') ? `https://animetsu.cc${ep.img}` : ep.img) : "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=320&auto=format&fit=crop"} 
                    alt={ep.name} 
                    referrerPolicy="no-referrer"
                  />
                  <div className="ep-play-overlay">
                    <span className="overlay-play-icon">▶</span>
                  </div>
                  <span className="ep-num-label">Ep {ep.ep_num}</span>
                </div>
                <div className="episode-details">
                  <h4 className="episode-title">{ep.name || `Episode ${ep.ep_num}`}</h4>
                  {ep.desc && <p className="episode-desc">{ep.desc}</p>}
                  <div className="episode-meta">
                    {ep.views && <span className="episode-views">👁️ {ep.views.toLocaleString()} views</span>}
                    {ep.is_filler && <span className="filler-badge">Filler</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="episodes-empty">
          <h2>Episodes Catalog</h2>
          <p>No episodes are registered for this show yet.</p>
        </div>
      )}

      {/* Characters strip section */}
      {anime.characters && anime.characters.length > 0 && (
        <div className="characters-section">
          <h2>Spotlight Characters</h2>
          <div className="characters-strip">
            {anime.characters.map((c, idx) => (
              <div key={idx} className="character-card">
                <div className="character-image-container">
                  <img 
                    src={c.image || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop"} 
                    alt={c.name} 
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h4 className="character-name">{c.name}</h4>
                <p className="character-role">{c.role === "MAIN" ? "Protagonist" : "Supporting"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations rows */}
      {anime.recommendations && anime.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h2>More Like This</h2>
          <div className="recommendations-grid">
            {anime.recommendations.slice(0, 6).map((rec) => (
              <AnimeCard key={rec.id} anime={rec} />
            ))}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default AnimeDetail;