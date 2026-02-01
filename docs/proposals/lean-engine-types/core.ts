/**
 * Core Engine Types
 *
 * These are the foundational primitives that all mechanics build upon.
 * The core is intentionally minimal - complexity lives in mechanics.
 */

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
};

export interface ValidationError {
  path?: string;
  code?: string;
  message: string;
  suggestion?: string;
}

export interface ParseError {
  path: string;
  expected: string;
  received: unknown;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

export type GameStatus =
  | 'initializing'      // Game created, waiting for config
  | 'waiting_for_players'  // Config valid, players registering
  | 'in_progress'       // Active gameplay
  | 'pending_analysis'  // Game ended, awaiting GM analysis
  | 'completed'         // Fully complete with analysis
  | 'cancelled';        // Aborted

// ═══════════════════════════════════════════════════════════════════════════
// CORE GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal core state - mechanics extend this via composition.
 */
export interface CoreGameState {
  // ─────────────────────────────────────────────────────────────
  // Identity (immutable after creation)
  // ─────────────────────────────────────────────────────────────
  readonly gameId: string;        // Unique identifier
  readonly gameName: string;      // Game type (e.g., "markovs-chains")
  readonly instanceId: string;    // Instance identifier

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────
  status: GameStatus;
  winner?: string | null;         // null = draw
  endReason?: string;

  // ─────────────────────────────────────────────────────────────
  // Turn Tracking (simple default, mechanics can override)
  // ─────────────────────────────────────────────────────────────
  round: number;                  // 1-indexed
  turnNumber: number;             // Global turn counter
  currentPlayer: string | null;   // null during setup or simultaneous
  turnOrder: string[];            // Player IDs in turn order

  // ─────────────────────────────────────────────────────────────
  // Players
  // ─────────────────────────────────────────────────────────────
  players: Record<string, CorePlayerState>;

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────
  config: GameConfig;

  // ─────────────────────────────────────────────────────────────
  // Mechanic State (each mechanic stores its state here)
  // ─────────────────────────────────────────────────────────────
  mechanicState: MechanicStateMap;

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────
  logPath: string;

  // ─────────────────────────────────────────────────────────────
  // Adjudication (contests, resignations, victory claims)
  // ─────────────────────────────────────────────────────────────
  adjudication: AdjudicationState;

  // ─────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────
  createdAt: string;              // ISO timestamp
  updatedAt: string;              // ISO timestamp
}

export interface CorePlayerState {
  readonly playerId: string;
  agentId?: string;
  persona?: string;

  isActive: boolean;              // false if resigned/eliminated
  isConnected: boolean;           // Agent is registered

