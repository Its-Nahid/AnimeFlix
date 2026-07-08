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

  // Dynamic episode counts
  const isRecent = !!anime.ep_num;
  const isUpcoming = anime.status === 'NOT_YET_RELEASED';
  const totalEps = anime.total_eps || anime.total_episodes || null;

  // 1. Determine sub count
  let subCount = anime.sub_count !== undefined && anime.sub_count !== null ? anime.sub_count : (anime.episodes?.sub || anime.sub);
  if (subCount === undefined || subCount === null || subCount === '') {
    if (isRecent) {
      subCount = anime.ep_num;
    } else if (anime.next_airing_ep) {
      subCount = anime.next_airing_ep.ep_num - 1;
    } else {
      subCount = totalEps || '?';
    }
  }

  // 2. Determine dub count — only ever from real data. Never assume a dub
  // exists just because a show is airing (previously "simuldub matches sub"),
  // which made sub-only titles falsely show a dub count.
  let dubCount = anime.dub_count !== undefined && anime.dub_count !== null ? anime.dub_count : (anime.episodes?.dub ?? anime.dub);
  if (dubCount === undefined || dubCount === '') {
    dubCount = null;
  }

  // Formatting rating out of 10
  const rating = score ? (score <= 10 ? score : (score / 10).toFixed(1)) : 'NR';

  // Determine release date string
  const releaseDate = anime.start_date || (anime.season && anime.year ? `${anime.season} ${anime.year}` : 'Upcoming');

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
          {isAdult && (
            <>
              <span className="badge-divider">|</span>
              <span className="rating-pg">18+</span>
            </>
          )}
        </div>

        {/* Bottom stats overlay */}
        <div className="card-bottom-overlay">
          {isUpcoming ? (
            <span className="stat-item" style={{ fontSize: '0.73rem', fontWeight: '600' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              {releaseDate}
            </span>
          ) : (
            <>
              <span className="stat-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect><path d="M7 11H9"></path><path d="M15 11H17"></path></svg>
                {isRecent ? `EP ${subCount}` : `${subCount} Sub`}
              </span>
              
              {dubCount !== null && dubCount > 0 && (
                <>
                  <span className="stat-divider">/</span>
                  <span className="stat-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                    {dubCount} Dub
                  </span>
                </>
              )}
            </>
          )}
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