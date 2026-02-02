import { Link } from 'react-router-dom'
import './BackLink.css'

interface BackLinkProps {
  to: string
  children: React.ReactNode
}

function BackLink({ to, children }: BackLinkProps) {
  return (
    <Link to={to} className="back-link">
      <span className="back-link-arrow">←</span> {children}
    </Link>
  )
}

export default BackLink
