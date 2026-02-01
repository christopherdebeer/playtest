import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { marked } from 'marked'
import { LogsData, TranscriptSummary, TranscriptEvent } from '../types/logs'
import LogViewer from '../components/LogViewer'
import logsDataRaw from '../data/logs.json'
import './LogDetailPage.css'

// Helper component for expandable text content
function ExpandableText({ text, maxLength = 500, className = '' }: { text: string; maxLength?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = text.length > maxLength

  if (!needsTruncation) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {expanded ? text : text.substring(0, maxLength)}
      <button
        className="expand-text-btn"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(!expanded)
        }}
      >
        {expanded ? ' [show less]' : '... [show more]'}
      </button>
    </span>
  )
}

// Helper to format tool input as readable text
function formatToolInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

// Helper to parse tool result content (may be JSON string or array)
function parseToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    // Try to parse as JSON for pretty printing
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return content
    }
  }
  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'object' && item !== null && 'text' in item) {
        return (item as { text: string }).text
      }
      return JSON.stringify(item)
    }).join('\n')
  }
  return JSON.stringify(content, null, 2)
}

const logsData = logsDataRaw as unknown as LogsData

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: true,
})

// Format agent type for display
function formatAgentType(agentType: string): string {
  if (agentType === 'gamemaster') return 'Gamemaster'
  if (agentType.startsWith('player')) {
    const num = agentType.replace('player', '')
    return `Player ${num}`
  }
  return agentType
}

// Get color for agent type
function getAgentColor(agentType: string): string {
  if (agentType === 'gamemaster') return '#a855f7' // purple
  if (agentType === 'player1') return '#3b82f6' // blue
  if (agentType === 'player2') return '#ef4444' // red
  if (agentType.startsWith('player')) return '#22c55e' // green for others
  return '#6b7280' // gray
}

// Extended block type to include tool_result fields
interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  text?: string
  thinking?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
}

// Component for displaying a single content block with expand/collapse
function ContentBlockDisplay({ block, index }: { block: ContentBlock; index: number }) {
  const [expanded, setExpanded] = useState(false)

  if (block.type === 'text' && block.text) {
    return (
      <div key={index} className="block-text">
        <ExpandableText text={block.text} maxLength={500} />
      </div>
    )
  }

  if (block.type === 'thinking' && block.thinking) {
    return (
      <div key={index} className="block-thinking">
        <em>Thinking: <ExpandableText text={block.thinking} maxLength={300} /></em>
      </div>
    )
  }

  if (block.type === 'tool_use' && block.name) {
    const hasInput = block.input && Object.keys(block.input).length > 0
    return (
      <div key={index} className="block-tool-use">
        <div className="tool-use-header">
          <span>Tool: <code>{block.name}</code></span>
          {hasInput && (
            <button
              className="tool-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide input' : 'Show input'}
            </button>
          )}
        </div>
        {expanded && hasInput && (
          <pre className="tool-input">
            <code>{formatToolInput(block.input!)}</code>
          </pre>
        )}
      </div>
    )
  }

  if (block.type === 'tool_result') {
    const resultContent = block.content ? parseToolResultContent(block.content) : '(empty result)'
    const isLong = resultContent.length > 200
    return (
      <div key={index} className="block-tool-result">
        <div className="tool-result-header">
          <span className="tool-result-label">Tool Result</span>
          {isLong && (
            <button
              className="tool-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
        <pre className={`tool-result-content ${expanded || !isLong ? 'expanded' : 'collapsed'}`}>
          <code>{expanded || !isLong ? resultContent : resultContent.substring(0, 200) + '...'}</code>
        </pre>
      </div>
    )
  }

  return null
}

// Format transcript event content for display
function formatTranscriptContent(event: TranscriptEvent): React.ReactNode {
  if (!event.message?.content) {
    if (event.type === 'progress') return <span className="event-progress">...</span>
    return <span className="event-empty">(no content)</span>
  }

  const content = event.message.content
  if (typeof content === 'string') {
    return <span className="event-text"><ExpandableText text={content} maxLength={500} /></span>
  }

  // Array content (tool use, thinking, tool results, etc.)
  return (
    <div className="event-blocks">
      {content.map((block, i) => (
        <ContentBlockDisplay key={i} block={block as ContentBlock} index={i} />
      ))}
    </div>
  )
}

// Transcript viewer component
function TranscriptViewer({ transcript }: { transcript: TranscriptSummary }) {
  const [expanded, setExpanded] = useState(false)
  const color = getAgentColor(transcript.agentType)

  // Filter to only show meaningful events
  const meaningfulEvents = transcript.events.filter(e =>
    e.type === 'user' || e.type === 'assistant'
  )

  const displayEvents = expanded ? meaningfulEvents : meaningfulEvents.slice(0, 10)

  return (
    <div className="transcript-viewer" style={{ '--agent-color': color } as React.CSSProperties}>
      <div className="transcript-header">
        <div className="transcript-title">
          <span className="agent-badge" style={{ backgroundColor: color }}>
            {formatAgentType(transcript.agentType)}
          </span>
          {transcript.agentId && <code className="agent-id">{transcript.agentId}</code>}
        </div>
        <div className="transcript-stats">
          <span>{transcript.messageCount} messages</span>
          <span>{transcript.toolUseCount} tool uses</span>
          <span>{(transcript.fileSize / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      <div className="transcript-events">
        {displayEvents.map((event, idx) => (
          <div key={idx} className={`transcript-event ${event.type}`}>
            <span className="event-role">{event.message?.role || event.type}</span>
            <span className="event-content">{formatTranscriptContent(event)}</span>
          </div>
        ))}
      </div>

      {meaningfulEvents.length > 10 && (
        <button
          className="transcript-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show all ${meaningfulEvents.length} messages`}
        </button>
      )}
    </div>
  )
}

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
  const hasTranscripts = log?.transcripts && log.transcripts.length > 0
  const [activeTab, setActiveTab] = useState<'analysis' | 'events' | 'transcripts'>(
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
              <span className="meta-label">Rounds</span>
              <span className="meta-value">{log.totalRounds}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Actions</span>
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

        {/* Tab navigation for Analysis, Event Log, and Transcripts */}
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
            {hasTranscripts && (
              <button
                className={`tab-button ${activeTab === 'transcripts' ? 'active' : ''}`}
                onClick={() => setActiveTab('transcripts')}
              >
                Transcripts ({log.transcripts!.length})
              </button>
            )}
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

            {activeTab === 'transcripts' && hasTranscripts && (
              <div className="log-detail-transcripts">
                <p className="transcripts-intro">
                  Agent transcripts show the full conversation history for each agent during the game,
                  including their reasoning, tool usage, and decisions.
                </p>
                {log.transcripts!.map((transcript, idx) => (
                  <TranscriptViewer key={idx} transcript={transcript} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LogDetailPage
