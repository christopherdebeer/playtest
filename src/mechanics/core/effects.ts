/**
 * Effects Service
 *
 * Pure state manipulation functions for player effects (buffs, debuffs, blocks).
 * Effects are stored in state.players[playerId].effects as Effect[].
 */

import type { GameState, Effect } from '../../types/game.js';

export interface EffectResult {
  success: boolean;
  effect?: Effect;
}

function getPlayer(state: GameState, playerId: string) {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} not found`);
  if (!player.effects) player.effects = [];
  return player;
}

export function addEffect(state: GameState, playerId: string, effect: Effect): EffectResult {
  const player = getPlayer(state, playerId);
  // Replace existing effect of same type
  const idx = player.effects.findIndex(e => e.type === effect.type);
  if (idx >= 0) {
    player.effects[idx] = effect;
  } else {
    player.effects.push(effect);
  }
  return { success: true, effect };
}

export function removeEffect(state: GameState, playerId: string, type: string): EffectResult {
  const player = getPlayer(state, playerId);
  const idx = player.effects.findIndex(e => e.type === type);
  if (idx < 0) return { success: false };
  const [removed] = player.effects.splice(idx, 1);
  return { success: true, effect: removed };
}

export function clearEffects(state: GameState, playerId: string): Effect[] {
  const player = getPlayer(state, playerId);
  const removed = [...player.effects];
  player.effects = [];
  return removed;
}

export function decrementEffectDurations(state: GameState, playerId: string): Effect[] {
  const player = getPlayer(state, playerId);
  const expired: Effect[] = [];
  player.effects = player.effects.filter(e => {
    if (e.duration <= 0) return true; // permanent effects (duration 0)
    e.duration--;
    if (e.duration <= 0) {
      expired.push(e);
      return false;
    }
    return true;
  });
  return expired;
}

export function hasEffect(state: GameState, playerId: string, type: string): boolean {
  const player = getPlayer(state, playerId);
  return player.effects.some(e => e.type === type);
}

export function getEffect(state: GameState, playerId: string, type: string): Effect | undefined {
  const player = getPlayer(state, playerId);
  return player.effects.find(e => e.type === type);
}

export function getEffects(state: GameState, playerId: string): Effect[] {
  const player = getPlayer(state, playerId);
  return [...player.effects];
}

export function getEffectsByType(state: GameState, playerId: string, type: string): Effect[] {
  const player = getPlayer(state, playerId);
  return player.effects.filter(e => e.type === type);
}

export function getEffectValue(state: GameState, playerId: string, type: string): number {
  const player = getPlayer(state, playerId);
  return player.effects
    .filter(e => e.type === type)
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

const BLOCKING_TYPES = ['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen'];

export function isBlocked(state: GameState, playerId: string): boolean {
  const player = getPlayer(state, playerId);
  return player.effects.some(e => BLOCKING_TYPES.includes(e.type));
}

export function extendEffectDuration(state: GameState, playerId: string, type: string, amount: number): boolean {
  const player = getPlayer(state, playerId);
  const effect = player.effects.find(e => e.type === type);
  if (!effect) return false;
  effect.duration += amount;
  return true;
}
