/**
 * Card Matching Mechanic Types
 *
 * Game-agnostic card matching rules for validating card plays.
 * Works with cards mechanic to enforce matching constraints.
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CardMatchingConfig {
  /** Enable matching validation */
  enabled: boolean;

  /** How to determine if a card can be played */
  matchRules: MatchRule[];

  /** Cards that can always be played regardless of rules */
  wildTypes?: string[];

  /** Property on card.effect that holds the color */
  colorProperty?: string;

  /** Property on card.effect that holds the value */
  valueProperty?: string;

  /** Allow playing when no valid matches (force draw) */
  mustMatchOrDraw?: boolean;

  /** Initial card to start the discard pile */
  initialCardFromDeck?: boolean;
}

export interface MatchRule {
  /** Rule type */
  type: 'color' | 'value' | 'type' | 'custom';

  /** For custom rules, the property path to compare */
  property?: string;

  /** Whether this rule alone is sufficient (OR) or required (AND) */
  mode: 'any' | 'all';
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CardMatchingGameState {
  /** Current card to match against (top of discard) */
  currentCard: MatchCard | null;

  /** Current declared color (for wild cards) */
  declaredColor?: string;

  /** Play direction (1 = normal, -1 = reversed) */
  direction: 1 | -1;

  /** Number of cards to draw (accumulated from Draw Two/Four) */
  pendingDrawCount: number;
}

export interface MatchCard {
  id: string;
  name: string;
  type?: string;
  color?: string;
  value?: number | string;
  effect?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CardMatchingPlayerState {
  /** Whether player must draw due to no valid plays */
  mustDraw: boolean;

  /** Whether player has drawn this turn (can now pass) */
  hasDrawnThisTurn: boolean;

  /** Skip flag from previous player's action */
  isSkipped: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayMatchedCardAction extends BaseAction {
  type: 'play_matched_card';
  cardId?: string;
  cardName?: string;
  declaredColor?: string; // For wild cards
}

export interface DrawForMatchAction extends BaseAction {
  type: 'draw_for_match';
}

export interface PassAfterDrawAction extends BaseAction {
  type: 'pass_after_draw';
}

export type CardMatchingAction =
  | PlayMatchedCardAction
  | DrawForMatchAction
  | PassAfterDrawAction;

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export interface SkipNextEffect extends BaseEffect {
  type: 'skip_next';
}

export interface ReverseDirectionEffect extends BaseEffect {
  type: 'reverse_direction';
}

export interface SetColorEffect extends BaseEffect {
  type: 'set_color';
  color: string;
}

export type CardMatchingEffect =
  | SkipNextEffect
  | ReverseDirectionEffect
  | SetColorEffect;
