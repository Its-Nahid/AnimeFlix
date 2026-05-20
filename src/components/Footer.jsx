import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <h2 className="logo-text">AnimeFlix</h2>
          <p>Your premium destination for discovering and streaming the absolute best anime content. Powered by the high-performance Animetsu API proxy.</p>
        </div>
        <div className="footer-links-container">
          <div className="footer-links-col">
            <h4>Browse</h4>
            <ul>
              <li><Link to="/">Home Page</Link></li>
              <li><Link to="/search">Advanced Search</Link></li>
              <li><a href="https://github.com/ullamua/animetsu-api" target="_blank" rel="noopener noreferrer">Animetsu API Go</a></li>
            </ul>
          </div>
          <div className="footer-links-col">
            <h4>Information</h4>
            <ul>
              <li><span>Disclaimer</span></li>
              <li><span>Privacy Policy</span></li>
              <li><span>Terms of Use</span></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} AnimeFlix. All rights reserved. Created with passion for the anime community.</p>
      </div>
    </footer>
  );
}

export default Footer;
