/**
 * Card Piles Core Service
 *
 * Manages deck, discard pile, and card play operations.
 * This is a "trunk" mechanic that other mechanics depend on.
 *
 * Strangler fig pattern: Wraps existing game.ts logic, gradually
 * adding hooks for dependent mechanics to intercept.
 *
 * Hooks fired:
 * - onBeforeDraw / onBeforeCardDraw: Can modify draw count or block draw
 * - onAfterDraw / onCardDrawn: Notified after draw completes
 * - onDiscard / onCardDiscarded: Notified when cards are discarded
 * - onCardPlayed: Notified when a card is played from hand
 */

import { GameState, Card } from '../../types/game.js';
import { shuffleDeck } from '../../core/rules.js';
import { mechanicRegistry } from '../registry.js';
import { applyStateChanges } from '../registry.js';
import { removeFromHandByName } from './hand.js';

/**
 * Draw context for hooks (re-exported from types)
 */
export type { DrawContext } from '../types.js';

/**
 * Result of a draw operation
 */
export interface DrawResult {
  cards: Card[];
  reshuffled: boolean;
  /** True if draw was blocked by a hook */
  blocked?: boolean;
  blockReason?: string;
}

/**
 * Internal draw implementation without hooks.
 * Used by drawFromDeck and for cases where hooks shouldn't fire.
 */
function drawFromDeckInternal(state: GameState, count: number): { cards: Card[]; reshuffled: boolean } {
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
 * Draw cards from deck, reshuffling discard if needed.
 * Does NOT add to hand - caller decides destination.
 * Calls onBeforeDraw and onAfterDraw hooks.
 *
 * @param state - Game state
 * @param count - Number of cards to draw
 * @param playerId - Player drawing (for hook context). If not provided, hooks are skipped.
 */
export function drawFromDeck(state: GameState, count: number, playerId?: string): DrawResult {
  // Run onBeforeDraw hooks if we have a player context
  let actualCount = count;
  if (playerId) {
    // Global hook (all mechanics)
    const beforeResult = mechanicRegistry.onBeforeDraw(state, playerId, count);
    if (beforeResult.blocked) {
      return { cards: [], reshuffled: false, blocked: true, blockReason: beforeResult.blockReason };
    }
    if (beforeResult.count !== undefined) {
      actualCount = beforeResult.count;
    }

    // Cards-defined hook (only cards dependents) - strangler fig dual-fire
    const cardsBeforeResult = mechanicRegistry.fire('cards', 'onBeforeCardDraw', state, playerId, {
      requestedCount: actualCount
    });
    if (cardsBeforeResult && (cardsBeforeResult as Record<string, unknown>).blocked) {
      const blockReason = (cardsBeforeResult as Record<string, unknown>).blockReason as string | undefined;
      return { cards: [], reshuffled: false, blocked: true, blockReason };
    }
    if (cardsBeforeResult && typeof (cardsBeforeResult as Record<string, unknown>).count === 'number') {
      actualCount = (cardsBeforeResult as Record<string, unknown>).count as number;
    }
  }

  // Perform the draw
  const { cards: drawn, reshuffled } = drawFromDeckInternal(state, actualCount);

  // Run onAfterDraw hooks
  if (playerId && drawn.length > 0) {
    // Global hook (all mechanics)
    const afterChanges = mechanicRegistry.onAfterDraw(state, playerId, count, drawn, reshuffled);
    applyStateChanges(state, afterChanges);

    // Cards-defined hook (only cards dependents) - strangler fig dual-fire
    const cardsChanges = mechanicRegistry.fire('cards', 'onCardDrawn', state, playerId, {
      cards: drawn, requestedCount: count, reshuffled
    });
    if (cardsChanges) applyStateChanges(state, cardsChanges);
  }

  return { cards: drawn, reshuffled };
}

/**
 * Add cards to discard pile, updating top card tracking.
 * Calls onDiscard hook after cards are added.
 *
 * @param state - Game state
 * @param cards - Cards to discard
 * @param playerId - Optional player discarding (for hook context)
 */
export function addToDiscard(state: GameState, cards: Card[], playerId?: string): void {
  for (const card of cards) {
    state.discardPile.push(card);

    // Update top card tracking (currentColor is set by card-matching's onCardPlayed)
    state.shared.topCard = card;
  }

  // Run onDiscard hooks
  if (cards.length > 0) {
    // Global hook (all mechanics)
    const changes = mechanicRegistry.onDiscard(state, cards, playerId);
    applyStateChanges(state, changes);

    // Cards-defined hook (only cards dependents) - strangler fig dual-fire
    if (playerId) {
      const cardsChanges = mechanicRegistry.fire('cards', 'onCardDiscarded', state, playerId, { cards });
      if (cardsChanges) applyStateChanges(state, cardsChanges);
    }
  }
}

/**
 * Result of a play card operation
 */
export interface PlayCardResult {
  /** The card that was played, or null if not found */
  card: Card | null;
}

/**
 * Play a card from hand to discard pile.
 * Removes from hand, adds to discard, fires onCardPlayed hook.
 *
 * @param state - Game state
 * @param playerId - Player playing the card
 * @param cardName - Name of the card to play
 * @param playContext - Additional context (e.g., declaredColor for wild cards)
 */
export function playCard(
  state: GameState,
  playerId: string,
  cardName: string,
  playContext?: Record<string, unknown>
): PlayCardResult {
  const card = removeFromHandByName(state, playerId, cardName);
  if (!card) {
    return { card: null };
  }

  addToDiscard(state, [card], playerId);

  // Fire cards-defined onCardPlayed hook (card-matching sets currentColor here)
  const cardPlayedChanges = mechanicRegistry.fire('cards', 'onCardPlayed', state, playerId, {
    card, target: 'discard', playContext: playContext ?? {}
  });
  if (cardPlayedChanges) applyStateChanges(state, cardPlayedChanges);

  return { card };
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
