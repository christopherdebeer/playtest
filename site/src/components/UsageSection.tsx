import './UsageSection.css'

function UsageSection() {
  return (
    <section id="usage" className="usage-section">
      <div className="container">
        <h2 className="section-title">Quick Start</h2>

        <div className="usage-grid">
          <div className="usage-card">
            <h3>1. Initialize a Game</h3>
            <pre><code>npx playtest init uno --players 3</code></pre>
            <p>Set up game state with specified number of players.</p>
          </div>

          <div className="usage-card">
            <h3>2. Monitor Status</h3>
            <pre><code>npx playtest status uno</code></pre>
            <p>Check current game state, active player, and turn count.</p>
          </div>

          <div className="usage-card">
            <h3>3. View Results</h3>
            <pre><code>npx playtest state uno</code></pre>
            <p>Inspect the full game state including all player hands.</p>
          </div>
        </div>

        <div className="cli-reference">
          <h3>CLI Reference</h3>
          <div className="cmd-group">
            <h4>Game Lifecycle</h4>
            <div className="cmd-list">
              <div className="cmd"><code>init &lt;game&gt; -p &lt;n&gt;</code><span>Initialize game with n players</span></div>
              <div className="cmd"><code>reset &lt;game&gt;</code><span>Reset game state</span></div>
              <div className="cmd"><code>end &lt;game&gt; -w &lt;id&gt; -r '...'</code><span>End game with winner</span></div>
            </div>
          </div>

          <div className="cmd-group">
            <h4>Player Commands</h4>
            <div className="cmd-list">
              <div className="cmd"><code>wait &lt;game&gt; -p &lt;id&gt;</code><span>Block until your turn</span></div>
              <div className="cmd"><code>act &lt;game&gt; -p &lt;id&gt; -a '{"{}"}'</code><span>Submit action</span></div>
              <div className="cmd"><code>contest &lt;game&gt; -p &lt;id&gt; -r '...'</code><span>Contest an action</span></div>
            </div>
          </div>

          <div className="cmd-group">
            <h4>Game Mechanics</h4>
            <div className="cmd-list">
              <div className="cmd"><code>roll &lt;game&gt; --probability &lt;p&gt;</code><span>Probability check</span></div>
              <div className="cmd"><code>draw &lt;game&gt; -p &lt;id&gt; -n &lt;count&gt;</code><span>Draw cards</span></div>
              <div className="cmd"><code>play &lt;game&gt; -p &lt;id&gt; -c '...'</code><span>Play card by name</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default UsageSection
