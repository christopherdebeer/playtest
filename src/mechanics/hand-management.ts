/**
 * Hand Management Mechanic
 *
 * Hand size limits and discard policies.
 * Policies: cannot_draw (block), discard_choice, discard_oldest
 *
 * Hooks used:
 * - preValidateAction: Block draw if cannot_draw policy and at limit
 *
 * Note: discard_choice and discard_oldest policies require execution-time
 * handling which remains in game.ts for now (requires state mutation during action).
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, DrawAction } from '../types/game.js';

export const handManagementMechanic: MechanicHooks = {
  slug: 'hand-management',
  name: 'Hand Management',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate draw actions
    if (action.type !== 'draw') return null;

    const handLimit = ctx.config.engine_mechanics?.hand_limit as number | undefined;
    if (handLimit === undefined) return null;

    const policy = (ctx.config.engine_mechanics?.hand_limit_policy as string) || 'cannot_draw';

    // Only block if policy is 'cannot_draw'
    if (policy !== 'cannot_draw') return null;

    const drawAction = action as DrawAction;
    const drawCount = drawAction.count ?? 1;
    const currentHandSize = ctx.player.hand.length;
    const projectedHandSize = currentHandSize + drawCount;

    if (projectedHandSize > handLimit) {
      const maxDrawable = Math.max(0, handLimit - currentHandSize);
      if (maxDrawable === 0) {
        return {
          valid: false,
          error: `Hand limit (${handLimit}) reached. You have ${currentHandSize} cards and cannot draw more.`
        };
      } else {
        return {
          valid: false,
          error: `Drawing ${drawCount} cards would exceed hand limit (${handLimit}). You have ${currentHandSize} cards. Max you can draw: ${maxDrawable}.`
        };
      }
    }

    return { valid: true };
  }
};
