/**
 * Set Collection Mechanic
 *
 * Collect matching sets of cards for points/effects.
 *
 * Hooks used:
 * - preValidateAction: Validate collect_set action
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

interface SetDefinition {
  name: string;
  size: number;
}

interface SetCollectionConfig {
  sets: SetDefinition[];
}

export const setCollectionMechanic: MechanicHooks = {
  slug: 'set-collection',
  name: 'Set Collection',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type !== 'collect_set') return null;

    const setConfig = ctx.config.engine_mechanics?.set_collection as SetCollectionConfig | undefined;
    if (!setConfig) {
      return { valid: false, error: 'Set collection is not enabled for this game.' };
    }

    const collectAction = action as { cards: string[]; setType: string };
    const setDef = setConfig.sets.find(s => s.name === collectAction.setType);

    if (!setDef) {
      return {
        valid: false,
        error: `Unknown set type "${collectAction.setType}". Available: ${setConfig.sets.map(s => s.name).join(', ')}`
      };
    }

    // Verify player has all the cards
    for (const cardName of collectAction.cards) {
      if (!ctx.player.hand.find(c => c.name === cardName)) {
        return { valid: false, error: `Card "${cardName}" not in your hand.` };
      }
    }

    // Verify set size matches
    if (collectAction.cards.length !== setDef.size) {
      return {
        valid: false,
        error: `Set "${collectAction.setType}" requires exactly ${setDef.size} cards, you provided ${collectAction.cards.length}.`
      };
    }

    return { valid: true };
  }
};
