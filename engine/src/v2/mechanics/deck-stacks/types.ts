/**
 * Deck Stacks Mechanic Types
 *
 * Handles multiple card piles/stacks with shuffle-reload.
 * Supports: deck, discard, play surface, etc.
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface DeckStacksConfig {
  stacks: StackDefinition[];
  shuffleReloadFrom?: string; // When main deck empty, shuffle this stack into deck
  topCardVisible?: string; // Which stack's top card is visible (e.g., 'play' for UNO)
}

export interface StackDefinition {
  name: string;
  startsWith?: 'empty' | 'deck' | number; // Initial state
  faceUp?: boolean; // Is stack visible?
  topOnly?: boolean; // Only top card visible?
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface DeckStacksGameState {
  stacks: Record<string, StackState>;
  topCard?: StackCard; // Currently visible top card (for matching)
}

export interface StackState {
  cards: StackCard[];
  faceUp: boolean;
  topOnly: boolean;
}

export interface StackCard {
  id: string;
  name: string;
  color?: string;
  value?: number;
  type?: string;
  effect?: CardEffect;
}

export interface CardEffect {
  type: string;
  color?: string;
  value?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface DeckStacksPlayerState {
  // Player-specific stacks if needed (usually empty for shared stacks)
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type DeckStacksAction =
  | DrawFromStackAction
  | PlayToStackAction
  | ShuffleStackAction;

export interface DrawFromStackAction extends BaseAction {
  type: 'draw_from_stack';
  stackName: string;
  count?: number;
}

export interface PlayToStackAction extends BaseAction {
  type: 'play_to_stack';
  stackName: string;
  cardId: string;
  declaredColor?: string; // For wild cards
}

export interface ShuffleStackAction extends BaseAction {
  type: 'shuffle_stack';
  sourceStack: string;
  targetStack: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type DeckStacksEffect =
  | RefillDeckEffect
  | SetTopCardEffect
  | ClearStackEffect;

export interface RefillDeckEffect extends BaseEffect {
  type: 'refill_deck';
  fromStack: string;
}

export interface SetTopCardEffect extends BaseEffect {
  type: 'set_top_card';
  card: StackCard;
}

export interface ClearStackEffect extends BaseEffect {
  type: 'clear_stack';
  stackName: string;
}
