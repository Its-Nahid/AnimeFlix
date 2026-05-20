import { useState, useEffect } from "react";
import AnimeCard from "./AnimeCard";
import axios from "axios";

function AnimeRow({ title, url }) {
    const [animeList, setAnimeList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        async function fetchAnime() {
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get(url);
                if (isMounted) {
                    // Animetsu-api wraps responses in standard models.Envelope { success, data }
                    const list = response.data?.success ? response.data.data : response.data;
                    setAnimeList(Array.isArray(list) ? list : []);
                }
            } catch (err) {
                console.error("Error fetching anime in row:", err);
                if (isMounted) {
                    setError("Failed to load list");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchAnime();
        return () => {
            isMounted = false;
        };
    }, [url]);

    if (loading) {
        return (
            <div className="anime-row">
                <h2>{title}</h2>
                <div className="row-cards" style={{ overflow: "hidden" }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className="shimmer-card" style={{
                            minWidth: "150px",
                            height: "225px",
                            borderRadius: "8px",
                            background: "linear-gradient(90deg, #222 25%, #333 50%, #222 75%)",
                            backgroundSize: "200% 100%",
                            animation: "shimmer 1.5s infinite",
                            flexShrink: 0
                        }}></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || animeList.length === 0) {
        return null; // Gracefully hide rows that fail or are empty
    }

    return (
        <div className="anime-row">
            <h2>{title}</h2>
            <div className="row-cards">
                {animeList.map((anime) => (
                    <AnimeCard key={anime.id || anime.mal_id} anime={anime} />
                ))}
            </div>
        </div>
    );
}

export default AnimeRow;