function Hero({ anime, onWatchClick }) {
  if (!anime) {
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

  const title = anime.title?.english || anime.title?.romaji || (typeof anime.title === "string" ? anime.title : "Featured Anime");
  const banner = anime.banner || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1200&auto=format&fit=crop";
  const desc = anime.description || "No synopsis available.";
  const genres = anime.genres || [];

  return (
    <div
      className="hero"
      style={{
        backgroundImage: `linear-gradient(to top, #141414 5%, rgba(20, 20, 20, 0.4) 60%, rgba(20, 20, 20, 0.8) 95%), url(${banner})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      <div className="hero-overlay">
        {genres.length > 0 && (
          <div className="hero-genres">
            {genres.slice(0, 3).map((g, idx) => (
              <span key={idx} className="hero-genre-tag">{g}</span>
            ))}
          </div>
        )}
        <h1 className="hero-title">{title}</h1>
        <p className="hero-desc">{desc.length > 250 ? desc.slice(0, 250) + "..." : desc}</p>
        <div className="hero-buttons">
          <button className="btn-play" onClick={onWatchClick}>▶ Watch Now</button>
        </div>
      </div>
    </div>
  );
}

export default Hero;