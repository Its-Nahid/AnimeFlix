import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import { ENDPOINTS, proxyImage } from "../config";

function AnimeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // States
  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("episodes");
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  // Fetch anime info & episodes
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
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
          setError("Failed to load anime details.");
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

  if (loading) {
    return (
      <div className="layout-with-sidebar">
        <div className="main-content loading-screen">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="layout-with-sidebar">
        <div className="main-content error-screen">
          <div className="error-body">
            <p className="error-icon">📺</p>
            <h2>Unable to Connect to API</h2>
            <p>{error}</p>
            <button onClick={() => navigate("/")} className="btn-back">Return Home</button>
          </div>
        </div>
      </div>
    );
  }

  const title = anime.title?.english || anime.title?.romaji || (typeof anime.title === "string" ? anime.title : "Anime details");
  const subTitle = anime.title?.romaji !== title ? anime.title?.romaji : anime.title?.native;
  const rating = anime.average_score || anime.mean_score;
  let banner = anime.banner || anime.cover_image?.large || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop";
  let poster = anime.cover_image?.large || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop";

  if (typeof banner === 'string' && banner.startsWith('/')) banner = `https://animetsu.cc${banner}`;
  if (typeof poster === 'string' && poster.startsWith('/')) poster = `https://animetsu.cc${poster}`;

  return (
    <div className="layout-without-sidebar">
      <Navbar />

      <div className="main-content">
        {/* Banner Section */}
        <div className="anime-banner-header" style={{ backgroundImage: `url(${banner})` }}>
          <div className="banner-gradient-overlay"></div>
        </div>

        {/* Content Section */}
        <div className="anime-content-section">
          
          {/* Header Info (Poster + Text) */}
          <div className="anime-header-container">
            {/* Left side: Poster overlapping banner */}
            <div className="anime-poster-column">
              <div className="poster-wrapper">
                <img src={poster} alt={title} referrerPolicy="no-referrer" />
              </div>
              
              <button 
                className="action-btn primary mt-3"
                onClick={() => {
                  if (episodes.length > 0) {
                    navigate(`/anime/${id}/watch/${episodes[0].ep_num}`);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                Watch Now
              </button>
              <button className="action-btn secondary mt-2">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                Add to Library
              </button>
            </div>

            {/* Right side: Titles, Meta, Synopsis */}
            <div className="anime-info-column">
              <h1 className="main-title-new">{title}</h1>
              {subTitle && <h3 className="native-title-new">{subTitle}</h3>}
              
              <div className="title-meta-new">
                {anime.format && <span className="meta-tag format">{anime.format}</span>}
                {anime.total_eps && <span className="meta-tag">{anime.total_eps} episodes</span>}
                {anime.status && <span className="meta-tag status">[{anime.status}]</span>}
                {anime.start_date && <span className="meta-tag">{anime.start_date}</span>}
                {anime.season && <span className="meta-tag season">{anime.season} {anime.year}</span>}
                {rating && <span className="meta-tag rating">★ {rating} / 100</span>}
              </div>

              <div className="genres-line">
                {anime.genres?.join(", ")}
                {anime.next_airing_ep && (
                  <span className="next-ep-inline">
                    &nbsp;• Episode {anime.next_airing_ep.ep_num} : airs in {Math.floor(anime.next_airing_ep.time_left / 86400)}d {Math.floor((anime.next_airing_ep.time_left % 86400) / 3600)}h
                  </span>
                )}
              </div>

              <div className="synopsis-box-new">
                <div 
                  className={`synopsis-text ${synopsisExpanded ? 'expanded' : ''}`}
                  dangerouslySetInnerHTML={{ __html: anime.description || "No description available." }}
                ></div>
                {(anime.description?.length > 250) && (
                  <button 
                    className="view-more-btn" 
                    onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                  >
                    {synopsisExpanded ? 'View Less' : 'View More'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="tabs-header-new">
            <button className={activeTab === "episodes" ? "active" : ""} onClick={() => setActiveTab("episodes")}>Episodes <span className="count">{episodes.length}</span></button>
            <button className={activeTab === "characters" ? "active" : ""} onClick={() => setActiveTab("characters")}>Characters <span className="count">{anime.characters?.length || 0}</span></button>
            <button className={activeTab === "staff" ? "active" : ""} onClick={() => setActiveTab("staff")}>Staff</button>
            <button className={activeTab === "related" ? "active" : ""} onClick={() => setActiveTab("related")}>Related</button>
          </div>

          {/* TAB CONTENT */}
          {activeTab === "episodes" && (
            <div className="tab-content episodes-tab-new">
              <div className="ep-grid-new">
                {episodes.map(ep => (
                  <div 
                    key={ep.id} 
                    className="ep-card-new"
                    onClick={() => navigate(`/anime/${id}/watch/${ep.ep_num}`)}
                  >
                    <div className="ep-thumb">
                      <img 
                        src={proxyImage(ep.img, banner)} 
                        alt={ep.name} 
                      />
                      <div className="ep-badge">EP {ep.ep_num}</div>
                    </div>
                    <div className="ep-info">
                      <h4>{ep.name || `Episode ${ep.ep_num}`}</h4>
                      <div className="ep-stats">
                        <span>{ep.created_at ? new Date(ep.created_at).toLocaleDateString() : 'Unknown date'}</span>
                        {ep.views && <span> • {ep.views.toLocaleString()} views</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === "characters" && (
            <div className="tab-content chars-tab-new mt-3">
              <div className="chars-grid">
                {anime.characters?.map((char, i) => (
                  <div key={i} className="char-card">
                    <img src={proxyImage(char.image)} alt={char.name} className="char-img" />
                    <div className="char-info">
                      <div className="char-name">{char.name}</div>
                      <div className="char-role">{char.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "staff" && (
            <div className="tab-content chars-tab-new mt-3">
              <div className="chars-grid">
                {anime.staff?.map((s, i) => (
                  <div key={i} className="char-card">
                    <img src={proxyImage(s.image)} alt={s.name} className="char-img" />
                    <div className="char-info">
                      <div className="char-name">{s.name}</div>
                      <div className="char-role">{s.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "related" && (
            <div className="tab-content related-tab-new mt-3">
              <div className="related-grid">
                {anime.recommendations?.map((rec, i) => (
                  <div key={i} className="poster-card" style={{cursor: 'pointer'}} onClick={() => navigate(`/anime/${rec.id}`)}>
                    <img src={proxyImage(rec.cover_image?.large)} alt={rec.title?.english || rec.title?.romaji} />
                    <div style={{padding: '8px', fontSize: '0.85rem', color: '#fff'}}>{rec.title?.english || rec.title?.romaji}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default AnimeDetail;