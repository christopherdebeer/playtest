import './Hero.css'

function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <h1 className="hero-title">
          AI-Driven Game Playtesting
        </h1>
        <p className="hero-subtitle">
          TypeScript engine orchestration with parallel AI player agents.
          Test game mechanics, validate rules, and explore edge cases automatically.
        </p>
        <div className="hero-cta">
          <code className="install-cmd">/playtest &lt;game&gt; &lt;players&gt;</code>
        </div>
        <div className="hero-features">
          <div className="feature">
            <span className="feature-icon">&#9881;</span>
            <span>Engine-driven state</span>
          </div>
          <div className="feature">
            <span className="feature-icon">&#9733;</span>
            <span>Multi-agent coordination</span>
          </div>
          <div className="feature">
            <span className="feature-icon">&#9830;</span>
            <span>YAML rule definitions</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
