/**
 * Forbidden Items Mechanic
 *
 * Enforces curse penalties on non-Enemy players who hold forbidden items.
 * Forbidden items are identified by effect.type === "enemy_item".
 *
 * Curse effects (applied at turn start):
 * - Cursed Amulet: Holder loses 1 AP per turn (only 2 AP available)
 * - Dark Tome: Holder's hand limit reduced by 1
 * - Shadow Key: Holder cannot use Hidden Path or Hidden Cave
 *
 * The Enemy is immune to all curses.
 *
 * Hooks used:
 * - onTurnStart: Check for forbidden items and apply curse penalties
 */

import {
  MechanicHooks,
  TurnStartContext,
  StateChanges,
} from './types.js';
import type { Card } from '../types/game.js';

/**
 * Map of forbidden item names to their curse effects.
 */
const FORBIDDEN_ITEM_CURSES: Record<string, {
  description: string;
  apReduction?: number;
  handLimitReduction?: number;
}> = {
  'Cursed Amulet': {
    description: 'Lose 1 AP per turn',
    apReduction: 1,
  },
  'Dark Tome': {
    description: 'Hand limit reduced by 1',
    handLimitReduction: 1,
  },
  'Shadow Key': {
    description: 'Cannot use Hidden Path or Hidden Cave',
    // Movement restriction handled by preValidateAction if needed
  },
};

export const forbiddenItemsMechanic: MechanicHooks = {
  slug: 'forbidden-items',
  name: 'Forbidden Items',
  alwaysEnabled: true,  // Harmless no-op when no enemy_item cards exist

  /**
   * At turn start, check if the current player holds any forbidden items.
   * If they are NOT The Enemy, apply curse penalties:
   * - Cursed Amulet: reduce AP by 1
   * - Dark Tome: reduce hand limit by 1 (enforced via effect)
   */
  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    const { state, playerId, player } = ctx;
    const hand: Card[] = player.hand ?? [];

    // Find all forbidden items in hand
    const forbiddenItems = hand.filter(c => c.effect?.type === 'enemy_item');

    // Always reset curse reduction (in case player discarded/traded forbidden items)
    if (forbiddenItems.length === 0) {
      if (player.forbiddenHandLimitReduction) {
        return {
          playerStateChanges: {
            [playerId]: { forbiddenHandLimitReduction: 0 }
          }
        };
      }
      return null;
    }

    // Check if this player is The Enemy (immune to curses)
    const objective = player.objective;
    const isEnemy = objective?.type === 'enemy' || objective?.name === 'The Enemy';

    if (isEnemy) {
      // The Enemy is immune to forbidden item curses
      return null;
    }

    // Apply curse penalties
    const changes: StateChanges = { playerStateChanges: {} };
    let totalApReduction = 0;
    let totalHandLimitReduction = 0;

    for (const item of forbiddenItems) {
      const curse = FORBIDDEN_ITEM_CURSES[item.name];
      if (curse) {
        if (curse.apReduction) {
          totalApReduction += curse.apReduction;
        }
        if (curse.handLimitReduction) {
          totalHandLimitReduction += curse.handLimitReduction;
        }
      }
    }

    // Reduce AP — action-points mechanic resets AP to points_per_turn at turn start,
    // and since all onTurnStart changes are merged (last writer wins), we compute
    // the final value directly from the config base.
    if (totalApReduction > 0) {
      const apConfig = ctx.config.engine_mechanics?.action_points;
      const baseAP = apConfig?.points_per_turn ?? (player.actionPoints ?? 0);
      const rollover = apConfig?.rollover ? (player.actionPoints || 0) : 0;
      const newAP = Math.max(0, baseAP + rollover - totalApReduction);
      changes.playerStateChanges![playerId] = {
        ...changes.playerStateChanges![playerId],
        actionPoints: newAP,
        actionPointsUsed: 0,
      };
    }

    // Store hand limit reduction as a custom field for hand-management to read
    if (totalHandLimitReduction > 0) {
      changes.playerStateChanges![playerId] = {
        ...changes.playerStateChanges![playerId],
        forbiddenHandLimitReduction: totalHandLimitReduction,
      };
    }

    return Object.keys(changes.playerStateChanges!).length > 0 ? changes : null;
  },

  configSchema: {
    type: 'object',
    description: 'Enforces curse penalties on non-Enemy players holding forbidden items.',
    properties: {},
  },

  getHighlight(config: unknown): { label: string; value: string }[] | null {
    return [{ label: 'Curses', value: 'Active' }];
  },
};
