/**
 * Income Mechanic
 *
 * Automatic resource generation each turn or round.
 * Supports resource caps from engine_mechanics.resources config.
 *
 * Hooks used:
 * - onTurnStart: Generate per_turn and per_round income
 */

import { MechanicHooks, TurnStartContext, StateChanges } from './types.js';
import { GameConfig } from '../types/game.js';

interface ResourceConfig {
  name: string;
  max?: number;
}

export const incomeMechanic: MechanicHooks = {
  slug: 'income',
  name: 'Income',
  requires: ['resources'],

  // Config schema for validation and documentation
  configSchema: {
    type: 'object',
    description: 'Automatic resource generation each turn or round',
    properties: {
      per_turn: {
        type: 'object',
        description: 'Resources to add at the start of each turn'
      },
      per_round: {
        type: 'object',
        description: 'Resources to add at the start of each round'
      }
    }
  },

  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    const incomeConfig = ctx.config.engine_mechanics?.income as {
      per_turn?: Record<string, number>;
      per_round?: Record<string, number>;
    } | undefined;

    if (!incomeConfig) return null;
    if (!ctx.player.resources) return null;

    const resourcesConfig = (ctx.config.engine_mechanics?.resources || []) as ResourceConfig[];
    const newResources = { ...ctx.player.resources };
    let hasChanges = false;

    // Apply per-turn income
    if (incomeConfig.per_turn) {
      for (const [resource, amount] of Object.entries(incomeConfig.per_turn)) {
        newResources[resource] = (newResources[resource] || 0) + amount;

        // Apply resource cap if configured
        const resourceConfig = resourcesConfig.find(r => r.name === resource);
        if (resourceConfig?.max !== undefined) {
          newResources[resource] = Math.min(newResources[resource], resourceConfig.max);
        }
        hasChanges = true;
      }
    }

    // Apply per-round income (only at start of new round)
    if (ctx.isNewRound && incomeConfig.per_round) {
      for (const [resource, amount] of Object.entries(incomeConfig.per_round)) {
        newResources[resource] = (newResources[resource] || 0) + amount;

        const resourceConfig = resourcesConfig.find(r => r.name === resource);
        if (resourceConfig?.max !== undefined) {
          newResources[resource] = Math.min(newResources[resource], resourceConfig.max);
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) return null;

    return {
      playerStateChanges: {
        [ctx.playerId]: {
          resources: newResources
        }
      }
    };
  }
};
