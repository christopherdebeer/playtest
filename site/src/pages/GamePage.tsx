import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import gamesData from '../data/games.json'
import MechanicBadge from '../components/MechanicBadge'
import { LogsData } from '../types/logs'
import { fetchLogsIndex } from '../utils/logData'
import BackLink from '../components/BackLink'
import './GamePage.css'

interface CardDef {
  name: string
  count: number
  type: string
  effect: Record<string, unknown>
}

interface GameConfig {
  name: string
  players: string
  winCondition: string
  maxRounds: number
  startingCards?: number
  deck?: CardDef[]
  board?: {
    states: string[]
    start: string
  }
  mechanics?: string[]
}

interface Game {
  id: string
  config: GameConfig
  rulesMarkdown: string
  rulesHtml: string
}

function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const games: Game[] = gamesData as Game[]
  const game = games.find((g) => g.id === gameId)
  const [logsData, setLogsData] = useState<LogsData | null>(null)

  // Load logs index for showing log count
  useEffect(() => {
    fetchLogsIndex().then(setLogsData).catch(() => setLogsData(null))
  }, [])

  if (!game) {
    return (
      <div className="game-page">
        <div className="container">
          <h1>Game not found</h1>
          <BackLink to="/">Back to home</BackLink>
        </div>
      </div>
    )
  }

  const cardsByType: Record<string, CardDef[]> = {}
  if (game.config.deck) {
    for (const card of game.config.deck) {
      if (!cardsByType[card.type]) {
        cardsByType[card.type] = []
      }
      cardsByType[card.type].push(card)
    }
  }

  return (
    <div className="game-page">
      <div className="container">
        <BackLink to="/">Back to games</BackLink>

        <div className="game-page-header">
          <h1>{game.config.name}</h1>
          <span className="player-badge">{game.config.players} players</span>
        </div>

        <div className="game-meta">
          <div className="meta-item">
            <span className="meta-label">Win Condition</span>
            <span className="meta-value">{game.config.winCondition}</span>
          </div>
          {game.config.startingCards && (
            <div className="meta-item">
              <span className="meta-label">Starting Cards</span>
              <span className="meta-value">{game.config.startingCards}</span>
            </div>
          )}
          <div className="meta-item">
            <span className="meta-label">Max Rounds</span>
            <span className="meta-value">{game.config.maxRounds}</span>
          </div>
        </div>

        {game.config.mechanics && game.config.mechanics.length > 0 && (
          <div className="mechanics-section">
            <h2>Game Mechanics</h2>
            <div className="mechanics-badges">
              {game.config.mechanics.map((slug) => (
                <MechanicBadge key={slug} slug={slug} showCategory />
              ))}
            </div>
          </div>
        )}

        <div className="quick-start">
          <h2>Quick Start</h2>
          <pre><code>/playtest {game.id} 3</code></pre>
        </div>

        {logsData && (() => {
          const gameLogs = logsData.logs.filter(l => l.gameName === game.id)
          if (gameLogs.length === 0) return null
          return (
            <div className="game-logs-section">
              <h2>Playtest Logs</h2>
              <p className="logs-summary">
                {gameLogs.length} playtest session{gameLogs.length !== 1 ? 's' : ''} recorded
              </p>
              <Link to={`/logs?game=${game.id}`} className="view-logs-btn">
                View Game Logs
              </Link>
            </div>
          )
        })()}

        {game.config.board && (
          <div className="board-section">
            <h2>Board States</h2>
            <div className="board-states">
              {game.config.board.states.map((state) => (
                <span
                  key={state}
                  className={`board-state ${state === game.config.board?.start ? 'start' : ''} ${state === 'Victory' ? 'victory' : ''}`}
                >
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}

        {game.config.deck && (
          <div className="deck-section">
            <h2>Deck ({game.config.deck.reduce((acc, c) => acc + c.count, 0)} cards)</h2>
            {Object.entries(cardsByType).map(([type, cards]) => (
              <div key={type} className="card-type">
                <h3>{type} cards</h3>
                <div className="cards-list">
                  {cards.map((card) => (
                    <div key={card.name} className="card-item">
                      <span className="card-name">{card.name}</span>
                      <span className="card-count">x{card.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rules-section">
          <h2>Full Rules</h2>
          <div
            className="rules-content markdown-body"
            dangerouslySetInnerHTML={{ __html: game.rulesHtml }}
          />
        </div>
      </div>
    </div>
  )
}

export default GamePage
