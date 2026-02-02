/**
 * Deck Stacks Mechanic
 *
 * Manages multiple card stacks/piles with:
 * - Named stacks (deck, discard, play surface)
 * - Shuffle-reload when deck empties
 * - Visible top card for matching rules
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
  DeckStacksConfig,
  DeckStacksGameState,
  DeckStacksPlayerState,
  DeckStacksAction,
  DeckStacksEffect,
  StackState,
  StackCard,
  DrawFromStackAction,
  PlayToStackAction,
  ShuffleStackAction,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function shuffleCards(cards: StackCard[], random: () => number): StackCard[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const deckStacksMechanic = defineMechanic<
  'deck-stacks',
  DeckStacksConfig,
  DeckStacksGameState,
  DeckStacksPlayerState,
  DeckStacksAction,
  DeckStacksEffect
>({
  slug: 'deck-stacks',
  version: '1.0.0',
  displayName: 'Deck Stacks',
  description: 'Multiple card piles with shuffle-reload and visible top card',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<DeckStacksConfig, ValidationError[]> {
    const config = raw as DeckStacksConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Deck stacks config is required' }]);
    }

    if (!config.stacks || !Array.isArray(config.stacks) || config.stacks.length === 0) {
      errors.push({ path: 'stacks', message: 'At least one stack must be defined' });
    } else {
      const names = new Set<string>();
      for (const stack of config.stacks) {
        if (!stack.name) {
          errors.push({ message: 'Stack name is required' });
        } else if (names.has(stack.name)) {
          errors.push({ message: `Duplicate stack name: ${stack.name}` });
        }
        names.add(stack.name);
      }
    }

    if (errors.length > 0) return err(errors);
    return ok(config);
  },

  validateConfig(config: DeckStacksConfig, registry: MechanicRegistryView): ValidationError[] {
    return [];
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['stacks'],
      properties: {
        stacks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              startsWith: { type: 'string' },
              faceUp: { type: 'boolean' },
              topOnly: { type: 'boolean' },
            },
          },
        },
        shuffleReloadFrom: { type: 'string' },
        topCardVisible: { type: 'string' },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: DeckStacksConfig, context: InitContext): DeckStacksGameState {
    const stacks: Record<string, StackState> = {};

    for (const stackDef of config.stacks) {
      stacks[stackDef.name] = {
        cards: [],
        faceUp: stackDef.faceUp ?? false,
        topOnly: stackDef.topOnly ?? false,
      };
    }

    return { stacks };
  },

  initPlayerState(config: DeckStacksConfig, playerId: string, context: InitContext): DeckStacksPlayerState {
    return {};
  },

  onGameStart(
    config: DeckStacksConfig,
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>
  ): ExecutionResult<DeckStacksGameState, DeckStacksPlayerState> {
    // If there's a topCardVisible stack and it has cards, set the top card
    if (config.topCardVisible) {
      const stack = ctx.gameState.stacks[config.topCardVisible];
      if (stack && stack.cards.length > 0) {
        return {
          success: true,
          gameStateChanges: {
            topCard: stack.cards[stack.cards.length - 1],
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'top_card_set',
            data: { card: stack.cards[stack.cards.length - 1] },
          }],
          nextTurn: { type: 'same_player' },
        };
      }
    }

    return {
      success: true,
      events: [],
      nextTurn: { type: 'same_player' },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly DeckStacksAction['type'][] {
    return ['draw_from_stack', 'play_to_stack', 'shuffle_stack'] as const;
  },

  validateAction(
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>,
    action: DeckStacksAction
  ): ValidationResult {
    const { gameState } = ctx;
    const config = ctx.getMechanicConfig<DeckStacksConfig>('deck-stacks')!;

    switch (action.type) {
      case 'draw_from_stack': {
        const drawAction = action as DrawFromStackAction;
        const stack = gameState.stacks[drawAction.stackName];

        if (!stack) {
          return invalidResult([{
            code: 'STACK_NOT_FOUND',
            message: `Stack "${drawAction.stackName}" does not exist`,
          }]);
        }

        const count = drawAction.count ?? 1;
        const available = stack.cards.length;

        // Check if auto-reload can help
        if (available < count && config.shuffleReloadFrom) {
          const reloadStack = gameState.stacks[config.shuffleReloadFrom];
          if (reloadStack && reloadStack.cards.length + available < count) {
            return invalidResult([{
              code: 'NOT_ENOUGH_CARDS',
              message: `Not enough cards in ${drawAction.stackName} (even after reload)`,
            }]);
          }
        } else if (available < count) {
          return invalidResult([{
            code: 'NOT_ENOUGH_CARDS',
            message: `Not enough cards in ${drawAction.stackName}`,
          }]);
        }

        return validResult();
      }

      case 'play_to_stack': {
        const playAction = action as PlayToStackAction;
        const stack = gameState.stacks[playAction.stackName];

        if (!stack) {
          return invalidResult([{
            code: 'STACK_NOT_FOUND',
            message: `Stack "${playAction.stackName}" does not exist`,
          }]);
        }

        // Card validation would happen via cards mechanic
        return validResult();
      }

      case 'shuffle_stack': {
        const shuffleAction = action as ShuffleStackAction;

        if (!gameState.stacks[shuffleAction.sourceStack]) {
          return invalidResult([{ message: `Source stack "${shuffleAction.sourceStack}" not found` }]);
        }
        if (!gameState.stacks[shuffleAction.targetStack]) {
          return invalidResult([{ message: `Target stack "${shuffleAction.targetStack}" not found` }]);
        }

        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>,
    action: DeckStacksAction
  ): ExecutionResult<DeckStacksGameState, DeckStacksPlayerState> {
    const { gameState } = ctx;
    const config = ctx.getMechanicConfig<DeckStacksConfig>('deck-stacks')!;

    switch (action.type) {
      case 'draw_from_stack': {
        const drawAction = action as DrawFromStackAction;
        const stack = gameState.stacks[drawAction.stackName];
        const count = drawAction.count ?? 1;

        let newStackCards = [...stack.cards];
        let drawnCards: StackCard[] = [];
        const events: LogEvent[] = [];

        // Check if we need to reload deck
        if (newStackCards.length < count && config.shuffleReloadFrom) {
          const reloadStack = gameState.stacks[config.shuffleReloadFrom];
          if (reloadStack && reloadStack.cards.length > 0) {
            // Keep top card of play stack if applicable
            const reloadCards = config.topCardVisible === config.shuffleReloadFrom
              ? reloadStack.cards.slice(0, -1)
              : reloadStack.cards;

            const shuffled = shuffleCards(reloadCards, ctx.random);
            newStackCards = [...newStackCards, ...shuffled];

            events.push({
              timestamp: ctx.timestamp,
              event: 'deck_reloaded',
              data: {
                from: config.shuffleReloadFrom,
                to: drawAction.stackName,
                cardsShuffled: reloadCards.length,
              },
            });
          }
        }

        // Draw cards from top of stack
        drawnCards = newStackCards.slice(-count);
        newStackCards = newStackCards.slice(0, -count);

        const newStacks = {
          ...gameState.stacks,
          [drawAction.stackName]: { ...stack, cards: newStackCards },
        };

        // Clear reload stack if we used it
        if (events.length > 0 && config.shuffleReloadFrom) {
          const keepCard = config.topCardVisible === config.shuffleReloadFrom
            ? [gameState.stacks[config.shuffleReloadFrom].cards.slice(-1)[0]]
            : [];
          newStacks[config.shuffleReloadFrom] = {
            ...gameState.stacks[config.shuffleReloadFrom],
            cards: keepCard,
          };
        }

        events.push({
          timestamp: ctx.timestamp,
          event: 'cards_drawn_from_stack',
          player: ctx.playerId,
          data: { stack: drawAction.stackName, count: drawnCards.length },
        });

        return {
          success: true,
          message: `Drew ${drawnCards.length} cards from ${drawAction.stackName}`,
          gameStateChanges: { stacks: newStacks },
          events,
          nextTurn: { type: 'same_player' },
        };
      }

      case 'play_to_stack': {
        const playAction = action as PlayToStackAction;
        const stack = gameState.stacks[playAction.stackName];

        // Create card from ID (in real implementation, this comes from player's hand)
        const card: StackCard = {
          id: playAction.cardId,
          name: playAction.cardId,
          color: playAction.declaredColor,
        };

        const newCards = [...stack.cards, card];
        const newStacks = {
          ...gameState.stacks,
          [playAction.stackName]: { ...stack, cards: newCards },
        };

        const result: ExecutionResult<DeckStacksGameState, DeckStacksPlayerState> = {
          success: true,
          message: `Played ${card.name} to ${playAction.stackName}`,
          gameStateChanges: {
            stacks: newStacks,
            topCard: config.topCardVisible === playAction.stackName ? card : gameState.topCard,
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'card_played_to_stack',
            player: ctx.playerId,
            data: {
              stack: playAction.stackName,
              card: card.name,
              declaredColor: playAction.declaredColor,
            },
          }],
          nextTurn: { type: 'same_player' },
        };

        return result;
      }

      case 'shuffle_stack': {
        const shuffleAction = action as ShuffleStackAction;
        const sourceStack = gameState.stacks[shuffleAction.sourceStack];
        const targetStack = gameState.stacks[shuffleAction.targetStack];

        const shuffled = shuffleCards(sourceStack.cards, ctx.random);

        const newStacks = {
          ...gameState.stacks,
          [shuffleAction.sourceStack]: { ...sourceStack, cards: [] },
          [shuffleAction.targetStack]: {
            ...targetStack,
            cards: [...targetStack.cards, ...shuffled],
          },
        };

        return {
          success: true,
          message: `Shuffled ${shuffled.length} cards from ${shuffleAction.sourceStack} to ${shuffleAction.targetStack}`,
          gameStateChanges: { stacks: newStacks },
          events: [{
            timestamp: ctx.timestamp,
            event: 'stack_shuffled',
            data: {
              source: shuffleAction.sourceStack,
              target: shuffleAction.targetStack,
              count: shuffled.length,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      default:
        return {
          success: false,
          message: `Unknown action: ${(action as any).type}`,
          events: [],
          nextTurn: { type: 'same_player' },
        };
    }
  },

  getAvailableActions(
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>
  ): ActionAvailability<DeckStacksAction>[] {
    const { gameState } = ctx;
    const actions: ActionAvailability<DeckStacksAction>[] = [];

    for (const [name, stack] of Object.entries(gameState.stacks)) {
      if (stack.cards.length > 0) {
        actions.push({
          type: 'draw_from_stack',
          enabled: true,
          description: `Draw from ${name} (${stack.cards.length} cards)`,
          examples: [{ type: 'draw_from_stack', stackName: name, count: 1 }],
        });
      }

      actions.push({
        type: 'play_to_stack',
        enabled: true,
        description: `Play a card to ${name}`,
        examples: [{ type: 'play_to_stack', stackName: name, cardId: 'card_from_hand' }],
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly DeckStacksEffect['type'][] {
    return ['refill_deck', 'set_top_card', 'clear_stack'] as const;
  },

  applyEffect(
    ctx: EffectContext<DeckStacksGameState, DeckStacksPlayerState>,
    effect: DeckStacksEffect
  ): EffectResult<DeckStacksGameState, DeckStacksPlayerState> {
    const { gameState } = ctx;

    switch (effect.type) {
      case 'refill_deck': {
        const fromStack = gameState.stacks[effect.fromStack];
        if (!fromStack) return { events: [] };

        const shuffled = shuffleCards(fromStack.cards, ctx.random);
        const deckStack = gameState.stacks['deck'];

        return {
          gameStateChanges: {
            stacks: {
              ...gameState.stacks,
              [effect.fromStack]: { ...fromStack, cards: [] },
              deck: { ...deckStack, cards: [...deckStack.cards, ...shuffled] },
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'deck_refilled',
            data: { from: effect.fromStack, count: shuffled.length },
          }],
        };
      }

      case 'set_top_card': {
        return {
          gameStateChanges: { topCard: effect.card },
          events: [{
            timestamp: ctx.timestamp,
            event: 'top_card_changed',
            data: { card: effect.card },
          }],
        };
      }

      case 'clear_stack': {
        const stack = gameState.stacks[effect.stackName];
        if (!stack) return { events: [] };

        return {
          gameStateChanges: {
            stacks: {
              ...gameState.stacks,
              [effect.stackName]: { ...stack, cards: [] },
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'stack_cleared',
            data: { stack: effect.stackName },
          }],
        };
      }

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<DeckStacksGameState, DeckStacksPlayerState> {
    return { events: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: DeckStacksGameState,
    playerId: string
  ): Record<string, unknown> {
    const filteredStacks: Record<string, any> = {};

    for (const [name, stack] of Object.entries(state.stacks)) {
      if (stack.faceUp) {
        if (stack.topOnly && stack.cards.length > 0) {
          filteredStacks[name] = {
            count: stack.cards.length,
            topCard: stack.cards[stack.cards.length - 1],
          };
        } else {
          filteredStacks[name] = {
            count: stack.cards.length,
            cards: stack.cards,
          };
        }
      } else {
        filteredStacks[name] = {
          count: stack.cards.length,
        };
      }
    }

    return {
      stacks: filteredStacks,
      topCard: state.topCard,
    };
  },

  filterPlayerStateForViewer(
    state: DeckStacksPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    return {};
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<DeckStacksGameState, DeckStacksPlayerState>
  ): WinConditionResult | null {
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'cards_drawn_from_stack',
      'card_played_to_stack',
      'stack_shuffled',
      'deck_reloaded',
      'deck_refilled',
      'top_card_set',
      'top_card_changed',
      'stack_cleared',
    ];
  },
});

export default deckStacksMechanic;
export * from './types.js';

/**
 * Helper to check if a card can be played on the current top card.
 * Useful for UNO-style matching.
 */
export function canPlayOnTop(
  card: StackCard,
  topCard: StackCard | undefined,
  matchRules: { color?: boolean; value?: boolean; type?: boolean; wild?: string[] }
): boolean {
  if (!topCard) return true; // First card can always be played

  // Wild cards can always be played
  if (matchRules.wild && matchRules.wild.includes(card.type || '')) {
    return true;
  }

  // Check color match
  if (matchRules.color && card.color === topCard.color) {
    return true;
  }

  // Check value match
  if (matchRules.value && card.value === topCard.value) {
    return true;
  }

  // Check type match
  if (matchRules.type && card.type === topCard.type) {
    return true;
  }

  return false;
}
