/**
 * Shared Log Event Types
 *
 * Source of truth for log event structures used by:
 * - engine/src/types.ts (LogEvent)
 * - site/src/types/logs.ts (TypedLogEvent)
 *
 * When adding new events:
 * 1. Add type here
 * 2. Add to LogEventType union
 * 3. Update engine logEvent() calls
 * 4. Update site TypedLogEvent union
 */

// All possible log event types
export const LOG_EVENT_TYPES = [
  // Game lifecycle
  'game_init',
  'game_start',
  'game_end',
  'game_cancelled',

  // Actions
  'action_executed',

  // Probability/movement (when probability_movement enabled)
  'probability_roll',
  'state_transition',
  'move_failed',

  // Victory declaration (when victory_declaration enabled)
  'victory_claimed',
  'victory_adjudicated',
  'victory_rejected',

  // Contest system
  'contest_filed',
  'contest_adjudicated',

  // Resignations
  'resignation_submitted',
  'resignation_adjudicated',
] as const;

export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

// Event data schemas by type
export interface LogEventDataSchemas {
  game_init: {
    gameId: string;
    playerCount: number;
    config: string;
  };

  game_start: {
    players: string[];
    firstPlayer: string;
  };

  game_end: {
    winner: string;
    reason: string;
    resignedPlayer?: string;
    claimedState?: string;
  };

  game_cancelled: {
    reason: string;
  };

  action_executed: {
    type: 'play_card' | 'draw' | 'pass' | 'move';
    card?: string;
    effect?: Record<string, unknown>;
    declaredColor?: string;
    count?: number;
    target?: string;
    success?: boolean;
    reasoning?: string;
  };

  probability_roll: {
    fromState: string;
    toState: string;
    baseProbability: number;
    boost: { card: string; value: number } | null;
    effectiveProbability: number;
    roll: number;
    success: boolean;
  };

  state_transition: {
    fromState: string;
    toState: string;
  };

  move_failed: {
    fromState: string;
    toState: string;
    probability: number;
    reasoning?: string;
  };

  victory_claimed: {
    reason: string;
    state: string;
  };

  victory_adjudicated: {
    player: string;
    accepted: boolean;
    rulingReason: string;
  };

  victory_rejected: {
    reason: string;
    rolledBackFrom: string;
    rolledBackTo: string;
  };

  contest_filed: {
    reason: string;
    contestedAction: Record<string, unknown>;
    contestedPlayer: string;
  };

  contest_adjudicated: {
    ruling: 'allowed' | 'rejected';
    rulingReason: string;
    reversed: boolean;
    contestedPlayer: string;
    contestedBy: string;
  };

  resignation_submitted: {
    reason: string;
  };

  resignation_adjudicated: {
    player: string;
    accepted: boolean;
    rulingReason?: string;
  };
}

// Helper type for type-safe event creation
export type TypedLogEvent<T extends LogEventType> = {
  timestamp: string;
  event: T;
  turn?: number;
  player?: string;
  data: LogEventDataSchemas[T];
};
