import { Link } from 'react-router-dom'
import mechanicsData from '../data/mechanics.json'
import './MechanicsSection.css'

// Category colors matching MechanicBadge
const CATEGORY_COLORS: Record<string, string> = {
  action: '#8b5cf6',
  auction: '#f59e0b',
  building: '#84cc16',
  cards: '#3b82f6',
  conflict: '#ef4444',
  cooperative: '#22c55e',
  dice: '#f97316',
  economic: '#eab308',
  ending: '#6366f1',
  information: '#06b6d4',
  movement: '#14b8a6',
  physical: '#ec4899',
  social: '#a855f7',
  'turn-order': '#64748b',
  victory: '#fbbf24',
  'worker-placement': '#10b981',
  other: '#6b7280',
}

function MechanicsSection() {
  const { categories, count } = mechanicsData

  // Get count per category
  const categoryCounts: Record<string, number> = {}
  for (const mech of mechanicsData.mechanics) {
    categoryCounts[mech.category] = (categoryCounts[mech.category] || 0) + 1
  }

  return (
    <section id="mechanics" className="mechanics-section">
      <div className="container">
        <div className="mechanics-header">
          <div>
            <h2 className="section-title">Game Mechanics Database</h2>
            <p className="section-desc">
              {count} board game mechanics from BoardGameGeek, organized into {categories.length} categories.
              Reference mechanics in your RULES.md to help AI agents understand game systems.
            </p>
          </div>
          <Link to="/mechanics" className="browse-btn">
            Browse All Mechanics
          </Link>
        </div>

        <div className="categories-grid">
          {categories.map((cat) => (
            <Link
              to={`/mechanics?category=${cat}`}
              key={cat}
              className="category-card"
              style={{ '--cat-color': CATEGORY_COLORS[cat] || '#6b7280' } as React.CSSProperties}
            >
              <span className="category-name">{cat.replace(/-/g, ' ')}</span>
              <span className="category-count">{categoryCounts[cat] || 0}</span>
            </Link>
          ))}
        </div>

        <div className="mechanics-usage">
          <h3>Usage in RULES.md</h3>
          <pre><code>{`---
name: "My Game"
mechanics:
  - hand-management
  - set-collection
  - push-your-luck
---`}</code></pre>
        </div>
      </div>
    </section>
  )
}

export default MechanicsSection
