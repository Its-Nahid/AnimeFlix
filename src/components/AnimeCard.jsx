import { Link } from "react-router-dom";

function AnimeCard({ anime }) {
    return (
        <Link to={`/anime/${anime.id}`}>
            <div className="anime-card">
                <img src={anime.img} alt={anime.title} />
                <div className="overlay">
                    <h3>{anime.title}</h3>
                </div>
            </div>
        </Link>
    );
}

export default AnimeCard;