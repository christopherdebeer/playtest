/**
 * Take-That Mechanic
 *
 * Direct attack cards targeting opponents.
 * Handles interference card validation requiring target specification.
 *
 * Hooks used:
 * - preValidateAction: Validate target for interference cards
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, PlayCardAction } from '../types/game.js';

const INTERFERENCE_EFFECTS = ['block_turn', 'probability_penalty', 'force_discard', 'skip'];

export const takeThatMechanic: MechanicHooks = {
  slug: 'take-that',
  name: 'Take That',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate play_card actions
    if (action.type !== 'play_card') return null;

    const playAction = action as PlayCardAction;
    const card = ctx.player.hand.find(c => c.name === playAction.card);

    // Card not found - let core validation handle this
    if (!card) return null;

    // Check if this is an interference card
    const isInterferenceCard = card.type === 'interference' ||
                               (card.effect?.type && INTERFERENCE_EFFECTS.includes(card.effect.type));

    if (!isInterferenceCard) return null;

    const opponents = ctx.state.turnOrder.filter(pid => pid !== ctx.playerId);

    if (opponents.length > 1 && !playAction.target) {
      // Multiple opponents - require explicit target
      return {
        valid: false,
        error: `Interference card "${card.name}" requires a "target" field. Valid targets: ${opponents.join(', ')}`
      };
    }

    if (playAction.target) {
      // Validate target is a valid opponent
      if (!opponents.includes(playAction.target)) {
        return {
          valid: false,
          error: `Invalid target "${playAction.target}". Valid targets: ${opponents.join(', ')}`
        };
      }
    }

    // If only 1 opponent, target is implicit (no need to specify)
    return { valid: true };
  }
};
