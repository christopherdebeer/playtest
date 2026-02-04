import './Footer.css'

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-left">
          <span className="footer-logo"><span className="logo-text">/playtest</span></span>
          <span className="footer-sep">|</span>
          <span className="footer-tagline">AI game playtesting framework</span>
        </div>
        <div className="footer-right">
          <a
            href="https://github.com/christopherdebeer/playtest"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
