import { useParams, Link } from 'react-router-dom'
import gamesData from '../data/games.json'
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
  maxTurns: number
  startingCards?: number
  deck?: CardDef[]
  board?: {
    states: string[]
    start: string
  }
}

interface Game {
  id: string
  config: GameConfig
  rulesMarkdown: string
}

function GamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const games: Game[] = gamesData as Game[]
  const game = games.find((g) => g.id === gameId)

  if (!game) {
    return (
      <div className="game-page">
        <div className="container">
          <h1>Game not found</h1>
          <Link to="/">Back to home</Link>
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
        <Link to="/" className="back-link">Back to games</Link>

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
            <span className="meta-label">Max Turns</span>
            <span className="meta-value">{game.config.maxTurns}</span>
          </div>
        </div>

        <div className="quick-start">
          <h2>Quick Start</h2>
          <pre><code>npx playtest init {game.id} --players 3</code></pre>
        </div>

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
          <div className="rules-content">
            <pre>{game.rulesMarkdown}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GamePage
