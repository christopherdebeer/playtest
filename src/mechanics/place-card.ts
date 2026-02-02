/**
 * Place Card Mechanic
 *
 * Allows placing cards with placeable flag onto board states.
 * Used for traps, buffs, and state-modifying effects.
 *
 * Hooks used:
 * - preValidateAction: Validate place_card action requirements
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, PlaceCardAction } from '../types/game.js';

export const placeCardMechanic: MechanicHooks = {
  slug: 'place-card',
  name: 'Place Card',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate place_card actions
    if (action.type !== 'place_card') return null;

    const placeAction = action as PlaceCardAction;

    // Check if card exists in hand
    const card = ctx.player.hand.find(c => c.name === placeAction.card);
    if (!card) {
      // Let core validation handle missing card
      return null;
    }

    // Check if card is placeable
    if (!card.placeable) {
      return {
        valid: false,
        error: `Card "${placeAction.card}" cannot be placed on states. Only cards marked as placeable can be used with place_card action.`
      };
    }

    // Check if board config exists
    if (!ctx.config.board) {
      return {
        valid: false,
        error: 'place_card action requires a game with board states defined.'
      };
    }

    // Check if target state is valid
    const validStates = ctx.config.board.states || [];
    if (!validStates.includes(placeAction.targetState)) {
      return {
        valid: false,
        error: `Invalid target state "${placeAction.targetState}". Valid states: ${validStates.join(', ')}`
      };
    }

    return { valid: true };
  }
};
