import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import AnimeCard from "../components/AnimeCard";
import axios from "axios";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function Search() {
    const query = useQuery().get("query");
    const [results, setResults] = useState([]);

    useEffect(() => {
        async function fetchResults() {
            if (!query) return;
            try {
                const response = await axios.get(
                    `https://api.jikan.moe/v4/anime?q=${query}&limit=20`
                );
                setResults(
                    response.data.data.map((anime) => ({
                        id: anime.mal_id,
                        title: anime.title,
                        img: anime.images.jpg.image_url,
                        description: anime.synopsis,
                    }))
                );
            } catch (error) {
                console.error("Error fetching search results:", error);
            }
        }
        fetchResults();
    }, [query]);

    return (
        <div style={{ padding: "100px 50px", color: "white" }}>
            <h2>Search Results for "{query}"</h2>
            <div className="row-cards" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: "20px" }}>
                {results.map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                ))}
            </div>
        </div>
    );
}

export default Search;