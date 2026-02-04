/**
 * Card Piles Core Service
 *
 * Manages deck and discard pile operations.
 * This is a "trunk" mechanic that other mechanics depend on.
 *
 * Strangler fig pattern: Wraps existing game.ts logic, gradually
 * adding hooks for dependent mechanics to intercept.
 *
 * Hooks:
 * - onBeforeDraw: Can modify draw count or block draw
 * - onAfterDraw: Notified after draw completes
 * - onDiscard: Notified when cards are discarded
 */

import { GameState, Card } from '../../types/game.js';
import { shuffleDeck } from '../../core/rules.js';
import { mechanicRegistry } from '../registry.js';
import { applyStateChanges } from '../registry.js';

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

    // Update top card tracking
    state.shared.topCard = card;
    if (card.effect?.color) {
      state.shared.currentColor = card.effect.color;
    }
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
