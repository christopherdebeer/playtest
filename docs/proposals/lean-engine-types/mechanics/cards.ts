/**
 * Cards Mechanic
 *
 * Provides card game fundamentals:
 * - Deck and discard pile
 * - Player hands
 * - Draw, play, discard actions
 *
 * This is a complete example of implementing the Mechanic interface.
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
} from '../core';
import {
  Mechanic,
  InitContext,
  MechanicRegistryView,
  JsonSchema,
  defineMechanic,
} from '../mechanic';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Configuration (from RULES.md)
// ─────────────────────────────────────────────────────────────

export interface CardsConfig {
  deck: DeckEntry[];
  startingCards: number;
  handLimit?: number;
  handLimitPolicy?: HandLimitPolicy;
  reshuffleDiscard?: boolean;
}

export interface DeckEntry {
  name: string;
  count: number;
  type?: string;
  effect?: CardEffect;
  targetRequired?: boolean;
  targetMode?: 'self' | 'opponent' | 'any';
}

export interface CardEffect {
  type: string;
  value?: number;
  duration?: number;
}

export type HandLimitPolicy =
  | 'cannot_draw'      // Can't draw if at limit
  | 'discard_choice'   // Must discard to hand limit
  | 'discard_oldest';  // Auto-discard oldest cards

// ─────────────────────────────────────────────────────────────
// Game State
// ─────────────────────────────────────────────────────────────

export interface CardsGameState {
  deck: Card[];
  discardPile: Card[];
  cardDefinitions: Map<string, DeckEntry>;  // For looking up card effects
}

export interface Card {
  id: string;           // Unique instance ID
  name: string;
  type?: string;
  effect?: CardEffect;
}

// ─────────────────────────────────────────────────────────────
// Player State
// ─────────────────────────────────────────────────────────────

export interface CardsPlayerState {
  hand: Card[];
}

// ─────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────

export type CardsAction =
  | DrawAction
  | PlayCardAction
  | DiscardAction;

export interface DrawAction {
  type: 'draw';
  count?: number;  // Default: 1
}

export interface PlayCardAction {
  type: 'play_card';
  cardName: string;
  target?: string;  // Player ID or entity
}

export interface DiscardAction {
  type: 'discard';
  cardName: string;
}

// ─────────────────────────────────────────────────────────────
// Effects
// ─────────────────────────────────────────────────────────────

export type CardsEffect =
  | DrawCardsEffect
  | ForceDiscardEffect
  | StealCardEffect;

export interface DrawCardsEffect {
  type: 'draw_cards';
  count: number;
  source?: string;
  target?: string;
}

export interface ForceDiscardEffect {
  type: 'force_discard';
  count: number;
  source?: string;
  target?: string;
}

export interface StealCardEffect {
  type: 'steal_card';
  cardName?: string;  // If not specified, random
  source?: string;
  target?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE AUGMENTATION (for type-safe state access)
// ═══════════════════════════════════════════════════════════════════════════

declare module '../core' {
  interface MechanicStateMap {
    cards: CardsGameState;
  }
  interface PlayerMechanicStateMap {
    cards: CardsPlayerState;
  }
}

declare module '../mechanic' {
  interface MechanicTypeRegistry {
    cards: {
      config: CardsConfig;
      gameState: CardsGameState;
      playerState: CardsPlayerState;
      actions: CardsAction;
      effects: CardsEffect;
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildDeck(entries: DeckEntry[]): Card[] {
  const cards: Card[] = [];
  let idCounter = 0;

  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) {
      cards.push({
        id: `card-${idCounter++}`,
        name: entry.name,
        type: entry.type,
        effect: entry.effect,
      });
    }
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

function getCardDefinition(config: CardsConfig, name: string): DeckEntry | undefined {
  return config.deck.find(d => d.name === name);
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
  // ─────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────

  slug: 'cards',
  version: '1.0.0',
  displayName: 'Cards',
  description: 'Core card game mechanics: deck, hands, draw, play, discard',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<CardsConfig, any[]> {
    // In real implementation, use Zod or similar
    const config = raw as CardsConfig;

    const errors: any[] = [];

    if (!config.deck || !Array.isArray(config.deck)) {
      errors.push({ path: 'deck', message: 'deck must be an array' });
    }

    if (typeof config.startingCards !== 'number' || config.startingCards < 0) {
      errors.push({ path: 'startingCards', message: 'startingCards must be a non-negative number' });
    }

    if (errors.length > 0) {
      return { ok: false, error: errors };
    }

    return { ok: true, value: config };
  },

  validateConfig(config: CardsConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check deck has cards
    if (config.deck.length === 0) {
      errors.push({ path: 'deck', message: 'Deck cannot be empty' });
    }

    // Check total cards is enough for all players
    const totalCards = config.deck.reduce((sum, d) => sum + d.count, 0);
    const playerCount = registry.getPlayerCount();
    const minCardsNeeded = config.startingCards * playerCount;

    if (totalCards < minCardsNeeded) {
      errors.push({
        path: 'deck',
        message: `Not enough cards (${totalCards}) for ${playerCount} players with ${config.startingCards} starting cards each (need ${minCardsNeeded})`,
      });
    }

    // Validate card effects reference valid effect types
    for (const entry of config.deck) {
      if (entry.effect && entry.targetRequired && !entry.targetMode) {
        errors.push({
          path: `deck[${entry.name}]`,
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
            },
          },
        },
        startingCards: { type: 'number', minimum: 0 },
        handLimit: { type: 'number', minimum: 1 },
        handLimitPolicy: {
          type: 'string',
          enum: ['cannot_draw', 'discard_choice', 'discard_oldest'],
        },
        reshuffleDiscard: { type: 'boolean' },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: CardsConfig, context: InitContext): CardsGameState {
    const deck = buildDeck(config.deck);
    const shuffled = shuffleDeck(deck, context.random);

    const cardDefinitions = new Map<string, DeckEntry>();
    for (const entry of config.deck) {
      cardDefinitions.set(entry.name, entry);
    }

    return {
      deck: shuffled,
      discardPile: [],
      cardDefinitions,
    };
  },

  initPlayerState(config: CardsConfig, playerId: string, context: InitContext): CardsPlayerState {
    // Hands are dealt in onGameStart when all players are ready
    return {
      hand: [],
    };
  },

  onGameStart(
    config: CardsConfig,
    ctx: ActionContext<CardsGameState, CardsPlayerState>
  ): ExecutionResult<CardsGameState, CardsPlayerState> {
    const gameState = ctx.gameState;
    const events: LogEvent[] = [];
    const playerStateChanges: Record<string, Partial<CardsPlayerState>> = {};

    // Deal starting cards to each player
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
      gameStateChanges: {
        deck: gameState.deck.slice(deckIndex),
      },
      playerStateChanges,
      events,
      nextTurn: { type: 'same_player' },  // Don't advance turn, just dealt cards
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

        // Check if deck has enough cards
        if (gameState.deck.length < count) {
          if (!config.reshuffleDiscard || gameState.discardPile.length === 0) {
            return {
              valid: false,
              errors: [{
                code: 'DECK_EMPTY',
                message: `Cannot draw ${count} cards: only ${gameState.deck.length} in deck`,
                suggestion: config.reshuffleDiscard
                  ? 'Discard pile is also empty'
                  : 'Consider enabling reshuffleDiscard in config',
              }],
            };
          }
        }

        // Check hand limit
        if (config.handLimit && config.handLimitPolicy === 'cannot_draw') {
          if (playerState.hand.length + count > config.handLimit) {
            return {
              valid: false,
              errors: [{
                code: 'HAND_LIMIT',
                message: `Cannot draw: would exceed hand limit of ${config.handLimit}`,
                suggestion: 'Discard cards first or play cards from hand',
              }],
            };
          }
        }

        return { valid: true, errors: [] };
      }

      case 'play_card': {
        const card = playerState.hand.find(c => c.name === action.cardName);

        if (!card) {
          return {
            valid: false,
            errors: [{
              code: 'CARD_NOT_IN_HAND',
              message: `Card "${action.cardName}" is not in your hand`,
              suggestion: `Your hand contains: ${playerState.hand.map(c => c.name).join(', ')}`,
            }],
          };
        }

        // Check target requirements
        const definition = getCardDefinition(config, card.name);
        if (definition?.targetRequired && !action.target) {
          return {
            valid: false,
            errors: [{
              code: 'TARGET_REQUIRED',
              message: `Card "${action.cardName}" requires a target`,
              suggestion: `Specify target: { type: "play_card", cardName: "${action.cardName}", target: "player-X" }`,
            }],
          };
        }

        // Validate target mode
        if (action.target && definition?.targetMode) {
          const isOpponent = action.target !== ctx.playerId;
          if (definition.targetMode === 'self' && isOpponent) {
            return {
              valid: false,
              errors: [{
                code: 'INVALID_TARGET',
                message: `Card "${action.cardName}" can only target yourself`,
              }],
            };
          }
          if (definition.targetMode === 'opponent' && !isOpponent) {
            return {
              valid: false,
              errors: [{
                code: 'INVALID_TARGET',
                message: `Card "${action.cardName}" can only target opponents`,
              }],
            };
          }
        }

        return { valid: true, errors: [] };
      }

      case 'discard': {
        const card = playerState.hand.find(c => c.name === action.cardName);

        if (!card) {
          return {
            valid: false,
            errors: [{
              code: 'CARD_NOT_IN_HAND',
              message: `Card "${action.cardName}" is not in your hand`,
            }],
          };
        }

        return { valid: true, errors: [] };
      }

      default:
        return {
          valid: false,
          errors: [{ message: `Unknown action type: ${(action as any).type}` }],
        };
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
          deck = [...deck, ...shuffleDeck(discardPile, Math.random)];
          discardPile = [];
        }

        const drawn = deck.slice(0, count);
        const newDeck = deck.slice(count);
        const newHand = [...playerState.hand, ...drawn];

        return {
          success: true,
          message: `Drew ${count} card${count > 1 ? 's' : ''}`,
          gameStateChanges: { deck: newDeck, discardPile },
          playerStateChanges: {
            [ctx.playerId]: { hand: newHand },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'cards_drawn',
            player: ctx.playerId,
            data: { count, deckRemaining: newDeck.length },
          }],
          nextTurn: { type: 'same_player' },  // Drawing doesn't end turn by default
        };
      }

      case 'play_card': {
        const cardIndex = playerState.hand.findIndex(c => c.name === action.cardName);
        const card = playerState.hand[cardIndex];
        const newHand = [...playerState.hand];
        newHand.splice(cardIndex, 1);

        const definition = getCardDefinition(config, card.name);

        return {
          success: true,
          message: `Played ${card.name}${action.target ? ` targeting ${action.target}` : ''}`,
          gameStateChanges: {
            discardPile: [...gameState.discardPile, card],
          },
          playerStateChanges: {
            [ctx.playerId]: { hand: newHand },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'card_played',
            player: ctx.playerId,
            data: {
              card: card.name,
              target: action.target,
              effect: card.effect,
            },
          }],
          // If card has an effect, emit it
          effects: card.effect ? [{
            ...card.effect,
            source: ctx.playerId,
            target: action.target ?? ctx.playerId,
          } as any] : [],
          nextTurn: { type: 'advance' },  // Playing a card ends turn by default
        };
      }

      case 'discard': {
        const cardIndex = playerState.hand.findIndex(c => c.name === action.cardName);
        const card = playerState.hand[cardIndex];
        const newHand = [...playerState.hand];
        newHand.splice(cardIndex, 1);

        return {
          success: true,
          message: `Discarded ${card.name}`,
          gameStateChanges: {
            discardPile: [...gameState.discardPile, card],
          },
          playerStateChanges: {
            [ctx.playerId]: { hand: newHand },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'card_discarded',
            player: ctx.playerId,
            data: { card: card.name },
          }],
          nextTurn: { type: 'same_player' },  // Discarding doesn't end turn
        };
      }

      default:
        return {
          success: false,
          message: `Unknown action type`,
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
    const deckHasCards = gameState.deck.length > 0 ||
      (config.reshuffleDiscard && gameState.discardPile.length > 0);
    const handLimitBlocked = config.handLimit &&
      config.handLimitPolicy === 'cannot_draw' &&
      playerState.hand.length >= config.handLimit;

    actions.push({
      type: 'draw',
      enabled: deckHasCards && !handLimitBlocked,
      description: 'Draw cards from the deck',
      reason: !deckHasCards
        ? 'Deck is empty'
        : handLimitBlocked
          ? `Hand limit reached (${config.handLimit})`
          : undefined,
      examples: deckHasCards && !handLimitBlocked
        ? [{ type: 'draw' }, { type: 'draw', count: 2 }]
        : [],
    });

    // Play card actions
    if (playerState.hand.length > 0) {
      const playExamples: PlayCardAction[] = [];

      for (const card of playerState.hand) {
        const definition = getCardDefinition(config, card.name);
        if (definition?.targetRequired) {
          // Add example with target
          const opponentId = ctx.state.turnOrder.find(p => p !== ctx.playerId);
          if (opponentId) {
            playExamples.push({
              type: 'play_card',
              cardName: card.name,
              target: opponentId,
            });
          }
        } else {
          playExamples.push({ type: 'play_card', cardName: card.name });
        }
      }

      actions.push({
        type: 'play_card',
        enabled: true,
        description: 'Play a card from your hand',
        examples: playExamples,
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
        const targetId = effect.target ?? ctx.state.currentPlayer!;
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId)!;

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
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId)!;

        // For simplicity, discard from end of hand (could be random or choice)
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
        const sourceState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', sourceId)!;
        const targetState = ctx.getMechanicPlayerState<CardsPlayerState>('cards', targetId)!;

        // Find card to steal (specific or random)
        const cardIndex = effect.cardName
          ? targetState.hand.findIndex(c => c.name === effect.cardName)
          : Math.floor(Math.random() * targetState.hand.length);

        if (cardIndex === -1 || targetState.hand.length === 0) {
          return { events: [] };  // No card to steal
        }

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
  ): Partial<CardsGameState> {
    return {
      // Only show deck count, not contents
      deck: undefined,
      // Discard pile is public
      discardPile: state.discardPile,
      // Add a helper field for UI
      ...({ deckCount: state.deck.length } as any),
    };
  },

  filterPlayerStateForViewer(
    state: CardsPlayerState,
    viewerId: string,
    ownerId: string
  ): Partial<CardsPlayerState> {
    if (viewerId === ownerId) {
      // Full visibility for own hand
      return state;
    }

    // Only show hand count for opponents
    return {
      ...({ handCount: state.hand.length } as any),
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<CardsGameState, CardsPlayerState>
  ): WinConditionResult | null {
    // Base cards mechanic doesn't define win conditions
    // Card-shedding games would use a separate mechanic or game config
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

// Export the mechanic
export default cardsMechanic;
