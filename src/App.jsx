import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import Home from "./pages/Home";
import AnimeDetail from "./pages/AnimeDetails";
import Search from "./pages/Search";
import Recent from "./pages/Recent";
import WatchPage from "./pages/WatchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/anime/:id" element={<AnimeDetail />} />
        <Route path="/anime/:id/watch/:ep" element={<WatchPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/recent" element={<Recent />} />
      </Routes>
      <SpeedInsights />
    </BrowserRouter>
  );
}

export default App;