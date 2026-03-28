/**
 * Resource Service
 *
 * Pure state manipulation functions for player resources.
 * Resources are stored in state.players[playerId].resources as Record<string, number>.
 */

import type { GameState } from '../../types/game.js';

export interface ResourceResult {
  success: boolean;
  newAmount: number;
  actualChange: number;
  blocked?: boolean;
}

function getPlayer(state: GameState, playerId: string) {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} not found`);
  return player;
}

export function addResource(state: GameState, playerId: string, resource: string, amount: number): ResourceResult {
  const player = getPlayer(state, playerId);
  if (!player.resources) player.resources = {};
  const prev = player.resources[resource] ?? 0;
  player.resources[resource] = prev + amount;
  return { success: true, newAmount: player.resources[resource], actualChange: amount };
}

export function spendResource(state: GameState, playerId: string, resource: string, amount: number): ResourceResult {
  const player = getPlayer(state, playerId);
  if (!player.resources) {
    return { success: false, newAmount: 0, actualChange: 0, blocked: true };
  }
  const prev = player.resources[resource] ?? 0;
  if (prev < amount) {
    return { success: false, newAmount: prev, actualChange: 0, blocked: true };
  }
  player.resources[resource] = prev - amount;
  return { success: true, newAmount: player.resources[resource], actualChange: amount };
}

export function setResource(state: GameState, playerId: string, resource: string, amount: number): ResourceResult {
  const player = getPlayer(state, playerId);
  if (!player.resources) player.resources = {};
  const prev = player.resources[resource] ?? 0;
  player.resources[resource] = amount;
  return { success: true, newAmount: amount, actualChange: amount - prev };
}

export function getResource(state: GameState, playerId: string, resource: string): number {
  const player = getPlayer(state, playerId);
  return player.resources?.[resource] ?? 0;
}

export function hasResource(state: GameState, playerId: string, resource: string, amount: number): boolean {
  return getResource(state, playerId, resource) >= amount;
}

export function getAllResources(state: GameState, playerId: string): Record<string, number> {
  const player = getPlayer(state, playerId);
  return { ...(player.resources ?? {}) };
}

export function getResourceNames(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  return Object.keys(player.resources ?? {});
}
