/**
 * Mechanic Hooks - Incremental extraction infrastructure
 *
 * This provides hook points for extracting mechanics from the monolithic game.ts
 * without breaking existing functionality. Mechanics can opt-in to hooks by
 * returning values; returning null means "not my concern".
 */

import { GameState, GameConfig, PlayerState, GameAction, Card, Effect } from '../types/game.js';

/**
 * Context passed to hooks - read-only view of game state
 */
export interface HookContext {
  state: GameState;
  playerId: string;
  player: PlayerState;
  config: GameConfig;
}

/**
 * Extended context for turn-start hooks
 */
export interface TurnStartContext extends HookContext {
  isNewRound: boolean;
}

/**
 * Extended context for turn-end hooks
 */
export interface TurnEndContext extends HookContext {
  /** Next player ID (after turn advances) */
  nextPlayerId: string;
  /** True if this ends the current round */
  isRoundEnd: boolean;
}

/**
 * Context for win condition checks
 */
export interface WinCheckContext {
  state: GameState;
  playerId: string;
  player: PlayerState;
  config: GameConfig;
  /** The trigger that caused this win check (action type, turn end, etc.) */
  trigger: string;
}

/**
 * Result from win condition check
 */
export interface WinCheckResult {
  /** True if this player has won */
  won: boolean;
  /** Reason for winning (for logging) */
  reason?: string;
}

// ============ Action Execution & Registration Types ============

/**
 * Context for action execution
 */
export interface ActionExecutionContext extends HookContext {
  action: GameAction;
}

/**
 * Result from action execution
 */
export interface ActionExecutionResult {
  /** True if this mechanic handled the action */
  handled: boolean;
  /** State changes to apply */
  stateChanges?: StateChanges;
  /** Should turn advance after this action? */
  advanceTurn?: boolean;
  /** Should check win conditions after this action? */
  checkWin?: boolean;
  /** Log message for the action */
  logMessage?: string;
  /** Additional log data */
  logData?: Record<string, unknown>;
}

/**
 * An available action exposed by a mechanic
 */
export interface AvailableAction {
  /** The action object */
  action: GameAction;
  /** Priority for display ordering (higher = first) */
  priority?: number;
  /** Category for grouping in UI */
  category?: string;
}

/**
 * Description of an action for display
 */
export interface ActionDescription {
  /** Action type */
  type: string;
  /** Human-readable label */
  label: string;
  /** Detailed description */
  description: string;
  /** Example usage strings */
  examples?: string[];
}

/**
 * Result of action validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * State changes to apply after hook execution
 */
export interface StateChanges {
  playerStateChanges?: Record<string, Partial<PlayerState>>;
  sharedStateChanges?: Record<string, unknown>;
}

/**
 * Player state initialization result
 */
export interface PlayerInitResult {
  [key: string]: unknown;
}

/**
 * Context for player initialization (includes partial game state being built)
 */
export interface PlayerInitContext {
  config: GameConfig;
  playerId: string;
  playerIndex: number;
  /** Players initialized so far (for cross-player coordination) */
  existingPlayers: Record<string, Partial<PlayerState>>;
}

/**
 * Context for card draw operations
 */
export interface DrawContext {
  state: GameState;
  playerId: string;
  requestedCount: number;
  config: GameConfig;
}

/**
 * Result from onBeforeDraw - can modify count or block draw
 */
