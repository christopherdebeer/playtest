import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import mechanicsData from '../data/mechanics.json'
import gamesData from '../data/games.json'
import BackLink from '../components/BackLink'
import './MechanicsPage.css'

interface MechanicDef {
  id: number
  name: string
  slug: string
  category: string
  summary: string
  bggUrl: string
  description: string
  contentHtml: string
  // Implementation status from shared/mechanics-implementation.json
  implementationStatus: 'implemented' | 'partial' | 'not_implemented'
  implementationConfig?: string
  implementationSince?: string
  implementationDescription?: string
  implementationNotes?: string
  implementationRelated?: string
}

interface ImplementationStats {
  implemented: number
  partial: number
  notImplemented: number
}

interface MechanicsData {
  categories: string[]
  mechanics: MechanicDef[]
  count: number
  implementationStats?: ImplementationStats
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

function MechanicsPage() {
  const [searchParams] = useSearchParams()
  const highlightSlug = searchParams.get('highlight')
  const categoryParam = searchParams.get('category')

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryParam)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [expandedMechanics, setExpandedMechanics] = useState<Set<string>>(new Set())

  // Sync category filter with URL param
  useEffect(() => {
    setSelectedCategory(categoryParam)
  }, [categoryParam])

  const data = mechanicsData as MechanicsData
  const games = gamesData as Game[]

  const toggleExpanded = useCallback((slug: string) => {
    setExpandedMechanics(prev => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }, [])

  // Find games using each mechanic
  const gamesUsingMechanic = (slug: string): Game[] => {
    return games.filter(g => g.config.mechanics?.includes(slug))
  }

  // Filter mechanics
  const filteredMechanics = data.mechanics.filter(m => {
    const matchesSearch = search === '' ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === null || m.category === selectedCategory
    const matchesStatus = selectedStatus === null || m.implementationStatus === selectedStatus
    return matchesSearch && matchesCategory && matchesStatus
  })

  // Group by category
  const mechanicsByCategory = data.categories.reduce((acc, cat) => {
    acc[cat] = filteredMechanics.filter(m => m.category === cat)
    return acc
  }, {} as Record<string, MechanicDef[]>)

  // Scroll to highlighted mechanic on load
  useEffect(() => {
    if (highlightSlug) {
      const element = document.getElementById(`mechanic-${highlightSlug}`)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('highlighted')
        }, 100)
      }
    }
  }, [highlightSlug])

  return (
    <div className="mechanics-page">
      <div className="container">
        <BackLink to="/">Back to home</BackLink>

        <div className="mechanics-header">
          <h1>Game Mechanics</h1>
          <p className="mechanics-subtitle">
            Browse {data.count} board game mechanics from BoardGameGeek, organized into {data.categories.length} categories.
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

          {data.implementationStats && (data.implementationStats.implemented > 0 || data.implementationStats.partial > 0) && (
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
                Implemented ({data.implementationStats.implemented})
              </button>
              <button
                className={`status-filter ${selectedStatus === 'partial' ? 'active' : ''}`}
                style={{ '--status-color': implementationStatusColors.partial } as React.CSSProperties}
                onClick={() => setSelectedStatus(selectedStatus === 'partial' ? null : 'partial')}
              >
                Partial ({data.implementationStats.partial})
              </button>
              <button
                className={`status-filter ${selectedStatus === 'not_implemented' ? 'active' : ''}`}
                style={{ '--status-color': implementationStatusColors.not_implemented } as React.CSSProperties}
                onClick={() => setSelectedStatus(selectedStatus === 'not_implemented' ? null : 'not_implemented')}
              >
                Not Implemented ({data.implementationStats.notImplemented})
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
                  {mechanics.map(mechanic => {
                    const usedIn = gamesUsingMechanic(mechanic.slug)
                    const isExpanded = expandedMechanics.has(mechanic.slug)
                    return (
                      <div
                        key={mechanic.slug}
                        id={`mechanic-${mechanic.slug}`}
                        className={`mechanic-card ${highlightSlug === mechanic.slug ? 'highlight' : ''} ${isExpanded ? 'expanded' : ''}`}
                        style={{ '--cat-color': color } as React.CSSProperties}
                      >
                        <div className="mechanic-card-header">
                          <h3>{mechanic.name}</h3>
                          <div className="mechanic-badges">
                            {mechanic.implementationStatus !== 'not_implemented' && (
                              <span
                                className={`implementation-badge ${mechanic.implementationStatus}`}
                                style={{ '--impl-color': implementationStatusColors[mechanic.implementationStatus] } as React.CSSProperties}
                                title={
                                  mechanic.implementationStatus === 'implemented'
                                    ? `Config: ${mechanic.implementationConfig} (v${mechanic.implementationSince})`
                                    : mechanic.implementationNotes
                                }
                              >
                                {implementationStatusLabels[mechanic.implementationStatus]}
                              </span>
                            )}
                            <span className="mechanic-id">#{mechanic.id}</span>
                          </div>
                        </div>
                        <p className="mechanic-summary">{mechanic.summary}</p>

                        {!isExpanded && (
                          <p className="mechanic-description">{mechanic.description}</p>
                        )}

                        {isExpanded && mechanic.contentHtml && (
                          <div
                            className="mechanic-content markdown-body"
                            dangerouslySetInnerHTML={{ __html: mechanic.contentHtml }}
                          />
                        )}

                        <button
                          className="expand-toggle"
                          onClick={() => toggleExpanded(mechanic.slug)}
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>

                        {usedIn.length > 0 && (
                          <div className="mechanic-games">
                            <span className="games-label">Used in:</span>
                            {usedIn.map(game => (
                              <Link key={game.id} to={`/games/${game.id}`} className="game-link">
                                {game.config.name}
                              </Link>
                            ))}
                          </div>
                        )}

                        <div className="mechanic-footer">
                          <code className="mechanic-slug">{mechanic.slug}</code>
                          <a
                            href={mechanic.bggUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bgg-link"
                          >
                            BGG
                          </a>
                        </div>
                      </div>
                    )
                  })}
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
