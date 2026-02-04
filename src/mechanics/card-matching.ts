/**
 * Card Matching Mechanic
 *
 * Handles UNO-style card matching where players must play cards that match
 * by color, value, or use wild cards with declared colors.
 *
 * This extracts hardcoded card matching logic from game.ts to enable
 * game.ts agnosticism regarding card types and color mechanics.
 *
 * Hooks used:
 * - initSharedState: Initialize currentColor from top card
 * - preValidateAction: Validate card matches current color/top card
 * - postExecuteAction: Update currentColor after wild card play
 */

import {
  MechanicHooks,
  HookContext,
  ValidationResult,
  StateChanges,
  SharedStateInitContext,
  SharedStateInitResult,
  isMechanicEnabled
} from './types.js';
import { GameAction, Card } from '../types/game.js';

interface CardMatchingConfig {
  /** Colors available in the game */
  colors?: string[];
  /** Whether number/value matching is enabled */
  value_matching?: boolean;
  /** Whether action type matching is enabled */
  action_matching?: boolean;
  /** Whether to allow any card when no color is set */
  allow_any_when_no_color?: boolean;
}

const DEFAULT_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];

export const cardMatchingMechanic: MechanicHooks = {
  slug: 'card-matching',
  name: 'Card Matching (UNO-style)',

  configSchema: {
    type: 'object',
    description: 'UNO-style card matching with color and value rules',
    properties: {
      colors: {
        type: 'array',
        description: 'Available colors (default: Red, Blue, Green, Yellow)'
      },
      value_matching: {
        type: 'boolean',
        description: 'Allow matching by card value/number (default: true)'
      },
      action_matching: {
        type: 'boolean',
        description: 'Allow matching by action type (default: true)'
      },
      allow_any_when_no_color: {
        type: 'boolean',
        description: 'Allow any card when no currentColor is set (default: true)'
      }
    }
  },

  /**
   * Initialize shared state with currentColor
   */
  initSharedState(ctx: SharedStateInitContext): SharedStateInitResult | null {
    if (!isMechanicEnabled(ctx.config, 'card-matching')) return null;

    // Initialize currentColor as null - will be set when first card is played
    // Game initialization will set topCard separately, and postExecuteAction
    // will update currentColor when cards are played
    return {
      currentColor: null
    };
  },

  /**
   * Validate that played card matches current color/top card
   */
  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (!isMechanicEnabled(ctx.config, 'card-matching')) return null;
    if (action.type !== 'play_card') return null;

    const playAction = action as { type: 'play_card'; card: string; declaredColor?: string };
    if (!playAction.card) return null;

    const mechanics = ctx.config.engine_mechanics as Record<string, unknown> | undefined;
    const config = mechanics?.card_matching as CardMatchingConfig | undefined;
    const validColors = config?.colors ?? DEFAULT_COLORS;
    const valueMatching = config?.value_matching ?? true;
    const actionMatching = config?.action_matching ?? true;
    const allowAnyWhenNoColor = config?.allow_any_when_no_color ?? true;

    // Find the card in player's hand
    const card = ctx.player.hand?.find((c: Card) =>
      c.name === playAction.card || c.name.toLowerCase() === playAction.card.toLowerCase()
    );

    if (!card) {
      // Let game.ts handle "card not in hand" error
      return null;
    }

    const currentColor = ctx.state.shared.currentColor as string | null;
    const topCard = ctx.state.shared.topCard as Card | null;

    // Wild card handling
    if (card.type === 'wild') {
      if (!playAction.declaredColor) {
        return {
          valid: false,
          error: `Wild cards require "declaredColor" field. Specify: ${validColors.join(', ')}`
        };
      }
      if (!validColors.includes(playAction.declaredColor)) {
        return {
          valid: false,
          error: `Invalid color "${playAction.declaredColor}". Valid colors: ${validColors.join(', ')}`
        };
      }
      // Wild cards are always playable with valid declared color
      return { valid: true };
    }

    // If no color constraint, allow any card
    if (!currentColor && allowAnyWhenNoColor) {
      return { valid: true };
    }

    // Check color match
    const cardColor = card.effect?.color;
    const colorMatch = cardColor === currentColor;

    // Check value/number match
    let valueMatch = false;
    if (valueMatching && topCard) {
      const cardValue = card.value ?? card.effect?.value;
      const topValue = topCard.value ?? topCard.effect?.value;
      valueMatch = cardValue !== undefined && cardValue === topValue;
    }

    // Check action type match
    let actionMatch = false;
    if (actionMatching && topCard) {
      const cardActionType = card.effect?.type;
      const topActionType = topCard.effect?.type;
      actionMatch = card.type === 'action' && topCard.type === 'action' &&
                   cardActionType !== undefined && cardActionType === topActionType;
    }

    if (!colorMatch && !valueMatch && !actionMatch) {
      const matchOptions = ['matching color'];
      if (valueMatching) matchOptions.push('value');
      if (actionMatching) matchOptions.push('action type');

      return {
        valid: false,
        error: `Card "${playAction.card}" doesn't match current color (${currentColor || 'none'})` +
               (topCard ? ` or top card (${topCard.name})` : '') +
               `. Play a card with ${matchOptions.join('/')}, or use a wild card.`
      };
    }

    return { valid: true };
  },

  /**
   * Update currentColor after card play
   */
  postExecuteAction(ctx: HookContext, action: GameAction): StateChanges | null {
    if (!isMechanicEnabled(ctx.config, 'card-matching')) return null;
    if (action.type !== 'play_card') return null;

    const playAction = action as { type: 'play_card'; card: string; declaredColor?: string };

    // Get the card that was just played (now top of discard/topCard)
    const topCard = ctx.state.shared.topCard as Card | undefined;
    if (!topCard) return null;

    // If wild card with declared color, update currentColor
    if (topCard.type === 'wild' && playAction.declaredColor) {
      return {
        sharedStateChanges: {
          currentColor: playAction.declaredColor
        }
      };
    }

    // For non-wild cards, update currentColor from card's color
    const cardColor = topCard.effect?.color;
    if (cardColor) {
      return {
        sharedStateChanges: {
          currentColor: cardColor
        }
      };
    }

    return null;
  }
};
