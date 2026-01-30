// Core game types

export type GameStatus = 'initializing' | 'waiting_for_players' | 'in_progress' | 'completed' | 'cancelled';
export type Role = 'gamemaster' | 'player';

export interface Card {
  name: string;
  type: string;
  effect: {
    type: string;
    value?: number;
    duration?: number;
    target?: string;
    color?: string;  // For card games like UNO
  };
}

export interface PlayerState {
  agentId?: string;
  state: string;  // position/status in game
  hand: Card[];
  effects: Effect[];
  score?: number;
}

export interface Effect {
  type: string;
  value?: number;
  duration: number;  // turns remaining
  source?: string;   // who applied it
}

// Engine mechanics that can be enabled per-game
export interface EngineMechanics {
  probability_movement?: boolean;  // Moves use edge probabilities (default: true if board.edges have probability)
  card_boosts?: boolean;           // Cards can modify move probability (default: true if deck exists)
  victory_declaration?: boolean;   // Players must declare victory for GM adjudication (default: false)
}

export interface GameConfig {
  name: string;
  version: string;
  players: number | { min: number; max: number };
  win_condition: string;
  max_turns: number;
  starting_cards?: number;
  deck?: DeckConfig[];
  board?: BoardConfig;
  mechanics?: string[];  // References to mechanic slugs (e.g., ['hand-management', 'set-collection'])
  engine_mechanics?: EngineMechanics;  // Enable/disable engine capabilities
  [key: string]: unknown;  // game-specific config
}

// Mechanic definition from mechanics/ folder
export interface MechanicDef {
  id: string;
  name: string;
  slug: string;
  category: string;
  path: string;
}

export interface MechanicsIndex {
  generated: string;
  source: string;
  count: number;
  categories: string[];
  mechanics: MechanicDef[];
}

export interface DeckConfig {
  name: string;
  count: number;
  type?: string;
  effect?: {
    type: string;
    value?: number;
    duration?: number;
    color?: string;  // For card games like UNO
  };
}

export interface BoardConfig {
  states: string[];
  start?: string;
  edges: EdgeConfig[];
}

export interface EdgeConfig {
  from: string | string[];
  to: string | string[];
  probability?: number;
  cost?: number;
}

export interface PendingAction {
  player: string;
  turn: number;
  action: Record<string, unknown>;
  submittedAt: string;
}

export interface GameState {
  gameId: string;
  gameName: string;
  status: GameStatus;
  turn: number;
  currentPlayer: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  shared: Record<string, unknown>;  // game-specific shared state
  deck: Card[];
  discardPile: Card[];
  config: GameConfig;
  rulesMarkdown: string;
  log: string;  // path to log file
}

export interface WaitResult {
  status: 'your_turn' | 'game_over' | 'game_cancelled' | 'timeout' | 'error' | 'game_not_found';
  gameState?: PlayerView;
  winner?: string;
  reason?: string;
  error?: string;
}

export interface PlayerView {
  gameId: string;
  turn: number;
  currentPlayer: string;
  myState: {
    state: string;
    hand: Card[];
    effects: Effect[];
  };
  opponents: OpponentView[];
  shared: Record<string, unknown>;
}

export interface OpponentView {
  playerId: string;
  state: string;
  handSize: number;
  effects: Effect[];
}

export interface ActionResult {
  accepted: boolean;
  result?: {
    type: string;
    success?: boolean;
    details?: Record<string, unknown>;
  };
  error?: string;
  nextPlayer?: string;
}

export interface RollResult {
  roll: number;
  threshold: number;
  success: boolean;
  context: string;
}

/**
 * Log event structure for game event logging.
 *
 * SOURCE OF TRUTH: /shared/types/log-events.ts
 *
 * Keep in sync with:
 * - shared/types/log-events.ts (canonical event definitions)
 * - site/src/types/logs.ts (TypedLogEvent union)
 *
 * Event types include:
 * - game_init, game_start, game_end, game_cancelled
 * - action_executed
 * - probability_roll, state_transition, move_failed (probability_movement)
 * - victory_claimed, victory_adjudicated, victory_rejected (victory_declaration)
 * - contest_filed, contest_adjudicated
 * - resignation_submitted, resignation_adjudicated
 */
