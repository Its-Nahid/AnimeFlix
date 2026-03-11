import { useParams } from "react-router-dom";

function AnimeDetail() {
  const { id } = useParams();

  return (
    <div style={{ color: "white", padding: "20px" }}>
      <h1>Anime ID: {id}</h1>
      <p>Here will be anime details (poster, description, episodes, etc.)</p>
    </div>
  );
}

export default AnimeDetail;