/**
 * Cards Mechanic
 *
 * Core card game mechanics: deck, hands, draw, play, discard.
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  ActionContext,
  ExecutionResult,
  ActionAvailability,
  EffectContext,
  EffectResult,
  WinConditionResult,
  LogEvent,
  InitContext,
  ok,
  err,
  validResult,
  invalidResult,
} from '../../core/types.js';
import { Mechanic, MechanicRegistryView, JsonSchema, defineMechanic } from '../../core/mechanic.js';
import {
  CardsConfig,
  CardsGameState,
  CardsPlayerState,
  CardsAction,
  CardsEffect,
  Card,
  DeckEntry,
  DrawAction,
  PlayCardAction,
  DiscardAction,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildDeck(entries: DeckEntry[], random: () => number): Card[] {
  const cards: Card[] = [];
  let idCounter = 0;

  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) {
      cards.push({
        id: `card-${idCounter++}`,
        name: entry.name,
        type: entry.type,
        effect: entry.effect,
        targetRequired: entry.targetRequired,
        targetMode: entry.targetMode,
        description: entry.description,
      });
    }
  }

  // Shuffle using Fisher-Yates
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

function shuffleDeck(deck: Card[], random: () => number): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCardFromHand(hand: Card[], cardName: string): { card: Card; index: number } | null {
  const index = hand.findIndex(c => c.name === cardName);
  if (index === -1) return null;
  return { card: hand[index], index };
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const cardsMechanic = defineMechanic<
  'cards',
  CardsConfig,
  CardsGameState,
  CardsPlayerState,
  CardsAction,
  CardsEffect
>({
  slug: 'cards',
  version: '1.0.0',
  displayName: 'Cards',
  description: 'Core card game mechanics: deck, hands, draw, play, discard',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<CardsConfig, ValidationError[]> {
    const config = raw as CardsConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Cards config is required' }]);
    }

    if (!config.deck || !Array.isArray(config.deck)) {
      errors.push({ path: 'deck', message: 'deck must be an array' });
    } else if (config.deck.length === 0) {
      errors.push({ path: 'deck', message: 'deck cannot be empty' });
    } else {
      for (let i = 0; i < config.deck.length; i++) {
        const entry = config.deck[i];
        if (!entry.name) {
          errors.push({ path: `deck[${i}].name`, message: 'card name is required' });
        }
        if (typeof entry.count !== 'number' || entry.count < 1) {
          errors.push({ path: `deck[${i}].count`, message: 'count must be a positive number' });
        }
      }
    }

    if (typeof config.startingCards !== 'number' || config.startingCards < 0) {
      errors.push({ path: 'startingCards', message: 'startingCards must be a non-negative number' });
    }

    if (config.handLimit !== undefined && (typeof config.handLimit !== 'number' || config.handLimit < 1)) {
      errors.push({ path: 'handLimit', message: 'handLimit must be a positive number' });
    }

    if (config.handLimitPolicy && !['cannot_draw', 'discard_choice', 'discard_oldest'].includes(config.handLimitPolicy)) {
      errors.push({ path: 'handLimitPolicy', message: 'invalid handLimitPolicy' });
    }

    if (errors.length > 0) return err(errors);
    return ok(config);
  },

  validateConfig(config: CardsConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];

    const totalCards = config.deck.reduce((sum, d) => sum + d.count, 0);
    const playerCount = registry.getPlayerCount();
    const minCardsNeeded = config.startingCards * playerCount;

    if (totalCards < minCardsNeeded) {
      errors.push({
        path: 'deck',
        message: `Not enough cards (${totalCards}) for ${playerCount} players with ${config.startingCards} starting cards (need ${minCardsNeeded})`,
      });
    }

    // Validate card effects reference valid targets
    for (const entry of config.deck) {
      if (entry.targetRequired && !entry.targetMode) {
        errors.push({
          path: `deck`,
          message: `Card "${entry.name}" requires target but has no targetMode`,
        });
      }
    }

    return errors;
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['deck', 'startingCards'],
      properties: {
        deck: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'count'],
            properties: {
              name: { type: 'string' },
              count: { type: 'number', minimum: 1 },
              type: { type: 'string' },
              effect: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'number' },
                  duration: { type: 'number' },
                },
              },
              targetRequired: { type: 'boolean' },
              targetMode: { type: 'string', enum: ['self', 'opponent', 'any'] },
              description: { type: 'string' },
            },
          },
        },
        startingCards: { type: 'number', minimum: 0 },
        handLimit: { type: 'number', minimum: 1 },
        handLimitPolicy: { type: 'string', enum: ['cannot_draw', 'discard_choice', 'discard_oldest'] },
        reshuffleDiscard: { type: 'boolean' },
        drawOnTurnStart: { type: 'number', minimum: 0 },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: CardsConfig, context: InitContext): CardsGameState {
    const deck = buildDeck(config.deck, context.random);
    return { deck, discardPile: [] };
  },

  initPlayerState(config: CardsConfig, playerId: string, context: InitContext): CardsPlayerState {
    return { hand: [] };
  },

  onGameStart(
    config: CardsConfig,
    ctx: ActionContext<CardsGameState, CardsPlayerState>
  ): ExecutionResult<CardsGameState, CardsPlayerState> {
    const gameState = ctx.gameState;
    const events: LogEvent[] = [];
    const playerStateChanges: Record<string, Partial<CardsPlayerState>> = {};

    // Deal starting cards
    let deckIndex = 0;
    for (const playerId of ctx.state.turnOrder) {
      const hand = gameState.deck.slice(deckIndex, deckIndex + config.startingCards);
      deckIndex += config.startingCards;
      playerStateChanges[playerId] = { hand };
      events.push({
        timestamp: ctx.timestamp,
        event: 'cards_dealt',
        player: playerId,
        data: { count: hand.length },
      });
    }

    return {
      success: true,
      gameStateChanges: { deck: gameState.deck.slice(deckIndex) },
      playerStateChanges,
      events,
      nextTurn: { type: 'same_player' },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly CardsAction['type'][] {
    return ['draw', 'play_card', 'discard'] as const;
  },

  validateAction(
    ctx: ActionContext<CardsGameState, CardsPlayerState>,
    action: CardsAction
  ): ValidationResult {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardsConfig>('cards')!;

    switch (action.type) {
      case 'draw': {
        const count = action.count ?? 1;
        const available = gameState.deck.length + (config.reshuffleDiscard ? gameState.discardPile.length : 0);

        if (available < count) {
          return invalidResult([{
            code: 'DECK_EMPTY',
            message: `Cannot draw ${count} cards: only ${available} available`,
          }]);
        }

        if (config.handLimit && config.handLimitPolicy === 'cannot_draw') {
          if (playerState.hand.length + count > config.handLimit) {
            return invalidResult([{
              code: 'HAND_LIMIT',
              message: `Cannot draw: would exceed hand limit of ${config.handLimit}`,
              suggestion: 'Discard cards first',
            }]);
          }
        }

        return validResult();
      }

      case 'play_card': {
        const found = getCardFromHand(playerState.hand, action.cardName);
        if (!found) {
          return invalidResult([{
            code: 'CARD_NOT_IN_HAND',
            message: `Card "${action.cardName}" is not in your hand`,
            suggestion: `Your hand: ${playerState.hand.map(c => c.name).join(', ')}`,
          }]);
        }

        const { card } = found;
        if (card.targetRequired && !action.target) {
          return invalidResult([{
            code: 'TARGET_REQUIRED',
            message: `Card "${action.cardName}" requires a target`,
          }]);
        }

        if (action.target && card.targetMode) {
          const isOpponent = action.target !== ctx.playerId;
          if (card.targetMode === 'self' && isOpponent) {
            return invalidResult([{ code: 'INVALID_TARGET', message: 'Card can only target yourself' }]);
          }
          if (card.targetMode === 'opponent' && !isOpponent) {
            return invalidResult([{ code: 'INVALID_TARGET', message: 'Card can only target opponents' }]);
          }
        }

        return validResult();
      }

      case 'discard': {
        const found = getCardFromHand(playerState.hand, action.cardName);
        if (!found) {
          return invalidResult([{
            code: 'CARD_NOT_IN_HAND',
            message: `Card "${action.cardName}" is not in your hand`,
          }]);
        }
        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<CardsGameState, CardsPlayerState>,
    action: CardsAction
  ): ExecutionResult<CardsGameState, CardsPlayerState> {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardsConfig>('cards')!;

    switch (action.type) {
      case 'draw': {
        const count = action.count ?? 1;
        let deck = [...gameState.deck];
        let discardPile = [...gameState.discardPile];

        // Reshuffle if needed
        if (deck.length < count && config.reshuffleDiscard) {
          deck = [...deck, ...shuffleDeck(discardPile, ctx.random)];
          discardPile = [];
        }

        const drawn = deck.slice(0, count);
        const newDeck = deck.slice(count);
        const newHand = [...playerState.hand, ...drawn];

        return {
          success: true,
          message: `Drew ${count} card${count > 1 ? 's' : ''}`,
          gameStateChanges: { deck: newDeck, discardPile },
          playerStateChanges: { [ctx.playerId]: { hand: newHand } },
          events: [{
            timestamp: ctx.timestamp,
            event: 'cards_drawn',
            player: ctx.playerId,
            data: { count, deckRemaining: newDeck.length },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'play_card': {
        const found = getCardFromHand(playerState.hand, action.cardName)!;
        const { card, index } = found;
        const newHand = [...playerState.hand];
        newHand.splice(index, 1);

        const effects = card.effect ? [{
          type: card.effect.type,
          value: card.effect.value,
          source: ctx.playerId,
          target: action.target ?? ctx.playerId,
          duration: card.effect.duration ? { type: 'turns' as const, count: card.effect.duration } : undefined,
        }] : [];

        return {
          success: true,
          message: `Played ${card.name}${action.target ? ` targeting ${action.target}` : ''}`,
          gameStateChanges: { discardPile: [...gameState.discardPile, card] },
          playerStateChanges: { [ctx.playerId]: { hand: newHand } },
          events: [{
            timestamp: ctx.timestamp,
            event: 'card_played',
            player: ctx.playerId,
            data: { card: card.name, target: action.target, effect: card.effect },
          }],
          effects,
          nextTurn: { type: 'advance' },
        };
      }

      case 'discard': {
        const found = getCardFromHand(playerState.hand, action.cardName)!;
        const { card, index } = found;
        const newHand = [...playerState.hand];
        newHand.splice(index, 1);

        return {
          success: true,
          message: `Discarded ${card.name}`,
          gameStateChanges: { discardPile: [...gameState.discardPile, card] },
          playerStateChanges: { [ctx.playerId]: { hand: newHand } },
          events: [{
            timestamp: ctx.timestamp,
            event: 'card_discarded',
            player: ctx.playerId,
            data: { card: card.name },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown action type',
          events: [],
          nextTurn: { type: 'same_player' },
        };
    }
  },

  getAvailableActions(
    ctx: ActionContext<CardsGameState, CardsPlayerState>
  ): ActionAvailability<CardsAction>[] {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardsConfig>('cards')!;
    const actions: ActionAvailability<CardsAction>[] = [];

    // Draw action
    const available = gameState.deck.length + (config.reshuffleDiscard ? gameState.discardPile.length : 0);
    const canDraw = available > 0;
    const handLimitBlocked = config.handLimit &&
      config.handLimitPolicy === 'cannot_draw' &&
      playerState.hand.length >= config.handLimit;

    actions.push({
      type: 'draw',
      enabled: canDraw && !handLimitBlocked,
      description: 'Draw cards from the deck',
      reason: !canDraw ? 'Deck is empty' : handLimitBlocked ? `Hand limit reached (${config.handLimit})` : undefined,
      examples: canDraw && !handLimitBlocked ? [{ type: 'draw' } as DrawAction] : [],
    });

    // Play card actions
    if (playerState.hand.length > 0) {
      const examples: PlayCardAction[] = playerState.hand.map(card => {
        if (card.targetRequired && card.targetMode === 'opponent') {
          const opponent = ctx.state.turnOrder.find(p => p !== ctx.playerId);
          return { type: 'play_card', cardName: card.name, target: opponent };
        }
        return { type: 'play_card', cardName: card.name };
      });

      actions.push({
        type: 'play_card',
        enabled: true,
        description: 'Play a card from your hand',
        examples,
      });
    } else {
      actions.push({
        type: 'play_card',
        enabled: false,
        description: 'Play a card from your hand',
        reason: 'No cards in hand',
        examples: [],
      });
    }

    // Discard action
    if (playerState.hand.length > 0) {
      actions.push({
        type: 'discard',
        enabled: true,
        description: 'Discard a card from your hand',
        examples: playerState.hand.map(c => ({ type: 'discard' as const, cardName: c.name })),
      });
    } else {
      actions.push({
        type: 'discard',
        enabled: false,
        description: 'Discard a card from your hand',
        reason: 'No cards in hand',
        examples: [],
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly CardsEffect['type'][] {
    return ['draw_cards', 'force_discard', 'steal_card'] as const;
  },

  applyEffect(
    ctx: EffectContext<CardsGameState, CardsPlayerState>,
    effect: CardsEffect
  ): EffectResult<CardsGameState, CardsPlayerState> {
    const { gameState } = ctx;
    const events: LogEvent[] = [];

    switch (effect.type) {
      case 'draw_cards': {
        const targetId = effect.target ?? ctx.playerId;
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId);
        if (!targetState) return { events: [] };

        const drawn = gameState.deck.slice(0, effect.count);
        const newDeck = gameState.deck.slice(effect.count);
        const newHand = [...targetState.hand, ...drawn];

        events.push({
          timestamp: ctx.timestamp,
          event: 'cards_drawn',
          player: targetId,
          data: { count: effect.count, fromEffect: true, source: effect.source },
        });

        return {
          gameStateChanges: { deck: newDeck },
          playerStateChanges: { [targetId]: { hand: newHand } },
          events,
        };
      }

      case 'force_discard': {
        const targetId = effect.target!;
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId);
        if (!targetState) return { events: [] };

        const discarded = targetState.hand.slice(-effect.count);
        const newHand = targetState.hand.slice(0, -effect.count);

        events.push({
          timestamp: ctx.timestamp,
          event: 'cards_force_discarded',
          player: targetId,
          data: { count: discarded.length, source: effect.source },
        });

        return {
          gameStateChanges: { discardPile: [...gameState.discardPile, ...discarded] },
          playerStateChanges: { [targetId]: { hand: newHand } },
          events,
        };
      }

      case 'steal_card': {
        const sourceId = effect.source!;
        const targetId = effect.target!;
        const sourceState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', sourceId);
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId);
        if (!sourceState || !targetState || targetState.hand.length === 0) return { events: [] };

        const cardIndex = effect.cardName
          ? targetState.hand.findIndex(c => c.name === effect.cardName)
          : Math.floor(ctx.random() * targetState.hand.length);

        if (cardIndex === -1) return { events: [] };

        const stolenCard = targetState.hand[cardIndex];
        const newTargetHand = [...targetState.hand];
        newTargetHand.splice(cardIndex, 1);
        const newSourceHand = [...sourceState.hand, stolenCard];

        events.push({
          timestamp: ctx.timestamp,
          event: 'card_stolen',
          player: sourceId,
          data: { from: targetId, card: stolenCard.name },
        });

        return {
          playerStateChanges: {
            [sourceId]: { hand: newSourceHand },
            [targetId]: { hand: newTargetHand },
          },
          events,
        };
      }

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<CardsGameState, CardsPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<CardsGameState, CardsPlayerState> {
    // Cards mechanic has no duration-based effects
    return { events: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: CardsGameState,
    playerId: string
  ): Record<string, unknown> {
    return {
      deckCount: state.deck.length,
      discardPile: state.discardPile,
    };
  },

  filterPlayerStateForViewer(
    state: CardsPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    if (viewerId === ownerId) {
      return { ...state };
    }
    return { handCount: state.hand.length };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<CardsGameState, CardsPlayerState>
  ): WinConditionResult | null {
    // Base cards mechanic doesn't define win conditions
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'cards_dealt',
      'cards_drawn',
      'card_played',
      'card_discarded',
      'cards_force_discarded',
      'card_stolen',
      'deck_reshuffled',
    ] as const;
  },
});

export default cardsMechanic;
export * from './types.js';
