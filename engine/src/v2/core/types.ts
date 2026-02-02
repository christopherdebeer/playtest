/**
 * Core Engine Types
 *
 * Foundational primitives that all mechanics build upon.
 * The core is intentionally minimal - complexity lives in mechanics.
 */

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export interface ValidationError {
  path?: string;
  code?: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

export function validResult(): ValidationResult {
  return { valid: true, errors: [] };
}

export function invalidResult(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

export type GameStatus =
  | 'initializing'
  | 'waiting_for_players'
  | 'in_progress'
  | 'pending_analysis'
  | 'completed'
  | 'cancelled';

// ═══════════════════════════════════════════════════════════════════════════
// CORE GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CoreGameState {
  // Identity (immutable)
  readonly gameId: string;
  readonly gameName: string;
  readonly instanceId: string;

  // Lifecycle
  status: GameStatus;
  winner?: string | null;
  endReason?: string;

  // Turn tracking
  round: number;
  turnNumber: number;
  currentPlayer: string | null;
  turnOrder: string[];

  // Players
  players: Record<string, CorePlayerState>;

  // Configuration
  config: GameConfig;

  // Mechanic state (each mechanic stores its state here by slug)
  mechanicState: Record<string, unknown>;

  // Logging
  logPath: string;

  // Adjudication
  adjudication: AdjudicationState;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface CorePlayerState {
  readonly playerId: string;
  agentId?: string;
  persona?: string;
  isActive: boolean;
  isConnected: boolean;

  // Mechanic-specific player state by slug
  mechanicState: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GameConfig {
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
  config: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// ADJUDICATION STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface AdjudicationState {
  lastAction?: RecordedAction;
  actionHistory: RecordedAction[];
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;
  contestHistory: ContestRecord[];
  resignationHistory: ResignationRecord[];
  victoryHistory: VictoryRecord[];
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

export interface BaseAction {
  readonly type: string;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ActionContext<
  TGameState = unknown,
  TPlayerState = unknown
> {
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

  // Seeded random for reproducibility
  random: () => number;
}

export type TurnAdvancement =
  | { type: 'advance' }
  | { type: 'same_player' }
  | { type: 'skip'; count: number }
  | { type: 'reverse' }
  | { type: 'game_over'; winner?: string; reason: string };

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

export interface ActionAvailability<T extends BaseAction = BaseAction> {
  type: T['type'];
  enabled: boolean;
  description: string;
  reason?: string;
  examples: T[];
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export interface BaseEffect {
  readonly type: string;
  readonly source?: string;
  readonly target?: string;
  readonly duration?: EffectDuration;
}

export type EffectDuration =
  | { type: 'instant' }
  | { type: 'turns'; count: number }
  | { type: 'rounds'; count: number }
  | { type: 'permanent' };

export interface EffectContext<
  TGameState = unknown,
  TPlayerState = unknown
> extends ActionContext<TGameState, TPlayerState> {
  effect: BaseEffect;
}

export interface EffectResult<
  TGameState = unknown,
  TPlayerState = unknown
> {
  gameStateChanges?: Partial<TGameState>;
  playerStateChanges?: Record<string, Partial<TPlayerState>>;
  events: LogEvent[];
  expiredEffects?: string[];
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

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER VIEW
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayerView {
  gameId: string;
  gameName: string;
  status: GameStatus;
  round: number;
  turnNumber: number;
  currentPlayer: string | null;
  turnOrder: string[];

  me: PlayerSelfView;
  opponents: OpponentView[];
  shared: Record<string, unknown>;

  availableActions?: ActionAvailability[];
  lastAction?: RecordedAction;
  winCondition: string;
}

export interface PlayerSelfView {
  playerId: string;
  isActive: boolean;
  mechanicState: Record<string, unknown>;
}

export interface OpponentView {
  playerId: string;
  isActive: boolean;
  mechanicState: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIN CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface WinConditionResult {
  triggered: boolean;
  winner?: string | null;
  reason: string;
  isTie?: boolean;
  tiedPlayers?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

export interface InitContext {
  playerCount: number;
  playerIds: string[];
  gameId: string;
  random: () => number;
}
