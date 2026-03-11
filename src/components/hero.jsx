function Hero() {
    // Temporary featured anime data
    const featuredAnime = {
        title: "Attack on Titan",
        description:
            "In a world where humanity is on the brink of extinction, giant Titans threaten mankind. Join Eren Yeager and friends in this epic battle for survival.",
        img: "https://imgsrv.crunchyroll.com/cdn-cgi/image/fit=cover,format=auto,quality=85,width=1920/keyart/GR751KNZY-backdrop_wide", // place image in public/
    };

    return (
        <div
            className="hero"
            style={{
                backgroundImage: `url(${featuredAnime.img})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <div className="hero-overlay">
                <h1>{featuredAnime.title}</h1>
                <p>{featuredAnime.description}</p>
                <button>▶ Watch Now</button>
            </div>
        </div>
    );
}

export default Hero;