import { Link } from 'react-router-dom'
import { useState } from 'react'
import './Header.css'

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          <span className="logo-icon">&#9654;</span>
          <span className="logo-text">playtest</span>
        </Link>

        <button
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-icon">&#9776;</span>
        </button>

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

        {mobileMenuOpen && (
          <>
            <div
              className="mobile-menu-backdrop"
              onClick={closeMobileMenu}
            />
            <nav className="mobile-menu">
              <button
                className="mobile-menu-close"
                onClick={closeMobileMenu}
                aria-label="Close menu"
              >
                &times;
              </button>
              <a href="#usage" onClick={closeMobileMenu}>Usage</a>
              <Link to="/mechanics" onClick={closeMobileMenu}>Mechanics</Link>
              <Link to="/logs" onClick={closeMobileMenu}>Logs</Link>
              <Link to="/docs" onClick={closeMobileMenu}>Docs</Link>
              <a href="#games" onClick={closeMobileMenu}>Games</a>
              <a href="#architecture" onClick={closeMobileMenu}>Architecture</a>
              <a
                href="https://github.com/christopherdebeer/playtest"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMobileMenu}
              >
                GitHub
              </a>
            </nav>
          </>
        )}
      </div>
    </header>
  )
}

export default Header
