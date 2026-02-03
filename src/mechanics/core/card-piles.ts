/**
 * Card Piles Core Service
 *
 * Manages deck and discard pile operations.
 * This is a "trunk" mechanic that other mechanics depend on.
 *
 * Strangler fig pattern: Wraps existing game.ts logic, gradually
 * adding hooks for dependent mechanics to intercept.
 */

import { GameState, Card } from '../../types/game.js';
import { shuffleDeck } from '../../core/rules.js';

/**
 * Draw context for hooks
 */
export interface DrawContext {
  state: GameState;
  playerId: string;
  requestedCount: number;
}

/**
 * Result of a draw operation
 */
export interface DrawResult {
  cards: Card[];
  reshuffled: boolean;
}

/**
 * Draw cards from deck, reshuffling discard if needed.
 * Does NOT add to hand - caller decides destination.
 */
export function drawFromDeck(state: GameState, count: number): DrawResult {
  const drawn: Card[] = [];
  let reshuffled = false;

  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      // Reshuffle discard pile (keep top card if tracking)
      if (state.discardPile.length === 0) {
        break; // No cards left anywhere
      }

      // If tracking top card, keep it in discard
      const topCard = state.shared.topCard as Card | undefined;
      let cardsToShuffle = state.discardPile;

      if (topCard) {
        // Keep top card, shuffle the rest
        cardsToShuffle = state.discardPile.filter(c => c !== topCard);
        state.discardPile = [topCard];
      } else {
        state.discardPile = [];
      }

      if (cardsToShuffle.length > 0) {
        state.deck = shuffleDeck(cardsToShuffle);
        reshuffled = true;
      } else {
        break; // Only top card left, can't draw
      }
    }

    const card = state.deck.shift();
    if (card) {
      drawn.push(card);
    }
  }

  return { cards: drawn, reshuffled };
}

/**
 * Add cards to discard pile, updating top card tracking.
 */
export function addToDiscard(state: GameState, cards: Card[]): void {
  for (const card of cards) {
    state.discardPile.push(card);

    // Update top card tracking
    state.shared.topCard = card;
    if (card.effect?.color) {
      state.shared.currentColor = card.effect.color;
    }
  }
}

/**
 * Peek at top of discard pile without removing.
 */
export function peekDiscard(state: GameState): Card | undefined {
  if (state.discardPile.length === 0) return undefined;
  return state.discardPile[state.discardPile.length - 1];
}

/**
 * Check if deck has cards available (including potential reshuffle).
 */
export function hasCardsAvailable(state: GameState): boolean {
  return state.deck.length > 0 || state.discardPile.length > 1;
}

/**
 * Get count of cards in deck.
 */
export function getDeckSize(state: GameState): number {
  return state.deck.length;
}

/**
 * Get count of cards in discard pile.
 */
export function getDiscardSize(state: GameState): number {
  return state.discardPile.length;
}
