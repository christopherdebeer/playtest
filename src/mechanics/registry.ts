/**
 * Mechanic Registry - Manages registered mechanics and routes hooks
 *
 * This is intentionally minimal to avoid adding complexity.
 * Mechanics register themselves, and the registry routes hook calls
 * to all enabled mechanics.
 */

import {
  MechanicHooks,
  HookContext,
  TurnStartContext,
  ValidationResult,
  StateChanges,
  PlayerInitResult,
  PlayerInitContext,
  isMechanicEnabled
} from './types.js';
import { GameState, GameConfig, GameAction, PlayerState } from '../types/game.js';

class MechanicRegistry {
  private mechanics: Map<string, MechanicHooks> = new Map();

  /**
   * Register a mechanic's hooks
   */
  register(mechanic: MechanicHooks): void {
    if (this.mechanics.has(mechanic.slug)) {
      throw new Error(`Mechanic '${mechanic.slug}' is already registered`);
    }
    this.mechanics.set(mechanic.slug, mechanic);
  }

  /**
   * Get all registered mechanic slugs
   */
  getRegisteredSlugs(): string[] {
    return Array.from(this.mechanics.keys());
  }

  /**
   * Get mechanics enabled for a game config
   */
  getEnabledMechanics(config: GameConfig): MechanicHooks[] {
    return Array.from(this.mechanics.values())
      .filter(m => isMechanicEnabled(config, m.slug));
  }

  /**
   * Create hook context from game state
   */
  private createContext(state: GameState, playerId: string): HookContext {
    const player = state.players[playerId];
    if (!player) {
      throw new Error(`Player ${playerId} not found in state`);
    }
    return {
      state,
      playerId,
      player,
      config: state.config
    };
  }

  /**
   * Run preValidateAction hooks for all enabled mechanics.
   * Returns first validation failure, or { valid: true } if all pass.
   */
  preValidateAction(state: GameState, playerId: string, action: GameAction): ValidationResult {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.preValidateAction) {
        const result = mechanic.preValidateAction(ctx, action);
        if (result && !result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Run postExecuteAction hooks for all enabled mechanics.
   * Collects and merges all state changes.
   */
  postExecuteAction(state: GameState, playerId: string, action: GameAction): StateChanges {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.postExecuteAction) {
        const changes = mechanic.postExecuteAction(ctx, action);
        if (changes) {
          // Merge player state changes
          if (changes.playerStateChanges) {
            mergedChanges.playerStateChanges = mergedChanges.playerStateChanges || {};
            for (const [pid, pchanges] of Object.entries(changes.playerStateChanges)) {
              mergedChanges.playerStateChanges[pid] = {
                ...mergedChanges.playerStateChanges[pid],
                ...pchanges
              };
            }
          }
          // Merge shared state changes
          if (changes.sharedStateChanges) {
            mergedChanges.sharedStateChanges = {
              ...mergedChanges.sharedStateChanges,
              ...changes.sharedStateChanges
            };
          }
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Check if any enabled mechanic wants to auto-end turn.
   */
  shouldAutoEndTurn(state: GameState, playerId: string): boolean {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.shouldAutoEndTurn) {
        if (mechanic.shouldAutoEndTurn(ctx)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Collect player state from all enabled mechanics during registration.
   * Passes existing players for cross-player coordination (e.g., unique power assignment).
   */
  initPlayerState(
    config: GameConfig,
    playerId: string,
    playerIndex: number,
    existingPlayers: Record<string, Partial<PlayerState>>
  ): PlayerInitResult {
    const enabledMechanics = this.getEnabledMechanics(config);
    const merged: PlayerInitResult = {};

    const ctx: PlayerInitContext = {
      config,
      playerId,
      playerIndex,
      existingPlayers
    };

    for (const mechanic of enabledMechanics) {
      if (mechanic.initPlayerState) {
        const result = mechanic.initPlayerState(ctx);
        if (result) {
          Object.assign(merged, result);
        }
      }
    }

    return merged;
  }

  /**
   * Run onTurnStart hooks for all enabled mechanics.
   */
  onTurnStart(state: GameState, playerId: string, isNewRound: boolean = false): StateChanges {
    const baseCtx = this.createContext(state, playerId);
    const ctx: TurnStartContext = { ...baseCtx, isNewRound };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onTurnStart) {
        const changes = mechanic.onTurnStart(ctx);
        if (changes) {
          if (changes.playerStateChanges) {
            mergedChanges.playerStateChanges = mergedChanges.playerStateChanges || {};
            for (const [pid, pchanges] of Object.entries(changes.playerStateChanges)) {
              mergedChanges.playerStateChanges[pid] = {
                ...mergedChanges.playerStateChanges[pid],
                ...pchanges
              };
            }
          }
        }
      }
    }

    return mergedChanges;
  }
}

// Singleton registry instance
export const mechanicRegistry = new MechanicRegistry();

/**
 * Apply state changes to game state (mutates state)
 */
export function applyStateChanges(state: GameState, changes: StateChanges): void {
  if (changes.playerStateChanges) {
    for (const [playerId, playerChanges] of Object.entries(changes.playerStateChanges)) {
      if (state.players[playerId]) {
        Object.assign(state.players[playerId], playerChanges);
      }
    }
  }
  if (changes.sharedStateChanges) {
    state.shared = { ...state.shared, ...changes.sharedStateChanges };
  }
}
