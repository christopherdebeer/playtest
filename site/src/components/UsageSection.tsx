import { Link } from 'react-router-dom'
import './UsageSection.css'

function UsageSection() {
  return (
    <section id="usage" className="usage-section">
      <div className="container">
        <h2 className="section-title">Quick Start</h2>

        <div className="usage-grid">
          <div className="usage-card">
            <h3>1. Launch a Playtest</h3>
            <pre><code>/playtest markovs-chains 2</code></pre>
            <p>Use the <code>/playtest</code> skill in Claude Code to start a game with coordinated agents.</p>
          </div>

          <div className="usage-card">
            <h3>2. Monitor Progress</h3>
            <pre><code>./playtest status &lt;instance-id&gt;</code></pre>
            <p>Check game status, current turn, and active player.</p>
          </div>

          <div className="usage-card">
            <h3>3. List Active Games</h3>
            <pre><code>./playtest list</code></pre>
            <p>View all active game instances with their status and recent activity.</p>
          </div>
        </div>

        <div className="advanced-note">
          <p>
            <strong>For Advanced Users:</strong> See the complete{' '}
            <Link to="/docs/cli">CLI reference</Link> for direct command-line usage and integration.
          </p>
        </div>
      </div>
    </section>
  )
}

export default UsageSection
