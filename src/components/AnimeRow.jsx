import { useState, useEffect } from "react";
import AnimeCard from "./AnimeCard";
import axios from "axios";
import { Link } from "react-router-dom";

function AnimeRow({ title, subtitle, url, data, limit = 0, viewMoreLink = "/search" }) {
    const [animeList, setAnimeList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    useEffect(() => {
        if (data) {
            setAnimeList(data);
            if (data.length > 0) {
                setLoading(false);
            }
            return;
        }

        if (!url) return;
        let isMounted = true;
        async function fetchAnime() {
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get(url);
                if (isMounted) {
                    // Animetsu-api wraps responses in standard models.Envelope { success, data }
                    const list = response.data?.success ? response.data.data : response.data;
                    setAnimeList(Array.isArray(list) ? list : (list?.results || []));
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
    }, [url, data, retryTrigger]);

    if (loading) {
        return (
            <div className="anime-row">
                <div className="row-header-wrapper">
                    <div className="row-header">
                        <h2>{title}</h2>
                    </div>
                    {subtitle && <p className="row-subtitle">{subtitle}</p>}
                </div>
                <div className="row-cards" style={{ overflow: "hidden" }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <div key={n} className="shimmer-card" style={{
                            minWidth: "170px",
                            height: "250px",
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

    if (error) {
        return (
            <div className="anime-row">
                <div className="row-header-wrapper">
                    <div className="row-header">
                        <h2>{title}</h2>
                    </div>
                    {subtitle && <p className="row-subtitle">{subtitle}</p>}
                </div>
                <div className="row-error-message" style={{ padding: "30px 20px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px dashed rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", margin: "10px 0" }}>
                    <p style={{ margin: 0, color: "#aaa" }}>Failed to load list: {error}</p>
                    <button onClick={() => setRetryTrigger(prev => prev + 1)} style={{ padding: "8px 20px", background: "var(--primary-red, #e50914)", border: "none", color: "#fff", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", transition: "background 0.2s" }} onMouseOver={(e) => e.target.style.background = "#b80710"} onMouseOut={(e) => e.target.style.background = "var(--primary-red, #e50914)"}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (animeList.length === 0) {
        return null; // Gracefully hide rows that are empty
    }

    const displayList = limit > 0 ? animeList.slice(0, limit) : animeList;

    return (
        <div className="anime-row">
            <div className="row-header-wrapper">
                <div className="row-header">
                    <h2>{title}</h2>
                    {viewMoreLink && (
                        <Link to={viewMoreLink} className="view-more-btn">
                            VIEW MORE 
                            <svg className="view-more-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </Link>
                    )}
                </div>
                {subtitle && <p className="row-subtitle">{subtitle}</p>}
            </div>
            <div className="row-cards">
                {displayList.map((anime) => (
                    <AnimeCard key={anime.id || anime.mal_id} anime={anime} />
                ))}
            </div>
        </div>
    );
}

export default AnimeRow;