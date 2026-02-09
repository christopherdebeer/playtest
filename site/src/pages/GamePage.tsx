import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import gamesData from '../data/games.json'
import MechanicBadge from '../components/MechanicBadge'
import { LogsData } from '../types/logs'
import { fetchLogsIndex } from '../utils/logData'
import BackLink from '../components/BackLink'
import { formatDuration } from '../utils/timeUtils'
import './GamePage.css'

interface CardDef {
  name: string
  count: number
  type: string
  effect: Record<string, unknown>
}

interface Highlight {
  label: string
  value: string
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
  mechanics?: string[] | Record<string, unknown>
  highlights?: Highlight[]
}

interface Game {
  id: string
  hasPoster?: boolean
  config: GameConfig
  rulesMarkdown: string
  rulesHtml: string
}

function formatDate(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getOutcomeClass(outcome: string): string {
  switch (outcome) {
    case 'completed': return 'outcome-completed'
    case 'ended': return 'outcome-ended'
    case 'cancelled': return 'outcome-cancelled'
    case 'in_progress': return 'outcome-progress'
    default: return 'outcome-unknown'
  }
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

        {game.hasPoster && (
          <div className="game-page-poster">
            <img src={`/data/posters/${game.id}.png`} alt={`${game.config.name} poster`} />
          </div>
        )}

        <div className="game-page-header">
          <h1>{game.config.name}</h1>
          <span className="player-badge">{game.config.players} players</span>
        </div>

        <div className="game-meta">
          <div className="meta-item">
            <span className="meta-label">Win Condition</span>
            <span className="meta-value">{game.config.winCondition}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Max Rounds</span>
            <span className="meta-value">{game.config.maxRounds}</span>
          </div>
          {game.config.highlights && game.config.highlights.map((h: Highlight) => (
            <div className="meta-item" key={h.label}>
              <span className="meta-label">{h.label}</span>
              <span className="meta-value">{h.value}</span>
            </div>
          ))}
        </div>

        {game.config.mechanics && (() => {
          const slugs = Array.isArray(game.config.mechanics)
            ? game.config.mechanics
            : Object.keys(game.config.mechanics).filter(k => k !== 'cards' && k !== 'board');
          return slugs.length > 0 && (
          <div className="mechanics-section">
            <h2>Game Mechanics</h2>
            <div className="mechanics-badges">
              {slugs.map((slug: string) => (
                <MechanicBadge key={slug} slug={slug} showCategory />
              ))}
            </div>
          </div>
          );
        })()}

        <div className="quick-start">
          <h2>Quick Start</h2>
          <pre><code>/playtest {game.id} 3</code></pre>
        </div>

        {logsData && (() => {
          const gameLogs = logsData.logs
            .filter(l => l.gameName === game.id)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          if (gameLogs.length === 0) return null
          const recentLogs = gameLogs.slice(0, 5)
          return (
            <div className="game-logs-section">
              <h2>Recent Playtests</h2>
              <table className="playtests-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Players</th>
                    <th>Turns</th>
                    <th>Duration</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map(log => (
                    <tr key={log.gameId}>
                      <td>
                        <span className={`outcome-badge ${getOutcomeClass(log.outcome)}`}>
                          {log.outcome}
                        </span>
                      </td>
                      <td>{log.playerCount}</td>
                      <td>{log.totalTurns}</td>
                      <td>{formatDuration(log.duration)}</td>
                      <td>{formatDate(log.startTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {gameLogs.length > 5 && (
                <Link to={`/logs?game=${game.id}`} className="view-logs-btn">
                  View all {gameLogs.length} playtests
                </Link>
              )}
              {gameLogs.length <= 5 && (
                <Link to={`/logs?game=${game.id}`} className="view-logs-btn">
                  View detailed logs
                </Link>
              )}
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
