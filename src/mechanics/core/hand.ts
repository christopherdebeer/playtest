/**
 * Hand Core Service
 *
 * Manages player hand operations.
 * This is a "trunk" mechanic that other mechanics depend on.
 */

import { GameState, Card, PlayerState } from '../../types/game.js';

/**
 * Add cards to a player's hand.
 */
export function addToHand(state: GameState, playerId: string, cards: Card[]): void {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  player.hand.push(...cards);
}

/**
 * Remove a card from player's hand by index.
 * Returns the removed card, or null if index invalid.
 */
export function removeFromHandByIndex(state: GameState, playerId: string, cardIndex: number): Card | null {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    return null;
  }

  const [card] = player.hand.splice(cardIndex, 1);
  return card;
}

/**
 * Remove a card from player's hand by name.
 * Returns the removed card, or null if not found.
 */
export function removeFromHandByName(state: GameState, playerId: string, cardName: string): Card | null {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const cardIndex = player.hand.findIndex(c => c.name === cardName);
  if (cardIndex === -1) {
    return null;
  }

  const [card] = player.hand.splice(cardIndex, 1);
  return card;
}

/**
 * Remove multiple cards from player's hand by names.
 * Returns array of removed cards (may be shorter if some not found).
 */
export function removeCardsFromHand(state: GameState, playerId: string, cardNames: string[]): Card[] {
  const removed: Card[] = [];

  for (const cardName of cardNames) {
    const card = removeFromHandByName(state, playerId, cardName);
    if (card) {
      removed.push(card);
    }
  }

  return removed;
}

/**
 * Find a card in player's hand by name.
 * Returns the card (without removing) or undefined.
 */
export function findInHand(state: GameState, playerId: string, cardName: string): Card | undefined {
  const player = state.players[playerId];
  if (!player) return undefined;

  return player.hand.find(c => c.name === cardName);
}

/**
 * Get player's current hand size.
 */
export function getHandSize(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;
  return player.hand.length;
}

/**
 * Get all cards in player's hand.
 */
export function getHand(state: GameState, playerId: string): Card[] {
  const player = state.players[playerId];
  if (!player) return [];
  return [...player.hand]; // Return copy to prevent mutation
}
