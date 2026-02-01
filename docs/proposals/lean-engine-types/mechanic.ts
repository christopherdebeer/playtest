/**
 * Mechanic Interface
 *
 * The Mechanic interface defines the contract that all game mechanics must fulfill.
 * TypeScript enforces that all required methods are implemented at compile time.
 *
 * This is the heart of the pluggable architecture - add new mechanics by
 * implementing this interface.
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  ParseError,
  ActionContext,
  ExecutionResult,
  ActionAvailability,
  EffectContext,
  EffectResult,
  WinConditionResult,
  BaseAction,
  BaseEffect,
  LogEvent,
  MechanicStateMap,
  PlayerMechanicStateMap,
} from './core';

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A Mechanic is a self-contained game system that can be composed with others.
 *
 * @typeParam TSlug - Literal string type for the mechanic's unique identifier
 * @typeParam TConfig - Configuration shape from RULES.md
 * @typeParam TGameState - Game-level state this mechanic adds
 * @typeParam TPlayerState - Player-level state this mechanic adds
 * @typeParam TActions - Union of action types this mechanic handles
 * @typeParam TEffects - Union of effect types this mechanic provides
 */
export interface Mechanic<
  TSlug extends string = string,
  TConfig extends object = object,
  TGameState extends object = object,
  TPlayerState extends object = object,
  TActions extends BaseAction = BaseAction,
  TEffects extends BaseEffect = BaseEffect
