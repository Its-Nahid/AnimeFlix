import { useState, useEffect, useRef } from "react";

const LOGO_MAP = {
  "classroom of the elite": "https://upload.wikimedia.org/wikipedia/commons/3/37/Classroom_of_the_Elite_Text_Logo_%28English%29.svg",
  "yokoso jitsuryoku": "https://upload.wikimedia.org/wikipedia/commons/3/37/Classroom_of_the_Elite_Text_Logo_%28English%29.svg",
  "yōkoso jitsuryoku": "https://upload.wikimedia.org/wikipedia/commons/3/37/Classroom_of_the_Elite_Text_Logo_%28English%29.svg",
  "re:zero": "https://image.tmdb.org/t/p/original/wNysocYhYIiCNI3SQBBTw0DTkWu.png",
  "that time i got reincarnated as a slime": "https://static.wikia.nocookie.net/vsbattles/images/4/46/TSSDK_Logo_%28Render%29.png/revision/latest?cb=20181010214854",
  "witch hat atelier": "https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fmetadata-static.plex.tv%2F0%2F683a142553%2F03d37dd25ccc9887acc4f142f0b129e1.png",
  "tongari boushi": "https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fmetadata-static.plex.tv%2F0%2F683a142553%2F03d37dd25ccc9887acc4f142f0b129e1.png",
  "tongari bōshi": "https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fmetadata-static.plex.tv%2F0%2F683a142553%2F03d37dd25ccc9887acc4f142f0b129e1.png",
  "daemons of the shadow realm": "https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fmetadata-static.plex.tv%2F2%2F683a142553%2F2cdc102647fa42aecac68070b395cd13.png",
  "yomi no tsugai": "https://images.plex.tv/photo?size=large-1280&scale=1&url=https%3A%2F%2Fmetadata-static.plex.tv%2F2%2F683a142553%2F2cdc102647fa42aecac68070b395cd13.png"
};

const BANNER_MAP = {
  "re:zero": "https://finalweapon.net/wp-content/uploads/2026/03/ReZERO-Starting-Life-in-Another-World-Season-4-thumbnail.webp",
  "daemons of the shadow realm": "https://images.alphacoders.com/140/thumb-1920-1407873.jpg",
  "yomi no tsugai": "https://images.alphacoders.com/140/thumb-1920-1407873.jpg",
  "that time i got reincarnated as a slime": "https://images4.alphacoders.com/137/1378184.jpg",
  "witch hat atelier": "https://images.alphacoders.com/140/thumb-1920-1407912.png",
  "tongari boushi": "https://images.alphacoders.com/140/thumb-1920-1407912.png",
  "tongari bōshi": "https://images.alphacoders.com/140/thumb-1920-1407912.png",
  "classroom of the elite": "https://pbs.twimg.com/media/HE1avbFbQAA7uHr.jpg",
  "yokoso jitsuryoku": "https://pbs.twimg.com/media/HE1avbFbQAA7uHr.jpg",
  "yōkoso jitsuryoku": "https://pbs.twimg.com/media/HE1avbFbQAA7uHr.jpg"
};

