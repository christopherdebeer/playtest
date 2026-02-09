import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchMechanicDetail, MechanicDetail } from '../utils/mechanicData'
import BackLink from '../components/BackLink'
import './MechanicDetailPage.css'

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
  const [mechanic, setMechanic] = useState<MechanicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceExpanded, setSourceExpanded] = useState(false)

  useEffect(() => {
    if (!mechanicSlug) return

    setLoading(true)
    setError(null)

    fetchMechanicDetail(mechanicSlug)
      .then(setMechanic)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [mechanicSlug])

  if (loading) {
    return (
      <div className="mechanic-detail-page">
        <div className="container">
          <BackLink to="/mechanics">Back to mechanics</BackLink>
          <div className="loading-state">Loading mechanic...</div>
        </div>
      </div>
    )
  }

  if (error || !mechanic) {
    return (
      <div className="mechanic-detail-page">
        <div className="container">
          <BackLink to="/mechanics">Back to mechanics</BackLink>
          <div className="error-state">
            <h1>Mechanic not found</h1>
            <p>{error || `No mechanic found with slug: ${mechanicSlug}`}</p>
          </div>
        </div>
      </div>
    )
  }

  const categoryColor = categoryColors[mechanic.category] || '#6b7280'

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
              {mechanic.source === 'engine' && (
                <span
                  className="source-badge"
                  style={{ '--source-color': sourceColors.engine } as React.CSSProperties}
                  title={
                    mechanic.bggEquivalent
                      ? `Engine implementation (BGG equivalent: ${mechanic.bggEquivalent})`
                      : mechanic.bggRelated
                      ? `Engine implementation (related to BGG: ${mechanic.bggRelated})`
                      : 'Engine-specific mechanic'
                  }
                >
                  {sourceLabels.engine}
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

          {/* Full Description */}
          {mechanic.contentHtml && (
            <section className="mechanic-description-section">
              <h2>Description</h2>
              <div
                className="mechanic-content markdown-body"
                dangerouslySetInnerHTML={{ __html: mechanic.contentHtml }}
              />
            </section>
          )}

          {/* Implementation Details */}
          {mechanic.implementation && (
            <section className="implementation-info">
              <h2>Engine Implementation</h2>
              <div className="implementation-details">
                <div className="impl-item">
                  <span className="impl-label">Config Key</span>
                  <code>{mechanic.implementation.configKey}</code>
                </div>
                <div className="impl-item">
                  <span className="impl-label">Since Version</span>
                  <span>v{mechanic.implementation.since}</span>
                </div>
                {mechanic.implementation.description && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Description</span>
                    <span>{mechanic.implementation.description}</span>
                  </div>
                )}

                {/* Config Schema */}
                {mechanic.implementation.configSchema && Object.keys(mechanic.implementation.configSchema).length > 0 && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Config Options</span>
                    <div className="config-schema">
                      {Object.entries(mechanic.implementation.configSchema).map(([key, type]) => (
                        <div key={key} className="config-option">
                          <code>{key}</code>
                          <span className="config-type">{String(type)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hooks */}
                {mechanic.implementation.hooks.length > 0 && (
                  <div className="impl-item full-width">
                    <span className="impl-label">Hooks Used ({mechanic.implementation.hooks.length})</span>
                    <div className="hooks-list">
                      {mechanic.implementation.hooks.map(hook => (
                        <code key={hook} className="hook-name">{hook}</code>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependencies & Conflicts */}
                {mechanic.implementation.dependencies && mechanic.implementation.dependencies.length > 0 && (
                  <div className="impl-item">
                    <span className="impl-label">Dependencies</span>
                    <div className="dep-list">
                      {mechanic.implementation.dependencies.map(dep => (
                        <Link key={dep} to={`/mechanics/${dep}`} className="dep-link">{dep}</Link>
                      ))}
                    </div>
                  </div>
                )}
                {mechanic.implementation.conflicts && mechanic.implementation.conflicts.length > 0 && (
                  <div className="impl-item">
                    <span className="impl-label">Conflicts With</span>
                    <div className="dep-list">
                      {mechanic.implementation.conflicts.map(c => (
                        <Link key={c} to={`/mechanics/${c}`} className="conflict-link">{c}</Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Partial Implementation Notes */}
          {mechanic.implementationStatus === 'partial' && mechanic.implementationNotes && (
            <section className="implementation-info partial">
              <h2>Partial Implementation</h2>
              <p>{mechanic.implementationNotes}</p>
            </section>
          )}

          {/* Games Using This Mechanic */}
          {mechanic.gamesUsing.length > 0 && (
            <section className="games-using">
              <h2>Games Using This Mechanic</h2>
              <div className="games-list">
                {mechanic.gamesUsing.map(game => (
                  <Link key={game.id} to={`/games/${game.id}`} className="game-link">
                    {game.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Source Code */}
          {mechanic.sourceCode && (
            <section className="source-code-section">
              <div className="source-header">
                <h2>Source Code</h2>
                <div className="source-actions">
                  {mechanic.sourceFile && (
                    <span className="source-file">{mechanic.sourceFile}</span>
                  )}
                  <button
                    className="expand-toggle"
                    onClick={() => setSourceExpanded(!sourceExpanded)}
                  >
                    {sourceExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              <pre className={`source-code ${sourceExpanded ? 'expanded' : ''}`}>
                <code>{mechanic.sourceCode}</code>
              </pre>
            </section>
          )}
        </article>
      </div>
    </div>
  )
}

export default MechanicDetailPage
