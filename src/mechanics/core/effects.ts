/**
 * Effects Core Service
 *
 * Manages player effects (status effects, buffs, debuffs).
 * This is a "trunk" mechanic that other mechanics depend on.
 *
 * Hooks:
 * - onBeforeAddEffect: Can modify effect or block
 * - onAfterAddEffect: Notified after effect added
 * - onBeforeRemoveEffect: Can block removal
 * - onEffectExpired: Notified when effect duration reaches 0
 */

import { GameState, Effect } from '../../types/game.js';
import { mechanicRegistry, applyStateChanges } from '../registry.js';

/**
 * Result from effect operation
 */
export interface EffectOperationResult {
  /** True if the operation was applied */
  success: boolean;
  /** The effect that was operated on */
  effect?: Effect;
  /** True if operation was blocked by a hook */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Add an effect to a player.
 * Calls onBeforeAddEffect and onAfterAddEffect hooks.
 *
 * @returns Result indicating success
 */
export function addEffect(
  state: GameState,
  playerId: string,
  effect: Effect
): EffectOperationResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  // Run onBeforeAddEffect hooks
  const beforeResult = mechanicRegistry.onBeforeAddEffect(state, playerId, effect);
  if (beforeResult.blocked) {
    return {
      success: false,
      blocked: true,
      blockReason: beforeResult.blockReason
    };
  }

  const effectToAdd = beforeResult.effect ?? effect;

  // Check if an effect of the same type already exists
  const existingIndex = player.effects.findIndex(e => e.type === effectToAdd.type);
  if (existingIndex !== -1) {
    // Replace existing effect (refresh duration)
    player.effects[existingIndex] = effectToAdd;
  } else {
    // Add new effect
    player.effects.push(effectToAdd);
  }

  // Run onAfterAddEffect hooks
  const afterChanges = mechanicRegistry.onAfterAddEffect(state, playerId, effectToAdd);
  applyStateChanges(state, afterChanges);

  return {
    success: true,
    effect: effectToAdd
  };
}

/**
 * Remove an effect from a player by type.
 * Calls onBeforeRemoveEffect hook.
 *
 * @returns Result indicating success and the removed effect
 */
export function removeEffect(
  state: GameState,
  playerId: string,
  effectType: string
): EffectOperationResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const effectIndex = player.effects.findIndex(e => e.type === effectType);
  if (effectIndex === -1) {
    return {
      success: false,
      blockReason: `Effect "${effectType}" not found on player`
    };
  }

  const effect = player.effects[effectIndex];

  // Run onBeforeRemoveEffect hooks
  const beforeResult = mechanicRegistry.onBeforeRemoveEffect(state, playerId, effect);
  if (beforeResult.blocked) {
    return {
      success: false,
      blocked: true,
      blockReason: beforeResult.blockReason
    };
  }

  // Remove the effect
  player.effects.splice(effectIndex, 1);

  return {
    success: true,
    effect
  };
}

/**
 * Remove all effects from a player.
 *
 * @returns Array of removed effects
 */
export function clearEffects(state: GameState, playerId: string): Effect[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const removed = [...player.effects];
  player.effects = [];
  return removed;
}

/**
 * Decrement duration of all effects for a player.
 * Removes effects that reach 0 duration.
 * Calls onEffectExpired for each expired effect.
 *
 * @returns Array of expired effects that were removed
 */
export function decrementEffectDurations(state: GameState, playerId: string): Effect[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const expiredEffects: Effect[] = [];
  const remainingEffects: Effect[] = [];

  for (const effect of player.effects) {
    const newDuration = effect.duration - 1;
    if (newDuration <= 0) {
      expiredEffects.push(effect);
    } else {
      remainingEffects.push({ ...effect, duration: newDuration });
    }
  }

  // Update player's effects
  player.effects = remainingEffects;

  // Notify hooks about expired effects
  for (const effect of expiredEffects) {
    const changes = mechanicRegistry.onEffectExpired(state, playerId, effect);
    applyStateChanges(state, changes);
  }

  return expiredEffects;
}

/**
 * Check if a player has a specific effect type.
 */
export function hasEffect(state: GameState, playerId: string, effectType: string): boolean {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.effects.some(e => e.type === effectType);
}

/**
 * Get a specific effect from a player.
 * Returns undefined if not found.
 */
export function getEffect(state: GameState, playerId: string, effectType: string): Effect | undefined {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.effects.find(e => e.type === effectType);
}

/**
 * Get all effects for a player.
 */
export function getEffects(state: GameState, playerId: string): Effect[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return [...player.effects];
}

/**
 * Get effects of a specific type from a player.
 */
export function getEffectsByType(state: GameState, playerId: string, effectType: string): Effect[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.effects.filter(e => e.type === effectType);
}

/**
 * Get the total value of effects of a specific type.
 * Useful for stacking effects like "probability_boost".
 */
export function getEffectValue(state: GameState, playerId: string, effectType: string): number {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.effects
    .filter(e => e.type === effectType)
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

/**
 * Check if a player is blocked by any blocking effect.
 * Common blocking effects: block_turn, skip, lose_turn
 */
export function isBlocked(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const blockingEffectTypes = ['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen'];
  return player.effects.some(e => blockingEffectTypes.includes(e.type));
}

/**
 * Extend the duration of an existing effect.
 * If effect doesn't exist, does nothing.
 *
 * @returns True if effect was found and extended
 */
export function extendEffectDuration(
  state: GameState,
  playerId: string,
  effectType: string,
  additionalDuration: number
): boolean {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const effect = player.effects.find(e => e.type === effectType);
  if (!effect) {
    return false;
  }

  effect.duration += additionalDuration;
  return true;
}
