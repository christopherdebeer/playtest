/**
 * Placed Card Effects Mechanic
 *
 * Handles effects from cards placed on board states (traps, buffs, etc.).
 * This removes hardcoded placed card effect handling from game.ts.
 *
 * Hooks used:
 * - applyEffect: Handle placed card effect types (probability_boost, force_discard, etc.)
 */

import {
  MechanicHooks,
  EffectApplicationContext,
  EffectApplicationResult
} from './types.js';

/**
 * Effect types handled by this mechanic (placed card effects)
 */
const PLACED_CARD_EFFECT_TYPES = [
  'probability_boost',
  'probability_penalty',
  'force_discard'
];

export const placedCardEffectsMechanic: MechanicHooks = {
  slug: 'placed-card-effects',
  name: 'Placed Card Effects',

  /**
   * Apply placed card effects.
   * Handles probability modifiers and force_discard effects.
   */
  applyEffect(ctx: EffectApplicationContext): EffectApplicationResult | null {
    const { state, playerId, effect } = ctx;
    const effectType = effect.type.toLowerCase();

    // Only handle placed card effect types
    if (!PLACED_CARD_EFFECT_TYPES.includes(effectType)) {
      return null;
    }

    const player = state.players[playerId];

    switch (effectType) {
      case 'probability_boost': {
        // Positive probability modifier - adds to movement success chance
        // Uses dynamic property since probabilityModifier is not in base PlayerState type
        const boostValue = effect.value ?? 0.1;
        const playerAny = player as unknown as Record<string, unknown>;
        const currentMod = (playerAny.probabilityModifier as number) ?? 0;
        playerAny.probabilityModifier = currentMod + boostValue;

        return {
          handled: true,
          logMessage: 'probability_boost_applied',
          logData: {
            boost: boostValue,
            newModifier: currentMod + boostValue
          }
        };
      }

      case 'probability_penalty': {
        // Negative probability modifier - reduces movement success chance
        const penaltyValue = effect.value ?? -0.1;
        const playerAny = player as unknown as Record<string, unknown>;
        const currentMod = (playerAny.probabilityModifier as number) ?? 0;
        playerAny.probabilityModifier = currentMod + penaltyValue;

        return {
          handled: true,
          logMessage: 'probability_penalty_applied',
          logData: {
            penalty: penaltyValue,
            newModifier: currentMod + penaltyValue
          }
        };
      }

      case 'force_discard': {
        // Force player to discard a card
        if (player.hand.length === 0) {
          return {
            handled: true,
            logMessage: 'force_discard_no_cards',
            logData: { reason: 'empty_hand' }
          };
        }

        // Discard random card (or oldest if specified)
        const discardIndex = Math.floor(Math.random() * player.hand.length);
        const [discardedCard] = player.hand.splice(discardIndex, 1);
        state.discardPile.push(discardedCard);

        return {
          handled: true,
          logMessage: 'force_discard',
          logData: {
            discardedCard: discardedCard.name,
            remainingHandSize: player.hand.length
          }
        };
      }

      default:
        return null;
    }
  }
};
