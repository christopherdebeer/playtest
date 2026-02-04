import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LogsData, GameLogSummary } from '../types/logs'
import { fetchLogsIndex } from '../utils/logData'
import { formatDuration } from '../utils/timeUtils'
import BackLink from '../components/BackLink'
import './LogsPage.css'

function formatDate(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function LogCard({ log }: { log: GameLogSummary & { hasAnalysis?: boolean } }) {
  return (
    <Link to={`/logs/${log.gameId}`} className="log-card">
      <div className="log-card-header">
        <h3>{log.gameName}</h3>
        <div className="log-badges">
          {log.hasAnalysis && (
            <span className="analysis-badge" title="Analysis available">
              Analysis
            </span>
          )}
          <span className={`outcome-badge ${getOutcomeClass(log.outcome)}`}>
            {log.outcome}
          </span>
        </div>
      </div>

      <div className="log-card-meta">
        <span className="log-id">{log.gameId}</span>
        <span className="log-date">{formatDate(log.startTime)}</span>
      </div>

      <div className="log-card-stats">
        <div className="log-stat">
          <span className="log-stat-value">{log.playerCount}</span>
          <span className="log-stat-label">Players</span>
        </div>
        <div className="log-stat">
          <span className="log-stat-value">{log.totalTurns}</span>
          <span className="log-stat-label">Turns</span>
        </div>
        <div className="log-stat">
          <span className="log-stat-value">{log.totalEvents}</span>
          <span className="log-stat-label">Events</span>
        </div>
        <div className="log-stat">
          <span className="log-stat-value">{formatDuration(log.duration)}</span>
          <span className="log-stat-label">Duration</span>
        </div>
      </div>

      {log.winner && (
        <div className="log-winner">
          Winner: <strong>{log.winner}</strong>
        </div>
      )}

      {log.endReason && (
        <div className="log-reason">{log.endReason}</div>
      )}
    </Link>
  )
}

function LogsPage() {
  const [searchParams] = useSearchParams()
  const initialGameFilter = searchParams.get('game') || 'all'

  const [gameFilter, setGameFilter] = useState<string>(initialGameFilter)
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'turns' | 'events'>('date')
  const [logsData, setLogsData] = useState<LogsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load logs index on mount
  useEffect(() => {
    fetchLogsIndex()
      .then(data => {
        setLogsData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Update filter if URL param changes
  useEffect(() => {
    const gameParam = searchParams.get('game')
    if (gameParam) {
      setGameFilter(gameParam)
    }
  }, [searchParams])

  if (loading) {
    return (
      <div className="logs-page">
        <div className="container">
          <p>Loading logs...</p>
        </div>
      </div>
    )
  }

  if (error || !logsData) {
    return (
      <div className="logs-page">
        <div className="container">
          <p>Error loading logs: {error || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  const games = Object.keys(logsData.games)
  const outcomes = ['completed', 'ended', 'cancelled', 'in_progress', 'unknown']

  // Filter and sort logs
  let filteredLogs = logsData.logs.filter(log => {
    if (gameFilter !== 'all' && log.gameName !== gameFilter) return false
    if (outcomeFilter !== 'all' && log.outcome !== outcomeFilter) return false
    return true
  })

  // Sort logs
  filteredLogs = [...filteredLogs].sort((a, b) => {
    switch (sortBy) {
      case 'turns':
        return b.totalTurns - a.totalTurns
      case 'events':
        return b.totalEvents - a.totalEvents
      case 'date':
      default:
        return new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    }
  })

  // Calculate overall stats
  const totalLogs = logsData.logs.length
  const totalEvents = logsData.logs.reduce((sum, log) => sum + log.totalEvents, 0)
  const completedGames = logsData.logs.filter(l => l.outcome === 'completed' || l.outcome === 'ended').length
  const totalTime = logsData.logs.reduce((sum, log: GameLogSummary) => sum + (log.duration || 0), 0)

  return (
    <div className="logs-page">
      <div className="container">
        <BackLink to="/">Back to home</BackLink>

        <div className="logs-header">
          <h1>Game Logs</h1>
          <p className="logs-description">
            Browse and analyze historic playtest sessions
          </p>
        </div>

        <div className="logs-overview">
          <div className="overview-stat">
            <span className="overview-value">{totalLogs}</span>
            <span className="overview-label">Total Games</span>
          </div>
          <div className="overview-stat">
            <span className="overview-value">{completedGames}</span>
            <span className="overview-label">Completed</span>
          </div>
          <div className="overview-stat">
            <span className="overview-value">{totalEvents.toLocaleString()}</span>
            <span className="overview-label">Total Events</span>
          </div>
          <div className="overview-stat">
            <span className="overview-value">{games.length}</span>
            <span className="overview-label">Games</span>
          </div>
          <div className="overview-stat">
            <span className="overview-value">{formatDuration(totalTime)}</span>
            <span className="overview-label">Elapsed time</span>
          </div>
        </div>

        <div className="logs-filters">
          <div className="filter-group">
            <label>Game:</label>
            <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
              <option value="all">All Games</option>
              {games.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Outcome:</label>
            <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
              <option value="all">All Outcomes</option>
              {outcomes.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Sort by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'turns' | 'events')}>
              <option value="date">Date (newest)</option>
              <option value="turns">Turns</option>
              <option value="events">Events</option>
            </select>
          </div>
        </div>

        <div className="logs-count">
          Showing {filteredLogs.length} of {totalLogs} logs
        </div>

        <div className="logs-grid">
          {filteredLogs.map(log => (
            <LogCard key={log.gameId} log={log} />
          ))}
        </div>

        {filteredLogs.length === 0 && (
          <div className="no-logs">
            No game logs found. Run some playtests to generate logs!
          </div>
        )}
      </div>
    </div>
  )
}

export default LogsPage
