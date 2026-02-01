import { useState } from 'react'
import { LogEvent } from '../types/logs'
import {
  getEventIcon,
  getEventClass,
  renderEventContent,
  isTypedLogEvent,
} from './eventRenderers'
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

// Fallback for unknown event types
function renderUnknownEvent(evt: LogEvent): React.ReactNode {
  return (
    <span className="event-unknown">
      {evt.event}
      {evt.data && <code className="event-data">{JSON.stringify(evt.data)}</code>}
    </span>
  )
}

function LogEventRow({ evt, index }: { evt: LogEvent; index: number }) {
  const [expanded, setExpanded] = useState(false)

  // Use typed renderers for known event types
  const isTyped = isTypedLogEvent(evt)
  const icon = isTyped ? getEventIcon(evt.event as any) : '?'
  const cssClass = isTyped ? getEventClass(evt.event as any) : 'event-unknown'
  const content = isTyped ? renderEventContent(evt as any) : renderUnknownEvent(evt)

  return (
    <div className={`log-event ${cssClass}`}>
      <div className="event-main" onClick={() => setExpanded(!expanded)}>
        <span className="event-index">{index + 1}</span>
        <span className="event-time">{formatTimestamp(evt.timestamp)}</span>
        <span className={`event-icon ${cssClass}`}>
          {icon}
        </span>
        {evt.turn && <span className="event-turn">T{evt.turn}</span>}
        <span className="event-content">{content}</span>
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
