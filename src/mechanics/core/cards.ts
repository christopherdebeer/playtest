/**
 * Cards State Accessor
 *
 * Provides unified access to the cards subsystem state (deck, discardPile)
 * which lives in GameState.shared.
 */

import type { GameState, Card } from '../../types/game.js';

export interface CardsState {
  deck: Card[];
  discardPile: Card[];
}

/**
 * Get the cards subsystem state from GameState.shared.
 * Ensures deck and discardPile arrays exist.
 */
export function getCardsState(state: GameState): CardsState {
  if (!state.shared.deck) state.shared.deck = [];
  if (!state.shared.discardPile) state.shared.discardPile = [];
  return state.shared as unknown as CardsState;
}
