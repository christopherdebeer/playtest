import { useParams, Link } from 'react-router-dom'
import docsData from '../data/docs.json'
import './DocDetailPage.css'

interface DocMetadata {
  status?: string
  category?: string
  priority?: string
  discovered?: string
}

interface DocDef {
  slug: string
  title: string
  category: string
  path: string
  summary: string
  metadata: DocMetadata
  contentHtml: string
}

interface DocsData {
  docs: DocDef[]
}

const statusColors: Record<string, string> = {
  'Draft': '#f59e0b',
  'Investigation': '#6366f1',
  'Approved': '#22c55e',
  'In Progress': '#3b82f6',
  'Complete': '#10b981',
  'Implemented': '#10b981',
  'Rejected': '#ef4444',
}

const priorityLabels: Record<string, { label: string; color: string }> = {
  'P0': { label: 'Critical', color: '#ef4444' },
  'P1': { label: 'High', color: '#f59e0b' },
  'P2': { label: 'Medium', color: '#3b82f6' },
  'P3': { label: 'Low', color: '#6b7280' },
}

function DocDetailPage() {
  const { docSlug } = useParams<{ docSlug: string }>()
  const data = docsData as DocsData
  const doc = data.docs.find(d => d.slug === docSlug)

  if (!doc) {
    return (
      <div className="doc-detail-page">
        <div className="container">
          <h1>Document not found</h1>
          <p>No document found with slug: {docSlug}</p>
          <Link to="/docs" className="back-link">Back to docs</Link>
        </div>
      </div>
    )
  }

  const statusColor = doc.metadata.status ? statusColors[doc.metadata.status] || '#6b7280' : null
  const priority = doc.metadata.priority ? priorityLabels[doc.metadata.priority] : null

  return (
    <div className="doc-detail-page">
      <div className="container">
        <Link to="/docs" className="back-link">← Back to docs</Link>

        <article className="doc-article">
          <header className="doc-header">
            <h1>{doc.title}</h1>
            <div className="doc-meta">
              {doc.metadata.status && statusColor && (
                <span
                  className="status-badge"
                  style={{ '--status-color': statusColor } as React.CSSProperties}
                >
                  {doc.metadata.status}
                </span>
              )}
              {priority && (
                <span
                  className="priority-badge"
                  style={{ '--priority-color': priority.color } as React.CSSProperties}
                >
                  {doc.metadata.priority}: {priority.label}
                </span>
              )}
              <span className="category-badge">{doc.category}</span>
            </div>
            <div className="doc-path">
              <code>{doc.path}</code>
            </div>
          </header>

          <div
            className="doc-content markdown-body"
            dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
          />
        </article>
      </div>
    </div>
  )
}

export default DocDetailPage
