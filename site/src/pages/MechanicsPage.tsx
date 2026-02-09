import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchMechanicsIndex, MechanicsIndex, MechanicIndexEntry } from '../utils/mechanicData'
import BackLink from '../components/BackLink'
import './MechanicsPage.css'

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

const categoryDescriptions: Record<string, string> = {
  action: 'Mechanics involving action points, queues, and action selection',
  auction: 'Bidding and auction mechanisms for acquiring resources or items',
  building: 'Construction, placement, and network building mechanics',
  cards: 'Hand management, drafting, deck building, and card play',
  conflict: 'Combat resolution and direct conflict between players',
  cooperative: 'Team-based and cooperative gameplay mechanics',
  dice: 'Dice rolling, probability, and push-your-luck mechanics',
  economic: 'Trading, markets, and resource economy mechanics',
  ending: 'Game ending conditions and victory determination',
  information: 'Hidden information, deduction, and memory mechanics',
  movement: 'Player and piece movement across the game space',
  other: 'Miscellaneous mechanics that don\'t fit other categories',
  physical: 'Dexterity, real-time, and physical manipulation',
  social: 'Negotiation, voting, bluffing, and social interaction',
  'turn-order': 'Turn order determination and management',
  victory: 'Victory conditions, scoring, and win mechanics',
  'worker-placement': 'Worker placement and action blocking mechanics',
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

const sourceColors: Record<string, string> = {
  bgg: '#ef8354',
  engine: '#4a9eff',
}

const sourceLabels: Record<string, string> = {
  bgg: 'BGG',
  engine: 'Engine',
}

function MechanicsPage() {
  const [searchParams] = useSearchParams()
  const highlightSlug = searchParams.get('highlight')
  const categoryParam = searchParams.get('category')

  const [data, setData] = useState<MechanicsIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)

  // Load mechanics index
  useEffect(() => {
    fetchMechanicsIndex()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Sync category filter with URL param
  useEffect(() => {
    setSelectedCategory(categoryParam)
  }, [categoryParam])

  // Scroll to highlighted mechanic on load
  useEffect(() => {
    if (highlightSlug && data) {
      const element = document.getElementById(`mechanic-${highlightSlug}`)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('highlighted')
        }, 100)
      }
    }
  }, [highlightSlug, data])

  if (loading) {
    return (
      <div className="mechanics-page">
        <div className="container">
          <BackLink to="/">Back to home</BackLink>
          <div className="loading-state">Loading mechanics...</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mechanics-page">
        <div className="container">
          <BackLink to="/">Back to home</BackLink>
          <div className="error-state">
            <h2>Error loading mechanics</h2>
            <p>{error || 'Unknown error'}</p>
          </div>
        </div>
      </div>
    )
  }

  // Filter mechanics
  const filteredMechanics = data.mechanics.filter(m => {
    const matchesSearch = search === '' ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.includes(search.toLowerCase()) ||
      m.summary.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === null || m.category === selectedCategory
    const matchesStatus = selectedStatus === null || m.implementationStatus === selectedStatus
    return matchesSearch && matchesCategory && matchesStatus
  })

  // Group by category
  const mechanicsByCategory = data.categories.reduce((acc, cat) => {
    acc[cat] = filteredMechanics.filter(m => m.category === cat)
    return acc
  }, {} as Record<string, MechanicIndexEntry[]>)

  return (
    <div className="mechanics-page">
      <div className="container">
        <BackLink to="/">Back to home</BackLink>

        <div className="mechanics-header">
          <h1>Game Mechanics</h1>
          <p className="mechanics-subtitle">
            Browse {data.count} board game mechanics ({data.mechanics.filter(m => m.source === 'engine').length} engine-specific, {data.mechanics.filter(m => m.source === 'bgg').length} from BGG), organized into {data.categories.length} categories.
          </p>
        </div>

        <div className="mechanics-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search mechanics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch('')}>
                Clear
              </button>
            )}
          </div>

          <div className="category-filters">
            <button
              className={`category-filter ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              All ({data.mechanics.length})
            </button>
            {data.categories.map(cat => {
              const count = data.mechanics.filter(m => m.category === cat).length
              const color = categoryColors[cat] || '#6b7280'
              return (
                <button
                  key={cat}
                  className={`category-filter ${selectedCategory === cat ? 'active' : ''}`}
                  style={{ '--cat-color': color } as React.CSSProperties}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                >
                  {cat} ({count})
                </button>
              )
            })}
          </div>

          {data.stats && (data.stats.implemented > 0 || data.stats.partial > 0) && (
            <div className="implementation-filters">
              <span className="filter-label">Engine Status:</span>
              <button
                className={`status-filter ${selectedStatus === null ? 'active' : ''}`}
                onClick={() => setSelectedStatus(null)}
              >
                All
              </button>
              <button
                className={`status-filter ${selectedStatus === 'implemented' ? 'active' : ''}`}
                style={{ '--status-color': implementationStatusColors.implemented } as React.CSSProperties}
                onClick={() => setSelectedStatus(selectedStatus === 'implemented' ? null : 'implemented')}
              >
                Implemented ({data.stats.implemented})
              </button>
              <button
                className={`status-filter ${selectedStatus === 'partial' ? 'active' : ''}`}
                style={{ '--status-color': implementationStatusColors.partial } as React.CSSProperties}
                onClick={() => setSelectedStatus(selectedStatus === 'partial' ? null : 'partial')}
              >
                Partial ({data.stats.partial})
              </button>
              <button
                className={`status-filter ${selectedStatus === 'not_implemented' ? 'active' : ''}`}
                style={{ '--status-color': implementationStatusColors.not_implemented } as React.CSSProperties}
                onClick={() => setSelectedStatus(selectedStatus === 'not_implemented' ? null : 'not_implemented')}
              >
                Not Implemented ({data.stats.notImplemented})
              </button>
            </div>
          )}
        </div>

        <div className="mechanics-results">
          <p className="results-count">
            Showing {filteredMechanics.length} mechanics
            {selectedCategory && ` in ${selectedCategory}`}
            {selectedStatus && ` with status "${implementationStatusLabels[selectedStatus]}"`}
            {search && ` matching "${search}"`}
          </p>
        </div>

        <div className="mechanics-list">
          {(selectedCategory ? [selectedCategory] : data.categories).map(category => {
            const mechanics = mechanicsByCategory[category]
            if (!mechanics || mechanics.length === 0) return null

            const color = categoryColors[category] || '#6b7280'

            return (
              <section key={category} className="category-section">
                <div className="category-header" style={{ '--cat-color': color } as React.CSSProperties}>
                  <h2>{category}</h2>
                  <span className="category-count">{mechanics.length} mechanics</span>
                </div>
                {categoryDescriptions[category] && (
                  <p className="category-description">{categoryDescriptions[category]}</p>
                )}

                <div className="mechanics-grid">
                  {mechanics.map(mechanic => (
                    <Link
                      key={mechanic.slug}
                      to={`/mechanics/${mechanic.slug}`}
                      id={`mechanic-${mechanic.slug}`}
                      className={`mechanic-card ${highlightSlug === mechanic.slug ? 'highlight' : ''}`}
                      style={{ '--cat-color': color } as React.CSSProperties}
                    >
                      <div className="mechanic-card-header">
                        <h3>{mechanic.name}</h3>
                        <div className="mechanic-badges">
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
                          {mechanic.implementationStatus !== 'not_implemented' && (
                            <span
                              className={`implementation-badge ${mechanic.implementationStatus}`}
                              style={{ '--impl-color': implementationStatusColors[mechanic.implementationStatus] } as React.CSSProperties}
                            >
                              {implementationStatusLabels[mechanic.implementationStatus]}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mechanic-summary">{mechanic.summary}</p>

                      {mechanic.gamesUsing.length > 0 && (
                        <div className="mechanic-games" onClick={(e) => e.preventDefault()}>
                          <span className="games-label">Used in: </span>
                          {mechanic.gamesUsing.map((gameId, i) => (
                            <span key={gameId}>
                              {i > 0 && ', '}
                              <Link
                                to={`/games/${gameId}`}
                                className="mechanic-game-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {gameId}
                              </Link>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mechanic-footer">
                        <code className="mechanic-slug">{mechanic.slug}</code>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MechanicsPage
