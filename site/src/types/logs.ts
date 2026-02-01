/**
 * Log event types for the site log viewer.
 *
 * Core types are imported from @playtest/shared.
 * Site-specific types (transcripts, summaries) are defined here.
 */

// Import shared types
export type {
  PlayerStateSnapshot,
  GameStateSnapshot,
  LogEventType,
  LogEventDataSchemas,
  AnyLogEvent,
} from '@playtest/shared';

export {
  LOG_EVENT_TYPES,
  isEventType,
  validateActionEvent,
} from '@playtest/shared';

// Re-export TypedLogEvent with a different name to avoid confusion
// The shared version is generic, we create specific event interfaces below
import type {
  PlayerStateSnapshot,
  GameStateSnapshot,
} from '@playtest/shared';

// Base log event structure
export interface BaseLogEvent {
  timestamp: string
  round?: number
  turnNumber?: number
  player?: string
}

// Game lifecycle events
export interface GameInitEvent extends BaseLogEvent {
  event: 'game_init'
  data: {
    gameId: string
    playerCount: number
    config: string
    mechanics?: string[]
  }
}

export interface GameStartEvent extends BaseLogEvent {
  event: 'game_start'
  data: {
    players: string[]
    firstPlayer: string
    initialState?: GameStateSnapshot
  }
}

export interface GameEndEvent extends BaseLogEvent {
  event: 'game_end'
  data: {
    winner: string | null
    reason: string
    resignedPlayer?: string
    claimedState?: string
    finalState?: GameStateSnapshot
    endType?: 'victory' | 'resignation' | 'timeout' | 'cancelled'
  }
}

export interface GameCancelledEvent extends BaseLogEvent {
  event: 'game_cancelled'
  data: {
    reason: string
  }
}

// Action events
export interface ActionExecutedEvent extends BaseLogEvent {
  event: 'action_executed'
  player: string
  data: {
    type: 'play_card' | 'draw' | 'pass' | 'move' | 'place_card' | 'trade' | 'resign' | 'draft'
    card?: string
    effect?: Record<string, unknown>
    declaredColor?: string
    count?: number
    target?: string
    success?: boolean
    reasoning?: string
    stateBefore?: PlayerStateSnapshot
    stateAfter?: PlayerStateSnapshot
  }
}

// Probability/movement events
export interface ProbabilityRollEvent extends BaseLogEvent {
  event: 'probability_roll'
  player: string
  data: {
    fromState: string
    toState: string
    baseProbability: number
    boost: { card: string; value: number } | null
    effectiveProbability: number
    roll: number
    success: boolean
  }
}

export interface StateTransitionEvent extends BaseLogEvent {
  event: 'state_transition'
  player: string
  data: {
    fromState: string
    toState: string
  }
}

export interface MoveFailedEvent extends BaseLogEvent {
  event: 'move_failed'
  player: string
  data: {
    fromState: string
    toState: string
    probability: number
    reasoning?: string
  }
}

// Victory declaration events
export interface VictoryClaimedEvent extends BaseLogEvent {
  event: 'victory_claimed'
  player: string
  data: {
    reason: string
    state: string
    evidence?: Record<string, unknown>
  }
}

export interface VictoryAdjudicatedEvent extends BaseLogEvent {
  event: 'victory_adjudicated'
  data: {
    player: string
    accepted: boolean
    rulingReason: string
  }
}

export interface VictoryRejectedEvent extends BaseLogEvent {
  event: 'victory_rejected'
  player: string
  data: {
    reason: string
    rolledBackFrom: string
    rolledBackTo: string
  }
}

// Contest events
export interface ContestFiledEvent extends BaseLogEvent {
  event: 'contest_filed'
  player: string
  data: {
    reason: string
    contestedAction: Record<string, unknown>
    contestedPlayer: string
  }
}

export interface ContestAdjudicatedEvent extends BaseLogEvent {
  event: 'contest_adjudicated'
  data: {
    ruling: 'allowed' | 'rejected'
    rulingReason: string
    reversed: boolean
    contestedPlayer: string
    contestedBy: string
  }
}

