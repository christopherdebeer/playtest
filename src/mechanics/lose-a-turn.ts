/**
 * Lose-a-Turn Mechanic
 *
 * Skip actions via card effects (block_turn, skip, etc.).
 * The primary blocking check is now handled by the engine reading
 * the `blocks_turn` flag on effects. This mechanic provides a
 * preValidateAction guard for explicit blocking effect types as a
 * fallback/compatibility layer.
 *
 * Hooks used:
 * - preValidateAction: Block all actions except pass when player has a blocking effect
 * - isPlayerBlocked: Report whether player is blocked (for engine agnosticism)
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

export const loseATurnMechanic: MechanicHooks = {
  slug: 'lose-a-turn',
  name: 'Lose a Turn',
  requires: ['effects'],

  /**
   * Check if player is blocked from taking actions.
   * Delegates to the engine's blocks_turn flag on effects.
   * Returns true if any effect has blocks_turn === true.
   */
  isPlayerBlocked(ctx: HookContext): boolean | null {
    const hasBlockingEffect = ctx.player.effects.some(e => e.blocks_turn === true);
    return hasBlockingEffect ? true : null;
  },

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Pass is always allowed (it's how blocked players end their turn)
    if (action.type === 'pass') return null;

    // Check for effects with blocks_turn flag
    const blockingEffects = ctx.player.effects.filter(e => e.blocks_turn === true);

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
