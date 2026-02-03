/**
 * Variable Player Powers Mechanic
 *
 * Assigns unique powers/abilities to each player.
 * Supports random (unique per player) or fixed (by index) assignment.
 *
 * Hooks used:
 * - initPlayerState: Assign power based on config and existing assignments
 */

import { MechanicHooks, PlayerInitResult, PlayerInitContext } from './types.js';

interface Power {
  id: string;
  name: string;
}

interface VariablePowersConfig {
  assignment: 'random' | 'fixed';
  powers: Power[];
}

export const variablePlayerPowersMechanic: MechanicHooks = {
  slug: 'variable-player-powers',
  name: 'Variable Player Powers',

  configSchema: {
    type: 'object',
    description: 'Assign unique powers/abilities to each player',
    properties: {
      assignment: {
        type: 'string',
        description: 'How powers are assigned',
        enum: ['random', 'fixed'],
        required: true
      },
      powers: {
        type: 'array',
        description: 'Available powers with id, name, and description',
        required: true
      }
    },
    required: ['assignment', 'powers']
  },

  initPlayerState(ctx: PlayerInitContext): PlayerInitResult | null {
    const powersConfig = ctx.config.engine_mechanics?.variable_powers as VariablePowersConfig | undefined;
    if (!powersConfig) return null;

    const powers = powersConfig.powers;
    let powerId: string | undefined;

    if (powersConfig.assignment === 'random') {
      // Random assignment - each player gets a different power
      // Check existing players to avoid duplicates
      const usedPowerIds = Object.values(ctx.existingPlayers)
        .map(p => p.powerId)
        .filter((id): id is string => id !== undefined);

      const availablePowers = powers.filter(p => !usedPowerIds.includes(p.id));

      if (availablePowers.length > 0) {
        powerId = availablePowers[Math.floor(Math.random() * availablePowers.length)].id;
      }
    } else if (powersConfig.assignment === 'fixed') {
      // Fixed assignment by player index
      if (ctx.playerIndex < powers.length) {
        powerId = powers[ctx.playerIndex].id;
      }
    }

    if (!powerId) return null;

    return { powerId };
  }
};
