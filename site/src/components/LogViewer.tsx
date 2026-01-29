import { useState } from 'react'
import { LogEvent } from '../types/logs'
import './LogViewer.css'

interface LogViewerProps {
  events: LogEvent[]
  showRaw?: boolean
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getEventIcon(event: string): string {
  switch (event) {
    case 'game_init': return 'I'
    case 'game_start': return 'S'
    case 'game_end': return 'E'
    case 'game_cancelled': return 'X'
    case 'action_submitted': return 'A'
    case 'play_card': return 'P'
    case 'draw': return 'D'
    case 'discard': return 'D'
    default: return '?'
  }
}

function getEventClass(event: string): string {
  switch (event) {
    case 'game_init':
    case 'game_start':
      return 'event-system'
    case 'game_end':
      return 'event-end'
    case 'game_cancelled':
      return 'event-cancelled'
    case 'action_submitted':
      return 'event-action'
    case 'play_card':
      return 'event-play'
    case 'draw':
    case 'discard':
      return 'event-draw'
    default:
      return 'event-default'
  }
}

function renderEventContent(evt: LogEvent): React.ReactNode {
  const { event, player, data } = evt

  switch (event) {
    case 'game_init':
      return (
        <span>
          Game initialized with <strong>{String(data?.playerCount ?? '')}</strong> players
        </span>
      )
    case 'game_start':
      return (
        <span>
          Game started. Players: {(data?.players as string[])?.join(', ')}. First player: <strong>{String(data?.firstPlayer ?? '')}</strong>
        </span>
      )
    case 'game_end':
      return (
        <span>
          Game ended. Winner: <strong>{String(data?.winner ?? 'none')}</strong>
          {data?.reason ? <span className="event-reason"> - {String(data.reason)}</span> : null}
        </span>
      )
    case 'game_cancelled':
      return (
        <span>
          Game cancelled
          {data?.reason ? <span className="event-reason"> - {String(data.reason)}</span> : null}
        </span>
      )
    case 'action_submitted':
      return (
        <span>
          <strong>{player}</strong> submitted: {String(data?.type ?? '')}
          {data?.card ? <> - <code>{String(data.card)}</code></> : null}
          {data?.reasoning ? (
            <div className="event-reasoning">"{String(data.reasoning)}"</div>
          ) : null}
        </span>
      )
    case 'play_card':
      return (
        <span>
          <strong>{player}</strong> played <code>{String(data?.card ?? '')}</code>
          {data?.currentColor ? <> (color: {String(data.currentColor)})</> : null}
        </span>
      )
    case 'draw':
      return (
        <span>
          <strong>{player}</strong> drew {String(data?.count ?? 0)} card(s)
          {data?.cards ? (
            <span className="drawn-cards">: {(data.cards as string[]).join(', ')}</span>
          ) : null}
        </span>
      )
    case 'discard':
      return (
        <span>
          <strong>{player}</strong> discarded <code>{String(data?.card ?? '')}</code>
        </span>
      )
    default:
      return (
        <span>
          {event}
          {data && <code className="event-data">{JSON.stringify(data)}</code>}
        </span>
      )
  }
}

function LogEventRow({ evt, index }: { evt: LogEvent; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`log-event ${getEventClass(evt.event)}`}>
      <div className="event-main" onClick={() => setExpanded(!expanded)}>
        <span className="event-index">{index + 1}</span>
        <span className="event-time">{formatTimestamp(evt.timestamp)}</span>
        <span className={`event-icon ${getEventClass(evt.event)}`}>
          {getEventIcon(evt.event)}
        </span>
        {evt.turn && <span className="event-turn">T{evt.turn}</span>}
        <span className="event-content">{renderEventContent(evt)}</span>
        {evt.data && (
          <button className="expand-btn" title="Toggle raw data">
            {expanded ? '-' : '+'}
          </button>
        )}
      </div>
      {expanded && evt.data && (
        <div className="event-raw">
          <pre>{JSON.stringify(evt.data, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

function LogViewer({ events, showRaw = false }: LogViewerProps) {
  const [filter, setFilter] = useState<string>('all')
  const [playerFilter, setPlayerFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>(showRaw ? 'raw' : 'structured')

  // Get unique event types and players
  const eventTypes = [...new Set(events.map(e => e.event))]
  const players = [...new Set(events.filter(e => e.player).map(e => e.player!))]

  // Filter events
  const filteredEvents = events.filter(evt => {
    if (filter !== 'all' && evt.event !== filter) return false
    if (playerFilter !== 'all' && evt.player !== playerFilter) return false
    return true
  })

  return (
    <div className="log-viewer">
      <div className="log-controls">
        <div className="control-group">
          <label>Event Type:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {players.length > 0 && (
          <div className="control-group">
            <label>Player:</label>
            <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
              <option value="all">All Players</option>
              {players.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        <div className="control-group view-toggle">
          <button
            className={viewMode === 'structured' ? 'active' : ''}
            onClick={() => setViewMode('structured')}
          >
            Structured
          </button>
          <button
            className={viewMode === 'raw' ? 'active' : ''}
            onClick={() => setViewMode('raw')}
          >
            Raw JSONL
          </button>
        </div>
      </div>

      <div className="log-stats">
        Showing {filteredEvents.length} of {events.length} events
      </div>

      {viewMode === 'structured' ? (
        <div className="log-events">
          {filteredEvents.map((evt, idx) => (
            <LogEventRow key={idx} evt={evt} index={idx} />
          ))}
        </div>
      ) : (
        <div className="log-raw-view">
          <pre>
            {filteredEvents.map((evt, idx) => (
              <div key={idx} className="raw-line">
                {JSON.stringify(evt)}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  )
}

export default LogViewer
