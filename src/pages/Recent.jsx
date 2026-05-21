import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AnimeCard from "../components/AnimeCard";
import { ENDPOINTS } from "../config";
import axios from "axios";

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

function Recent() {
    const navigate = useNavigate();
    const query = useQuery();
    const pageParam = parseInt(query.get("page")) || 1;

    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(pageParam);
    const [lastPage, setLastPage] = useState(1);

    useEffect(() => {
        let isMounted = true;
        async function fetchResults() {
            setLoading(true);
            setError(null);
            try {
                // Ensure page doesn't go less than 1
                const validPage = Math.max(1, pageParam);
                const url = `${ENDPOINTS.recent}?page=${validPage}&per_page=16`;
                const response = await axios.get(url);
                
                if (isMounted) {
                    const payload = response.data?.success ? response.data.data : response.data;
                    const list = Array.isArray(payload) ? payload : (payload?.results || []);
                    setResults(list);
                    if (payload?.current_page) setCurrentPage(payload.current_page);
                    if (payload?.last_page) setLastPage(payload.last_page);
                }
            } catch (err) {
                console.error("Error fetching recent episodes:", err);
                if (isMounted) {
                    setError("Failed to fetch latest episodes.");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchResults();
        return () => {
            isMounted = false;
        };
    }, [pageParam]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= lastPage) {
            navigate(`/recent?page=${newPage}`);
            window.scrollTo(0, 0);
        }
    };

    return (
        <div className="search-page-container">
            <Navbar />
            <div className="search-content">
                <div className="search-header">
                    <h2>Latest Episodes</h2>
                </div>

                {loading ? (
                    <div className="search-loading-container">
                        <div className="spinner"></div>
                        <p>Loading latest episodes...</p>
                    </div>
                ) : error ? (
                    <div className="search-error-container">
                        <p className="error-icon">⚠️</p>
                        <p>{error}</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="search-empty-container">
                        <p className="empty-icon">📺</p>
                        <p>No recent episodes found.</p>
                    </div>
                ) : (
                    <>
                        <div className="search-grid">
                            {results.map((anime) => (
                                <AnimeCard key={anime.id || anime.mal_id} anime={anime} />
                            ))}
                        </div>
                        
                        {/* Pagination Controls */}
                        {lastPage > 1 && (
                            <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '40px', flexWrap: 'wrap' }}>
                                <button 
                                    onClick={() => handlePageChange(currentPage - 1)} 
                                    disabled={currentPage === 1}
                                    style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                                >
                                    Prev
                                </button>
                                
                                {Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
                                    // Logic to show a window of 5 pages around the current page
                                    let startPage = Math.max(1, currentPage - 2);
                                    let endPage = Math.min(lastPage, startPage + 4);
                                    if (endPage - startPage < 4) {
                                        startPage = Math.max(1, endPage - 4);
                                    }
                                    const pageNum = startPage + i;
                                    
                                    if (pageNum > lastPage) return null;
                                    
                                    return (
                                        <button 
                                            key={pageNum}
                                            onClick={() => handlePageChange(pageNum)}
                                            style={{ 
                                                padding: '8px 12px', 
                                                background: currentPage === pageNum ? 'var(--primary-red, #e50914)' : 'rgba(255,255,255,0.1)', 
                                                border: 'none', 
                                                color: '#fff', 
                                                borderRadius: '4px', 
                                                cursor: 'pointer',
                                                fontWeight: currentPage === pageNum ? 'bold' : 'normal'
                                            }}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}

                                {currentPage < lastPage - 2 && lastPage > 5 && (
                                    <span style={{ color: '#a3a3a3', margin: '0 4px' }}>...</span>
                                )}

                                {currentPage < lastPage - 2 && lastPage > 5 && (
                                    <button 
                                        onClick={() => handlePageChange(lastPage)}
                                        style={{ 
                                            padding: '8px 12px', 
                                            background: 'rgba(255,255,255,0.1)', 
                                            border: 'none', 
                                            color: '#fff', 
                                            borderRadius: '4px', 
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {lastPage}
                                    </button>
                                )}

                                <button 
                                    onClick={() => handlePageChange(currentPage + 1)} 
                                    disabled={currentPage === lastPage}
                                    style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', cursor: currentPage === lastPage ? 'not-allowed' : 'pointer' }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            <Footer />
        </div>
    );
}

export default Recent;