export interface DrawHookResult {
  /** Modified count to draw (defaults to requestedCount) */
  count?: number;
  /** Block the draw entirely */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Context for after-draw hook
 */
export interface AfterDrawContext extends DrawContext {
  drawnCards: Card[];
  reshuffled: boolean;
}

/**
 * Context for discard operations
 */
export interface DiscardContext {
  state: GameState;
  playerId?: string;
  cards: Card[];
  config: GameConfig;
}

/**
 * Context for hand add operations
 */
export interface HandAddContext {
  state: GameState;
  playerId: string;
  cards: Card[];
  config: GameConfig;
}

/**
 * Result from onBeforeAddToHand - can filter or block
 */
export interface HandAddHookResult {
  /** Cards to actually add (can filter) */
  cards?: Card[];
  /** Block the add entirely */
  blocked?: boolean;
  blockReason?: string;
}

/**
 * Context for hand remove operations
 */
export interface HandRemoveContext {
  state: GameState;
  playerId: string;
  cards: Card[];
  config: GameConfig;
}

/**
 * Context for resource change operations
 */
export interface ResourceChangeContext {
  state: GameState;
  playerId: string;
  resource: string;
  /** Positive for add, negative for spend */
  amount: number;
  config: GameConfig;
}

/**
 * Result from onBeforeResourceChange - can modify amount or block
 */
export interface ResourceChangeHookResult {
  /** Modified amount (defaults to requested amount) */
  amount?: number;
  /** Block the change entirely */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Context for after-resource-change hook
 */
export interface AfterResourceChangeContext extends ResourceChangeContext {
  /** New amount after the change */
  newAmount: number;
}

/**
 * Context for effect operations
 */
export interface EffectContext {
  state: GameState;
  playerId: string;
  effect: Effect;
  config: GameConfig;
}

/**
 * Result from onBeforeAddEffect - can modify effect or block
 */
export interface EffectAddHookResult {
  /** Modified effect (defaults to original) */
  effect?: Effect;
  /** Block the add entirely */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Result from onBeforeRemoveEffect - can block removal
 */
export interface EffectRemoveHookResult {
  /** Block the removal */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Context for board move operations
 */
export interface MoveContext {
  state: GameState;
  playerId: string;
  /** Target state to move to */
  target: string;
  config: GameConfig;
}

// ============ Visibility System Types (Phase 4) ============

/**
 * Context for visibility checks - determines what a player can see
 */
export interface VisibilityContext {
  state: GameState;
  viewerPlayerId: string;
  config: GameConfig;
}

/**
 * Context for reveal operations - when hidden info becomes visible
 */
export interface RevealContext {
  state: GameState;
  /** Player revealing the information */
  revealingPlayerId: string;
  /** Type of information being revealed (e.g., 'role', 'hand', 'position') */
  targetInfo: string;
  /** Players who will see the revealed info ('all' for everyone) */
  toPlayerIds: string[] | 'all';
  config: GameConfig;
}

/**
 * Result from getVisibleState - filtered game state for a viewer
 */
export interface VisibleState {
  /** Filtered players object (with hidden info redacted) */
  players?: Record<string, Partial<PlayerState>>;
  /** Filtered shared state */
  shared?: Record<string, unknown>;
  /** Additional visibility metadata */
  visibilityMeta?: {
    hiddenPlayers?: string[];
    hiddenInfo?: string[];
    revealedTo?: Record<string, string[]>;
  };
}

/**
 * Result from onBeforeMove - can modify target or block
 */
export interface MoveHookResult {
  /** Modified target state */
  target?: string;
  /** Block the move entirely */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Context for after-move hook
 */
export interface AfterMoveContext {
  state: GameState;
  playerId: string;
  /** Previous state before move */
  previousState: string;
  /** New state after move */
  newState: string;
  config: GameConfig;
}

/**
 * Mechanic hooks interface - all methods optional, return null to skip
 */
export interface MechanicHooks {
  /** Unique identifier for this mechanic */
  slug: string;

  /** Human-readable name */
  name: string;

  /**
   * Called before action validation in core.
   * Return { valid: false, error } to block action.
   * Return { valid: true } or null to allow.
   */
  preValidateAction?(ctx: HookContext, action: GameAction): ValidationResult | null;

  /**
   * Called after successful action execution.
   * Return state changes to apply, or null for no changes.
   */
  postExecuteAction?(ctx: HookContext, action: GameAction): StateChanges | null;

  /**
   * Called to check if turn should auto-end.
   * Return true to force turn end, false/null to continue.
   */
  shouldAutoEndTurn?(ctx: HookContext): boolean;

  /**
   * Called when initializing a new player.
   * Return partial player state to merge.
   * Context includes existingPlayers for cross-player coordination.
   */
  initPlayerState?(ctx: PlayerInitContext): PlayerInitResult | null;

  /**
   * Called at start of player's turn.
   * Return state changes to apply.
   */
  onTurnStart?(ctx: TurnStartContext): StateChanges | null;

  /**
   * Called at end of player's turn (before advancing to next player).
   * Return state changes to apply.
   */
  onTurnEnd?(ctx: TurnEndContext): StateChanges | null;

  /**
   * Called to check if a player has won.
   * Return { won: true, reason } if the player has achieved victory.
   * Multiple mechanics can define win conditions; first to return won: true wins.
   */
  onCheckWin?(ctx: WinCheckContext): WinCheckResult | null;

  // ============ Action Execution & Registration Hooks ============
  // These hooks enable mechanics to handle their own actions and
  // dynamically expose available actions based on game state.

  /**
   * Execute an action owned by this mechanic.
   * Return { handled: true } to prevent default execution in game.ts.
   * Return null if this action is not owned by this mechanic.
   */
  onExecuteAction?(ctx: ActionExecutionContext): ActionExecutionResult | null;

  /**
   * Return actions this mechanic provides for the current player.
   * Called when building available actions list.
   */
  getAvailableActions?(ctx: HookContext): AvailableAction[];

  /**
   * Describe an action for display purposes.
   * Return null if this action is not owned by this mechanic.
   */
  describeAction?(action: GameAction): ActionDescription | null;

