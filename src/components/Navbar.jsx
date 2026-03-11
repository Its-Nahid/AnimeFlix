import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Navbar() {
    const [query, setQuery] = useState("");
    const navigate = useNavigate();
    
    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim() !== "" ){
            navigate(`/search?query=${query}`);
            setQuery("");
        }
    };
    
    return (
        <nav>
            <h1>AnimeFlix</h1>

            <ul>
                <li>Home</li>
                <li>Trending</li>
                <li>Top Anime</li>
                <li>Upcoming</li>
            </ul>
            <form className="search-container" onSubmit={handleSearch}>
                <input 
                    type="text" 
                    placeholder="Search anime..." 
                    value={query} 
                    onChange={(e) => setQuery(e.target.value)} 
                />
                <button type="submit">🔎</button>
            </form>
        </nav>
    )
}

export default Navbar;