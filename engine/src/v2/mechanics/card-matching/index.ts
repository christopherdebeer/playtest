/**
 * Card Matching Mechanic
 *
 * Game-agnostic card matching validation for games like UNO.
 * Depends on cards mechanic for hand/deck management.
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
  CardMatchingConfig,
  CardMatchingGameState,
  CardMatchingPlayerState,
  CardMatchingAction,
  CardMatchingEffect,
  MatchCard,
  PlayMatchedCardAction,
  SkipNextEffect,
  ReverseDirectionEffect,
  SetColorEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

interface CardInfo {
  id: string;
  name: string;
  type?: string;
  effect?: Record<string, unknown>;
}

function getPlayerHand(ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>, playerId: string): CardInfo[] {
  const cardsState = ctx.getMechanicPlayerState<{ hand: CardInfo[] }>('cards', playerId);
  return cardsState?.hand ?? [];
}

function extractCardProperties(card: CardInfo, config: CardMatchingConfig): MatchCard {
  const effect = card.effect ?? {};
  return {
    id: card.id,
    name: card.name,
    type: card.type,
    color: effect[config.colorProperty ?? 'color'] as string | undefined,
    value: effect[config.valueProperty ?? 'value'] as number | string | undefined,
    effect,
  };
}

function cardMatches(
  card: MatchCard,
  target: MatchCard,
  config: CardMatchingConfig,
  declaredColor?: string
): boolean {
  // Wild cards always match
  if (config.wildTypes?.includes(card.type ?? '')) {
    return true;
  }

  const colorToMatch = declaredColor ?? target.color;

  for (const rule of config.matchRules) {
    let matches = false;

    switch (rule.type) {
      case 'color':
        matches = card.color === colorToMatch;
        break;
      case 'value':
        matches = card.value === target.value;
        break;
      case 'type':
        matches = card.type === target.type;
        break;
      case 'custom':
        if (rule.property) {
          matches = card.effect?.[rule.property] === target.effect?.[rule.property];
        }
        break;
    }

    if (rule.mode === 'any' && matches) {
      return true;
    }
    if (rule.mode === 'all' && !matches) {
      return false;
    }
  }

  // If all rules are 'all' mode and we got here, all matched
  return config.matchRules.every(r => r.mode === 'all');
}

function getValidPlays(
  hand: CardInfo[],
  currentCard: MatchCard | null,
  config: CardMatchingConfig,
  declaredColor?: string
): CardInfo[] {
  if (!currentCard) {
    // No card to match - all cards are valid
    return hand;
  }

  return hand.filter(card => {
    const matchCard = extractCardProperties(card, config);
    return cardMatches(matchCard, currentCard, config, declaredColor);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const cardMatchingMechanic = defineMechanic<
  'card-matching',
  CardMatchingConfig,
  CardMatchingGameState,
  CardMatchingPlayerState,
  CardMatchingAction,
  CardMatchingEffect
>({
  slug: 'card-matching',
  version: '1.0.0',
  displayName: 'Card Matching',
  description: 'Validates card plays based on matching rules (color, value, type)',
  dependencies: ['cards'],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<CardMatchingConfig, ValidationError[]> {
    const config = (raw || {}) as Partial<CardMatchingConfig>;

    return ok({
      enabled: config.enabled ?? true,
      matchRules: config.matchRules ?? [
        { type: 'color', mode: 'any' },
        { type: 'value', mode: 'any' },
      ],
      wildTypes: config.wildTypes ?? ['wild'],
      colorProperty: config.colorProperty ?? 'color',
      valueProperty: config.valueProperty ?? 'value',
      mustMatchOrDraw: config.mustMatchOrDraw ?? true,
      initialCardFromDeck: config.initialCardFromDeck ?? true,
    });
  },

  validateConfig(config: CardMatchingConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!registry.isEnabled('cards')) {
      errors.push({
        message: 'Card matching requires cards mechanic',
        path: 'dependencies',
      });
    }

    if (config.matchRules.length === 0) {
      errors.push({
        message: 'At least one match rule is required',
        path: 'matchRules',
      });
    }

    return errors;
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        matchRules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['color', 'value', 'type', 'custom'] },
              property: { type: 'string' },
              mode: { type: 'string', enum: ['any', 'all'] },
            },
          },
        },
        wildTypes: { type: 'array', items: { type: 'string' } },
        colorProperty: { type: 'string', default: 'color' },
        valueProperty: { type: 'string', default: 'value' },
        mustMatchOrDraw: { type: 'boolean', default: true },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: CardMatchingConfig, context: InitContext): CardMatchingGameState {
    return {
      currentCard: null,
      direction: 1,
      pendingDrawCount: 0,
    };
  },

  initPlayerState(config: CardMatchingConfig, playerId: string, context: InitContext): CardMatchingPlayerState {
    return {
      mustDraw: false,
      hasDrawnThisTurn: false,
      isSkipped: false,
    };
  },

  onGameStart(
    config: CardMatchingConfig,
    context: ActionContext<CardMatchingGameState, CardMatchingPlayerState>
  ): ExecutionResult<CardMatchingGameState, CardMatchingPlayerState> {
    // Draw initial card from discard pile if configured
    if (config.initialCardFromDeck) {
      const cardsState = context.getMechanicGameState<{ discardPile: CardInfo[] }>('cards');
      const topCard = cardsState?.discardPile?.[cardsState.discardPile.length - 1];

      if (topCard) {
        const matchCard = extractCardProperties(topCard, config);
        return {
          success: true,
          message: 'Initial card set',
          gameStateChanges: {
            currentCard: matchCard,
          },
          events: [{
            timestamp: context.timestamp,
            event: 'initial_card_set',
            data: { card: matchCard.name, color: matchCard.color },
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

  getActionTypes(): readonly CardMatchingAction['type'][] {
    return ['play_matched_card', 'draw_for_match', 'pass_after_draw'] as const;
  },

  validateAction(
    ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>,
    action: CardMatchingAction
  ): ValidationResult {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardMatchingConfig>('card-matching')!;

    if (!config.enabled) {
      return validResult();
    }

    // Check if player is skipped
    if (playerState.isSkipped) {
      return invalidResult([{ message: 'You are skipped this turn' }]);
    }

    switch (action.type) {
      case 'play_matched_card': {
        const playAction = action as PlayMatchedCardAction;
        const hand = getPlayerHand(ctx, ctx.playerId);

        // Find the card
        const card = hand.find(c =>
          (playAction.cardId && c.id === playAction.cardId) ||
          (playAction.cardName && c.name === playAction.cardName)
        );

        if (!card) {
          return invalidResult([{ message: 'Card not found in hand' }]);
        }

        // Check if must handle pending draws first
        if (gameState.pendingDrawCount > 0) {
          const matchCard = extractCardProperties(card, config);
          // Can only play cards that add to the draw count
          const cardEffect = card.effect?.type;
          if (cardEffect !== 'draw' && cardEffect !== 'wild_draw') {
            return invalidResult([{
              message: `Must draw ${gameState.pendingDrawCount} cards or play a Draw card`,
            }]);
          }
        }

        // Check if card matches
        if (gameState.currentCard) {
          const matchCard = extractCardProperties(card, config);
          if (!cardMatches(matchCard, gameState.currentCard, config, gameState.declaredColor)) {
            return invalidResult([{
              message: `Card does not match. Current: ${gameState.declaredColor ?? gameState.currentCard.color} ${gameState.currentCard.value ?? ''}`,
            }]);
          }
        }

        // Wild cards require color declaration
        if (config.wildTypes?.includes(card.type ?? '') && !playAction.declaredColor) {
          return invalidResult([{ message: 'Must declare a color for wild card' }]);
        }

        return validResult();
      }

      case 'draw_for_match': {
        if (playerState.hasDrawnThisTurn && !gameState.pendingDrawCount) {
          return invalidResult([{ message: 'Already drew this turn' }]);
        }
        return validResult();
      }

      case 'pass_after_draw': {
        if (!playerState.hasDrawnThisTurn) {
          return invalidResult([{ message: 'Must draw before passing' }]);
        }
        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>,
    action: CardMatchingAction
  ): ExecutionResult<CardMatchingGameState, CardMatchingPlayerState> {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardMatchingConfig>('card-matching')!;

    switch (action.type) {
      case 'play_matched_card': {
        const playAction = action as PlayMatchedCardAction;
        const hand = getPlayerHand(ctx, ctx.playerId);
        const card = hand.find(c =>
          (playAction.cardId && c.id === playAction.cardId) ||
          (playAction.cardName && c.name === playAction.cardName)
        )!;

        const matchCard = extractCardProperties(card, config);
        const events: LogEvent[] = [];

        // Build effects from card (can include cross-mechanic effects)
        const effects: Array<CardMatchingEffect | { type: string; [key: string]: unknown }> = [];
        const cardEffectType = card.effect?.type as string | undefined;

        // Move the played card from hand to discard pile (cards mechanic effect)
        effects.push({
          type: 'move_card_to_discard',
          playerId: ctx.playerId,
          cardId: card.id,
          cardName: card.name,
        });

        // Handle card effects
        let nextTurnType: 'advance' | 'same_player' | 'skip' | 'reverse' = 'advance';
        let newPendingDraw = 0;

        if (cardEffectType === 'skip') {
          effects.push({ type: 'skip_next' });
          nextTurnType = 'skip';
          events.push({
            timestamp: ctx.timestamp,
            event: 'player_skipped',
            player: ctx.playerId,
          });
        } else if (cardEffectType === 'reverse') {
          effects.push({ type: 'reverse_direction' });
          nextTurnType = 'reverse';
          events.push({
            timestamp: ctx.timestamp,
            event: 'direction_reversed',
            player: ctx.playerId,
          });
        } else if (cardEffectType === 'draw' || cardEffectType === 'wild_draw') {
          const drawCount = (card.effect?.value as number) ?? 2;
          newPendingDraw = drawCount;
          effects.push({ type: 'draw_cards_effect', count: drawCount, targetNext: true });
          events.push({
            timestamp: ctx.timestamp,
            event: 'draw_penalty',
            player: ctx.playerId,
            data: { count: drawCount },
          });
        }

        events.push({
          timestamp: ctx.timestamp,
          event: 'card_matched',
          player: ctx.playerId,
          data: {
            card: card.name,
            color: matchCard.color,
            value: matchCard.value,
            declaredColor: playAction.declaredColor,
          },
        });

        return {
          success: true,
          message: `Played ${card.name}`,
          gameStateChanges: {
            currentCard: matchCard,
            declaredColor: playAction.declaredColor,
            direction: cardEffectType === 'reverse' ? (gameState.direction * -1) as 1 | -1 : gameState.direction,
            pendingDrawCount: newPendingDraw,
          },
          playerStateChanges: {
            [ctx.playerId]: {
              hasDrawnThisTurn: false,
              mustDraw: false,
            },
          },
          effects,
          events,
          nextTurn: nextTurnType === 'skip'
            ? { type: 'skip' as const, count: 1 }
            : { type: 'advance' as const },
        };
      }

      case 'draw_for_match': {
        const drawCount = gameState.pendingDrawCount || 1;

        return {
          success: true,
          message: `Drew ${drawCount} card(s)`,
          gameStateChanges: {
            pendingDrawCount: 0,
          },
          playerStateChanges: {
            [ctx.playerId]: {
              hasDrawnThisTurn: true,
              mustDraw: false,
            },
          },
          // Trigger draw from cards mechanic (use cards mechanic's effect type)
          effects: [{
            type: 'draw_cards',
            count: drawCount,
          } as unknown as CardMatchingEffect],
          events: [{
            timestamp: ctx.timestamp,
            event: 'drew_for_match',
            player: ctx.playerId,
            data: { count: drawCount },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'pass_after_draw': {
        return {
          success: true,
          message: 'Passed turn',
          playerStateChanges: {
            [ctx.playerId]: {
              hasDrawnThisTurn: false,
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'passed_turn',
            player: ctx.playerId,
          }],
          nextTurn: { type: 'advance' },
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
    ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>
  ): ActionAvailability<CardMatchingAction>[] {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<CardMatchingConfig>('card-matching')!;
    const actions: ActionAvailability<CardMatchingAction>[] = [];

    if (!config.enabled || playerState.isSkipped) {
      return actions;
    }

    const hand = getPlayerHand(ctx, ctx.playerId);
    const validPlays = getValidPlays(hand, gameState.currentCard, config, gameState.declaredColor);

    // Must handle pending draws?
    if (gameState.pendingDrawCount > 0) {
      // Check for stackable draw cards
      const drawCards = validPlays.filter(c =>
        c.effect?.type === 'draw' || c.effect?.type === 'wild_draw'
      );

      if (drawCards.length > 0) {
        actions.push({
          type: 'play_matched_card',
          enabled: true,
          description: `Stack a Draw card or draw ${gameState.pendingDrawCount}`,
          examples: drawCards.slice(0, 2).map(c => ({
            type: 'play_matched_card' as const,
            cardName: c.name,
          })),
        });
      }

      actions.push({
        type: 'draw_for_match',
        enabled: true,
        description: `Draw ${gameState.pendingDrawCount} cards`,
        examples: [{ type: 'draw_for_match' as const }],
      });

      return actions;
    }

    // Normal turn - can play matching cards
    if (validPlays.length > 0) {
      const wildCards = validPlays.filter(c => config.wildTypes?.includes(c.type ?? ''));
      const normalCards = validPlays.filter(c => !config.wildTypes?.includes(c.type ?? ''));

      actions.push({
        type: 'play_matched_card',
        enabled: true,
        description: gameState.currentCard
          ? `Play a card matching ${gameState.declaredColor ?? gameState.currentCard.color} or ${gameState.currentCard.value}`
          : 'Play any card',
        examples: [
          ...normalCards.slice(0, 2).map(c => ({
            type: 'play_matched_card' as const,
            cardName: c.name,
          })),
          ...wildCards.slice(0, 1).map(c => ({
            type: 'play_matched_card' as const,
            cardName: c.name,
            declaredColor: 'Red',
          })),
        ],
      });
    }

    // Can draw if no valid plays or by choice
    if (!playerState.hasDrawnThisTurn) {
      actions.push({
        type: 'draw_for_match',
        enabled: true,
        description: validPlays.length === 0 ? 'No valid plays - must draw' : 'Draw a card',
        examples: [{ type: 'draw_for_match' as const }],
      });
    }

    // Can pass after drawing
    if (playerState.hasDrawnThisTurn) {
      actions.push({
        type: 'pass_after_draw',
        enabled: true,
        description: 'Pass turn',
        examples: [{ type: 'pass_after_draw' as const }],
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly CardMatchingEffect['type'][] {
    return ['skip_next', 'reverse_direction', 'set_color'] as const;
  },

  applyEffect(
    ctx: EffectContext<CardMatchingGameState, CardMatchingPlayerState>,
    effect: CardMatchingEffect
  ): EffectResult<CardMatchingGameState, CardMatchingPlayerState> {
    switch (effect.type) {
      case 'skip_next':
        // Mark next player as skipped (handled by turn advancement)
        return {
          events: [{
            timestamp: ctx.timestamp,
            event: 'skip_applied',
          }],
        };

      case 'reverse_direction':
        return {
          gameStateChanges: {
            direction: (ctx.gameState.direction * -1) as 1 | -1,
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'direction_changed',
            data: { newDirection: ctx.gameState.direction * -1 },
          }],
        };

      case 'set_color':
        const setColorEffect = effect as SetColorEffect;
        return {
          gameStateChanges: {
            declaredColor: setColorEffect.color,
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'color_declared',
            data: { color: setColorEffect.color },
          }],
        };

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<CardMatchingGameState, CardMatchingPlayerState> {
    if (boundary === 'turn') {
      // Reset per-turn state
      return {
        playerStateChanges: {
          [ctx.playerId]: {
            hasDrawnThisTurn: false,
            isSkipped: false,
          },
        },
        events: [],
      };
    }
    return { events: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: CardMatchingGameState,
    playerId: string
  ): Record<string, unknown> {
    return {
      currentCard: state.currentCard,
      declaredColor: state.declaredColor,
      direction: state.direction,
      pendingDrawCount: state.pendingDrawCount,
    };
  },

  filterPlayerStateForViewer(
    state: CardMatchingPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    return {
      isSkipped: state.isSkipped,
      hasDrawnThisTurn: viewerId === ownerId ? state.hasDrawnThisTurn : undefined,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<CardMatchingGameState, CardMatchingPlayerState>
  ): WinConditionResult | null {
    // Check if any player has empty hand
    for (const playerId of ctx.state.turnOrder) {
      const hand = getPlayerHand(ctx, playerId);
      if (hand.length === 0) {
        return {
          triggered: true,
          winner: playerId,
          reason: `${playerId} played all their cards`,
        };
      }
    }
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'initial_card_set',
      'card_matched',
      'drew_for_match',
      'passed_turn',
      'player_skipped',
      'direction_reversed',
      'draw_penalty',
      'skip_applied',
      'direction_changed',
      'color_declared',
    ];
  },
});

export default cardMatchingMechanic;
export * from './types.js';