  // Mechanic-specific player state
  mechanicState: PlayerMechanicStateMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC STATE MAPS (type-safe storage)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps mechanic slugs to their game-level state.
 * Extended via module augmentation when mechanics are registered.
 */
export interface MechanicStateMap {
  [slug: string]: unknown;
}

/**
 * Maps mechanic slugs to their player-level state.
 */
export interface PlayerMechanicStateMap {
  [slug: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GameConfig {
  // From RULES.md frontmatter
  name: string;
  version: string;
  players: PlayerRange;
  winCondition: string;
  maxRounds?: number;
  maxTurns?: number;

  // Mechanic configurations
  mechanics: MechanicConfigEntry[];

  // Raw markdown for GM context
  rulesMarkdown: string;
}

export type PlayerRange =
  | { type: 'exact'; count: number }
  | { type: 'range'; min: number; max: number };

export interface MechanicConfigEntry {
  slug: string;
  config: unknown;  // Parsed by the mechanic itself
}

// ═══════════════════════════════════════════════════════════════════════════
// ADJUDICATION STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AdjudicationState {
  // Last executed action (for contesting)
  lastAction?: RecordedAction;
  actionHistory: RecordedAction[];

  // Pending items awaiting GM
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;

  // History
  contestHistory: ContestRecord[];
  resignationHistory: ResignationRecord[];
  victoryHistory: VictoryRecord[];

  // Operator hints (ephemeral, for unblocking agents)
  operatorHints?: OperatorHint[];
}

export interface RecordedAction {
  player: string;
  action: BaseAction;
  timestamp: string;
  round: number;
  turnNumber: number;
  result?: ActionResult;
}

export interface PendingContest {
  contestedBy: string;
  reason: string;
  originalAction: RecordedAction;
  timestamp: string;
}

export interface PendingResignation {
  player: string;
  reason: string;
  timestamp: string;
}

export interface PendingVictoryClaim {
  player: string;
  reason: string;
  timestamp: string;
}

export interface ContestRecord {
  contest: PendingContest;
  ruling: 'allowed' | 'rejected';
  reason: string;
  timestamp: string;
}

export interface ResignationRecord {
  resignation: PendingResignation;
  ruling: 'accepted' | 'rejected';
  reason: string;
  timestamp: string;
}

export interface VictoryRecord {
  claim: PendingVictoryClaim;
  ruling: 'accepted' | 'rejected';
  reason: string;
  timestamp: string;
}

export interface OperatorHint {
  message: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base action type - all actions must have a type discriminator.
 */
export interface BaseAction {
  readonly type: string;
}

/**
 * Result of executing an action.
 */
export interface ActionResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Context provided to mechanics when handling actions.
 */
export interface ActionContext<
  TGameState = unknown,
  TPlayerState = unknown
> {
  // Full state access
  state: Readonly<CoreGameState>;
  playerId: string;
  timestamp: string;

  // Type-safe mechanic state access
  getMechanicGameState<T>(slug: string): T | undefined;
  getMechanicPlayerState<T>(slug: string, playerId: string): T | undefined;
  getMechanicConfig<T>(slug: string): T | undefined;

  // Convenience for the calling mechanic
  gameState: TGameState;
  playerState: TPlayerState;
}

/**
 * Result of action execution.
 */
export interface ExecutionResult<
  TGameState = unknown,
  TPlayerState = unknown
> {
  success: boolean;
  message?: string;

  // State changes to apply (immutable pattern)
  gameStateChanges?: Partial<TGameState>;
  playerStateChanges?: Record<string, Partial<TPlayerState>>;

  // Events to log
  events: LogEvent[];

  // Effects to apply (cross-mechanic)
  effects?: BaseEffect[];

  // What happens next
  nextTurn: TurnAdvancement;
}

export type TurnAdvancement =
  | { type: 'advance' }           // Normal turn advancement
  | { type: 'same_player' }       // Player continues (e.g., after draw)
  | { type: 'skip'; count: number }  // Skip N players
  | { type: 'reverse' }           // Reverse turn order
  | { type: 'game_over'; winner?: string; reason: string };

/**
 * Describes an available action for agent display.
 */
export interface ActionAvailability<T extends BaseAction = BaseAction> {
  type: T['type'];
  enabled: boolean;
  description: string;
  reason?: string;      // Why disabled
  examples: T[];        // Concrete examples agent can use
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base effect type - all effects must have a type discriminator.
 */
export interface BaseEffect {
  readonly type: string;
  readonly source?: string;       // Player who created effect
  readonly target?: string;       // Player/entity affected
  readonly duration?: EffectDuration;
}

export type EffectDuration =
  | { type: 'instant' }
  | { type: 'turns'; count: number }
  | { type: 'rounds'; count: number }
  | { type: 'until_condition'; condition: string }
  | { type: 'permanent' };

/**
 * Context for applying effects.
 */
export interface EffectContext<
  TGameState = unknown,
  TPlayerState = unknown
> extends ActionContext<TGameState, TPlayerState> {
  effect: BaseEffect;
}

/**
 * Result of effect application.
 */
export interface EffectResult<
  TGameState = unknown,
  TPlayerState = unknown
> {
  gameStateChanges?: Partial<TGameState>;
  playerStateChanges?: Record<string, Partial<TPlayerState>>;
  events: LogEvent[];
  expiredEffects?: string[];      // Effect IDs that expired
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export interface LogEvent {
  timestamp: string;
  event: string;
  round?: number;
  turnNumber?: number;
  player?: string;
  data?: Record<string, unknown>;
}

// Core event types (mechanics add their own)
export type CoreLogEventType =
  | 'game_created'
  | 'game_started'
  | 'game_ended'
  | 'game_cancelled'
  | 'player_registered'
  | 'player_resigned'
  | 'turn_advanced'
  | 'action_executed'
  | 'contest_filed'
  | 'contest_adjudicated'
  | 'victory_claimed'
  | 'victory_adjudicated';

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER VIEW (information hiding)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What a player sees - filtered by mechanics.
 */
export interface PlayerView {
  // Game info
  gameId: string;
  gameName: string;
  status: GameStatus;
  round: number;
  turnNumber: number;
  currentPlayer: string | null;
  turnOrder: string[];

  // My state (full visibility)
  me: PlayerSelfView;

  // Opponents (filtered)
  opponents: OpponentView[];

  // Shared/public state (filtered by mechanics)
  shared: Record<string, unknown>;

  // Available actions (if it's my turn)
  availableActions?: ActionAvailability[];

  // Last action (for contesting)
  lastAction?: RecordedAction;

  // Win condition info
  winCondition: string;
}

export interface PlayerSelfView {
  playerId: string;
  isActive: boolean;
  // Mechanic-specific state (full)
  mechanicState: PlayerMechanicStateMap;
}

export interface OpponentView {
  playerId: string;
  isActive: boolean;
  // Mechanic-specific state (filtered)
  mechanicState: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIN CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface WinConditionResult {
  triggered: boolean;
  winner?: string | null;   // null = draw
  reason: string;
  isTie?: boolean;
  tiedPlayers?: string[];
}
