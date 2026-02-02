/**
 * Mechanic Hooks - Incremental extraction infrastructure
 *
 * This provides hook points for extracting mechanics from the monolithic game.ts
 * without breaking existing functionality. Mechanics can opt-in to hooks by
 * returning values; returning null means "not my concern".
 */

import { GameState, GameConfig, PlayerState, GameAction } from '../types/game.js';

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
