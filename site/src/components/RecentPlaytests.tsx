import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LogsData, GameLogSummary } from '../types/logs'
import { fetchLogsIndex } from '../utils/logData'
import { formatDuration } from '../utils/timeUtils'
import './RecentPlaytests.css'

function RecentPlaytests() {
  const [logsData, setLogsData] = useState<LogsData | null>(null)

  useEffect(() => {
    fetchLogsIndex().then(setLogsData).catch(() => setLogsData(null))
  }, [])

  if (!logsData || logsData.logs.length === 0) return null

  const recentLogs = [...logsData.logs]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 8)

  return (
    <section id="recent-playtests" className="recent-playtests-section">
      <div className="container">
        <div className="recent-playtests-header">
          <h2 className="section-title">Recent Playtests</h2>
          <Link to="/logs" className="browse-btn">View All Logs</Link>
        </div>
        <p className="section-desc">
          Latest playtest sessions across all games.
        </p>

        <div className="recent-playtests-table-wrapper">
          <table className="recent-playtests-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
                <th>Players</th>
                <th>Turns</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log: GameLogSummary) => (
                <tr key={log.gameId}>
                  <td>
                    <Link to={`/games/${log.gameName}`} className="game-name-link">
                      {log.gameName}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/logs/${log.gameId}`}>
                      {new Date(log.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Link>
                  </td>
                  <td>{log.playerCount}</td>
                  <td>{log.totalTurns}</td>
                  <td>{formatDuration(log.duration)}</td>
                  <td>
                    <span className={`rp-outcome rp-outcome-${log.outcome}`}>
                      {log.outcome}
                    </span>
                  </td>
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
