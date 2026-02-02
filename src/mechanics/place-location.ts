/**
 * Place Location Mechanic
 *
 * Allows placing location cards onto the grid adjacent to existing locations.
 * Extends the playable grid dynamically.
 *
 * Hooks used:
 * - preValidateAction: Validate place_location action requirements
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

interface GridConfig {
  starting_tile?: string;
}

export const placeLocationMechanic: MechanicHooks = {
  slug: 'place-location',
  name: 'Place Location',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate place_location actions
    if (action.type !== 'place_location') return null;

    const placeAction = action as { card: string; adjacentTo: string };

    // Check if card exists in hand
    const card = ctx.player.hand.find(c => c.name === placeAction.card);
    if (!card) {
      // Let core validation handle missing card
      return null;
    }

    // Check if card is a location type
    if (card.type !== 'location') {
      return {
        valid: false,
        error: `Card "${placeAction.card}" is not a location card. Only location cards can be placed on the grid.`
      };
    }

    // Check if grid config exists
    const gridConfig = ctx.config.engine_mechanics?.grid as GridConfig | undefined;
    if (!gridConfig) {
      return {
        valid: false,
        error: 'place_location action requires a game with grid mechanics defined.'
      };
    }

    // Check if adjacentTo is a valid existing location
    const placedLocations = (ctx.state.shared.placedLocations as string[]) || [];
    const startingTile = gridConfig.starting_tile || 'origin';
    const validLocations = [startingTile, ...placedLocations];

    if (!validLocations.includes(placeAction.adjacentTo)) {
      return {
        valid: false,
        error: `Invalid adjacentTo target "${placeAction.adjacentTo}". Must be an existing location: ${validLocations.join(', ')}`
      };
    }

    return { valid: true };
  }
};
