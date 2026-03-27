/**
 * Effect Dispatcher Core Mechanic
 *
 * Central dispatcher for card effects that aren't handled by specialized mechanics.
 * When a card with an effect is played, this mechanic routes the effect to the
 * appropriate handler via mechanicRegistry.applyEffect(), or handles common effects
 * directly (draw, score, reverse).
 *
 * When no handler exists and a mechanic agent is registered, creates a
 * PendingIntervention instead of silently adding a cosmetic status effect.
 *
 * Hooks used:
 * - onCardPlayed: Dispatch card effects to handlers or apply directly
 */

import {
  MechanicHooks,
  HookContext,
  StateChanges
} from '../types.js';
import type { CardsHooks, CardPlayedPayload } from './cards.js';
import type { GameState, PendingIntervention, ContestState } from '../../types/game.js';
import { drawFromDeck } from './card-piles.js';
import { addToHand } from './hand.js';
import { addEffect } from './effects.js';
import { mechanicRegistry } from '../registry.js';

/**
 * Effect types handled directly by this dispatcher.
 * Other effect types are routed to mechanicRegistry.applyEffect().
 */
const DIRECT_EFFECT_TYPES = ['draw', 'score', 'reverse', 'bonus_worker'];

/**
 * Effect types that target opponents by default
 */
const OPPONENT_TARGETING_EFFECTS = ['draw', 'block_turn', 'skip', 'lose_turn'];

let interventionCounter = 0;

/**
 * Create a PendingIntervention directly on the state object.
 * Avoids circular dependency with game.ts by writing to state.shared directly.
 */
function createPendingIntervention(
  state: GameState,
  effectType: string,
  sourcePlayer: string,
  targetPlayer: string,
  options?: {
    effectValue?: number;
    effectDuration?: number;
    cardName?: string;
    cardDescription?: string;
    context?: string;
  }
): void {
  // Ensure contestState exists
  if (!state.shared.contestState) {
    state.shared.contestState = {
      actionHistory: [],
      contestHistory: [],
      resignations: [],
      victoryHistory: [],
      interventionHistory: []
    };
  }
  const cs = state.shared.contestState as ContestState;
  if (!cs.interventionHistory) {
    cs.interventionHistory = [];
  }

  const intervention: PendingIntervention = {
    id: `intervention-${++interventionCounter}-${Date.now()}`,
    effectType,
    effectValue: options?.effectValue,
    effectDuration: options?.effectDuration,
    sourcePlayer,
    targetPlayer,
    cardName: options?.cardName,
    cardDescription: options?.cardDescription,
    context: options?.context || `Effect "${effectType}" from ${sourcePlayer} targeting ${targetPlayer} has no engine handler`,
    gameState: {
      round: state.round,
      turnNumber: state.turnNumber,
      currentPlayer: state.currentPlayer
    },
    timestamp: new Date().toISOString()
  };

  cs.pendingIntervention = intervention;
}

export const effectDispatcherMechanic: MechanicHooks & CardsHooks = {
  slug: 'effect-dispatcher',
  name: 'Effect Dispatcher',
  requires: ['cards'],

  /**
   * When a card is played, check if it has an effect and dispatch it.
   * This runs after more specific onCardPlayed handlers (take-that, placed-card-effects, etc.)
   * due to the registry ordering. If no other handler has applied the effect,
   * this dispatcher picks it up.
   */
  onCardPlayed(ctx: HookContext, { card, playContext }: CardPlayedPayload): StateChanges | null {
    if (!card.effect?.type) return null;

    const effectType = card.effect.type.toLowerCase();

    // Determine target player
    const actionTarget = playContext?.actionTarget as string | undefined;
    const targetMode = card.targetMode || (OPPONENT_TARGETING_EFFECTS.includes(effectType) ? 'opponents' : 'owner');

    let targetId: string;
    if (actionTarget && ctx.state.players[actionTarget]) {
      targetId = actionTarget;
    } else if (targetMode === 'opponents') {
      // Default to next player in turn order for opponent-targeting effects
      const currentIdx = ctx.state.turnOrder.indexOf(ctx.playerId);
      const nextIdx = (currentIdx + 1) % ctx.state.turnOrder.length;
      targetId = ctx.state.turnOrder[nextIdx];
    } else {
      targetId = ctx.playerId;
    }

    // Handle direct effect types
    switch (effectType) {
      case 'draw': {
        // Force target to draw cards (e.g., UNO Draw Two)
        const count = card.effect.value ?? 2;
        const drawn = drawFromDeck(ctx.state, count, targetId);
        if (drawn.cards.length > 0) {
          addToHand(ctx.state, targetId, drawn.cards);
        }
        return null; // Direct mutation via core services
      }

      case 'score': {
        // Add/subtract score for target
        const value = card.effect.value ?? 1;
        const target = ctx.state.players[targetId];
        if (target) {
          target.score = (target.score ?? 0) + value;
        }
        return null;
      }

      case 'reverse': {
        // Reverse turn order
        ctx.state.turnOrder.reverse();
        return null;
      }

      case 'bonus_worker': {
        // Add a bonus worker to the player
        const target = ctx.state.players[targetId];
        if (target) {
          const workers = (target as unknown as Record<string, unknown>).workers;
          if (typeof workers === 'number') {
            (target as unknown as Record<string, unknown>).workers = workers + (card.effect.value ?? 1);
          }
        }
        return null;
      }

      default:
        break;
    }

    // For effect types not handled directly, try the applyEffect dispatch
    const result = mechanicRegistry.applyEffect(ctx.state, targetId, {
      type: effectType,
      value: card.effect.value,
      duration: card.effect.duration ?? 1,
      source: ctx.playerId
    }, ctx.playerId);

    if (result?.handled) {
      return result.stateChanges ?? null;
    }

    // No engine handler found for this effect type.
    // If a mechanic agent is registered, create a PendingIntervention
    // so the agent can reason about and apply the effect.
    // Otherwise, fall back to cosmetic status effect (legacy behavior).
    if (ctx.state.shared.mechanicAgentId) {
      const cardAny = card as unknown as Record<string, unknown>;
      const effectAny = card.effect as unknown as Record<string, unknown>;
      // Card description may be at card.description or card.effect.description
      const description = (cardAny.description || effectAny.description || card.name) as string;
      createPendingIntervention(ctx.state, effectType, ctx.playerId, targetId, {
        effectValue: card.effect.value,
        effectDuration: card.effect.duration,
        cardName: card.name,
        cardDescription: description,
        context: `${ctx.playerId} played "${card.name}" targeting ${targetId}. Effect type "${effectType}" has no engine handler. Description: ${description}`
      });
      // Don't add cosmetic status effect - let the mechanic agent handle it
    } else if (card.effect.duration && card.effect.duration > 0) {
      // Legacy fallback: add as cosmetic status effect when no mechanic agent
      addEffect(ctx.state, targetId, {
        type: effectType,
        value: card.effect.value,
        duration: card.effect.duration,
        source: ctx.playerId
      });
    }

    return null;
  }
};
