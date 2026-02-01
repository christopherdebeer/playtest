/**
 * Typed event renderers for the LogViewer.
 *
 * This module provides exhaustive handling of all log event types.
 * TypeScript will fail at compile time if a new event type is added
 * to TypedLogEvent but not handled here.
 *
 * SOURCE OF TRUTH: /shared/types/log-events.ts
 */

import type {
  TypedLogEvent,
  GameInitEvent,
  GameStartEvent,
  GameEndEvent,
  GameCancelledEvent,
  ActionExecutedEvent,
  StateSnapshotEvent,
  ProbabilityRollEvent,
  StateTransitionEvent,
  MoveFailedEvent,
  VictoryClaimedEvent,
  VictoryAdjudicatedEvent,
  VictoryRejectedEvent,
  ContestFiledEvent,
  ContestAdjudicatedEvent,
  ResignationSubmittedEvent,
  ResignationAdjudicatedEvent,
  HandLimitExceededEvent,
} from '../types/logs'

// ============ EVENT ICONS ============
// Single character icons for compact display

type EventType = TypedLogEvent['event']

const EVENT_ICONS: Record<EventType, string> = {
  game_init: 'I',
  game_start: 'S',
  game_end: 'E',
  game_cancelled: 'X',
  action_executed: 'A',
  state_snapshot: '~',
  probability_roll: 'R',
  state_transition: 'T',
  move_failed: 'F',
  victory_claimed: 'V',
  victory_adjudicated: 'J',
  victory_rejected: 'N',
  contest_filed: 'C',
  contest_adjudicated: 'J',
  resignation_submitted: 'Q',
  resignation_adjudicated: 'J',
  hand_limit_exceeded: 'H',
}

export function getEventIcon(event: EventType): string {
  return EVENT_ICONS[event]
}

// ============ EVENT CSS CLASSES ============

const EVENT_CLASSES: Record<EventType, string> = {
  game_init: 'event-system',
  game_start: 'event-system',
  game_end: 'event-end',
  game_cancelled: 'event-cancelled',
  action_executed: 'event-action',
  state_snapshot: 'event-state',
  probability_roll: 'event-roll',
  state_transition: 'event-transition',
  move_failed: 'event-failed',
  victory_claimed: 'event-victory',
  victory_adjudicated: 'event-adjudication',
  victory_rejected: 'event-rejected',
  contest_filed: 'event-contest',
  contest_adjudicated: 'event-adjudication',
  resignation_submitted: 'event-resignation',
  resignation_adjudicated: 'event-adjudication',
  hand_limit_exceeded: 'event-limit',
}

export function getEventClass(event: EventType): string {
  return EVENT_CLASSES[event]
}

// ============ EVENT RENDERERS ============
// Each event type has a dedicated renderer function

function renderGameInit(evt: GameInitEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Game initialized with <strong>{data.playerCount}</strong> players
      {data.mechanics && data.mechanics.length > 0 && (
        <span className="event-mechanics"> ({data.mechanics.join(', ')})</span>
      )}
    </span>
  )
}

function renderGameStart(evt: GameStartEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Game started. Players: {data.players.join(', ')}. First: <strong>{data.firstPlayer}</strong>
    </span>
  )
}

function renderGameEnd(evt: GameEndEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Game ended. Winner: <strong>{data.winner ?? 'none'}</strong>
      {data.reason && <span className="event-reason"> - {data.reason}</span>}
      {data.endType && <span className="event-type"> ({data.endType})</span>}
    </span>
  )
}

function renderGameCancelled(evt: GameCancelledEvent): React.ReactNode {
  return (
    <span>
      Game cancelled
      {evt.data.reason && <span className="event-reason"> - {evt.data.reason}</span>}
    </span>
  )
}

function renderActionExecuted(evt: ActionExecutedEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> {data.type}
      {data.card && <> - <code>{data.card}</code></>}
      {data.count && data.count > 1 && <> x{data.count}</>}
      {data.target && <> to {data.target}</>}
      {data.declaredColor && <> (color: {data.declaredColor})</>}
      {data.success === false && <span className="event-failed"> FAILED</span>}
      {data.reasoning && (
        <div className="event-reasoning">"{data.reasoning}"</div>
      )}
    </span>
  )
}

function renderStateSnapshot(evt: StateSnapshotEvent): React.ReactNode {
  const { data } = evt
  const playerCount = Object.keys(data.state.players).length
  return (
    <span>
      State snapshot ({data.reason}): Round {data.state.round}, {playerCount} players,
      deck: {data.state.deckSize}, discard: {data.state.discardSize}
    </span>
  )
}

function renderProbabilityRoll(evt: ProbabilityRollEvent): React.ReactNode {
  const { player, data } = evt
  const pct = Math.round(data.effectiveProbability * 100)
  return (
    <span>
      <strong>{player}</strong> rolled {data.roll.toFixed(2)} vs {pct}%
      {data.boost && <> (boosted by {data.boost.card})</>}
      {' '}<span className={data.success ? 'event-success' : 'event-failed'}>
        {data.success ? 'SUCCESS' : 'FAILED'}
      </span>
    </span>
  )
}

function renderStateTransition(evt: StateTransitionEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> moved: {data.fromState} → {data.toState}
    </span>
  )
}

