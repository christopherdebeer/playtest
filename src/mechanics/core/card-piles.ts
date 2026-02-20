/**
 * Card Piles Service
 *
 * Pure state manipulation functions for deck and discard pile operations.
 * Deck and discard live in state.shared (via getCardsState).
 */

import type { GameState, Card } from '../../types/game.js';
import { getCardsState } from './cards.js';
import { addToHand, removeFromHandByName } from './hand.js';

export interface DrawResult {
  cards: Card[];
  reshuffled: boolean;
}

export interface PlayCardResult {
  card: Card | null;
}

/**
 * Draw cards from the top of the shared deck.
 * If deck is empty and discard has cards, reshuffles discard into deck.
 * Optionally adds drawn cards to player's hand.
 */
export function drawFromDeck(state: GameState, count: number, playerId?: string): DrawResult {
  const cardsState = getCardsState(state);
  let reshuffled = false;

  // If deck is empty, reshuffle discard
  if (cardsState.deck.length === 0 && cardsState.discardPile.length > 0) {
    cardsState.deck = [...cardsState.discardPile];
    cardsState.discardPile = [];
    // Shuffle the deck
    for (let i = cardsState.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardsState.deck[i], cardsState.deck[j]] = [cardsState.deck[j], cardsState.deck[i]];
    }
    reshuffled = true;
  }

  const drawn = cardsState.deck.splice(0, count);

  if (playerId && drawn.length > 0) {
    addToHand(state, playerId, drawn);
  }

  return { cards: drawn, reshuffled };
}

/**
 * Add cards to the discard pile. Updates shared.topCard to the last card added.
 */
export function addToDiscard(state: GameState, cards: Card[], _playerId?: string): void {
  const cardsState = getCardsState(state);
  cardsState.discardPile.push(...cards);
  if (cards.length > 0) {
    state.shared.topCard = cards[cards.length - 1];
  }
}

/**
 * Play a card from a player's hand: removes from hand, adds to discard.
 */
export function playCard(state: GameState, playerId: string, cardName: string): PlayCardResult {
  const card = removeFromHandByName(state, playerId, cardName);
  if (!card) return { card: null };
  addToDiscard(state, [card], playerId);
  return { card };
}

/**
 * Peek at the top card of the discard pile without removing it.
 */
export function peekDiscard(state: GameState): Card | undefined {
  const cardsState = getCardsState(state);
  if (cardsState.discardPile.length === 0) return undefined;
  return cardsState.discardPile[cardsState.discardPile.length - 1];
}

/**
 * Check if there are cards available (deck or discard pile).
 */
export function hasCardsAvailable(state: GameState): boolean {
  const cardsState = getCardsState(state);
  return cardsState.deck.length > 0 || cardsState.discardPile.length > 0;
}

/**
 * Get the current deck size.
 */
export function getDeckSize(state: GameState): number {
  return getCardsState(state).deck.length;
}

/**
 * Get the current discard pile size.
 */
export function getDiscardSize(state: GameState): number {
  return getCardsState(state).discardPile.length;
}
