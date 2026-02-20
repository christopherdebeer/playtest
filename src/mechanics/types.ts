/**
 * Mechanic Types - Minimal type definitions retained for game.ts compatibility.
 * All mechanic execution now routes through the Lean engine.
 */

import { GameState, GameConfig, PlayerState, GameAction, Card, Effect } from '../types/game.js';

export interface HookContext {
  state: GameState;
  playerId: string;
  player: PlayerState;
  config: GameConfig;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface StateChanges {
  playerStateChanges?: Record<string, Partial<PlayerState>>;
  sharedStateChanges?: Record<string, unknown>;
}

export interface ActionExecutionResult {
  handled: boolean;
  stateChanges?: StateChanges;
  advanceTurn?: boolean;
  checkWin?: boolean;
  logMessage?: string;
  logData?: Record<string, unknown>;
}

export interface AvailableAction {
  action: GameAction;
  priority?: number;
  category?: string;
  enabled?: boolean;
  reason?: string;
  description?: string;
  required?: Record<string, string>;
  optional?: Record<string, string>;
  examples?: GameAction[];
  cards?: string[];
  targets?: string[];
}

export interface WinCheckResult {
  won: boolean;
  reason?: string;
}

export interface ActionSchemaFieldDef {
  type: string;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
}

export interface ActionSchemaConditional {
  if: Record<string, unknown>;
  require?: string[];
  forbid?: string[];
}

export interface ActionSchema {
  required?: string[];
  optional?: string[];
  fields?: Record<string, ActionSchemaFieldDef>;
  conditional?: ActionSchemaConditional[];
}

/**
 * Check if a mechanic is enabled in the game config.
 */
export function isMechanicEnabled(config: GameConfig, slug: string): boolean {
  if (!config.engine_mechanics) return false;
  const configKey = slug.replace(/-/g, '_');
  if (configKey in config.engine_mechanics &&
      config.engine_mechanics[configKey as keyof typeof config.engine_mechanics] !== undefined) {
    return true;
  }
  return false;
}

export function hasExplicitConfig(config: GameConfig, slug: string): boolean {
  return isMechanicEnabled(config, slug);
}

export function setDependencyResolver(_resolver: (config: GameConfig, slug: string) => boolean): void {
  // No-op: Lean engine handles all mechanics
}
