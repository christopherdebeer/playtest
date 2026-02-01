import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import docsData from '../data/docs.json'
import './DocsPage.css'

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

interface CategoryDef {
  name: string
  label: string
  count: number
}

interface DocsData {
  categories: CategoryDef[]
  docs: DocDef[]
  count: number
  generated: string
}

const categoryColors: Record<string, string> = {
  proposals: '#3b82f6',
  general: '#6b7280',
  guides: '#10b981',
  api: '#8b5cf6',
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

function DocsPage() {
  const [searchParams] = useSearchParams()
  const highlightSlug = searchParams.get('highlight')

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)

  const data = docsData as DocsData

  // Get unique statuses from docs
  const statuses = [...new Set(data.docs
    .map(d => d.metadata.status)
    .filter((s): s is string => !!s)
  )]

  // Filter docs
  const filteredDocs = data.docs.filter(d => {
    const matchesSearch = search === '' ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.slug.includes(search.toLowerCase()) ||
      d.summary.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === null || d.category === selectedCategory
    const matchesStatus = selectedStatus === null || d.metadata.status === selectedStatus
    return matchesSearch && matchesCategory && matchesStatus
  })

  // Group by category
  const docsByCategory = data.categories.reduce((acc, cat) => {
    acc[cat.name] = filteredDocs.filter(d => d.category === cat.name)
    return acc
  }, {} as Record<string, DocDef[]>)

  // Scroll to highlighted doc on load
  useEffect(() => {
    if (highlightSlug) {
      const element = document.getElementById(`doc-${highlightSlug}`)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('highlighted')
        }, 100)
      }
    }
  }, [highlightSlug])

  return (
    <div className="docs-page">
      <div className="container">
        <Link to="/" className="back-link">← Back to home</Link>

        <div className="docs-header">
          <h1>Documentation</h1>
          <p className="docs-subtitle">
            Browse {data.count} documents including proposals, guides, and API documentation.
          </p>
        </div>

        <div className="docs-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search documentation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch('')}>
                Clear
              </button>
            )}
          </div>

          <div className="filter-row">
            <div className="category-filters">
              <button
                className={`category-filter ${selectedCategory === null ? 'active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All ({data.docs.length})
              </button>
              {data.categories.map(cat => {
                const color = categoryColors[cat.name] || '#6b7280'
                return (
                  <button
                    key={cat.name}
                    className={`category-filter ${selectedCategory === cat.name ? 'active' : ''}`}
                    style={{ '--cat-color': color } as React.CSSProperties}
                    onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                  >
                    {cat.label} ({cat.count})
                  </button>
                )
              })}
            </div>

            {statuses.length > 0 && (
              <div className="status-filters">
                <span className="filter-label">Status:</span>
                <button
                  className={`status-filter ${selectedStatus === null ? 'active' : ''}`}
                  onClick={() => setSelectedStatus(null)}
                >
                  All
                </button>
                {statuses.map(status => {
                  const color = statusColors[status] || '#6b7280'
                  return (
                    <button
                      key={status}
                      className={`status-filter ${selectedStatus === status ? 'active' : ''}`}
                      style={{ '--status-color': color } as React.CSSProperties}
                      onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
                    >
                      {status}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="docs-results">
          <p className="results-count">
            Showing {filteredDocs.length} documents
            {selectedCategory && ` in ${selectedCategory}`}
            {selectedStatus && ` with status "${selectedStatus}"`}
            {search && ` matching "${search}"`}
          </p>
        </div>

        <div className="docs-list">
          {(selectedCategory ? [selectedCategory] : data.categories.map(c => c.name)).map(categoryName => {
            const docs = docsByCategory[categoryName]
            if (!docs || docs.length === 0) return null

            const category = data.categories.find(c => c.name === categoryName)
            const color = categoryColors[categoryName] || '#6b7280'

            return (
              <section key={categoryName} className="category-section">
                <div className="category-header" style={{ '--cat-color': color } as React.CSSProperties}>
                  <h2>{category?.label || categoryName}</h2>
                  <span className="category-count">{docs.length} documents</span>
                </div>

                <div className="docs-grid">
                  {docs.map(doc => {
                    const statusColor = doc.metadata.status ? statusColors[doc.metadata.status] || '#6b7280' : null
                    const priority = doc.metadata.priority ? priorityLabels[doc.metadata.priority] : null

                    return (
                      <Link
                        key={doc.slug}
                        to={`/docs/${doc.slug}`}
                        id={`doc-${doc.slug}`}
                        className={`doc-card ${highlightSlug === doc.slug ? 'highlight' : ''}`}
                        style={{ '--cat-color': color } as React.CSSProperties}
                      >
                        <div className="doc-card-header">
                          <h3>{doc.title}</h3>
                          <div className="doc-badges">
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
                          </div>
                        </div>
                        <p className="doc-summary">{doc.summary}</p>
                        <div className="doc-footer">
                          <code className="doc-path">{doc.path}</code>
                          <span className="view-link">View →</span>
                        </div>
                      </Link>
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

export default DocsPage