function Hero({ animeList, onWatchClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef(null);

  // Auto-rotation every 10 seconds
  useEffect(() => {
    if (!animeList || animeList.length === 0) return;

    const startTimer = () => {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % animeList.length);
      }, 10000);
    };

    startTimer();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [animeList]);

  // Reset timer on manual action to prevent fast cycling
  const resetTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % animeList.length);
      }, 10000);
    }
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    resetTimer();
    setCurrentIndex((prev) => (prev === 0 ? animeList.length - 1 : prev - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    resetTimer();
    setCurrentIndex((prev) => (prev + 1) % animeList.length);
  };

  const handleIndicatorClick = (idx, e) => {
    e.stopPropagation();
    resetTimer();
    setCurrentIndex(idx);
  };

  if (!animeList || animeList.length === 0) {
    return (
      <div className="hero shimmer-hero" style={{ height: "65vh", background: "#141414" }}>
        <div className="hero-overlay">
          <div className="shimmer-bar animate-shimmer" style={{ height: "45px", width: "40%", background: "#333", marginBottom: "15px", borderRadius: "4px" }}></div>
          <div className="shimmer-bar animate-shimmer" style={{ height: "20px", width: "70%", background: "#222", marginBottom: "10px", borderRadius: "4px" }}></div>
          <div className="shimmer-bar animate-shimmer" style={{ height: "20px", width: "60%", background: "#222", marginBottom: "25px", borderRadius: "4px" }}></div>
          <div className="shimmer-bar animate-shimmer" style={{ height: "45px", width: "140px", background: "#444", borderRadius: "5px" }}></div>
        </div>
      </div>
    );
  }

  const anime = animeList[currentIndex];
  const title = anime.title?.english || anime.title?.romaji || (typeof anime.title === "string" ? anime.title : "Featured Anime");
  
  // Resolve clear logo dynamically by checking title matching
  let logoUrl = anime.clear_logo || null;
  const englishTitleLower = anime.title?.english?.toLowerCase() || "";
  const romajiTitleLower = anime.title?.romaji?.toLowerCase() || "";
  if (!logoUrl) {
    for (const [key, url] of Object.entries(LOGO_MAP)) {
      if (englishTitleLower.includes(key) || romajiTitleLower.includes(key)) {
        logoUrl = url;
        break;
      }
    }
  }

  // Resolve custom banner background image
  let customBanner = null;
  for (const [key, url] of Object.entries(BANNER_MAP)) {
    if (englishTitleLower.includes(key) || romajiTitleLower.includes(key)) {
      customBanner = url;
      break;
    }
  }

  const banner = customBanner || anime.banner || anime.cover_image?.large || anime.cover_image?.medium || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop";
  const desc = anime.description || "No synopsis available.";
  const genres = anime.genres || [];

  // Metadata
  const year = anime.year || anime.seasonYear || "N/A";
  const format = anime.format || "";
  const episodes = typeof anime.episodes === "object"
    ? (anime.episodes?.total || anime.total_eps || anime.total_episodes || "?")
    : (anime.episodes || anime.total_eps || anime.total_episodes || "?");
  const duration = anime.duration ? `${anime.duration}m` : "";
  const ratingVal = anime.average_score ? (anime.average_score / 10).toFixed(1) : "";
  const status = anime.status === "RELEASING" ? "Airing" : anime.status === "FINISHED" ? "Completed" : anime.status;

  return (
    <div className="hero">
      {/* Cinematic Background Slide */}
      <div 
        key={`bg-${currentIndex}`}
        className="hero-backdrop-slide"
        style={{
          backgroundImage: `linear-gradient(to top, #000000 5%, rgba(0, 0, 0, 0.4) 60%, rgba(0, 0, 0, 0.8) 95%), url(${banner})`,
        }}
      />

      {/* Left/Right manual arrows */}
      <button className="hero-carousel-arrow left" onClick={handlePrev} aria-label="Previous Slide">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button className="hero-carousel-arrow right" onClick={handleNext} aria-label="Next Slide">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      {/* Slide Text Content overlay with key change to re-trigger slide-up */}
      <div className="hero-overlay" key={`content-${currentIndex}`}>
        {genres.length > 0 && (
          <div className="hero-genres">
            {genres.slice(0, 3).map((g, idx) => (
              <span key={idx} className="hero-genre-tag">{g}</span>
            ))}
          </div>
        )}
        
        {/* Dynamic Title / Logo display */}
        {logoUrl ? (
          <img src={logoUrl} alt={title} className="hero-logo" />
        ) : (
          <h1 className="hero-title">{title}</h1>
        )}
        
        {/* Clean Metadata Layout (matches exact reference design) */}
        <div className="hero-clean-meta">
          <span className="hero-meta-item">{year}</span>
          {format && <span className="hero-meta-divider">•</span>}
          {format && <span className="hero-meta-item">{format}</span>}
          <span className="hero-meta-divider">•</span>
          <span className="hero-meta-item">{episodes} eps</span>
          {duration && <span className="hero-meta-divider">•</span>}
          {duration && <span className="hero-meta-item">{duration}</span>}
          {ratingVal && (
            <span className="hero-meta-rating">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              {ratingVal}
            </span>
          )}
          {status && <span className="hero-meta-status">{status}</span>}
          
          {/* Mini Watch Now Button placed directly beside Airing status */}
          <button className="btn-play-mini" onClick={() => onWatchClick(anime)}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style={{ marginRight: '4px', verticalAlign: 'middle', marginTop: '-2px' }}><path d="M8 5v14l11-7z"></path></svg>
            Watch Now
          </button>
        </div>

        <p className="hero-desc">{desc.replace(/<[^>]*>/g, '').length > 250 ? desc.replace(/<[^>]*>/g, '').slice(0, 250) + "..." : desc.replace(/<[^>]*>/g, '')}</p>
      </div>

      {/* Segmented indicators at bottom right */}
      <div className="hero-carousel-indicators">
        {animeList.map((_, idx) => (
          <div
            key={idx}
            className={`hero-carousel-indicator-bar ${idx === currentIndex ? "active" : ""}`}
            onClick={(e) => handleIndicatorClick(idx, e)}
          />
        ))}
      </div>
    </div>
  );
}

export default Hero;