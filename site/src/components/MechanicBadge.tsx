import { Link } from 'react-router-dom'
import mechanicsData from '../data/mechanics.json'
import './MechanicBadge.css'

interface MechanicDef {
  id: number
  name: string
  slug: string
  category: string
  bggUrl: string
  description: string
}

interface MechanicsData {
  mechanics: MechanicDef[]
}

interface Props {
  slug: string
  showCategory?: boolean
  linkToPage?: boolean
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

function MechanicBadge({ slug, showCategory = false, linkToPage = true }: Props) {
  const data = mechanicsData as MechanicsData
  const mechanic = data.mechanics.find((m) => m.slug === slug)

  if (!mechanic) {
    return (
      <span className="mechanic-badge unknown">
        {slug}
      </span>
    )
  }

  const color = categoryColors[mechanic.category] || '#6b7280'
  const style = { '--badge-color': color } as React.CSSProperties

  const badge = (
    <span
      className={`mechanic-badge ${showCategory ? 'with-category' : ''}`}
      style={style}
      title={mechanic.description}
    >
      {mechanic.name}
      {showCategory && <span className="badge-category">{mechanic.category}</span>}
    </span>
  )

  if (linkToPage) {
    return (
      <Link to={`/mechanics/${slug}`} className="mechanic-link">
        {badge}
      </Link>
    )
  }

  return badge
}

export default MechanicBadge