  // ============ Core Operation Hooks ============
  // These hooks are called by core services (card-piles, hand)
  // to allow mechanics to intercept fundamental operations.

  /**
   * Called before drawing cards.
   * Can modify count or block draw entirely.
   */
  onBeforeDraw?(ctx: DrawContext): DrawHookResult | null;

  /**
   * Called after cards are drawn.
   * Can trigger effects based on what was drawn.
   */
  onAfterDraw?(ctx: AfterDrawContext): StateChanges | null;

  /**
   * Called when cards are added to discard.
   * Can trigger effects or modify behavior.
   */
  onDiscard?(ctx: DiscardContext): StateChanges | null;

  /**
   * Called before adding cards to hand.
   * Can filter cards or block entirely.
   */
  onBeforeAddToHand?(ctx: HandAddContext): HandAddHookResult | null;

  /**
   * Called after cards are added to hand.
   * Can trigger effects.
   */
  onAfterAddToHand?(ctx: HandAddContext): StateChanges | null;

  /**
   * Called after cards are removed from hand.
   * Can trigger effects.
   */
  onAfterRemoveFromHand?(ctx: HandRemoveContext): StateChanges | null;

  // ============ Resource Operation Hooks ============

  /**
   * Called before a resource change (add or spend).
   * Can modify the amount or block the change.
   */
  onBeforeResourceChange?(ctx: ResourceChangeContext): ResourceChangeHookResult | null;

  /**
   * Called after a resource change is applied.
   * Can trigger effects based on resource changes.
   */
  onAfterResourceChange?(ctx: AfterResourceChangeContext): StateChanges | null;

  // ============ Effect Operation Hooks ============

  /**
   * Called before adding an effect to a player.
   * Can modify the effect or block the add.
   */
  onBeforeAddEffect?(ctx: EffectContext): EffectAddHookResult | null;

  /**
   * Called after an effect is added to a player.
   * Can trigger side effects.
   */
  onAfterAddEffect?(ctx: EffectContext): StateChanges | null;

  /**
   * Called before removing an effect from a player.
   * Can block the removal.
   */
  onBeforeRemoveEffect?(ctx: EffectContext): EffectRemoveHookResult | null;

  /**
   * Called when an effect expires (duration reaches 0).
   * Can trigger side effects or cleanup.
   */
  onEffectExpired?(ctx: EffectContext): StateChanges | null;

  // ============ Board Movement Hooks ============

  /**
   * Called before a player moves to a new board state.
   * Can modify the target or block the move.
   */
  onBeforeMove?(ctx: MoveContext): MoveHookResult | null;

  /**
   * Called after a player moves to a new board state.
   * Can trigger effects or update state.
   */
  onAfterMove?(ctx: AfterMoveContext): StateChanges | null;

  // ============ Visibility System Hooks (Phase 4) ============

  /**
   * Filter game state for a specific viewer.
   * Return partial state showing only what the viewer should see.
   * Return null to skip (use default visibility).
   */
  getVisibleState?(ctx: VisibilityContext): VisibleState | null;

  /**
   * Called when hidden information is revealed.
   * Can trigger effects or update state based on reveals.
   */
  onReveal?(ctx: RevealContext): StateChanges | null;

  /**
   * Check if a player can see specific information.
   * Return true/false to allow/deny, or undefined to defer to other mechanics.
   * @param infoType - Type of info: 'role', 'hand', 'position', 'score', etc.
   * @param targetPlayerId - Optional target player (for viewing another player's info)
   */
  canSeeInfo?(ctx: VisibilityContext, infoType: string, targetPlayerId?: string): boolean | undefined;

  // ============ Mechanic Composition ============

  /**
   * Mechanics this one depends on.
   * Registry validates all dependencies are enabled at startup.
   */
  dependencies?: string[];

  /**
   * Mechanics this one conflicts with.
   * Registry validates no conflicts are enabled at startup.
   */
  conflicts?: string[];

  /**
   * JSON Schema for this mechanic's config.
   * Used for validation and documentation.
   */
  configSchema?: MechanicConfigSchema;
}

/**
 * JSON Schema for mechanic configuration validation
 */
export interface MechanicConfigSchema {
  type: 'object' | 'boolean';
  properties?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: (string | number | boolean)[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
    items?: { type: string };
    required?: boolean;
  }>;
  required?: string[];
  description?: string;
}

/**
 * Check if a mechanic is enabled in the game config
 */
export function isMechanicEnabled(config: GameConfig, slug: string): boolean {
  if (!config.engine_mechanics) return false;

  // Map slug to config key (e.g., 'action-points' -> 'action_points')
  const configKey = slug.replace(/-/g, '_');
  return configKey in config.engine_mechanics &&
         config.engine_mechanics[configKey as keyof typeof config.engine_mechanics] !== undefined;
}
