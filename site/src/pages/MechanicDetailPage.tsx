import { useParams, Link } from 'react-router-dom'
import mechanicsData from '../data/mechanics.json'
import gamesData from '../data/games.json'
import BackLink from '../components/BackLink'
import './MechanicDetailPage.css'

interface MechanicDef {
  id: number | string
  name: string
  slug: string
  category: string
  summary: string
  bggUrl?: string
  source?: string
  bggEquivalent?: string
  bggRelated?: string
  description: string
  contentHtml: string
  implementationStatus: 'implemented' | 'partial' | 'not_implemented'
  implementationConfig?: string
  implementationSince?: string
  implementationDescription?: string
  implementationNotes?: string
  implementationRelated?: string
}

interface MechanicsData {
  categories: string[]
  mechanics: MechanicDef[]
  count: number
}

interface GameConfig {
  name: string
  mechanics?: string[]
}

interface Game {
  id: string
  config: GameConfig
}

const categoryColors: Record<string, string> = {
  action: '#f59e0b',
  auction: '#10b981',
  building: '#8b5cf6',
  cards: '#3b82f6',
  conflict: '#ef4444',
  cooperative: '#22c55e',
  dice: '#f97316',
  economic: '#eab308',
  ending: '#6b7280',
  information: '#06b6d4',
  movement: '#a855f7',
  other: '#6b7280',
  physical: '#ec4899',
  social: '#14b8a6',
  'turn-order': '#64748b',
  victory: '#fbbf24',
  'worker-placement': '#8b5cf6',
}

const implementationStatusColors: Record<string, string> = {
  implemented: '#22c55e',
  partial: '#f59e0b',
  not_implemented: '#6b7280',
}

const implementationStatusLabels: Record<string, string> = {
  implemented: 'Implemented',
  partial: 'Partial',
  not_implemented: 'Not Implemented',
}

const sourceLabels: Record<string, string> = {
  bgg: 'BGG',
  engine: 'Engine',
}

const sourceColors: Record<string, string> = {
  bgg: '#ef8354',
  engine: '#4a9eff',
}

function MechanicDetailPage() {
  const { mechanicSlug } = useParams<{ mechanicSlug: string }>()
  const data = mechanicsData as MechanicsData
  const games = gamesData as Game[]
  const mechanic = data.mechanics.find(m => m.slug === mechanicSlug)

  if (!mechanic) {
    return (
      <div className="mechanic-detail-page">
        <div className="container">
          <h1>Mechanic not found</h1>
          <p>No mechanic found with slug: {mechanicSlug}</p>
          <BackLink to="/mechanics">Back to mechanics</BackLink>
        </div>
      </div>
    )
  }

  const categoryColor = categoryColors[mechanic.category] || '#6b7280'
  const gamesUsingMechanic = games.filter(g => g.config.mechanics?.includes(mechanic.slug))

  return (
    <div className="mechanic-detail-page">
      <div className="container">
        <BackLink to="/mechanics">Back to mechanics</BackLink>

        <article className="mechanic-article">
          <header className="mechanic-header">
            <h1>{mechanic.name}</h1>
            <div className="mechanic-meta">
              <Link
                to={`/mechanics?category=${mechanic.category}`}
                className="category-badge"
                style={{ '--cat-color': categoryColor } as React.CSSProperties}
              >
                {mechanic.category}
              </Link>
              {mechanic.source && mechanic.source === 'engine' && (
                <span
                  className="source-badge"
                  style={{ '--source-color': sourceColors[mechanic.source] } as React.CSSProperties}
                  title={
                    mechanic.bggEquivalent
                      ? `Engine implementation (BGG equivalent: ${mechanic.bggEquivalent})`
                      : mechanic.bggRelated
                      ? `Engine implementation (related to BGG: ${mechanic.bggRelated})`
                      : 'Engine-specific mechanic'
                  }
                >
                  {sourceLabels[mechanic.source]}
                </span>
              )}
              <span
                className={`implementation-badge ${mechanic.implementationStatus}`}
                style={{ '--impl-color': implementationStatusColors[mechanic.implementationStatus] } as React.CSSProperties}
              >
                {implementationStatusLabels[mechanic.implementationStatus]}
              </span>
              <span className="mechanic-id">#{mechanic.id}</span>
            </div>
            <div className="mechanic-slug-row">
              <code className="mechanic-slug">{mechanic.slug}</code>
              {mechanic.bggUrl && (
                <a
                  href={mechanic.bggUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bgg-link"
                >
                  View on BGG
                </a>
              )}
            </div>
          </header>

          <section className="mechanic-summary">
            <p>{mechanic.summary}</p>
          </section>

          {mechanic.implementationStatus !== 'not_implemented' && (
            <section className="implementation-info">
              <h2>Implementation Details</h2>
              <div className="implementation-details">
                {mechanic.implementationConfig && (
                  <div className="impl-item">
                    <span className="impl-label">Config:</span>
                    <code>{mechanic.implementationConfig}</code>
                  </div>
                )}
                {mechanic.implementationSince && (
                  <div className="impl-item">
                    <span className="impl-label">Since:</span>
                    <span>v{mechanic.implementationSince}</span>
                  </div>
                )}
                {mechanic.implementationDescription && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Description:</span>
                    <span>{mechanic.implementationDescription}</span>
                  </div>
                )}
                {mechanic.implementationNotes && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Notes:</span>
                    <span>{mechanic.implementationNotes}</span>
                  </div>
                )}
                {mechanic.implementationRelated && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Related:</span>
                    <span>{mechanic.implementationRelated}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {gamesUsingMechanic.length > 0 && (
            <section className="games-using">
              <h2>Games Using This Mechanic</h2>
              <div className="games-list">
                {gamesUsingMechanic.map(game => (
                  <Link key={game.id} to={`/games/${game.id}`} className="game-link">
                    {game.config.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {mechanic.contentHtml && (
            <div
              className="mechanic-content markdown-body"
              dangerouslySetInnerHTML={{ __html: mechanic.contentHtml }}
            />
          )}
        </article>
      </div>
    </div>
  )
}

export default MechanicDetailPage
