/**
 * Cards Mechanic Types
 */

import { BaseAction, BaseEffect, EffectDuration } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CardsConfig {
  deck: DeckEntry[];
  startingCards: number;
  handLimit?: number;
  handLimitPolicy?: HandLimitPolicy;
  reshuffleDiscard?: boolean;
  drawOnTurnStart?: number;
}

export interface DeckEntry {
  name: string;
  count: number;
  type?: string;
  subtype?: string;
  effect?: CardEffectDefinition;
  targetRequired?: boolean;
  targetMode?: 'self' | 'opponent' | 'any';
  description?: string;
  // Location card properties (for grid mechanic integration)
  terrain?: string;
  connections?: number;
  entryRequirements?: string[];
  placeable?: boolean;
  requires?: string[];
}

export interface CardEffectDefinition {
  type: string;
  value?: number;
  duration?: number;
}

export type HandLimitPolicy = 'cannot_draw' | 'discard_choice' | 'discard_oldest';

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CardsGameState {
  deck: Card[];
  discardPile: Card[];
}

export interface Card {
  id: string;
  name: string;
  type?: string;
  subtype?: string;
  effect?: CardEffectDefinition;
  targetRequired?: boolean;
  targetMode?: 'self' | 'opponent' | 'any';
  description?: string;
  // Location card properties (for grid mechanic integration)
  terrain?: string;
  connections?: number;
  entryRequirements?: string[];
  placeable?: boolean;
  requires?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface CardsPlayerState {
  hand: Card[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type CardsAction = DrawAction | PlayCardAction | DiscardAction;

export interface DrawAction extends BaseAction {
  type: 'draw';
  count?: number;
}

export interface PlayCardAction extends BaseAction {
  type: 'play_card';
  cardName: string;
  target?: string;
}

export interface DiscardAction extends BaseAction {
  type: 'discard';
  cardName: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type CardsEffect =
  | DrawCardsEffect
  | ForceDiscardEffect
  | StealCardEffect
  | MoveCardToDiscardEffect
  | RemoveCardFromHandEffect;

export interface DrawCardsEffect extends BaseEffect {
  type: 'draw_cards';
  count: number;
}

export interface ForceDiscardEffect extends BaseEffect {
  type: 'force_discard';
  count: number;
}

export interface StealCardEffect extends BaseEffect {
  type: 'steal_card';
  cardName?: string;
}

export interface MoveCardToDiscardEffect extends BaseEffect {
  type: 'move_card_to_discard';
  playerId: string;
  cardId?: string;
  cardName?: string;
}

/**
 * Remove a card from hand without putting it in discard pile.
 * Used when a card is consumed/transformed (e.g., placing a location on the grid).
 */
export interface RemoveCardFromHandEffect extends BaseEffect {
  type: 'remove_card_from_hand';
  playerId: string;
  cardId?: string;
  cardName?: string;
}
