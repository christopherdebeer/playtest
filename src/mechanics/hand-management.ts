/**
 * Hand Management Mechanic (Updated Proposal 012)
 *
 * Hand size limits and discard policies.
 * Policies: cannot_draw (block), discard_choice, discard_oldest
 *
 * Hooks used:
 * - onBeforeDraw: Block or limit draw based on hand limit policy
 * - onBeforeAddToHand: Block or limit ANY card acquisition (trades, effects, etc.)
 *
 * Note: discard_choice and discard_oldest policies require execution-time
 * handling which remains in game.ts for now (requires state mutation during action).
 */

import { MechanicHooks, DrawContext, DrawHookResult, HandAddContext, HandAddHookResult } from './types.js';

export const handManagementMechanic: MechanicHooks = {
  slug: 'hand-management',
  name: 'Hand Management',

  configSchema: {
    type: 'object',
    description: 'Hand size limits and discard policies',
    properties: {
      hand_limit: {
        type: 'number',
        description: 'Maximum cards allowed in hand'
      },
      hand_limit_policy: {
        type: 'string',
        description: 'Policy when hand limit exceeded',
        enum: ['cannot_draw', 'discard_choice', 'discard_oldest'],
        default: 'cannot_draw'
      }
    }
  },

  onBeforeDraw(ctx: DrawContext): DrawHookResult | null {
    const handLimit = ctx.config.engine_mechanics?.hand_limit as number | undefined;
    if (handLimit === undefined) return null;

    const policy = (ctx.config.engine_mechanics?.hand_limit_policy as string) || 'cannot_draw';

    // Only block/limit if policy is 'cannot_draw'
    if (policy !== 'cannot_draw') return null;

    const player = ctx.state.players[ctx.playerId];
    if (!player) return null;

    const currentHandSize = player.hand.length;
    const maxDrawable = Math.max(0, handLimit - currentHandSize);

    if (maxDrawable === 0) {
      return {
        blocked: true,
        blockReason: `Hand limit (${handLimit}) reached. You have ${currentHandSize} cards and cannot draw more.`
      };
    }

    // If requested count exceeds what we can draw, limit it
    if (ctx.requestedCount > maxDrawable) {
      return {
        count: maxDrawable,
        blockReason: `Draw limited to ${maxDrawable} cards due to hand limit (${handLimit}).`
      };
    }

    return null;
  },

  /**
   * Proposal 012: Enforce hand limit on ALL card acquisition (trades, effects, location draws)
   * This hook runs before ANY cards are added to hand, not just draws.
   */
  onBeforeAddToHand(ctx: HandAddContext): HandAddHookResult | null {
    const handLimit = ctx.config.engine_mechanics?.hand_limit as number | undefined;
    if (handLimit === undefined) return null;

    const policy = (ctx.config.engine_mechanics?.hand_limit_policy as string) || 'cannot_draw';

    const player = ctx.state.players[ctx.playerId];
    if (!player) return null;

    const currentHandSize = player.hand.length;
    const cardsToAdd = ctx.cards.length;
    const wouldExceed = currentHandSize + cardsToAdd > handLimit;

    if (!wouldExceed) return null;

    const maxAddable = Math.max(0, handLimit - currentHandSize);

    if (policy === 'cannot_draw') {
      // Block entirely if at limit
      if (maxAddable === 0) {
        return {
          blocked: true,
          blockReason: `Hand limit (${handLimit}) reached. Cannot add cards to hand.`
        };
      }
      // Otherwise limit the cards being added
      return {
        cards: ctx.cards.slice(0, maxAddable),
        blockReason: `Only ${maxAddable} cards added due to hand limit (${handLimit}).`
      };
    }

    // For discard_choice and discard_oldest, allow cards but they'll be discarded after
    // (handled in game.ts execution-time logic)
    return null;
  }
};
