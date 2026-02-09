/**
 * Cards Core Mechanic
 *
 * Defines the foundational card domain hooks that card-related leaf mechanics implement.
 * Any mechanic that works with cards should declare `requires: ['cards']` and implement
 * the hooks defined here.
 *
 * This mechanic is always enabled. Core card services fire these hooks
 * and only mechanics that declare `requires: ['cards']` receive them.
 *
 * Defined hooks:
 * - onCardDrawn: After cards are drawn from deck (merge)
 * - onCardPlayed: After a card is played from hand (merge)
 * - onCardDiscarded: After cards are discarded (merge)
 * - onBeforeCardDraw: Before drawing, can block/modify (blocking)
 * - onBeforeCardPlay: Before playing a card, can block (blocking)
 */

import {
  MechanicHooks,
  HookContext,
  StateChanges,
  ActionExecutionContext,
  ActionExecutionResult
} from '../types.js';
import { Card, PlayCardAction } from '../../types/game.js';
import { playCard } from './card-piles.js';

// ============ Payload types for cards-defined hooks ============

export interface CardDrawnPayload {
  /** Cards that were drawn */
  cards: Card[];
  /** Number originally requested */
  requestedCount: number;
  /** Whether the deck was reshuffled from discard */
  reshuffled: boolean;
}

export interface CardPlayedPayload {
  /** The card that was played */
  card: Card;
  /** Where the card was played (e.g., discard, board, etc.) */
  target?: string;
  /** Additional play context (e.g., declaredColor for wild cards) */
  playContext?: Record<string, unknown>;
}

export interface CardDiscardedPayload {
  /** Cards that were discarded */
  cards: Card[];
}

export interface BeforeCardDrawPayload {
  /** Number of cards requested to draw */
  requestedCount: number;
}

export interface BeforeCardPlayPayload {
  /** The card about to be played */
  card: Card;
  /** Player's current hand */
  hand: Card[];
}

export interface BeforeAddToHandPayload {
  /** Cards about to be added to hand */
  cards: Card[];
}

export interface CardsAddedToHandPayload {
  /** Cards that were added to hand */
  cards: Card[];
}

export interface CardsRemovedFromHandPayload {
  /** Cards that were removed from hand */
  cards: Card[];
}

// ============ Typed interface for dependents ============

/**
 * Hook methods defined by the cards core mechanic.
 * Mechanics that declare `requires: ['cards']` can implement these.
 *
 * Use intersection typing for type safety:
 * ```typescript
 * const myMechanic: MechanicHooks & CardsHooks = { ... };
 * ```
 */
export interface FilterPlayableCardsPayload {
  /** The candidate cards to filter */
  cards: Card[];
}

export interface CardsHooks {
  onCardDrawn?(ctx: HookContext, payload: CardDrawnPayload): StateChanges | null;
  onCardPlayed?(ctx: HookContext, payload: CardPlayedPayload): StateChanges | null;
  onCardDiscarded?(ctx: HookContext, payload: CardDiscardedPayload): StateChanges | null;
  onBeforeCardDraw?(ctx: HookContext, payload: BeforeCardDrawPayload): { blocked?: boolean; blockReason?: string; count?: number } | null;
  onBeforeCardPlay?(ctx: HookContext, payload: BeforeCardPlayPayload): { blocked?: boolean; blockReason?: string } | null;
  onBeforeAddToHand?(ctx: HookContext, payload: BeforeAddToHandPayload): { blocked?: boolean; blockReason?: string; cards?: Card[] } | null;
  onAfterAddToHand?(ctx: HookContext, payload: CardsAddedToHandPayload): StateChanges | null;
  onAfterRemoveFromHand?(ctx: HookContext, payload: CardsRemovedFromHandPayload): StateChanges | null;
  /** Filter which cards from hand are playable. Return filtered subset or null to skip. */
  filterPlayableCards?(ctx: HookContext, payload: FilterPlayableCardsPayload): Card[] | null;
}

// ============ The mechanic itself ============

export const cardsMechanic: MechanicHooks = {
  slug: 'cards',
  name: 'Cards Core',

  defines: {
    onBeforeCardDraw: {
      description: 'Before drawing cards. Can block or modify draw count.',
      resolution: 'blocking',
    },
    onCardDrawn: {
      description: 'After cards are drawn from deck into hand.',
      resolution: 'merge',
    },
    onBeforeCardPlay: {
      description: 'Before a card is played from hand. Can block the play.',
      resolution: 'blocking',
    },
    onCardPlayed: {
      description: 'After a card is played from hand.',
      resolution: 'merge',
    },
    onCardDiscarded: {
      description: 'After cards are discarded.',
      resolution: 'merge',
    },
    onBeforeAddToHand: {
      description: 'Before cards are added to hand. Can block or filter cards.',
      resolution: 'blocking',
    },
    onAfterAddToHand: {
      description: 'After cards are added to hand.',
      resolution: 'merge',
    },
    onAfterRemoveFromHand: {
      description: 'After cards are removed from hand.',
      resolution: 'merge',
    },
    filterPlayableCards: {
      description: 'Filter which cards from hand are playable for play_card. Returns filtered Card[].',
      resolution: 'first',
    },
  },

  getHighlight(config: unknown): { label: string; value: string }[] | null {
    if (!config || typeof config !== 'object') return null;
    const cfg = config as Record<string, unknown>;
    const deck = cfg.deck;
    if (!Array.isArray(deck)) return null;
    const total = deck.reduce((sum: number, c: Record<string, unknown>) => sum + ((c.count as number) ?? 0), 0);
    if (total <= 0) return null;
    return [{ label: 'Cards', value: String(total) }];
  },

  /**
   * Handle play_card action.
   * Core operation: remove from hand, discard, fire onCardPlayed.
   * Also applies card effects directly (to be extracted to proper
   * mechanics responding to onCardPlayed).
   */
  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    if (ctx.action.type !== 'play_card') return null;

    const { state, playerId } = ctx;
    const playAction = ctx.action as PlayCardAction;

    // Build play context (carries action metadata to onCardPlayed handlers)
    const playContext: Record<string, unknown> = {};
    if (playAction.declaredColor) playContext.declaredColor = playAction.declaredColor;
    if (playAction.target) playContext.actionTarget = playAction.target;

    // Core play: remove from hand, add to discard, fire onCardPlayed
    const result = playCard(state, playerId, playAction.card, playContext);
    if (!result.card) {
      return {
        handled: true,
        advanceTurn: false,
        checkWin: false,
        logMessage: 'play_card_failed',
        logData: { card: playAction.card, error: 'Card not in hand or failed to play' }
      };
    }

    const card = result.card;

    // Card effects are now handled by onCardPlayed responders:
    // - placed-card-effects: probability_boost, probability_penalty, force_discard
    // - take-that: block_turn, skip
    // - card-matching: currentColor
    // The generic applyEffect dispatch has been removed; each mechanic
    // reacts to the card play via the onCardPlayed hook fired by playCard().

    return {
      handled: true,
      advanceTurn: false,  // Let shouldAutoEndTurn / AP mechanic decide
      checkWin: true,
      logMessage: 'play_card',
      logData: {
        card: card.name,
        effect: card.effect,
        declaredColor: playAction.declaredColor,
        actionTarget: playAction.target,
        handSize: state.players[playerId]?.hand.length,
        currentColor: state.shared.currentColor,
        newTopCard: (state.shared.topCard as Card)?.name
      }
    };
  },
};
