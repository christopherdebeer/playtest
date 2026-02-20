/**
 * Hand Service
 *
 * Pure state manipulation functions for player hands.
 * Hand is stored in state.players[playerId].hand as Card[].
 */

import type { GameState, Card } from '../../types/game.js';

export interface AddToHandResult {
  addedCards: Card[];
}

function getPlayer(state: GameState, playerId: string) {
  const player = state.players[playerId];
  if (!player) throw new Error(`Player ${playerId} not found`);
  if (!player.hand) player.hand = [];
  return player;
}

export function addToHand(state: GameState, playerId: string, cards: Card[]): AddToHandResult {
  const player = getPlayer(state, playerId);
  player.hand!.push(...cards);
  return { addedCards: cards };
}

export function removeFromHandByIndex(state: GameState, playerId: string, index: number): Card | null {
  const player = getPlayer(state, playerId);
  if (index < 0 || index >= player.hand!.length) return null;
  const [removed] = player.hand!.splice(index, 1);
  return removed;
}

export function removeFromHandByName(state: GameState, playerId: string, name: string): Card | null {
  const player = getPlayer(state, playerId);
  const idx = player.hand!.findIndex(c => c.name === name);
  if (idx < 0) return null;
  const [removed] = player.hand!.splice(idx, 1);
  return removed;
}

export function removeCardsFromHand(state: GameState, playerId: string, names: string[]): Card[] {
  const player = getPlayer(state, playerId);
  const removed: Card[] = [];
  for (const name of names) {
    const idx = player.hand!.findIndex(c => c.name === name);
    if (idx >= 0) {
      removed.push(player.hand!.splice(idx, 1)[0]);
    }
  }
  return removed;
}

export function findInHand(state: GameState, playerId: string, name: string): Card | undefined {
  const player = getPlayer(state, playerId);
  return player.hand!.find(c => c.name === name);
}

export function getHandSize(state: GameState, playerId: string): number {
  const player = getPlayer(state, playerId);
  return player.hand!.length;
}

export function getHand(state: GameState, playerId: string): Card[] {
  const player = getPlayer(state, playerId);
  return [...player.hand!];
}
