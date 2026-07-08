import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import axios from "axios";
import AnimeCard from "../components/AnimeCard";
import Navbar from "../components/Navbar";
import { API_BASE_URL, ENDPOINTS, proxyImage, fetchZenshinEpisodes, getWatchedEpisodes, markEpisodeWatched } from "../config";

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

  // HLS quality level state
  const [hlsLevels, setHlsLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = auto

  // Which in-player menu is open: 'settings' | 'subtitle' | 'audio' | null
  const [openMenu, setOpenMenu] = useState(null);
  // Settings submenu view: 'root' | 'quality' | 'speed' | 'server'
  const [settingsView, setSettingsView] = useState("root");

  // Subtitle track state (-1 = off)
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [activeSubtitle, setActiveSubtitle] = useState(-1);

  // Custom player transport state
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Watched-episode tracking
  const [watchedEps, setWatchedEps] = useState(() => getWatchedEpisodes(id));
  const watchedMarkedRef = useRef(false);

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

          // Prepare subtitle tracks; default to first (or the flagged default)
          const subs = Array.isArray(data.subtitles) ? data.subtitles : [];
          setSubtitleTracks(subs);
          if (subs.length > 0) {
            const defIdx = subs.findIndex(s => s.default);
            setActiveSubtitle(defIdx >= 0 ? defIdx : 0);
          } else {
            setActiveSubtitle(-1);
          }
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

  // Scroll to top whenever the episode changes (fixes landing mid-page)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id, ep]);

  // Reset the per-episode "already marked watched" guard on episode change.
  useEffect(() => {
    watchedMarkedRef.current = false;
  }, [id, ep]);

  // Mark an episode watched once the viewer has seen ≥30% of it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ep) return;
    const onTimeUpdate = () => {
      if (watchedMarkedRef.current) return;
      if (video.duration && video.currentTime / video.duration >= 0.3) {
        watchedMarkedRef.current = true;
        markEpisodeWatched(id, ep);
        setWatchedEps(getWatchedEpisodes(id));
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [id, ep, watchData]);

  // Apply the selected subtitle track to the video's native text tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = i === activeSubtitle ? "showing" : "hidden";
    }
  }, [activeSubtitle, watchData, playerLoading]);

  // ─── Custom player transport wiring ───────────────────────────────────────
  // Sync React state with the <video> element's events.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playerLoading || playerError) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime);
    const onDuration = () => setDuration(video.duration || 0);
    const onVolume = () => { setVolume(video.volume); setMuted(video.muted); };
    const onRate = () => setPlaybackRate(video.playbackRate);
    const onProgress = () => {
      try {
        if (video.buffered.length) {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        }
      } catch {}
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("ratechange", onRate);
    video.addEventListener("progress", onProgress);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("ratechange", onRate);
      video.removeEventListener("progress", onProgress);
    };
  }, [playerLoading, playerError, watchData]);

  // Track fullscreen changes (from button or Esc key)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  };

  const seek = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };

  const skip = (secs) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(duration || Infinity, Math.max(0, video.currentTime + secs));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const changeVolume = (v) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
  };

  const setRate = (r) => {
    const video = videoRef.current;
    if (video) video.playbackRate = r;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  const fmtTime = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };

  // Auto-hide controls after inactivity while playing
  const revealControls = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!videoRef.current?.paused && !openMenu) setControlsVisible(false);
    }, 3000);
  };

  useEffect(() => () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); }, []);

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
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        // Extract available quality levels
        const levels = hls.levels.map((level, index) => ({
          index,
          height: level.height,
          width: level.width,
          bitrate: level.bitrate,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`
        }));
        setHlsLevels(levels);
        setCurrentLevel(-1); // Start with auto
        video.play().catch(() => {});
      });
      // Track auto-level changes to update UI
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        // Only update if we're in auto mode
        if (hls.autoLevelEnabled) {
          // Don't change currentLevel state, keep it as -1 (auto)
        }
      });
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
            {episodes.map(episode => {
              const isActive = episode.ep_num.toString() === ep;
              const isWatched = watchedEps.has(String(episode.ep_num));
              return (
                <div
                  key={episode.id}
                  className={`ep-sidebar-item ${isActive ? "active" : ""} ${isWatched && !isActive ? "watched" : ""}`}
                  onClick={() => navigate(`/anime/${id}/watch/${episode.ep_num}`)}
                >
                  <span className="ep-sidebar-num">{episode.ep_num}</span>
                  <span className="ep-sidebar-name">{episode.name || `Episode ${episode.ep_num}`}</span>
                  {isActive
                    ? <span className="ep-sidebar-playing">▶</span>
                    : isWatched && <span className="ep-sidebar-watched-check" title="Watched">✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER COLUMN: PLAYER + INFO */}
        <div className="watch-center-col">
          <div
            ref={containerRef}
            className={`video-wrapper ${controlsVisible || !isPlaying ? "controls-on" : "controls-off"}`}
            onMouseMove={revealControls}
            onMouseLeave={() => { if (isPlaying && !openMenu) setControlsVisible(false); }}
          >
            {playerLoading ? (
              <div className="player-loading">
                <div className="spinner"></div>
              </div>
            ) : playerError ? (
              <div className="player-error">{playerError}</div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  crossOrigin="anonymous"
                  className="html-video"
                  onClick={() => { if (openMenu) setOpenMenu(null); else togglePlay(); }}
                  onDoubleClick={toggleFullscreen}
                >
                  {subtitleTracks.map((sub, idx) => (
                    <track key={idx} kind="subtitles" src={sub.url} label={sub.label} srcLang={sub.lang || "en"} />
                  ))}
                </video>

                {/* Center play/pause tap indicator (shows while paused) */}
                {!isPlaying && (
                  <button className="vp-center-play" onClick={togglePlay} aria-label="Play">
                    <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                )}

                {/* ─── Custom bottom control bar ─── */}
                <div className="vp-controls" onClick={(e) => e.stopPropagation()}>
                  {/* Scrubber */}
                  <div className="vp-scrubber" onClick={seek}>
                    <div className="vp-scrubber-buffered" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
                    <div className="vp-scrubber-played" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}>
                      <span className="vp-scrubber-knob" />
                    </div>
                  </div>

                  <div className="vp-buttons">
                    {/* Left cluster */}
                    <div className="vp-left">
                      <button className="vp-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                        {isPlaying ? (
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <button className="vp-btn" onClick={() => skip(-10)} title="Rewind 10s">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4 3 12l8 8" /><path d="M21 12H4" />
                        </svg>
                      </button>
                      <button className="vp-btn" onClick={() => skip(10)} title="Forward 10s">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 4l8 8-8 8" /><path d="M3 12h17" />
                        </svg>
                      </button>

                      <div className="vp-volume">
                        <button className="vp-btn" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
                          {muted || volume === 0 ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 5 6 9H2v6h4l5 4z" />{volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                          )}
                        </button>
                        <input
                          className="vp-volume-slider"
                          type="range" min="0" max="1" step="0.05"
                          value={muted ? 0 : volume}
                          onChange={(e) => changeVolume(parseFloat(e.target.value))}
                        />
                      </div>

                      <span className="vp-time">{fmtTime(currentTime)} <span className="vp-time-sep">/</span> {fmtTime(duration)}</span>
                    </div>

                    {/* Right cluster */}
                    <div className="vp-right">
                      {/* Subtitles / CC */}
                      {subtitleTracks.length > 0 && (
                        <div className="vp-menu-wrap">
                          <button
                            className={`vp-btn ${activeSubtitle >= 0 ? "active" : ""}`}
                            onClick={() => setOpenMenu(openMenu === "subtitle" ? null : "subtitle")}
                            title="Subtitles"
                          >
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 12h4" /><path d="M14 12h4" /><path d="M6 15h2" /><path d="M12 15h6" />
                            </svg>
                          </button>
                          {openMenu === "subtitle" && (
                            <div className="vp-menu">
                              <div className="vp-menu-title">Subtitles</div>
                              <div className={`vp-menu-option ${activeSubtitle === -1 ? "active" : ""}`} onClick={() => { setActiveSubtitle(-1); setOpenMenu(null); }}>
                                <span>Off</span>{activeSubtitle === -1 && <span className="vp-menu-check">✓</span>}
                              </div>
                              {subtitleTracks.map((sub, idx) => (
                                <div key={idx} className={`vp-menu-option ${activeSubtitle === idx ? "active" : ""}`} onClick={() => { setActiveSubtitle(idx); setOpenMenu(null); }}>
                                  <span>{sub.label || sub.lang || `Track ${idx + 1}`}</span>
                                  {activeSubtitle === idx && <span className="vp-menu-check">✓</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Settings: Quality / Speed / Server */}
                      <div className="vp-menu-wrap">
                        <button
                          className={`vp-btn ${openMenu === "settings" ? "active" : ""}`}
                          onClick={() => { setOpenMenu(openMenu === "settings" ? null : "settings"); setSettingsView("root"); }}
                          title="Settings"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </button>
                        {openMenu === "settings" && (
                          <div className="vp-menu">
                            {settingsView === "root" && (
                              <>
                                <div className="vp-menu-row" onClick={() => setSettingsView("quality")}>
                                  <span>Quality</span>
                                  <span className="vp-menu-value">{currentLevel === -1 ? "Auto" : (hlsLevels.find(l => l.index === currentLevel)?.label || "Auto")} ›</span>
                                </div>
                                <div className="vp-menu-row" onClick={() => setSettingsView("speed")}>
                                  <span>Speed</span>
                                  <span className="vp-menu-value">{playbackRate === 1 ? "Normal" : `${playbackRate}x`} ›</span>
                                </div>
                                <div className="vp-menu-row" onClick={() => setSettingsView("server")}>
                                  <span>Server</span>
                                  <span className="vp-menu-value" style={{ textTransform: "capitalize" }}>{selectedServer} ›</span>
                                </div>
                              </>
                            )}

                            {settingsView === "quality" && (
                              <>
                                <div className="vp-menu-back" onClick={() => setSettingsView("root")}>‹ Quality</div>
                                <div className={`vp-menu-option ${currentLevel === -1 ? "active" : ""}`} onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = -1; setCurrentLevel(-1); }}>
                                  <span>Auto</span>{currentLevel === -1 && <span className="vp-menu-check">✓</span>}
                                </div>
                                {hlsLevels.length > 1 ? (
                                  [...hlsLevels].sort((a, b) => b.height - a.height).map(level => (
                                    <div key={level.index} className={`vp-menu-option ${currentLevel === level.index ? "active" : ""}`} onClick={() => { if (hlsRef.current) hlsRef.current.currentLevel = level.index; setCurrentLevel(level.index); }}>
                                      <span>{level.label}</span>
                                      {level.height >= 1080 && <span className="vp-hd-badge">HD</span>}
                                      {currentLevel === level.index && <span className="vp-menu-check">✓</span>}
                                    </div>
                                  ))
                                ) : (
                                  <div className="vp-menu-option disabled"><span>Auto only</span></div>
                                )}
                              </>
                            )}

                            {settingsView === "speed" && (
                              <>
                                <div className="vp-menu-back" onClick={() => setSettingsView("root")}>‹ Speed</div>
                                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                  <div key={rate} className={`vp-menu-option ${playbackRate === rate ? "active" : ""}`} onClick={() => { setRate(rate); }}>
                                    <span>{rate === 1 ? "Normal" : `${rate}x`}</span>
                                    {playbackRate === rate && <span className="vp-menu-check">✓</span>}
                                  </div>
                                ))}
                              </>
                            )}

                            {settingsView === "server" && (
                              <>
                                <div className="vp-menu-back" onClick={() => setSettingsView("root")}>‹ Server</div>
                                {["auto", "kite", "dio"].map(srv => (
                                  <div key={srv} className={`vp-menu-option ${selectedServer === srv ? "active" : ""}`} onClick={() => { setSelectedServer(srv); setOpenMenu(null); }}>
                                    <span style={{ textTransform: "capitalize" }}>{srv === "auto" ? "⚡ Auto" : srv}</span>
                                    {selectedServer === srv && <span className="vp-menu-check">✓</span>}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <button className="vp-btn" onClick={toggleFullscreen} title="Fullscreen">
                        {isFullscreen ? (
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Server Controls Row */}
          <div className="watch-server-row">
            <div className="watch-server-group">
              <span className="watch-server-type-label">SERVER</span>
              <div className="watch-server-btns">
                <button className={`watch-srv-btn ${selectedServer === "auto" ? "active" : ""}`} onClick={() => setSelectedServer("auto")}>⚡ Auto</button>
                <button className={`watch-srv-btn ${selectedServer === "kite" ? "active" : ""}`} onClick={() => setSelectedServer("kite")}>Kite</button>
                <button className={`watch-srv-btn ${selectedServer === "dio" ? "active" : ""}`} onClick={() => setSelectedServer("dio")}>Dio</button>
              </div>
            </div>
            <div className="watch-server-group">
              <span className="watch-server-type-label">AUDIO</span>
              <div className="watch-server-btns">
                <button className={`watch-srv-btn ${sourceType === "sub" ? "active" : ""}`} onClick={() => setSourceType("sub")}>🇯🇵 Sub</button>
                <button className={`watch-srv-btn ${sourceType === "dub" ? "active" : ""}`} onClick={() => setSourceType("dub")}>🎤 Dub</button>
              </div>
            </div>
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
                <div className="meta-item"><span className="meta-label">Episodes:</span> <span className="meta-value">{anime.total_eps || anime.total_episodes || episodes.length}</span></div>
                {anime.sub_count !== null && anime.sub_count !== undefined && <div className="meta-item"><span className="meta-label">Sub:</span> <span className="meta-value">{anime.sub_count}</span></div>}
                {anime.dub_count !== null && anime.dub_count !== undefined && <div className="meta-item"><span className="meta-label">Dub:</span> <span className="meta-value">{anime.dub_count}</span></div>}
                <div className="meta-item"><span className="meta-label">Status:</span> <span className="meta-value">{anime.status || 'Unknown'}</span></div>
                <div className="meta-item"><span className="meta-label">Duration:</span> <span className="meta-value">{anime.duration ? `${anime.duration} min` : '24 min'}</span></div>
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

          {/* Seasons / Relations Bar */}
          {anime.relations && anime.relations.length > 0 && (
            <div className="watch-seasons-bar">
              {(() => {
                // Build the list: current anime + its relations, sorted logically
                const relationOrder = ['PREQUEL', 'PARENT', 'SIDE_STORY', 'SEQUEL', 'ALTERNATIVE', 'SPIN_OFF', 'OTHER', 'CHARACTER', 'SUMMARY', 'COMPILATION'];
                const relationLabels = {
                  'PREQUEL': 'Prequel',
                  'SEQUEL': 'Sequel',
                  'SIDE_STORY': 'Side Story',
                  'PARENT': 'Parent',
                  'ALTERNATIVE': 'Alternative',
                  'SPIN_OFF': 'Spin Off',
                  'OTHER': 'Related',
                  'CHARACTER': 'Character',
                  'SUMMARY': 'Summary',
                  'COMPILATION': 'Compilation'
                };
                
                // Current anime entry
                const currentEntry = {
                  id: anime.id,
                  title: animeTitle,
                  format: anime.format || 'TV',
                  isCurrent: true
                };
                
                // Map relations with their labels
                const relEntries = anime.relations.map(rel => ({
                  id: rel.id,
                  title: rel.title?.english || rel.title?.romaji,
                  format: rel.format,
                  relation_type: rel.relation_type,
                  label: relationLabels[rel.relation_type] || rel.relation_type,
                  isCurrent: false,
                  cover: rel.cover_image?.large || rel.cover_image?.medium
                }));

                // Sort: prequels first, then current, then sequels, then others
                const prequels = relEntries.filter(r => r.relation_type === 'PREQUEL');
                const sequels = relEntries.filter(r => r.relation_type === 'SEQUEL');
                const others = relEntries.filter(r => !['PREQUEL', 'SEQUEL'].includes(r.relation_type));
                
                const allEntries = [...prequels, currentEntry, ...sequels, ...others];

                return allEntries.map((entry, idx) => (
                  <div 
                    key={entry.id}
                    className={`season-tab ${entry.isCurrent ? 'active' : ''}`}
                    onClick={() => !entry.isCurrent && navigate(`/anime/${entry.id}`)}
                    title={entry.title}
                  >
                    {entry.cover && (
                      <img className="season-tab-thumb" src={proxyImage(entry.cover)} alt="" />
                    )}
                    <div className="season-tab-text">
                      <span className="season-tab-label">
                        {entry.isCurrent ? (entry.format || 'CURRENT') : (entry.label || entry.format)}
                      </span>
                      <span className="season-tab-title">{entry.title}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
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
