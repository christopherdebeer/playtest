/**
 * Targeting Helpers
 *
 * Shared logic for determining whether a card targets opponents,
 * used by both cards.ts (available actions + validation) and
 * effect-dispatcher.ts (fallback targeting).
 */

import type { Card } from '../../types/game.js';

/**
 * Effect types that inherently target opponents (not the caster).
 * This is a known-set heuristic; the description regex below catches
 * game-specific types not listed here.
 */
const OPPONENT_EFFECT_TYPES = new Set([
  'block_turn', 'skip', 'lose_turn',
  'steal_item', 'peek_hand', 'peek_objective', 'block_tile',
]);

/**
 * Description keywords that indicate a card targets another player.
 * Matches phrases like "target player", "adjacent player", "steal from",
 * "peek at target", "opponent", "another player", "enemy".
 */
const TARGETING_KEYWORDS = /\b(target(?:'s|\s+player)?|adjacent\s+player|opponent|steal|peek\s+at\s+target|enemy|another\s+player)\b/i;

/**
 * Determine if a card is meant to target opponents rather than self.
 * Uses card type, effect type, and effect description heuristics.
 */
export function isOpponentTargeting(card: Card): boolean {
  // Card type "interference" is always opponent-targeting
  if (card.type === 'interference') return true;

  // Check effect type against known set
  if (card.effect?.type && OPPONENT_EFFECT_TYPES.has(card.effect.type)) return true;

  // Check effect description for targeting keywords (description is a YAML pass-through)
  const description = (card.effect as Record<string, unknown> | undefined)?.description;
  if (typeof description === 'string' && TARGETING_KEYWORDS.test(description)) return true;

  return false;
}