// Resignation events
export interface ResignationSubmittedEvent extends BaseLogEvent {
  event: 'resignation_submitted'
  player: string
  data: {
    reason: string
  }
}

export interface ResignationAdjudicatedEvent extends BaseLogEvent {
  event: 'resignation_adjudicated'
  data: {
    player: string
    accepted: boolean
    rulingReason?: string
  }
}

// State snapshot event
export interface StateSnapshotEvent extends BaseLogEvent {
  event: 'state_snapshot'
  data: {
    reason: 'turn_start' | 'turn_end' | 'checkpoint' | 'debug'
    state: GameStateSnapshot
  }
}

// Hand limit enforcement
export interface HandLimitExceededEvent extends BaseLogEvent {
  event: 'hand_limit_exceeded'
  player: string
  data: {
    handSize: number
    limit: number
    excess: number
    policy: string
    message: string
  }
}

// Placed card triggered event
export interface PlacedCardTriggeredEvent extends BaseLogEvent {
  event: 'placed_card_triggered'
  player: string
  data: {
    targetState: string
    effects: string[]
    probabilityModifier: number
  }
}

// Analysis submitted event
export interface AnalysisSubmittedEvent extends BaseLogEvent {
  event: 'analysis_submitted'
  data: {
    file: string
    version: string
  }
}

// Union type for all log events
export type TypedLogEvent =
  | GameInitEvent
  | GameStartEvent
  | GameEndEvent
  | GameCancelledEvent
  | ActionExecutedEvent
  | StateSnapshotEvent
  | ProbabilityRollEvent
  | StateTransitionEvent
  | MoveFailedEvent
  | VictoryClaimedEvent
  | VictoryAdjudicatedEvent
  | VictoryRejectedEvent
  | ContestFiledEvent
  | ContestAdjudicatedEvent
  | ResignationSubmittedEvent
  | ResignationAdjudicatedEvent
  | HandLimitExceededEvent
  | PlacedCardTriggeredEvent
  | AnalysisSubmittedEvent

// Generic log event for backwards compatibility
export interface LogEvent {
  timestamp: string
  event: string
  round?: number
  turnNumber?: number
  player?: string
  data?: Record<string, unknown>
}

// ============ SITE-SPECIFIC TYPES ============
// These are only used by the site, not shared with engine

// Transcript event from agent session
export interface TranscriptEvent {
  parentUuid?: string
  type: 'user' | 'assistant' | 'progress' | 'tool_result'
  timestamp: string
  message?: {
    role: 'user' | 'assistant'
    content: string | Array<{
      type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
      text?: string
      thinking?: string
      name?: string
      input?: Record<string, unknown>
    }>
  }
  agentId?: string
  sessionId?: string
}

// Summary of an agent transcript
export interface TranscriptSummary {
  filename: string
  fileSize: number
  agentType: 'gamemaster' | 'player1' | 'player2' | string
  agentId: string | null
  messageCount: number
  toolUseCount: number
  thinkingCount: number
  eventCount: number
  events: TranscriptEvent[]
}

export interface GameLogSummary {
  gameId: string
  gameName: string
  playerCount: number
  players: string[]
  startTime: string
  endTime: string
  duration: number | null
  totalTurns: number
  totalEvents: number
  eventCounts: Record<string, number>
  outcome: 'completed' | 'ended' | 'cancelled' | 'in_progress' | 'unknown'
  winner: string | null
  endReason: string | null
  fileSize: number
  events: LogEvent[]
  analysis?: {
    version: string
    filename: string
    content: string
  }
  transcripts?: TranscriptSummary[]
}

export interface GameStats {
  totalLogs: number
  completedGames: number
  cancelledGames: number
  totalTurns: number
}

export interface LogsData {
  generatedAt: string
  games: Record<string, GameStats>
  logs: GameLogSummary[]
}
