/**
 * Resources Core Service
 *
 * Manages player resource/currency operations.
 * This is a "trunk" mechanic that other mechanics depend on.
 *
 * Hooks:
 * - onBeforeResourceChange: Can modify amount or block change
 * - onAfterResourceChange: Notified after resource changed
 */

import { GameState } from '../../types/game.js';
import { mechanicRegistry, applyStateChanges } from '../registry.js';

/**
 * Result from resource operation
 */
export interface ResourceChangeResult {
  /** True if the change was applied */
  success: boolean;
  /** New resource amount after change */
  newAmount: number;
  /** Amount that was actually changed (may differ from requested) */
  actualChange: number;
  /** True if change was blocked by a hook */
  blocked?: boolean;
  /** Reason for blocking */
  blockReason?: string;
}

/**
 * Spend (deduct) a resource from a player.
 * Calls onBeforeResourceChange and onAfterResourceChange hooks.
 *
 * @returns Result indicating success and new amount
 */
export function spendResource(
  state: GameState,
  playerId: string,
  resource: string,
  amount: number
): ResourceChangeResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  if (!player.resources) {
    return {
      success: false,
      newAmount: 0,
      actualChange: 0,
      blocked: true,
      blockReason: 'Resources not configured for this player'
    };
  }

  const currentAmount = player.resources[resource] ?? 0;

  if (amount > currentAmount) {
    return {
      success: false,
      newAmount: currentAmount,
      actualChange: 0,
      blocked: true,
      blockReason: `Not enough ${resource}. Have ${currentAmount}, need ${amount}`
    };
  }

  // Run onBeforeResourceChange hooks
  const beforeResult = mechanicRegistry.onBeforeResourceChange(
    state,
    playerId,
    resource,
    -amount // negative for spend
  );
  if (beforeResult.blocked) {
    return {
      success: false,
      newAmount: currentAmount,
      actualChange: 0,
      blocked: true,
      blockReason: beforeResult.blockReason
    };
  }

  const actualAmount = beforeResult.amount ?? amount;

  // Apply the change
  player.resources[resource] = currentAmount - actualAmount;

  // Run onAfterResourceChange hooks
  const afterChanges = mechanicRegistry.onAfterResourceChange(
    state,
    playerId,
    resource,
    -actualAmount,
    player.resources[resource]
  );
  applyStateChanges(state, afterChanges);

  return {
    success: true,
    newAmount: player.resources[resource],
    actualChange: actualAmount
  };
}

/**
 * Add a resource to a player.
 * Calls onBeforeResourceChange and onAfterResourceChange hooks.
 *
 * @returns Result indicating success and new amount
 */
export function addResource(
  state: GameState,
  playerId: string,
  resource: string,
  amount: number
): ResourceChangeResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  // Initialize resources if not present
  if (!player.resources) {
    player.resources = {};
  }

  const currentAmount = player.resources[resource] ?? 0;

  // Run onBeforeResourceChange hooks
  const beforeResult = mechanicRegistry.onBeforeResourceChange(
    state,
    playerId,
    resource,
    amount // positive for add
  );
  if (beforeResult.blocked) {
    return {
      success: false,
      newAmount: currentAmount,
      actualChange: 0,
      blocked: true,
      blockReason: beforeResult.blockReason
    };
  }

  const actualAmount = beforeResult.amount ?? amount;

  // Apply the change
  player.resources[resource] = currentAmount + actualAmount;

  // Run onAfterResourceChange hooks
  const afterChanges = mechanicRegistry.onAfterResourceChange(
    state,
    playerId,
    resource,
    actualAmount,
    player.resources[resource]
  );
  applyStateChanges(state, afterChanges);

  return {
    success: true,
    newAmount: player.resources[resource],
    actualChange: actualAmount
  };
}

/**
 * Set a resource to a specific value.
 * Calls onBeforeResourceChange and onAfterResourceChange hooks.
 */
export function setResource(
  state: GameState,
  playerId: string,
  resource: string,
  amount: number
): ResourceChangeResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  // Initialize resources if not present
  if (!player.resources) {
    player.resources = {};
  }

  const currentAmount = player.resources[resource] ?? 0;
  const delta = amount - currentAmount;

  // Run onBeforeResourceChange hooks
  const beforeResult = mechanicRegistry.onBeforeResourceChange(
    state,
    playerId,
    resource,
    delta
  );
  if (beforeResult.blocked) {
    return {
      success: false,
      newAmount: currentAmount,
      actualChange: 0,
      blocked: true,
      blockReason: beforeResult.blockReason
    };
  }

  // Apply the change (use full amount, not modified delta)
  player.resources[resource] = amount;

  // Run onAfterResourceChange hooks
  const afterChanges = mechanicRegistry.onAfterResourceChange(
    state,
    playerId,
    resource,
    delta,
    amount
  );
  applyStateChanges(state, afterChanges);

  return {
    success: true,
    newAmount: amount,
    actualChange: delta
  };
}

/**
 * Get current amount of a resource for a player.
 */
export function getResource(state: GameState, playerId: string, resource: string): number {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.resources?.[resource] ?? 0;
}

/**
 * Check if a player has at least a certain amount of a resource.
 */
export function hasResource(
  state: GameState,
  playerId: string,
  resource: string,
  amount: number
): boolean {
  return getResource(state, playerId, resource) >= amount;
}

/**
 * Get all resources for a player.
 */
export function getAllResources(
  state: GameState,
  playerId: string
): Record<string, number> {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return { ...(player.resources ?? {}) };
}

/**
 * Get list of resource names configured for a player.
 */
export function getResourceNames(state: GameState, playerId: string): string[] {
  const player = state.players[playerId];
  if (!player || !player.resources) {
    return [];
  }

  return Object.keys(player.resources);
}
