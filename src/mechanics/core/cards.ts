/**
 * Cards Core Mechanic
 *
 * Defines the foundational card domain hooks that card-related leaf mechanics implement.
 * Any mechanic that works with cards should declare `requires: ['cards']` and implement
 * the hooks defined here.
 *
 * This mechanic is always enabled. It fires domain-specific hooks alongside the existing
 * global card hooks (onBeforeDraw, onAfterDraw, etc.) as part of the strangler fig
 * migration. Leaf mechanics can implement either the global hooks or the cards-defined
 * hooks during the transition period.
 *
 * Defined hooks:
 * - onCardDrawn: After cards are drawn from deck (merge)
 * - onCardPlayed: After a card is played from hand (merge)
 * - onCardDiscarded: After cards are discarded (merge)
 * - onBeforeCardDraw: Before drawing, can block/modify (blocking)
 * - onBeforeCardPlay: Before playing a card, can block (blocking)
 */

import { MechanicHooks, HookContext, StateChanges } from '../types.js';
import { Card } from '../../types/game.js';

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
export interface CardsHooks {
  onCardDrawn?(ctx: HookContext, payload: CardDrawnPayload): StateChanges | null;
  onCardPlayed?(ctx: HookContext, payload: CardPlayedPayload): StateChanges | null;
  onCardDiscarded?(ctx: HookContext, payload: CardDiscardedPayload): StateChanges | null;
  onBeforeCardDraw?(ctx: HookContext, payload: BeforeCardDrawPayload): { blocked?: boolean; blockReason?: string; count?: number } | null;
  onBeforeCardPlay?(ctx: HookContext, payload: BeforeCardPlayPayload): { blocked?: boolean; blockReason?: string } | null;
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
  },
};
