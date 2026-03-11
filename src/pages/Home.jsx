import Navbar from "../components/Navbar";
import Hero from "../components/hero";
import AnimeRow from "../components/AnimeRow";

function Home() {
    return (
        <div>
            <Navbar />
            <Hero />
            <AnimeRow title="Top Anime" url="https://api.jikan.moe/v4/top/anime" />
            <AnimeRow title="Upcoming" url="https://api.jikan.moe/v4/seasons/upcoming" />
            <AnimeRow title="Trending Now" url="https://api.jikan.moe/v4/anime?order_by=popularity&sort=desc" />
        </div>
    );
}

export default Home;