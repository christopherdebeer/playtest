/**
 * Mechanic Interface
 *
 * The contract that all game mechanics must fulfill.
 * TypeScript enforces that all required methods are implemented at compile time.
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  ActionContext,
  ExecutionResult,
  ActionAvailability,
  EffectContext,
  EffectResult,
  WinConditionResult,
  BaseAction,
  BaseEffect,
  InitContext,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

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

  readonly slug: TSlug;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly conflicts: readonly string[];

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  parseConfig(raw: unknown): Result<TConfig, ValidationError[]>;

  validateConfig(
    config: TConfig,
    registry: MechanicRegistryView
  ): ValidationError[];

  getConfigSchema(): JsonSchema;

  // ═══════════════════════════════════════════════════════════════
  // STATE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  initGameState(config: TConfig, context: InitContext): TGameState;

  initPlayerState(config: TConfig, playerId: string, context: InitContext): TPlayerState;

  onGameStart?(
    config: TConfig,
    context: ActionContext<TGameState, TPlayerState>
  ): ExecutionResult<TGameState, TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  getActionTypes(): readonly TActions['type'][];

  validateAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ValidationResult;

  executeAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ExecutionResult<TGameState, TPlayerState>;

  getAvailableActions(
    ctx: ActionContext<TGameState, TPlayerState>
  ): ActionAvailability<TActions>[];

  // ═══════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════

  getEffectTypes(): readonly TEffects['type'][];

  applyEffect(
    ctx: EffectContext<TGameState, TPlayerState>,
    effect: TEffects
  ): EffectResult<TGameState, TPlayerState>;

  tickEffects(
    ctx: ActionContext<TGameState, TPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<TGameState, TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // INFORMATION HIDING
  // ═══════════════════════════════════════════════════════════════

  filterGameStateForPlayer(
    state: TGameState,
    playerId: string
  ): Record<string, unknown>;

  filterPlayerStateForViewer(
    state: TPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown>;

  // ═══════════════════════════════════════════════════════════════
  // WIN CONDITIONS
  // ═══════════════════════════════════════════════════════════════

  checkWinCondition(
    ctx: ActionContext<TGameState, TPlayerState>
  ): WinConditionResult | null;

  // ═══════════════════════════════════════════════════════════════
  // ACTION HOOKS (optional, for cross-mechanic coordination)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Called before validating ANY action (from any mechanic).
   * Use this to add cross-cutting validation (e.g., action-points checking AP cost).
   * Return errors to block the action.
   */
  preValidateAction?(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: BaseAction
  ): ValidationResult;

  /**
   * Called after executing ANY action (from any mechanic).
   * Use this to react to actions (e.g., action-points deducting AP cost).
   * Return state changes to apply after the action.
   */
  postExecuteAction?(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: BaseAction,
    result: ExecutionResult
  ): EffectResult<TGameState, TPlayerState>;

  /**
   * Called after action execution to check if turn should auto-end.
   * Use this for mechanics that manage turn resources (e.g., action-points checking 0 AP).
   * Return true to force turn advancement.
   */
  shouldAutoEndTurn?(
    ctx: ActionContext<TGameState, TPlayerState>
  ): boolean;

  // ═══════════════════════════════════════════════════════════════
  // TURN ORDER (optional)
  // ═══════════════════════════════════════════════════════════════

  getNextPlayer?(
    ctx: ActionContext<TGameState, TPlayerState>
  ): string | null;

  // ═══════════════════════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════════════════════

  getLogEventTypes(): readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MechanicRegistryView {
  get(slug: string): Mechanic | undefined;
  isEnabled(slug: string): boolean;
  getConfig<T>(slug: string): T | undefined;
  getEnabled(): string[];
  getPlayerCount(): number;
}

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
  additionalProperties?: boolean | JsonSchema;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper function for creating mechanics with better type inference.
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
// MECHANIC INFO (for registry listing)
// ═══════════════════════════════════════════════════════════════════════════

export interface MechanicInfo {
  slug: string;
  version: string;
  displayName: string;
  description: string;
  dependencies: readonly string[];
  conflicts: readonly string[];
  actionTypes: readonly string[];
  effectTypes: readonly string[];
}

export function getMechanicInfo(mechanic: Mechanic): MechanicInfo {
  return {
    slug: mechanic.slug,
    version: mechanic.version,
    displayName: mechanic.displayName,
    description: mechanic.description,
    dependencies: mechanic.dependencies,
    conflicts: mechanic.conflicts,
    actionTypes: mechanic.getActionTypes(),
    effectTypes: mechanic.getEffectTypes(),
  };
}
