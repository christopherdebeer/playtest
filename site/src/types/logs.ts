/**
 * Log event types for the site log viewer.
 *
 * SOURCE OF TRUTH: /shared/types/log-events.ts
 *
 * Keep these in sync with:
 * - shared/types/log-events.ts (canonical definitions)
 * - engine/src/types.ts (LogEvent interface)
 *
 * TODO: Set up npm workspaces to import shared types directly
 */

// Base log event structure
export interface BaseLogEvent {
  timestamp: string
  turn?: number
  player?: string
}

// Game lifecycle events
export interface GameInitEvent extends BaseLogEvent {
  event: 'game_init'
  data: {
    gameId: string
    playerCount: number
    config: string
  }
}

export interface GameStartEvent extends BaseLogEvent {
  event: 'game_start'
  data: {
    players: string[]
    firstPlayer: string
  }
}

export interface GameEndEvent extends BaseLogEvent {
  event: 'game_end'
  data: {
    winner: string
    reason: string
    resignedPlayer?: string
    claimedState?: string
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
    type: 'play_card' | 'draw' | 'pass' | 'move'
    card?: string
    effect?: Record<string, unknown>
    declaredColor?: string
    count?: number
    target?: string
    success?: boolean
    reasoning?: string
  }
}

// Probability/movement events (when probability_movement mechanic enabled)
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

// Victory declaration events (when victory_declaration mechanic enabled)
export interface VictoryClaimedEvent extends BaseLogEvent {
  event: 'victory_claimed'
  player: string
  data: {
    reason: string
    state: string
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

// Union type for all log events
export type TypedLogEvent =
  | GameInitEvent
  | GameStartEvent
  | GameEndEvent
  | GameCancelledEvent
  | ActionExecutedEvent
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

// Generic log event for backwards compatibility
export interface LogEvent {
  timestamp: string
  event: string
  turn?: number
  player?: string
  data?: Record<string, unknown>
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
