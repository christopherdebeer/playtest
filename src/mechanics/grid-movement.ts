/**
 * Grid Movement Mechanic
 *
 * Tile-based movement on a grid of placed locations.
 * Players can only move to locations that have been placed.
 *
 * Hooks used:
 * - preValidateAction: Validate move target is a placed location
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

interface GridConfig {
  type?: string;
  starting_tile?: string;
  adjacency?: string;
}

export const gridMovementMechanic: MechanicHooks = {
  slug: 'grid-movement',
  name: 'Grid Movement',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate move actions
    if (action.type !== 'move') return null;

    const gridConfig = ctx.config.engine_mechanics?.grid as GridConfig | undefined;
    if (!gridConfig) return null;

    const moveAction = action as { target: string };
    const placedLocations = (ctx.state.shared.placedLocations as string[]) || [];
    const startingTile = gridConfig.starting_tile || 'origin';
    const validLocations = [startingTile, ...placedLocations];

    if (!validLocations.includes(moveAction.target)) {
      return {
        valid: false,
        error: `Invalid move target "${moveAction.target}". You can only move to placed locations. Valid: ${validLocations.join(', ')}`
      };
    }

    return { valid: true };
  }
};
