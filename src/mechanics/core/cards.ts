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

import {
  MechanicHooks,
  HookContext,
  StateChanges,
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription
} from '../types.js';
import { Card, PlayCardAction, GameAction } from '../../types/game.js';
import { playCard } from './card-piles.js';
import { mechanicRegistry } from '../registry.js';
import { applyStateChanges } from '../registry.js';

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

  /**
   * Handle play_card action.
   * Core operation: remove from hand, discard, fire onCardPlayed.
   * Also applies card effects (strangler fig lift from game.ts - to be
   * extracted to proper mechanics responding to onCardPlayed).
   */
  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    if (ctx.action.type !== 'play_card') return null;

    const { state, playerId } = ctx;
    const playAction = ctx.action as PlayCardAction;

    // Build play context
    const playContext: Record<string, unknown> = {};
    if (playAction.declaredColor) playContext.declaredColor = playAction.declaredColor;

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
    let effectTarget: string | undefined;

    // --- Strangler fig: card effect application (to be extracted to onCardPlayed responders) ---

    // Interference effects: apply to target player
    const interferenceEffects = ['block_turn', 'probability_penalty', 'force_discard', 'skip'];
    const isInterferenceCard = card.type === 'interference' ||
                               (card.effect?.type && interferenceEffects.includes(card.effect.type));

    if (isInterferenceCard && card.effect) {
      const opponents = state.turnOrder.filter(pid => pid !== playerId);
      effectTarget = playAction.target || (opponents.length === 1 ? opponents[0] : undefined);

      if (effectTarget && state.players[effectTarget]) {
        const targetPlayer = state.players[effectTarget];
        const effectDuration = card.effect.duration ?? 1;

        targetPlayer.effects.push({
          type: card.effect.type,
          value: card.effect.value,
          duration: effectDuration,
          source: playerId
        });
      }
    }

    // Non-interference effects: apply via mechanic registry
    const nonInterferenceEffects = ['move_forward', 'move_backward', 'points', 'move', 'teleport'];
    const hasNonInterferenceEffect = card.effect?.type && nonInterferenceEffects.includes(card.effect.type);

    if (hasNonInterferenceEffect && card.effect) {
      const targetPlayer = playAction.target || playerId;
      const effectToApply = {
        type: card.effect.type,
        value: card.effect.value,
        duration: card.effect.duration ?? 1,
        source: playerId
      };
      const effectResult = mechanicRegistry.applyEffect(state, targetPlayer, effectToApply, playerId);
      if (effectResult?.handled) {
        applyStateChanges(state, effectResult.stateChanges || {});
      }
    }

    // Track placed locations for grid-based games
    const gridConfig = state.config.grid as { type?: string } | undefined;
    if (gridConfig && card.type === 'location') {
      if (!state.shared.placedLocations) {
        state.shared.placedLocations = [];
      }
      (state.shared.placedLocations as string[]).push(card.name);
    }

    // --- End strangler fig lift ---

    return {
      handled: true,
      advanceTurn: false,  // Let shouldAutoEndTurn / AP mechanic decide
      checkWin: true,
      logMessage: 'play_card',
      logData: {
        card: card.name,
        effect: card.effect,
        effectTarget,
        declaredColor: playAction.declaredColor,
        handSize: state.players[playerId]?.hand.length,
        currentColor: state.shared.currentColor,
        newTopCard: (state.shared.topCard as Card)?.name
      }
    };
  },
};
