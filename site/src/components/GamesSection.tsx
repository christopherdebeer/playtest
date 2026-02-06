import { Link } from 'react-router-dom'
import gamesData from '../data/games.json'
import MechanicBadge from './MechanicBadge'
import './GamesSection.css'

interface GameConfig {
  name: string
  players: string
  winCondition: string
  maxRounds: number
  startingCards?: number
  deckSize?: number
  boardStates?: string[]
  mechanics?: string[] | Record<string, unknown>
}

interface Game {
  id: string
  config: GameConfig
  rulesPreview: string
}

function GamesSection() {
  const games: Game[] = gamesData as Game[]

  return (
    <section id="games" className="games-section">
      <div className="container">
        <h2 className="section-title">Available Games</h2>
        <p className="section-desc">
          Games are defined using YAML frontmatter for machine-readable config
          and Markdown for human-readable rules.
        </p>

        <div className="games-grid">
          {games.map((game) => (
            <Link to={`/games/${game.id}`} key={game.id} className="game-card">
              <div className="game-header">
                <h3>{game.config.name}</h3>
                <span className="player-count">{game.config.players} players</span>
              </div>

              <p className="game-objective">{game.config.winCondition}</p>

              {game.config.mechanics && (() => {
                const slugs = Array.isArray(game.config.mechanics)
                  ? game.config.mechanics
                  : Object.keys(game.config.mechanics).filter(k => k !== 'cards' && k !== 'board');
                return slugs.length > 0 && (
                <div className="game-mechanics" onClick={(e) => e.preventDefault()}>
                  {slugs.slice(0, 4).map((slug: string) => (
                    <MechanicBadge key={slug} slug={slug} showCategory linkToPage />
                  ))}
                  {slugs.length > 4 && (
                    <span className="more-mechanics">+{slugs.length - 4}</span>
                  )}
                </div>
                );
              })()}

              <div className="game-stats">
                {game.config.startingCards != null && game.config.startingCards > 0 && (
                  <div className="stat">
                    <span className="stat-value">{game.config.startingCards}</span>
                    <span className="stat-label">starting cards</span>
                  </div>
                )}
                {game.config.deckSize != null && game.config.deckSize > 0 && (
                  <div className="stat">
                    <span className="stat-value">{game.config.deckSize}</span>
                    <span className="stat-label">deck size</span>
                  </div>
                )}
                {game.config.boardStates && game.config.boardStates.length > 0 && (
                  <div className="stat">
                    <span className="stat-value">{game.config.boardStates.length}</span>
                    <span className="stat-label">board states</span>
                  </div>
                )}
                {game.config.maxRounds != null && game.config.maxRounds > 0 && (
                  <div className="stat">
                    <span className="stat-value">{game.config.maxRounds}</span>
                    <span className="stat-label">max rounds</span>
                  </div>
                )}
              </div>

              <div className="game-preview">
                <code className="preview-cmd">/playtest {game.id} {game.config.players.split('-')[0]}</code>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default GamesSection
