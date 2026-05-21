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
  const format = anime.format || "TV";
  
  // Dynamic maturity rating
  const isAdult = anime.isAdult || anime.is_adult;
  const maturityRating = isAdult ? '18+' : (anime.rating || 'PG-13');

  // Dynamic episode counts
  const subEps = anime.episodes?.sub || anime.sub || anime.ep_num || anime.total_eps || '?';
  const dubEps = anime.episodes?.dub || anime.dub || null; 
  const totalEps = anime.total_eps || anime.total_episodes || '?';

  // Formatting rating out of 10
  const rating = score ? (score <= 10 ? score : (score / 10).toFixed(1)) : 'NR';

  return (
    <Link to={`/anime/${id}`} className="anime-card-link new-card-design">
      <div className="anime-card-image-wrapper">
        <img src={img} alt={title} loading="lazy" referrerPolicy="no-referrer" className="anime-card-img" />
        
        {/* Top left badge */}
        <div className="card-top-badge">
          <span className="star-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffb800" stroke="#ffb800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </span>
          <span className="rating-val">{rating}</span>
          <span className="badge-divider">|</span>
          <span className="rating-pg">{maturityRating}</span>
        </div>

        {/* Bottom stats overlay */}
        <div className="card-bottom-overlay">
          <span className="stat-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect><path d="M7 11H9"></path><path d="M15 11H17"></path></svg>
            {subEps}
          </span>
          
          {dubEps && (
            <>
              <span className="stat-divider">/</span>
              <span className="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                {dubEps}
              </span>
            </>
          )}

          <span className="stat-divider">/</span>
          <span className="stat-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            {totalEps}
          </span>
        </div>
      </div>
      
      <div className="anime-card-details">
        <h3 className="new-card-title"><span className="title-dot"></span>{title}</h3>
        <p className="new-card-meta">{format} {anime.duration ? `· ${anime.duration}m` : ''}</p>
      </div>
    </Link>
  );
}

export default AnimeCard;