> {
  // ═══════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════

  /** Unique identifier for this mechanic (kebab-case) */
  readonly slug: TSlug;

  /** Semantic version for compatibility checking */
  readonly version: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Brief description */
  readonly description: string;

  /**
   * Dependencies on other mechanics.
   * These must be enabled for this mechanic to work.
   * @example ['cards'] for a mechanic that uses card state
   */
  readonly dependencies: readonly string[];

  /**
   * Mechanics this conflicts with (cannot be used together).
   * @example ['grid'] and ['graph'] might conflict
   */
  readonly conflicts: readonly string[];

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parse raw config from RULES.md YAML into typed config.
   *
   * Called during game initialization before any state is created.
   * Should validate structure but not cross-mechanic constraints.
   */
  parseConfig(raw: unknown): Result<TConfig, ParseError[]>;

  /**
   * Validate config against the full mechanic registry.
   *
   * Called after all mechanics have parsed their configs.
   * Can validate cross-mechanic constraints here.
   */
  validateConfig(
    config: TConfig,
    registry: MechanicRegistryView
  ): ValidationError[];

  /**
   * JSON Schema for this mechanic's config.
   *
   * Used for RULES.md validation and documentation generation.
   */
  getConfigSchema(): JsonSchema;

  // ═══════════════════════════════════════════════════════════════
  // STATE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize game-level state for this mechanic.
   *
   * Called once when the game is created, after all players are known.
   *
   * @param config - This mechanic's parsed config
   * @param context - Initialization context (player count, etc.)
   */
  initGameState(config: TConfig, context: InitContext): TGameState;

  /**
   * Initialize player-level state for this mechanic.
   *
   * Called once per player when they join the game.
   *
   * @param config - This mechanic's parsed config
   * @param playerId - The player's ID
   * @param context - Initialization context
   */
  initPlayerState(config: TConfig, playerId: string, context: InitContext): TPlayerState;

  /**
   * Called when the game transitions from waiting_for_players to in_progress.
   *
   * Use this for any setup that requires all players to be present
   * (e.g., dealing starting cards).
   */
  onGameStart?(
    config: TConfig,
    context: ActionContext<TGameState, TPlayerState>
  ): ExecutionResult<TGameState, TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * List of action types this mechanic handles.
   *
   * Used for routing actions to the correct mechanic.
   */
  getActionTypes(): readonly TActions['type'][];

  /**
   * Validate an action before execution.
   *
   * Should be pure (no side effects).
   * Returns validation result with errors if invalid.
   */
  validateAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ValidationResult;

  /**
   * Execute a validated action.
   *
   * Returns state changes to apply (immutable pattern).
   * The engine applies these changes after successful execution.
   */
  executeAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ExecutionResult<TGameState, TPlayerState>;

  /**
   * Get available actions for a player.
   *
   * Called to show the player what actions they can take.
   * Should return enabled/disabled status with reasons.
   */
  getAvailableActions(
    ctx: ActionContext<TGameState, TPlayerState>
  ): ActionAvailability<TActions>[];

  // ═══════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * List of effect types this mechanic provides.
   */
  getEffectTypes(): readonly TEffects['type'][];

  /**
   * Apply an effect to the game state.
   *
   * Effects can come from this mechanic or others
   * (e.g., a card effect triggering probability modification).
   */
  applyEffect(
    ctx: EffectContext<TGameState, TPlayerState>,
    effect: TEffects
  ): EffectResult<TGameState, TPlayerState>;

  /**
   * Called at turn/round boundaries to tick effect durations.
   *
   * Should decrement duration counters and mark expired effects.
   */
  tickEffects(
    ctx: ActionContext<TGameState, TPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<TGameState, TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // INFORMATION HIDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Filter game-level state for a player's view.
   *
   * Hide information the player shouldn't see (e.g., deck contents).
   * Return only the visible portion.
   */
  filterGameStateForPlayer(
    state: TGameState,
    playerId: string
  ): FilteredState<TGameState>;

  /**
   * Filter player state for viewing by another player.
   *
   * @param state - The player state to filter
   * @param viewerId - Who is viewing
   * @param ownerId - Whose state this is
   */
  filterPlayerStateForViewer(
    state: TPlayerState,
    viewerId: string,
    ownerId: string
  ): FilteredState<TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // WIN CONDITIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if this mechanic's win condition is met.
   *
   * Return null if this mechanic doesn't define a win condition.
   * Multiple mechanics can have win conditions - first to trigger wins.
   */
  checkWinCondition(
    ctx: ActionContext<TGameState, TPlayerState>
  ): WinConditionResult | null;

  // ═══════════════════════════════════════════════════════════════
  // TURN ORDER (optional override)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Override default turn advancement logic.
   *
   * Return null to use default sequential advancement.
   */
  getNextPlayer?(
    ctx: ActionContext<TGameState, TPlayerState>
  ): string | null;

  // ═══════════════════════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Event types this mechanic may emit.
   *
   * Used for log schema validation and documentation.
   */
  getLogEventTypes(): readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context available during initialization.
 */
export interface InitContext {
  playerCount: number;
  playerIds: string[];
  gameId: string;
  random: () => number;  // Seeded random for reproducibility
}

/**
 * Read-only view of the mechanic registry.
 */
export interface MechanicRegistryView {
  /** Get a mechanic by slug */
  get(slug: string): Mechanic | undefined;

  /** Check if a mechanic is enabled for this game */
  isEnabled(slug: string): boolean;

  /** Get the config for a mechanic */
  getConfig<T>(slug: string): T | undefined;

  /** List all enabled mechanics */
  getEnabled(): string[];

  /** Get player count for the game */
  getPlayerCount(): number;
}

/**
 * Filtered state type - allows partial or transformed views.
 */
export type FilteredState<T> = {
  [K in keyof T]?: T[K] | FilteredValue;
};

/**
 * Special filtered values.
 */
export type FilteredValue =
  | { __hidden: true }           // Value exists but is hidden
  | { __count: number }          // Only count is visible
  | { __summary: string };       // Summarized representation

/**
 * JSON Schema type (simplified).
 */
export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  default?: unknown;
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC BUILDER (helper for creating mechanics)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper function for creating mechanics with better type inference.
 *
 * @example
 * const myMechanic = defineMechanic({
 *   slug: 'my-mechanic',
 *   version: '1.0.0',
 *   // ... TypeScript will enforce all required fields
 * });
 */
export function defineMechanic<
  TSlug extends string,
  TConfig extends object,
  TGameState extends object,
  TPlayerState extends object,
  TActions extends BaseAction,
  TEffects extends BaseEffect
>(
  mechanic: Mechanic<TSlug, TConfig, TGameState, TPlayerState, TActions, TEffects>
): Mechanic<TSlug, TConfig, TGameState, TPlayerState, TActions, TEffects> {
  return mechanic;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE MECHANIC STATE ACCESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Module augmentation interface for registering mechanic state types.
 *
 * Mechanics extend this to get type-safe state access.
 *
 * @example
 * // In cards/types.ts
 * declare module '../core' {
 *   interface MechanicStateMap {
 *     cards: CardsGameState;
 *   }
 *   interface PlayerMechanicStateMap {
 *     cards: CardsPlayerState;
 *   }
 * }
 */
export interface MechanicTypeRegistry {
  // Mechanic slug -> { config, gameState, playerState, actions, effects }
  [slug: string]: {
    config: object;
    gameState: object;
    playerState: object;
    actions: BaseAction;
    effects: BaseEffect;
  };
}

/**
 * Get the config type for a mechanic.
 */
export type MechanicConfig<TSlug extends keyof MechanicTypeRegistry> =
  MechanicTypeRegistry[TSlug]['config'];

/**
 * Get the game state type for a mechanic.
 */
export type MechanicGameState<TSlug extends keyof MechanicTypeRegistry> =
  MechanicTypeRegistry[TSlug]['gameState'];

/**
 * Get the player state type for a mechanic.
 */
export type MechanicPlayerState<TSlug extends keyof MechanicTypeRegistry> =
  MechanicTypeRegistry[TSlug]['playerState'];

/**
 * Get the action types for a mechanic.
 */
export type MechanicActions<TSlug extends keyof MechanicTypeRegistry> =
  MechanicTypeRegistry[TSlug]['actions'];

/**
 * Get the effect types for a mechanic.
 */
export type MechanicEffects<TSlug extends keyof MechanicTypeRegistry> =
  MechanicTypeRegistry[TSlug]['effects'];
