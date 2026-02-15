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
 * Effect types handled directly by this dispatcher (truly universal patterns).
 * These are structural operations that map 1:1 to engine primitives.
 * All other effect types are routed to mechanics or the mechanic agent.
 */
const UNIVERSAL_EFFECT_TYPES = ['draw', 'score', 'reverse'];

/**
 * Effect types that target opponents by default
 */
const OPPONENT_TARGETING_EFFECTS = ['draw', 'block_turn', 'skip', 'lose_turn'];

let interventionCounter = 0;

/**
 * Create a PendingIntervention directly on the state object.
 * Avoids circular dependency with game.ts by writing to state.shared directly.
 */
export function createEffectIntervention(
  state: GameState,
  triggerType: 'effect' | 'action' | 'location' | 'lifecycle',
  effectType: string,
  sourcePlayer: string,
  targetPlayer: string,
  options?: {
    effectValue?: number;
    effectDuration?: number;
    cardName?: string;
    cardDescription?: string;
    locationName?: string;
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

  const defaultContexts: Record<string, string> = {
    effect: `Effect "${effectType}" from ${sourcePlayer} targeting ${targetPlayer} has no engine handler`,
    action: `Action "${effectType}" from ${sourcePlayer} has no engine handler`,
    location: `Location effect "${effectType}" at "${options?.locationName}" for ${targetPlayer} has no engine handler`,
    lifecycle: `Lifecycle effect "${effectType}" for ${targetPlayer} has no engine handler`,
  };

  const intervention: PendingIntervention = {
    id: `intervention-${++interventionCounter}-${Date.now()}`,
    triggerType,
    effectType,
    effectValue: options?.effectValue,
    effectDuration: options?.effectDuration,
    sourcePlayer,
    targetPlayer,
    cardName: options?.cardName,
    cardDescription: options?.cardDescription,
    locationName: options?.locationName,
    context: options?.context || defaultContexts[triggerType],
    gameState: {
      round: state.round,
      turnNumber: state.turnNumber,
      currentPlayer: state.currentPlayer
    },
    timestamp: new Date().toISOString()
  };

  cs.pendingIntervention = intervention;
}

/**
 * Check if a mechanic agent is registered for this game.
 */
export function hasMechanicAgent(state: GameState): boolean {
  return !!state.shared.mechanicAgentId;
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

    // Handle universal effect types (structural operations that map 1:1 to primitives)
    switch (effectType) {
      case 'draw': {
        const count = card.effect.value ?? 2;
        const drawn = drawFromDeck(ctx.state, count, targetId);
        if (drawn.cards.length > 0) {
          addToHand(ctx.state, targetId, drawn.cards);
        }
        return null;
      }

      case 'score': {
        const value = card.effect.value ?? 1;
        const target = ctx.state.players[targetId];
        if (target) {
          target.score = (target.score ?? 0) + value;
        }
        return null;
      }

      case 'reverse': {
        ctx.state.turnOrder.reverse();
        return null;
      }

      default:
        break;
    }

    // For all other effect types, try the applyEffect dispatch to registered mechanics
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
    if (hasMechanicAgent(ctx.state)) {
      const cardAny = card as unknown as Record<string, unknown>;
      const effectAny = card.effect as unknown as Record<string, unknown>;
      const description = (cardAny.description || effectAny.description || card.name) as string;
      createEffectIntervention(ctx.state, 'effect', effectType, ctx.playerId, targetId, {
        effectValue: card.effect.value,
        effectDuration: card.effect.duration,
        cardName: card.name,
        cardDescription: description,
        context: `${ctx.playerId} played "${card.name}" targeting ${targetId}. Effect type "${effectType}" has no engine handler. Description: ${description}`
      });
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
