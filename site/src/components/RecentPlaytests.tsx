import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LogsData } from '../types/logs'
import { fetchLogsIndex } from '../utils/logData'
import { formatDuration } from '../utils/timeUtils'
import './RecentPlaytests.css'

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

function RecentPlaytests() {
  const [logsData, setLogsData] = useState<LogsData | null>(null)

  useEffect(() => {
    fetchLogsIndex().then(setLogsData).catch(() => {})
  }, [])

  if (!logsData || logsData.logs.length === 0) return null

  const recentLogs = [...logsData.logs]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 5)

  return (
    <section className="recent-playtests-section">
      <div className="container">
        <div className="recent-playtests-header">
          <h2 className="section-title">Recent Playtests</h2>
          <Link to="/logs" className="view-all-link">View all playtests</Link>
        </div>

        <div className="recent-playtests-table-wrap">
          <table className="recent-playtests-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Status</th>
                <th>Players</th>
                <th>Turns</th>
                <th>Duration</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map(log => (
                <tr key={log.gameId}>
                  <td>
                    <Link to={`/games/${log.gameName}`} className="game-name-link">
                      {log.gameName}
                    </Link>
                  </td>
                  <td>
                    <span className={`outcome-badge ${getOutcomeClass(log.outcome)}`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td>{log.playerCount}</td>
                  <td>{log.totalTurns}</td>
                  <td>{formatDuration(log.duration)}</td>
                  <td className="date-cell">{formatDate(log.startTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default RecentPlaytests
