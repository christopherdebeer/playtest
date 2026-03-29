/**
 * Turn Order: Stat-Based Mechanic (Phase 3)
 *
 * Determines turn order based on player statistics.
 * Higher or lower values can go first based on configuration.
 *
 * BGG Reference: Turn Order: Stat-Based
 * https://boardgamegeek.com/boardgamemechanic/2830/turn-order-stat-based
 *
 * Config options:
 * - turn_order_stat_based.stat: The stat to sort by ('score', 'resources.gold', etc.)
 * - turn_order_stat_based.descending: Whether higher values go first (default: true)
 * - turn_order_stat_based.trigger: When to reorder ('round_start', 'game_start')
 */

import {
  MechanicHooks,
  TurnOrderContext,
  TurnOrderResult,
  isMechanicEnabled
} from './types.js';

/**
 * Resolve a dot-notation property path on an object.
 * Examples:
 *   getNestedValue(player, 'score')         => player.score
 *   getNestedValue(player, 'resources.gold') => player.resources.gold
 *   getNestedValue(player, 'hand.length')    => player.hand.length
 */
function getNestedValue(obj: unknown, path: string): number {
  if (obj === null || obj === undefined) return 0;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return 0;
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current === 'number') return current;
  if (Array.isArray(current)) return current.length;
  return 0;
}

export const turnOrderStatBasedMechanic: MechanicHooks = {
  slug: 'turn-order-stat-based',
  name: 'Turn Order: Stat-Based',

  /**
   * Determine turn order based on player stat.
   * Supports any property path (e.g., 'score', 'resources.gold', 'hand.length').
   */
  onDetermineTurnOrder(ctx: TurnOrderContext): TurnOrderResult | null {
    if (!isMechanicEnabled(ctx.config, 'turn-order-stat-based')) {
      return null;
    }

    const statConfig = ctx.config.engine_mechanics?.turn_order_stat_based;
    if (!statConfig) return null;

    const stat = statConfig.stat ?? 'score';
    const descending = statConfig.descending ?? true;
    const trigger = statConfig.trigger ?? 'round_start';

    // Only trigger at configured times
    if (ctx.reason === 'round_start' && trigger !== 'round_start' && trigger !== 'both') {
      // Allow game_start (round 1)
      if (!(trigger === 'game_start' && ctx.state.round === 1)) {
        return null;
      }
    }

    // Sort the current turn order by the stat using the generic path resolver
    const sortedOrder = [...ctx.currentOrder].sort((a, b) => {
      const playerA = ctx.state.players[a];
      const playerB = ctx.state.players[b];

      const valueA = getNestedValue(playerA, stat);
      const valueB = getNestedValue(playerB, stat);

      return descending ? valueB - valueA : valueA - valueB;
    });

    return {
      order: sortedOrder
    };
  },

  configSchema: {
    type: 'object',
    description: 'Determines turn order based on player statistics.',
    properties: {
      stat: {
        type: 'string',
        description: 'The stat to sort by (score, resources.gold, hand.length, etc.)',
        default: 'score'
      },
      descending: {
        type: 'boolean',
        description: 'Whether higher values go first',
        default: true
      },
      trigger: {
        type: 'string',
        enum: ['game_start', 'round_start', 'both'],
        description: 'When to reorder',
        default: 'round_start'
      }
    }
  }
};
