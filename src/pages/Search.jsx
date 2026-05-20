import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AnimeCard from "../components/AnimeCard";
import { API_BASE_URL } from "../config";
import axios from "axios";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

const GENRES_LIST = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", 
    "Mystery", "Romance", "Sci-Fi", "Supernatural", "Thriller",
    "Psychological", "Horror", "Sports", "Mecha"
];

const FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"];

const SORTS = [
    { value: "POPULARITY_DESC", label: "Most Popular" },
    { value: "SCORE_DESC", label: "Highest Rated" },
    { value: "TRENDING_DESC", label: "Trending Now" },
    { value: "UPDATED_AT_DESC", label: "Recently Updated" },
    { value: "START_DATE_DESC", label: "Release Date" }
];

function Search() {
    const queryParam = useQuery().get("query") || "";

    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Dynamic Filter states
    const [selectedGenre, setSelectedGenre] = useState("");
    const [selectedFormat, setSelectedFormat] = useState("");
    const [selectedSort, setSelectedSort] = useState("POPULARITY_DESC");

    useEffect(() => {
        let isMounted = true;
        async function fetchResults() {
            setLoading(true);
            setError(null);
            try {
                // Build dynamic query parameters for animetsu-api search
                let url = `${API_BASE_URL}/api/search?q=${encodeURIComponent(queryParam)}`;
                if (selectedGenre) url += `&genres=${selectedGenre}`;
                if (selectedFormat) url += `&format=${selectedFormat}`;
                if (selectedSort) url += `&sort=${selectedSort}`;

                const response = await axios.get(url);
                if (isMounted) {
                    const list = response.data?.success ? response.data.data : response.data;
                    setResults(Array.isArray(list) ? list : []);
                }
            } catch (err) {
                console.error("Error fetching search results:", err);
                if (isMounted) {
                    setError("Failed to fetch search results. Make sure your local Animetsu API server is running.");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchResults();
        return () => {
            isMounted = false;
        };
    }, [queryParam, selectedGenre, selectedFormat, selectedSort]);

    return (
        <div className="search-page-container">
            <Navbar />
            <div className="search-content">
                <div className="search-header">
                    <h2>Search results for <span className="highlight">"{queryParam}"</span></h2>
                    
                    {/* Advanced filter control bar */}
                    <div className="filters-bar">
                        <div className="filter-group">
                            <label>Genre</label>
                            <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}>
                                <option value="">All Genres</option>
                                {GENRES_LIST.map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Format</label>
                            <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}>
                                <option value="">All Formats</option>
                                {FORMATS.map((f) => (
                                    <option key={f} value={f}>{f.replace("_", " ")}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Sort By</label>
                            <select value={selectedSort} onChange={(e) => setSelectedSort(e.target.value)}>
                                {SORTS.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="search-loading-container">
                        <div className="spinner"></div>
                        <p>Searching the AnimeFlix archives...</p>
                    </div>
                ) : error ? (
                    <div className="search-error-container">
                        <p className="error-icon">⚠️</p>
                        <p>{error}</p>
                        <p className="error-sub">Base URL: <code>{API_BASE_URL}</code></p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="search-empty-container">
                        <p className="empty-icon">📺</p>
                        <p>No titles matched your query. Try adjusting your filter tags or search keywords!</p>
                    </div>
                ) : (
                    <div className="search-grid">
                        {results.map((anime) => (
                            <AnimeCard key={anime.id || anime.mal_id} anime={anime} />
                        ))}
                    </div>
                )}
            </div>
            <Footer />
        </div>
    );
}

export default Search;