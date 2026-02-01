import { Link } from 'react-router-dom'
import './Header.css'

function Header() {
  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          <span className="logo-icon">&#9654;</span>
          <span className="logo-text">playtest</span>
        </Link>
        <nav className="nav">
          <a href="#usage">Usage</a>
          <a href="#games">Games</a>
          <Link to="/mechanics">Mechanics</Link>
          <Link to="/logs">Logs</Link>
          <Link to="/docs">Docs</Link>
          <a href="#architecture">Architecture</a>
          <a
            href="https://github.com/christopherdebeer/playtest"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

export default Header
