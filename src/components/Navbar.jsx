import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

function Navbar() {
    const [query, setQuery] = useState("");
    const [isScrolled, setIsScrolled] = useState(false);
    const navigate = useNavigate();

    // Scroll listener to toggle transparent-to-solid dark background
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 50) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);
    
    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim() !== "") {
            navigate(`/search?query=${encodeURIComponent(query.trim())}`);
            setQuery("");
        }
    };

    const handleNavClick = (sectionId) => {
        navigate("/");
        // Give router a millisecond to switch to home page if not already there
        setTimeout(() => {
            const element = document.getElementById(sectionId);
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 100);
    };
    
    return (
        <nav className={`fixed-navbar ${isScrolled ? "scrolled" : "transparent"}`}>
            <div className="nav-left">
                <Link to="/" className="logo-link">
                    <h1 className="logo-text">AnimeFlix</h1>
                </Link>

                <ul className="nav-links">
                    <li><Link to="/">Home</Link></li>
                    <li onClick={() => handleNavClick("row-trending")} className="nav-clickable">Trending</li>
                    <li onClick={() => handleNavClick("row-top")} className="nav-clickable">Top Rated</li>
                    <li onClick={() => handleNavClick("row-upcoming")} className="nav-clickable">Upcoming</li>
                </ul>
            </div>
            
            <div className="nav-right">
                <form className="search-container" onSubmit={handleSearch}>
                    <input 
                        type="text" 
                        placeholder="Titles, genres, years..." 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                    />
                    <button type="submit">🔎</button>
                </form>
            </div>
        </nav>
    );
}

export default Navbar;