/**
 * Core type definitions for the game design framework
 */

// Identifiers
export type PlayerId = string;
export type ZoneId = string;
export type CardId = string;
export type ActionId = string;

/**
 * Visibility levels for zones and cards
 */
export type Visibility = 'public' | 'private' | 'hidden';

/**
 * Card definition - flexible enough for any card game
 */
export interface Card {
  id: CardId;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  text?: string;  // Natural language effect text for arbiter interpretation
}

/**
 * Zone constraints for validation
 */
export interface ZoneConstraints {
  maxSize?: number;
  minSize?: number;
  ordered?: boolean;
  allowedCardTypes?: string[];
}

/**
 * A zone where cards can exist (hand, deck, battlefield, etc.)
 */
export interface Zone {
  id: ZoneId;
  owner?: PlayerId;
  visibility: Visibility;
  cards: Card[];
  constraints?: ZoneConstraints;
}

/**
 * Per-player state
 */
export interface PlayerState {
  id: PlayerId;
  name: string;
  resources: Record<string, number>;
  properties: Record<string, unknown>;
}

/**
 * Actions that can be taken in the game
 */
export interface Action {
  id: ActionId;
  type: string;
  playerId: PlayerId;
  timestamp: number;
  params: Record<string, unknown>;
  result?: ActionResult;
}

export interface ActionResult {
  success: boolean;
  stateChanges: StateChange[];
  message?: string;
  arbiterReasoning?: string;
}

export interface StateChange {
  type: 'move_card' | 'modify_resource' | 'modify_property' | 'create_card' | 'destroy_card';
  details: Record<string, unknown>;
}

/**
 * Pending decisions or effects that need resolution
 */
export interface Resolution {
  id: string;
  type: string;
  waitingFor: PlayerId | 'arbiter';
  context: Record<string, unknown>;
  options?: unknown[];
}

/**
 * Complete game state - serializable and trackable
 */
export interface GameState {
  id: string;
  zones: Map<ZoneId, Zone>;
  players: Map<PlayerId, PlayerState>;
  globals: Record<string, unknown>;
  history: Action[];
  pendingResolutions: Resolution[];

  // Turn tracking
  currentTurn: number;
  currentPhase: string;
  activePlayer: PlayerId;

  // Game status
  status: 'setup' | 'playing' | 'finished';
  winner?: PlayerId | 'draw';
  endReason?: string;
}

/**
 * Serialized game state for LLM context
 */
export interface SerializedGameState {
  formatted: string;  // Human/LLM readable format
  json: string;       // Full JSON for precise operations
  perspective?: PlayerId;  // If filtered for a player's view
}

/**
 * Game configuration derived from rules
 */
export interface GameConfig {
  name: string;
  version: string;
  playerCount: { min: number; max: number };
  zones: ZoneDefinition[];
  resources: ResourceDefinition[];
  turnStructure: TurnStructure;
  actions: ActionDefinition[];
  winConditions: WinCondition[];
  parameters: ParameterDefinition[];
}

export interface ZoneDefinition {
  id: string;
  perPlayer: boolean;
  visibility: Visibility;
  constraints?: ZoneConstraints;
}

export interface ResourceDefinition {
  id: string;
  initial: number;
  min?: number;
  max?: number;
}

export interface TurnStructure {
  phases: string[];
  actionsPerPhase?: Record<string, string[]>;
}

export interface ActionDefinition {
  id: string;
  name: string;
  validWhen: string;  // Condition expression or natural language
  effect: string;     // Effect description (may be natural language)
  params?: Record<string, ParamDefinition>;
  phases?: string[];  // Phases when this action is available
}

export interface ParamDefinition {
  type: 'card' | 'zone' | 'player' | 'number' | 'choice';
  required: boolean;
  validation?: string;
}

export interface WinCondition {
  id: string;
  condition: string;  // Expression or natural language
  priority?: number;  // For checking order
}

export interface ParameterDefinition {
  id: string;
  type: 'number' | 'boolean' | 'choice';
  default: unknown;
  min?: number;
  max?: number;
  choices?: unknown[];
  description?: string;
}

/**
 * Game event types for hooks
 */
export type GameEventType =
  | 'game_start'
  | 'game_end'
  | 'turn_start'
  | 'turn_end'
  | 'phase_start'
  | 'phase_end'
  | 'action_proposed'
  | 'action_validated'
  | 'action_executed'
  | 'action_rejected'
  | 'resolution_required'
  | 'resolution_provided'
  | 'state_changed';

export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  gameId: string;
  data: Record<string, unknown>;
}

/**
 * Metrics collected during gameplay
 */
export interface GameMetrics {
  gameId: string;
  duration: number;
  turnCount: number;
  actionCount: number;
  actionsPerTurn: number[];
  decisionsPerPlayer: Record<PlayerId, number>;
  arbiterInterventions: number;
  resourceHistory: Record<PlayerId, number[]>;
  leadChanges: number;
  winMargin?: number;
  cardUsage: Record<string, number>;
}
