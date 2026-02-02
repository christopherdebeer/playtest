/**
 * Push Your Luck Mechanic
 *
 * Risk/reward dice rolling with banking.
 *
 * Hooks used:
 * - preValidateAction: Validate roll and bank actions
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

interface PushYourLuckConfig {
  max_rolls?: number;
}

export const pushYourLuckMechanic: MechanicHooks = {
  slug: 'push-your-luck',
  name: 'Push Your Luck',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type !== 'roll' && action.type !== 'bank') return null;

    const pylConfig = ctx.config.engine_mechanics?.push_your_luck as PushYourLuckConfig | undefined;
    if (!pylConfig) {
      return { valid: false, error: 'Push your luck is not enabled for this game.' };
    }

    if (action.type === 'bank') {
      const accumulated = ctx.player.rollAccumulator ?? 0;
      if (accumulated === 0) {
        return { valid: false, error: 'No accumulated points to bank. Roll first!' };
      }
    }

    if (action.type === 'roll') {
      const rollCount = ctx.player.rollCount ?? 0;
      if (pylConfig.max_rolls && rollCount >= pylConfig.max_rolls) {
        return { valid: false, error: `Maximum rolls (${pylConfig.max_rolls}) reached. You must bank.` };
      }
    }

    return { valid: true };
  }
};
