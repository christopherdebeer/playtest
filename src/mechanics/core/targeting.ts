/**
 * Targeting Helpers
 *
 * Shared logic for determining whether a card targets opponents,
 * used by both cards.ts (available actions + validation) and
 * effect-dispatcher.ts (fallback targeting).
 */

import type { Card } from '../../types/game.js';

/**
 * Determine if a card is meant to target opponents rather than self.
 * Uses card.targetMode flag when available, falls back to card type check.
 */
export function isOpponentTargeting(card: Card): boolean {
  // Card type "interference" is always opponent-targeting
  if (card.type === 'interference') return true;

  // Use targetMode flag if present
  if (card.targetMode === 'opponents' || card.targetMode === 'all_opponents') return true;

  return false;
}
