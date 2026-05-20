import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Hero from "../components/hero";
import AnimeRow from "../components/AnimeRow";
import Footer from "../components/Footer";
import { ENDPOINTS } from "../config";
import axios from "axios";

function Home() {
    const [featured, setFeatured] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;
        async function fetchFeatured() {
            try {
                // Fetch the trending list to dynamically select the spotlight featured anime
                const response = await axios.get(ENDPOINTS.trending);
                if (isMounted) {
                    const list = response.data?.success ? response.data.data : response.data;
                    if (Array.isArray(list) && list.length > 0) {
                        // Pick the first trending anime as the hero spotlight
                        setFeatured(list[0]);
                    }
                }
            } catch (err) {
                console.error("Error setting featured anime:", err);
            }
        }
        fetchFeatured();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleWatchClick = () => {
        if (featured) {
            navigate(`/anime/${featured.id || featured.mal_id}`);
        }
    };

    return (
        <div className="home-container">
            <Navbar />
            <Hero anime={featured} onWatchClick={handleWatchClick} />
            {/* Standard overlapping Netflix spacing with a negative top margin for rows */}
            <div className="rows-container" style={{ position: "relative", zIndex: 10, marginTop: "-60px" }}>
                <div id="row-trending">
                    <AnimeRow title="Trending Now" url={ENDPOINTS.trending} />
                </div>
                <div id="row-season">
                    <AnimeRow title="Seasonal Highlights" url={ENDPOINTS.season} />
                </div>
                <div id="row-popular">
                    <AnimeRow title="All-Time Popular" url={ENDPOINTS.popular} />
                </div>
                <div id="row-top">
                    <AnimeRow title="Top Rated" url={ENDPOINTS.topRated} />
                </div>
                <div id="row-upcoming">
                    <AnimeRow title="Highly Anticipated Upcoming" url={ENDPOINTS.upcoming} />
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default Home;