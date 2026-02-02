/**
 * Open Drafting Mechanic
 *
 * Draft cards from a visible display.
 *
 * Hooks used:
 * - preValidateAction: Validate draft action (card in display)
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, Card } from '../types/game.js';

export const openDraftingMechanic: MechanicHooks = {
  slug: 'open-drafting',
  name: 'Open Drafting',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type !== 'draft') return null;

    const draftConfig = ctx.config.engine_mechanics?.open_drafting;
    if (!draftConfig) {
      return { valid: false, error: 'Open drafting is not enabled for this game.' };
    }

    const draftAction = action as { card: string };
    const display = (ctx.state.shared.draftDisplay || []) as Card[];

    if (!display.find(c => c.name === draftAction.card)) {
      return {
        valid: false,
        error: `Card "${draftAction.card}" not in draft display. Available: ${display.map(c => c.name).join(', ')}`
      };
    }

    return { valid: true };
  }
};
