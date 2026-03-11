import { useState, useEffect } from "react";
import AnimeCard from "./AnimeCard";
import axios from "axios";

function AnimeRow({ title, url }) {
    const [animeList, setAnimeList] = useState([]);

    useEffect(() => {
        async function fetchAnime() {
            try {
                const response = await axios.get(url);
                setAnimeList(
                    response.data.data.map((anime) => ({
                        id: anime.mal_id,
                        title: anime.title,
                        img: anime.images.jpg.image_url,
                        description: anime.synopsis,
                    }))
                );
            } catch (error) {
                console.error("Error fetching anime:", error);
            }
        }
        fetchAnime();
    }, [url]);

    return (
        <div className="anime-row">
            <h2>{title}</h2>
            <div className="row-cards">
                {animeList.map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} />
                ))}
            </div>
        </div>
    );
}

export default AnimeRow;