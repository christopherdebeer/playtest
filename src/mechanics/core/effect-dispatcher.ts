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
 * At turn start, scans the current player's active effects for types not handled
 * by any engine mechanic. Creates lifecycle interventions so the mechanic agent
 * can interpret per-turn effects (e.g., "poison deals 1 damage each turn").
 *
 * Hooks used:
 * - onCardPlayed: Dispatch card effects to handlers or apply directly
 * - onTurnStart: Create lifecycle interventions for unhandled active effects
 */

import {
  MechanicHooks,
  HookContext,
  TurnStartContext,
  StateChanges
} from '../types.js';
import type { CardsHooks, CardPlayedPayload } from './cards.js';
import type { GameState, PendingIntervention, ContestState } from '../../types/game.js';
import { drawFromDeck } from './card-piles.js';
import { addToHand } from './hand.js';
import { addEffect } from './effects.js';
import { mechanicRegistry } from '../registry.js';
import { isOpponentTargeting } from './targeting.js';

/**
 * Effect types handled directly by this dispatcher (truly universal patterns).
 * These are structural operations that map 1:1 to engine primitives.
 * All other effect types are routed to mechanics or the mechanic agent.
 */
const UNIVERSAL_EFFECT_TYPES = ['draw', 'score', 'reverse'];

/**
 * Effect types that target opponents by default.
 * Used as a fallback when targeting cannot be inferred from the card itself
 * (e.g., when the effect-dispatcher only has the effect type, not the full card).
 */
const OPPONENT_TARGETING_EFFECTS = new Set([
  'draw', 'block_turn', 'skip', 'lose_turn',
  'steal_item', 'peek_hand', 'peek_objective', 'block_tile',
]);

/**
 * Effect types passively handled by the engine (checked during movement, blocking, etc.).
 * These don't need per-turn lifecycle interventions because their presence is
 * already checked by engine code paths (isBlocked, probability mods, etc.).
 */
const KNOWN_PASSIVE_EFFECTS = new Set([
  'block_turn', 'skip', 'lose_turn', 'stunned', 'frozen', 'eliminated',
  'probability_boost', 'probability_penalty',
]);

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
      currentPlayer: state.currentPlayer,
      turnOrder: state.turnOrder,
      players: Object.fromEntries(
        Object.entries(state.players).map(([pid, ps]) => [pid, {
          state: ps.state,
          handSize: ps.hand?.length ?? 0,
          effects: ps.effects?.map(e => ({ type: e.type, duration: e.duration, source: e.source })) ?? [],
          score: ps.score ?? 0,
          resources: ps.resources,
        }])
      ),
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

/**
 * Extract a useful description from a card, checking multiple locations.
 * Cards may store descriptions at card.description, card.effect.description,
 * or card.text depending on how the game defines them in RULES.md.
 */
function extractCardDescription(card: Record<string, unknown>): string {
  const effect = card.effect as Record<string, unknown> | undefined;
  return (
    card.description ||
    effect?.description ||
    card.text ||
    card.flavor ||
    card.name ||
    'unknown card'
  ) as string;
}

export const effectDispatcherMechanic: MechanicHooks & CardsHooks = {
  slug: 'effect-dispatcher',
  name: 'Effect Dispatcher',
  requires: ['cards'],

  /**
   * At turn start, scan the current player's active effects for types that
   * no engine mechanic handles. If a mechanic agent is registered, create
   * a lifecycle intervention so the agent can interpret per-turn effects
   * (e.g., "poison deals 1 damage each turn", "regeneration heals 1 HP").
   *
   * Skips known passive effects (blocking markers, probability mods) since
   * those are already checked by engine code paths.
   */
  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    if (!hasMechanicAgent(ctx.state)) return null;

    // Don't create lifecycle interventions if there's already a pending intervention
    const cs = ctx.state.shared.contestState as ContestState | undefined;
    if (cs?.pendingIntervention) return null;

    const activeEffects = ctx.player.effects ?? [];
    if (activeEffects.length === 0) return null;

    // Find effects whose types are not known to the engine
    const unhandledEffects = activeEffects.filter(
      e => !KNOWN_PASSIVE_EFFECTS.has(e.type) && !UNIVERSAL_EFFECT_TYPES.includes(e.type)
    );

    if (unhandledEffects.length === 0) return null;

    // Group all unhandled effects into a single lifecycle intervention
    const effectDescriptions = unhandledEffects.map(
      e => `"${e.type}" (value=${e.value ?? 'none'}, duration=${e.duration}, source=${e.source ?? 'unknown'})`
    ).join('; ');

    createEffectIntervention(ctx.state, 'lifecycle', 'turn_start_effects', ctx.playerId, ctx.playerId, {
      context: `Turn ${ctx.state.turnNumber} start for ${ctx.playerId}. Active effects needing interpretation: ${effectDescriptions}. Read RULES.md to determine what these effects do at the start of the turn and apply any state changes.`
    });

    return null;
  },

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
    const cardIsOpponentTargeting = isOpponentTargeting(card) || OPPONENT_TARGETING_EFFECTS.has(effectType);
    const targetMode = card.targetMode || (cardIsOpponentTargeting ? 'opponents' : 'owner');

    // Helper: pick default opponent (next in turn order)
    const defaultOpponent = (): string => {
      const currentIdx = ctx.state.turnOrder.indexOf(ctx.playerId);
      const nextIdx = (currentIdx + 1) % ctx.state.turnOrder.length;
      return ctx.state.turnOrder[nextIdx];
    };

    let targetId: string;
    if (actionTarget && ctx.state.players[actionTarget]) {
      // Defense-in-depth: reject self-targeting for opponent-targeting cards
      if (actionTarget === ctx.playerId && cardIsOpponentTargeting) {
        targetId = defaultOpponent();
      } else {
        targetId = actionTarget;
      }
    } else if (targetMode === 'opponents') {
      targetId = defaultOpponent();
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
      const description = extractCardDescription(card as unknown as Record<string, unknown>);
      createEffectIntervention(ctx.state, 'effect', effectType, ctx.playerId, targetId, {
        effectValue: card.effect.value,
        effectDuration: card.effect.duration,
        cardName: card.name,
        cardDescription: description,
        context: `${ctx.playerId} played "${card.name}" targeting ${targetId}. Effect type "${effectType}" has no engine handler. Card: ${description}`
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
