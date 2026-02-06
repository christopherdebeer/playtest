/**
 * Place Card Mechanic
 *
 * Allows placing cards with placeable flag onto board states.
 * Used for traps, buffs, and state-modifying effects.
 *
 * Hooks used:
 * - preValidateAction: Validate place_card action requirements
 * - onExecuteAction: Handle place_card execution
 * - getAvailableActions: Expose place_card actions
 * - describeAction: Describe place_card action
 */

import {
  MechanicHooks,
  HookContext,
  ValidationResult,
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription,
  SharedStateInitContext,
  SharedStateInitResult,
  isMechanicEnabled
} from './types.js';
import { GameAction, PlaceCardAction, PlacedCard, Card } from '../types/game.js';

export const placeCardMechanic: MechanicHooks = {
  slug: 'place-card',
  name: 'Place Card',
  requires: ['cards'],

  initSharedState(_ctx: SharedStateInitContext): SharedStateInitResult | null {
    // Initialize placedCards array for tracking cards placed on board states
    return { placedCards: [] };
  },

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate place_card actions
    if (action.type !== 'place_card') return null;

    const placeAction = action as PlaceCardAction;

    // Check if card exists in hand
    const card = ctx.player.hand.find(c => c.name === placeAction.card);
    if (!card) {
      // Let core validation handle missing card
      return null;
    }

    // Check if card is placeable
    if (!card.placeable) {
      return {
        valid: false,
        error: `Card "${placeAction.card}" cannot be placed on states. Only cards marked as placeable can be used with place_card action.`
      };
    }

    // Check if board config exists
    if (!ctx.config.board) {
      return {
        valid: false,
        error: 'place_card action requires a game with board states defined.'
      };
    }

    // Check if target state is valid
    const validStates = ctx.config.board.states || [];
    if (!validStates.includes(placeAction.targetState)) {
      return {
        valid: false,
        error: `Invalid target state "${placeAction.targetState}". Valid states: ${validStates.join(', ')}`
      };
    }

    return { valid: true };
  },

  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const { action, player, playerId, state } = ctx;

    if (action.type !== 'place_card') return null;

    const placeAction = action as PlaceCardAction;

    // Find and remove card from hand
    const cardIndex = player.hand.findIndex(c => c.name === placeAction.card);
    if (cardIndex === -1) {
      return {
        handled: true,
        stateChanges: {},
        advanceTurn: false,
        checkWin: false,
        logMessage: 'place_card_failed',
        logData: { card: placeAction.card, error: 'Card not in hand' }
      };
    }

    const [card] = player.hand.splice(cardIndex, 1);

    // Verify card is placeable
    if (!card.placeable || !card.effect) {
      // Put card back
      player.hand.push(card);
      return {
        handled: true,
        stateChanges: {},
        advanceTurn: false,
        checkWin: false,
        logMessage: 'place_card_failed',
        logData: { card: placeAction.card, error: 'Card is not placeable' }
      };
    }

    // Create placed card entry
    const placedCard: PlacedCard = {
      cardName: card.name,
      placedBy: playerId,
      state: placeAction.targetState,
      effect: card.effect,
      targetMode: card.targetMode ?? 'opponents',
      triggersRemaining: card.effect.duration
    };

    // Add to placed cards list
    const placedCards = (state.shared.placedCards || []) as PlacedCard[];
    placedCards.push(placedCard);

    return {
      handled: true,
      stateChanges: {
        sharedStateChanges: {
          placedCards: placedCards
        }
      },
      advanceTurn: true,
      checkWin: false,
      logMessage: 'card_placed',
      logData: {
        card: placedCard.cardName,
        targetState: placedCard.state,
        targetMode: placedCard.targetMode,
        effect: placedCard.effect
      }
    };
  },

  getAvailableActions(ctx: HookContext): AvailableAction[] {
    // Check if board config exists
    if (!ctx.config.board) return [];

    const validStates = ctx.config.board.states || [];
    if (validStates.length === 0) return [];

    // Get placeable cards from hand
    const placeableCards = ctx.player.hand.filter((c: Card) => c.placeable);
    if (placeableCards.length === 0) return [];

    // Generate one action per placeable card per valid state
    const actions: AvailableAction[] = [];

    for (const card of placeableCards) {
      for (const targetState of validStates) {
        actions.push({
          action: {
            type: 'place_card',
            card: card.name,
            targetState
          } as GameAction,
          priority: 35,
          category: 'placement'
        });
      }
    }

    return actions;
  },

  describeAction(action: GameAction): ActionDescription | null {
    if (action.type !== 'place_card') return null;

    const placeAction = action as PlaceCardAction;
    return {
      type: 'place_card',
      label: 'Place Card',
      description: `Place a card with an effect onto a board state. The effect will trigger when players move to that state.${placeAction.card ? ` Card: ${placeAction.card}` : ''}${placeAction.targetState ? ` Target: ${placeAction.targetState}` : ''}`,
      examples: ['place_card card:"Trap" targetState:"Forest"', 'place_card card:"Blessing" targetState:"Castle"']
    };
  }
};
