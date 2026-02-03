/**
 * Automatic Resource Growth Mechanic
 *
 * Resources that grow based on their current value (interest, regeneration).
 * Unlike income which adds flat amounts, this multiplies existing values.
 *
 * Supports:
 * - Percentage growth (e.g., 10% interest on gold)
 * - Fixed growth with floor (e.g., +1 per 10 points)
 * - Decay (negative growth rates)
 * - Resource caps
 *
 * Hooks used:
 * - onTurnStart: Apply growth rates at turn/round start
 */

import { MechanicHooks, TurnStartContext, StateChanges } from './types.js';

interface GrowthRule {
  /** Resource to grow */
  resource: string;
  /** Growth rate as decimal (0.1 = 10% growth, -0.05 = 5% decay) */
  rate?: number;
  /** Fixed amount to add per threshold of resource */
  fixed_per?: number;
  /** Threshold for fixed_per (e.g., +1 per 10 points) */
  threshold?: number;
  /** Minimum value after growth */
  min?: number;
  /** Maximum value after growth */
  max?: number;
  /** Whether to round down (floor) or round (default: floor) */
  rounding?: 'floor' | 'round' | 'ceil';
  /** Apply at turn start or round start */
  timing?: 'turn' | 'round';
}

interface AutomaticResourceGrowthConfig {
  /** Growth rules for resources */
  rules: GrowthRule[];
}

function applyGrowth(currentValue: number, rule: GrowthRule): number {
  let newValue = currentValue;

  // Apply percentage rate
  if (rule.rate !== undefined) {
    newValue = currentValue * (1 + rule.rate);
  }

  // Apply fixed per threshold
  if (rule.fixed_per !== undefined && rule.threshold !== undefined && rule.threshold > 0) {
    const multiplier = Math.floor(currentValue / rule.threshold);
    newValue = currentValue + (rule.fixed_per * multiplier);
  }

  // Apply rounding
  const rounding = rule.rounding ?? 'floor';
  if (rounding === 'floor') {
    newValue = Math.floor(newValue);
  } else if (rounding === 'round') {
    newValue = Math.round(newValue);
  } else if (rounding === 'ceil') {
    newValue = Math.ceil(newValue);
  }

  // Apply min/max bounds
  if (rule.min !== undefined) {
    newValue = Math.max(newValue, rule.min);
  }
  if (rule.max !== undefined) {
    newValue = Math.min(newValue, rule.max);
  }

  return newValue;
}

export const automaticResourceGrowthMechanic: MechanicHooks = {
  slug: 'automatic-resource-growth',
  name: 'Automatic Resource Growth',

  configSchema: {
    type: 'object',
    description: 'Resources that grow based on current value (interest, regeneration)',
    properties: {
      rules: {
        type: 'array',
        description: 'Growth rules for resources',
        required: true
      }
    },
    required: ['rules']
  },

  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    const growthConfig = ctx.config.engine_mechanics?.automatic_resource_growth as AutomaticResourceGrowthConfig | undefined;
    if (!growthConfig?.rules) return null;
    if (!ctx.player.resources) return null;

    const newResources = { ...ctx.player.resources };
    let hasChanges = false;

    for (const rule of growthConfig.rules) {
      // Check timing
      const timing = rule.timing ?? 'turn';
      if (timing === 'round' && !ctx.isNewRound) continue;

      const currentValue = newResources[rule.resource];
      if (currentValue === undefined) continue;

      const newValue = applyGrowth(currentValue, rule);

      if (newValue !== currentValue) {
        newResources[rule.resource] = newValue;
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
