import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { marked } from 'marked'
import { LogsData } from '../types/logs'
import LogViewer from '../components/LogViewer'
import logsDataRaw from '../data/logs.json'
import './LogDetailPage.css'

const logsData = logsDataRaw as unknown as LogsData

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: true,
})

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatDateTime(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getOutcomeClass(outcome: string): string {
  switch (outcome) {
    case 'completed': return 'outcome-completed'
    case 'ended': return 'outcome-ended'
    case 'cancelled': return 'outcome-cancelled'
    case 'in_progress': return 'outcome-progress'
    default: return 'outcome-unknown'
  }
}

function LogDetailPage() {
  const { logId } = useParams<{ logId: string }>()
  const log = logsData.logs.find(l => l.gameId === logId)
  const [activeTab, setActiveTab] = useState<'analysis' | 'events'>(
    // Default to analysis if available, otherwise events
    log?.analysis ? 'analysis' : 'events'
  )

  if (!log) {
    return (
      <div className="log-detail-page">
        <div className="container">
          <h1>Log not found</h1>
          <Link to="/logs">Back to logs</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="log-detail-page">
      <div className="container">
        <Link to="/logs" className="back-link">Back to logs</Link>

        <div className="log-detail-header">
          <div className="header-main">
            <h1>{log.gameName}</h1>
            <span className={`outcome-badge ${getOutcomeClass(log.outcome)}`}>
              {log.outcome}
            </span>
          </div>
          <div className="log-detail-id">{log.gameId}</div>
        </div>

        <div className="log-detail-meta">
          <div className="meta-row">
            <div className="meta-item">
              <span className="meta-label">Started</span>
              <span className="meta-value">{formatDateTime(log.startTime)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Ended</span>
              <span className="meta-value">{formatDateTime(log.endTime)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Duration</span>
              <span className="meta-value">{formatDuration(log.duration)}</span>
            </div>
          </div>

          <div className="meta-row">
            <div className="meta-item">
              <span className="meta-label">Players</span>
              <span className="meta-value">{log.playerCount}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Turns</span>
              <span className="meta-value">{log.totalTurns}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Events</span>
              <span className="meta-value">{log.totalEvents}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">File Size</span>
              <span className="meta-value">{(log.fileSize / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>

        {log.winner && (
          <div className="log-detail-winner">
            Winner: <strong>{log.winner}</strong>
          </div>
        )}

        {log.endReason && (
          <div className="log-detail-reason">
            End reason: {log.endReason}
          </div>
        )}

        <div className="log-detail-players">
          <h2>Players</h2>
          <div className="players-list">
            {log.players.map(player => (
              <span key={player} className="player-tag">{player}</span>
            ))}
          </div>
        </div>

        <div className="log-detail-breakdown">
          <h2>Event Breakdown</h2>
          <div className="event-breakdown">
            {Object.entries(log.eventCounts).map(([event, count]) => (
              <div key={event} className="breakdown-item">
                <span className="breakdown-event">{event}</span>
                <span className="breakdown-count">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tab navigation for Analysis and Event Log */}
        <div className="log-detail-tabs">
          <div className="tab-buttons">
            {log.analysis && (
              <button
                className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
                onClick={() => setActiveTab('analysis')}
              >
                Analysis ({log.analysis.version})
              </button>
            )}
            <button
              className={`tab-button ${activeTab === 'events' ? 'active' : ''}`}
              onClick={() => setActiveTab('events')}
            >
              Event Log ({log.totalEvents})
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'analysis' && log.analysis && (
              <div className="log-analysis">
                <div className="analysis-meta">
                  <span className="analysis-file">{log.analysis.filename}</span>
                </div>
                <div
                  className="analysis-content markdown-body"
                  dangerouslySetInnerHTML={{
                    __html: marked(log.analysis.content) as string
                  }}
                />
              </div>
            )}

            {activeTab === 'events' && (
              <div className="log-detail-events">
                <LogViewer events={log.events} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LogDetailPage
