/**
 * Core Mechanics - Foundational services other mechanics depend on
 *
 * These are "trunk" mechanics that implement primitive operations
 * for cards, hands, and piles. Leaf mechanics hook into these.
 */

// Card pile operations (deck, discard)
export {
  drawFromDeck,
  addToDiscard,
  peekDiscard,
  hasCardsAvailable,
  getDeckSize,
  getDiscardSize,
  type DrawContext,
  type DrawResult
} from './card-piles.js';

// Hand operations
export {
  addToHand,
  removeFromHandByIndex,
  removeFromHandByName,
  removeCardsFromHand,
  findInHand,
  getHandSize,
  getHand,
  type AddToHandResult
} from './hand.js';
