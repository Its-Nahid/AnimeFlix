import { Link } from "react-router-dom";

function AnimeCard({ anime }) {
  // Normalize fields between different possible schema variations
  const id = anime.id || anime.mal_id;
  const title = anime.title?.english || anime.title?.romaji || (typeof anime.title === "string" ? anime.title : "Unknown Title");
  let img = anime.cover_image?.large || anime.img || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=300&auto=format&fit=crop";
  if (typeof img === 'string' && img.startsWith('/')) {
    img = `https://animetsu.cc${img}`;
  }
  const score = anime.average_score || anime.mean_score || null;
  const year = anime.year || null;
  const format = anime.format || null;

  return (
    <Link to={`/anime/${id}`} className="anime-card-link">
      <div className="anime-card">
        <div className="anime-card-img-container">
          <img src={img} alt={title} loading="lazy" referrerPolicy="no-referrer" />
        </div>
        <div className="overlay">
          <div className="overlay-content">
            <h3 className="card-title">{title}</h3>
            <div className="card-meta">
              {score && <span className="card-score">⭐ {score}%</span>}
              {year && <span className="card-year">{year}</span>}
              {format && <span className="card-format">{format}</span>}
            </div>
            {anime.genres && anime.genres.length > 0 && (
              <div className="card-genres">
                {anime.genres.slice(0, 2).map((g, idx) => (
                  <span key={idx} className="card-genre">{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default AnimeCard;