export interface LogEvent {
  timestamp: string;
  event: string;
  turn?: number;
  player?: string;
  data?: Record<string, unknown>;
}

// ============ Contest-Based Adjudication Types ============

// Action schemas for validation
export type ActionType = 'play_card' | 'draw' | 'pass' | 'move' | 'resign';

export interface BaseAction {
  type: ActionType;
  reasoning?: string;
}

export interface PlayCardAction extends BaseAction {
  type: 'play_card';
  card: string;
  declaredColor?: string;  // For wild cards
}

export interface DrawAction extends BaseAction {
  type: 'draw';
  count?: number;  // defaults to 1
}

export interface PassAction extends BaseAction {
  type: 'pass';
}

export interface MoveAction extends BaseAction {
  type: 'move';
  target: string;
  boost?: string;           // Card name to use for probability boost
  declareVictory?: boolean; // Player believes this move wins
  victoryReason?: string;   // Why they believe they won
}

export interface ResignAction extends BaseAction {
  type: 'resign';
  reason: string;  // Required: why player is resigning
}

export type GameAction = PlayCardAction | DrawAction | PassAction | MoveAction | ResignAction;

// Action validation result
export interface ActionValidationResult {
  valid: boolean;
  errors: string[];  // Actionable error messages for player
  warnings?: string[];  // Non-blocking issues
}

// Last action tracking (for contests)
export interface LastAction {
  player: string;
  action: GameAction;
  timestamp: string;
  turn: number;
  result?: {
    success: boolean;
    details?: Record<string, unknown>;
  };
}

// Pending contest state
export interface PendingContest {
  contestedBy: string;
  reason: string;
  originalAction: LastAction;
  timestamp: string;
}

// Pending resignation (awaiting gamemaster adjudication)
export interface PendingResignation {
  player: string;
  reason: string;
  timestamp: string;
}

// Pending victory claim (awaiting gamemaster adjudication)
export interface PendingVictoryClaim {
  player: string;
  reason: string;           // Why they believe they won
  fromState: string;        // State before the move
  toState: string;          // Claimed victory state
  action: GameAction;       // The action that led to claim
  timestamp: string;
}

// Victory claim history entry
export interface VictoryClaimEntry {
  player: string;
  reason: string;
  ruling: 'accepted' | 'rejected';
  rulingReason: string;
  timestamp: string;
}

// Contest history entry
export interface ContestHistoryEntry {
  turn: number;
  action: GameAction;
  player: string;
  contestedBy: string;
  contestReason: string;
  ruling: 'allowed' | 'rejected';
  rulingReason: string;
  timestamp: string;
}

// Resignation history entry
export interface ResignationEntry {
  player: string;
  reason: string;
  accepted: boolean;
  rulingReason?: string;
  timestamp: string;
}

// Extended game state with contest system
export interface ContestState {
  lastAction?: LastAction;
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;
  contestHistory: ContestHistoryEntry[];
  resignations: ResignationEntry[];
  victoryHistory: VictoryClaimEntry[];
}

// Act command result
export interface ActResult {
  success: boolean;
  action?: GameAction;
  validation?: ActionValidationResult;
  effect?: {
    type: string;
    details?: Record<string, unknown>;
  };
  handSize?: number;
  nextPlayer?: string;
  error?: string;
}

// Contest result
export interface ContestResult {
  success: boolean;
  contestId?: string;
  message?: string;
  error?: string;
}

// Adjudication result
export interface AdjudicationResult {
  success: boolean;
  ruling?: 'allowed' | 'rejected';
  reason?: string;
  reversedAction?: boolean;
  error?: string;
}

// Wait result extended with contest info
export interface ExtendedWaitResult {
  status: 'your_turn' | 'game_over' | 'game_cancelled' | 'timeout' | 'error' | 'game_not_found' | 'contest_pending' | 'resignation_pending' | 'victory_pending';
  gameState?: PlayerView;
  winner?: string;
  reason?: string;
  error?: string;
  lastAction?: LastAction;  // Previous player's action (for potential contest)
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;
}
