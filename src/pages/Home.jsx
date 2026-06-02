import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Hero from "../components/hero";
import AnimeRow from "../components/AnimeRow";
import Footer from "../components/Footer";
import { ENDPOINTS } from "../config";
import axios from "axios";

function Home() {
    const [heroSlides, setHeroSlides] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        let isMounted = true;
        async function fetchFeatured() {
            try {
                // Fetch the seasonal highlights
                const response = await axios.get(ENDPOINTS.season);
                if (isMounted) {
                    let list = response.data?.success ? response.data.data : response.data;
                    if (!Array.isArray(list) || list.length === 0) {
                        // Fallback to trending
                        const trendingRes = await axios.get(ENDPOINTS.trending);
                        list = trendingRes.data?.success ? trendingRes.data.data : trendingRes.data;
                    }
                    if (Array.isArray(list) && list.length > 0) {
                        setHeroSlides(list.slice(0, 5));
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

    const handleWatchClick = (anime) => {
        if (anime) {
            navigate(`/anime/${anime.id || anime.mal_id}`);
        }
    };

    return (
        <div className="home-container">
            <Navbar />
            <Hero animeList={heroSlides} onWatchClick={handleWatchClick} />
            {/* Standard overlapping Netflix spacing with a negative top margin for rows */}
            <div className="rows-container" style={{ position: "relative", zIndex: 10, marginTop: "-60px" }}>
                <div id="row-recent">
                    <AnimeRow title="Latest Episodes" subtitle="Recently updated releases" url={ENDPOINTS.recent} limit={8} viewMoreLink="/recent" />
                </div>
                <div id="row-season">
                    <AnimeRow title="Seasonal Highlights" subtitle="The best of this season" url={ENDPOINTS.season} limit={8} viewMoreLink="/search?sort=SEASON_YEAR_DESC" />
                </div>
                <div id="row-popular">
                    <AnimeRow title="All-Time Popular" subtitle="Most watched by the community" url={ENDPOINTS.popular} limit={8} viewMoreLink="/search?sort=POPULARITY_DESC" />
                </div>
                <div id="row-top">
                    <AnimeRow title="Top Rated" subtitle="Critically acclaimed masterpieces" url={ENDPOINTS.topRated} limit={8} viewMoreLink="/search?sort=SCORE_DESC" />
                </div>
                <div id="row-upcoming">
                    <AnimeRow title="Highly Anticipated Upcoming" subtitle="Exciting new shows on the horizon" url={ENDPOINTS.upcoming} limit={8} viewMoreLink="/search?sort=POPULARITY_DESC" />
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default Home;