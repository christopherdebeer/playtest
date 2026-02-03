/**
 * Lose-a-Turn Mechanic
 *
 * Skip actions via card effects (block_turn, skip, etc.).
 * Checks player effects to determine if they're blocked from acting.
 *
 * Hooks used:
 * - preValidateAction: Block all actions except pass when player has blocking effect
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

const BLOCKING_EFFECT_TYPES = ['block_turn', 'block', 'skip'];

export const loseATurnMechanic: MechanicHooks = {
  slug: 'lose-a-turn',
  name: 'Lose a Turn',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Pass is always allowed (it's how blocked players end their turn)
    if (action.type === 'pass') return null;

    // Check for blocking effects on the player
    const blockingEffects = ctx.player.effects.filter(e => {
      const effectType = e.type.toLowerCase();
      return BLOCKING_EFFECT_TYPES.includes(effectType);
    });

    if (blockingEffects.length > 0) {
      const effectNames = blockingEffects.map(e => e.type).join(', ');
      return {
        valid: false,
        error: `You are blocked this turn by effect: ${effectNames}. You can only pass.`
      };
    }

    return null;
  }
};
