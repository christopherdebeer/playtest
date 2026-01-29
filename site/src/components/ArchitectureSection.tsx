import './ArchitectureSection.css'

function ArchitectureSection() {
  return (
    <section id="architecture" className="architecture-section">
      <div className="container">
        <h2 className="section-title">Architecture</h2>

        <div className="arch-diagram">
          <pre>{`
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (skill)                     │
│  1. npx playtest init <game> --players <n>                  │
│  2. Spawn gamemaster (sonnet) + player agents (haiku)       │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - State management (games/<game>/state/game.json)          │
│  - Turn blocking (npx playtest wait)                        │
│  - Deck operations (npx playtest draw/play/discard)         │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │ Player 1  │        │ Player 2  │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │ Validates │        │ Decides   │        │ Decides   │
    └───────────┘        └───────────┘        └───────────┘
          `.trim()}</pre>
        </div>

        <div className="arch-details">
          <div className="detail-card">
            <h3>Engine-Driven State</h3>
            <p>
              All game state is managed by the TypeScript engine, not AI agents.
              This ensures deterministic, reproducible game sessions with clear audit trails.
            </p>
          </div>

          <div className="detail-card">
            <h3>Turn Synchronization</h3>
            <p>
              Players use <code>npx playtest wait</code> to block until their turn.
              The engine handles turn order, action validation, and state transitions.
            </p>
          </div>

          <div className="detail-card">
            <h3>Contest System</h3>
            <p>
              Players can contest actions they believe violate rules.
              The gamemaster adjudicates disputes based on the RULES.md definition.
            </p>
          </div>

          <div className="detail-card">
            <h3>YAML + Markdown Rules</h3>
            <p>
              Games are defined with YAML frontmatter for machine-readable config
              (deck, board, probabilities) and Markdown for human-readable rules.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ArchitectureSection
