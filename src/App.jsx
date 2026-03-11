import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AnimeDetail from "./pages/AnimeDetails";
import Search from "./pages/Search";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/anime/:id" element={<AnimeDetail />} />
        <Route path="/search" element={<Search />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;