# AnimeFlix 🎬

AnimeFlix is a premium, Netflix-inspired Anime discovery web application. It allows users to browse trending, top, and upcoming anime, as well as search for their favorite titles using the Jikan (MyAnimeList) API.

## 🚀 Features

*   **Sleek User Interface**: A modern, dark-themed UI with glassmorphism touches and smooth CSS micro-animations.
*   **Dynamic Data**: Real-time anime data fetching utilizing `axios` and the Jikan API.
*   **Search Functionality**: A fully functional search bar that routes users to a dedicated search results page.
*   **Horizontal Scrolling Rows**: Netflix-style horizontal scrollable rows for different anime categories.
*   **Responsive Headers**: Transparent-to-solid fixed navigation bar.
*   **Routing**: Client-side routing using `react-router-dom`.

## 📸 Screenshots

### Home Page
![Home Page Screenshot v1](./public/homescreenshot.jpeg)
![Home Page Screenshot v1.2](./public/homescreenshotv1.2.jpeg)
> **Description**: The Home page features a massive Hero section highlighting a featured anime ("Attack on Titan"). Below it, you can browse through dynamically loaded rows like "Top Anime", "Trending Now", and "Upcoming". Each anime card has a slick hover effect that reveals the title in an overlay.

### Search Results Page
![Search Page Screenshot](./public/searchscreenshotv1.jpeg)
> **Description**: Searching for an anime in the top navigation bar routes you to this page, where the Jikan API is queried for the search term, displaying up to 20 relevant results in a wrapped grid format.

---

## 📚 What I Learned

Building this project taught me several key concepts in modern web development:

1.  **React Hooks**: Extensive use of `useState` for managing component state (like search queries and fetched data lists) and `useEffect` for handling side effects like API calls when the component mounts or when URL parameters change.
2.  **API Integration**: Learning how to interact withRESTful APIs (Jikan/MyAnimeList) using `axios`, handling asynchronous operations with `async/await`, and safely mapping the response data to my React components.
3.  **Client-Side Routing**: Using `react-router-dom` (v6/v7) to create a Single Page Application (SPA). I learned how to use `<BrowserRouter>`, `<Routes>`, and `<Route>`, as well as hooks like `useNavigate` for programmatic navigation and `useLocation` / URLSearchParams to parse query parameters (e.g., `?query=naruto`).
4.  **Modern CSS & Layouts**:
    *   Implementing a fixed, transparent navigation bar that looks premium.
    *   Building horizontal scrolling containers (`overflow-x: auto`) while hiding the scrollbar for a native app feel.
    *   Using CSS `linear-gradient` to blend images into the dark background smoothly.
    *   Using `transform` and `transition` for interactive hover micro-animations on the anime cards.

---

## 📅 Version History

### Version 1 (v1) - The Foundation 🧱
*   Bootstrapped the project using **Vite** and **React**.
*   Built the static layout including the `Navbar`, `Hero`, `AnimeRow`, and `AnimeCard` components.
*   Used **Dummy Data** arrays to populate the rows and verify the layout.
*   Implemented the core Netflix-clone CSS styles (dark background, horizontal scroll, hover zooms).

### Version 2 (v2) - Making it Dynamic ⚡
*   Replaced dummy data with live data by integrating **Axios** and the **Jikan API (V4)**.
*   Added `react-router-dom` to support multiple pages (`/`, `/anime/:id`, `/search`).
*   Implemented the Search functionality: updating the Navbar form to navigate to the `/search` route, and building the `Search.jsx` component to fetch and display query-specific results.
*   Refactored the `AnimeRow` component to take a dynamic `url` prop so a single component could render "Top", "Trending", or "Upcoming" anime just by changing the endpoint.
*   Resolved port conflicts and updated dependency versions.

---

## 🛠️ Setup & Installation

If you want to run this project locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/animeflix.git
    cd animeflix
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # Note: Axios and React Router DOM are required.
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  Open your browser and navigate to `http://localhost:5173` (or the port Vite provides).

---
*Built with React, Vite, CSS, and ❤️*