function renderMoveFailed(evt: MoveFailedEvent): React.ReactNode {
  const { player, data } = evt
  const pct = Math.round(data.probability * 100)
  return (
    <span>
      <strong>{player}</strong> failed move: {data.fromState} → {data.toState} ({pct}%)
      {data.reasoning && <div className="event-reasoning">"{data.reasoning}"</div>}
    </span>
  )
}

function renderVictoryClaimed(evt: VictoryClaimedEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> claims victory: {data.reason}
      {data.state && <span className="event-state"> (at {data.state})</span>}
    </span>
  )
}

function renderVictoryAdjudicated(evt: VictoryAdjudicatedEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Victory claim by <strong>{data.player}</strong>:{' '}
      <span className={data.accepted ? 'event-success' : 'event-failed'}>
        {data.accepted ? 'ACCEPTED' : 'REJECTED'}
      </span>
      {data.rulingReason && <span className="event-reason"> - {data.rulingReason}</span>}
    </span>
  )
}

function renderVictoryRejected(evt: VictoryRejectedEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> victory rejected: {data.reason}
      <span className="event-rollback"> (rolled back: {data.rolledBackFrom} → {data.rolledBackTo})</span>
    </span>
  )
}

function renderContestFiled(evt: ContestFiledEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> contests <strong>{data.contestedPlayer}</strong>: {data.reason}
    </span>
  )
}

function renderContestAdjudicated(evt: ContestAdjudicatedEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Contest by <strong>{data.contestedBy}</strong> vs <strong>{data.contestedPlayer}</strong>:{' '}
      <span className={data.ruling === 'allowed' ? 'event-success' : 'event-failed'}>
        {data.ruling.toUpperCase()}
      </span>
      {data.reversed && <span className="event-reversed"> (action reversed)</span>}
      {data.rulingReason && <span className="event-reason"> - {data.rulingReason}</span>}
    </span>
  )
}

function renderResignationSubmitted(evt: ResignationSubmittedEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> resigns: {data.reason}
    </span>
  )
}

function renderResignationAdjudicated(evt: ResignationAdjudicatedEvent): React.ReactNode {
  const { data } = evt
  return (
    <span>
      Resignation by <strong>{data.player}</strong>:{' '}
      <span className={data.accepted ? 'event-success' : 'event-failed'}>
        {data.accepted ? 'ACCEPTED' : 'REJECTED'}
      </span>
      {data.rulingReason && <span className="event-reason"> - {data.rulingReason}</span>}
    </span>
  )
}

function renderHandLimitExceeded(evt: HandLimitExceededEvent): React.ReactNode {
  const { player, data } = evt
  return (
    <span>
      <strong>{player}</strong> exceeded hand limit: {data.handSize}/{data.limit}
      <span className="event-policy"> (policy: {data.policy})</span>
      {data.message && <span className="event-message"> - {data.message}</span>}
    </span>
  )
}

// ============ EXHAUSTIVE RENDERER ============
// TypeScript will error if a new event type is added but not handled

export function renderEventContent(evt: TypedLogEvent): React.ReactNode {
  switch (evt.event) {
    case 'game_init':
      return renderGameInit(evt)
    case 'game_start':
      return renderGameStart(evt)
    case 'game_end':
      return renderGameEnd(evt)
    case 'game_cancelled':
      return renderGameCancelled(evt)
    case 'action_executed':
      return renderActionExecuted(evt)
    case 'state_snapshot':
      return renderStateSnapshot(evt)
    case 'probability_roll':
      return renderProbabilityRoll(evt)
    case 'state_transition':
      return renderStateTransition(evt)
    case 'move_failed':
      return renderMoveFailed(evt)
    case 'victory_claimed':
      return renderVictoryClaimed(evt)
    case 'victory_adjudicated':
      return renderVictoryAdjudicated(evt)
    case 'victory_rejected':
      return renderVictoryRejected(evt)
    case 'contest_filed':
      return renderContestFiled(evt)
    case 'contest_adjudicated':
      return renderContestAdjudicated(evt)
    case 'resignation_submitted':
      return renderResignationSubmitted(evt)
    case 'resignation_adjudicated':
      return renderResignationAdjudicated(evt)
    case 'hand_limit_exceeded':
      return renderHandLimitExceeded(evt)
    default:
      // Exhaustiveness check - TypeScript will error if we miss a case
      return assertNever(evt)
  }
}

// Helper for exhaustiveness checking
function assertNever(x: never): React.ReactNode {
  // This function is called if TypeScript thinks x could still have a value
  // In runtime, render unknown events gracefully
  const unknownEvent = x as { event: string; data?: Record<string, unknown> }
  return (
    <span className="event-unknown">
      Unknown event: {unknownEvent.event}
      {unknownEvent.data && <code>{JSON.stringify(unknownEvent.data)}</code>}
    </span>
  )
}

// ============ TYPE GUARD ============
// Check if a loose LogEvent matches a TypedLogEvent

const KNOWN_EVENT_TYPES: Set<string> = new Set([
  'game_init',
  'game_start',
  'game_end',
  'game_cancelled',
  'action_executed',
  'state_snapshot',
  'probability_roll',
  'state_transition',
  'move_failed',
  'victory_claimed',
  'victory_adjudicated',
  'victory_rejected',
  'contest_filed',
  'contest_adjudicated',
  'resignation_submitted',
  'resignation_adjudicated',
  'hand_limit_exceeded',
])

export function isTypedLogEvent(evt: { event: string }): evt is TypedLogEvent {
  return KNOWN_EVENT_TYPES.has(evt.event)
}
