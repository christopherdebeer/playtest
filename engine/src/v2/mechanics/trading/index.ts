/**
 * Trading Mechanic
 *
 * Handles item exchange between players:
 * - Propose trades with offers and requests
 * - Accept, decline, or counter trades
 * - Location requirements (optional)
 * - Gift giving (one-sided trades)
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
  TradingConfig,
  TradingGameState,
  TradingPlayerState,
  TradingAction,
  TradingEffect,
  PendingTrade,
  ProposeTradeAction,
  RespondTradeAction,
  CancelTradeAction,
  BlockTradeEffect,
  ForceTradeEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateTradeId(): string {
  return `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface CardInfo {
  id: string;
  name: string;
  type?: string;
}

function getPlayerHand(ctx: ActionContext<TradingGameState, TradingPlayerState>, playerId: string): CardInfo[] {
  const cardsState = ctx.getMechanicPlayerState<{ hand: CardInfo[] }>('cards', playerId);
  return cardsState?.hand ?? [];
}

function hasCards(hand: CardInfo[], cardIds: string[]): boolean {
  const handIds = new Set(hand.map(c => c.id));
  return cardIds.every(id => handIds.has(id));
}

function areCardsTradeable(hand: CardInfo[], cardIds: string[], allowedTypes: string[] | undefined): boolean {
  if (!allowedTypes) return true;

  for (const cardId of cardIds) {
    const card = hand.find(c => c.id === cardId);
    if (!card) return false;
    if (card.type && !allowedTypes.includes(card.type)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const tradingMechanic = defineMechanic<
  'trading',
  TradingConfig,
  TradingGameState,
  TradingPlayerState,
  TradingAction,
  TradingEffect
>({
  slug: 'trading',
  version: '1.0.0',
  displayName: 'Trading',
  description: 'Item exchange between players with offers, counters, and gifts',
  dependencies: ['cards'],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<TradingConfig, ValidationError[]> {
    const config = (raw || {}) as TradingConfig;

    return ok({
      enabled: config.enabled ?? true,
      itemTypesOnly: config.itemTypesOnly ?? false,
      allowedTypes: config.allowedTypes,
      requireSameLocation: config.requireSameLocation ?? false,
      requireAdjacent: config.requireAdjacent ?? false,
      allowGifts: config.allowGifts ?? true,
      maxCardsPerTrade: config.maxCardsPerTrade ?? 5,
    });
  },

  validateConfig(config: TradingConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check location requirements need grid mechanic
    if (config.requireSameLocation || config.requireAdjacent) {
      if (!registry.isEnabled('grid')) {
        errors.push({
          message: 'Location-based trading requires grid mechanic',
          path: 'requireSameLocation',
        });
      }
    }

    return errors;
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        itemTypesOnly: { type: 'boolean', default: false },
        allowedTypes: { type: 'array', items: { type: 'string' } },
        requireSameLocation: { type: 'boolean', default: false },
        requireAdjacent: { type: 'boolean', default: false },
        allowGifts: { type: 'boolean', default: true },
        maxCardsPerTrade: { type: 'number', minimum: 1, default: 5 },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: TradingConfig, context: InitContext): TradingGameState {
    return {
      pendingTrades: [],
      completedTradesThisRound: 0,
    };
  },

  initPlayerState(config: TradingConfig, playerId: string, context: InitContext): TradingPlayerState {
    return {
      completedTrades: 0,
      tradesThisTurn: 0,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly TradingAction['type'][] {
    return ['propose_trade', 'respond_trade', 'cancel_trade'] as const;
  },

  validateAction(
    ctx: ActionContext<TradingGameState, TradingPlayerState>,
    action: TradingAction
  ): ValidationResult {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<TradingConfig>('trading')!;

    if (!config.enabled) {
      return invalidResult([{ message: 'Trading is disabled' }]);
    }

    if (playerState.blockedFromTrading) {
      return invalidResult([{ message: 'You are blocked from trading this round' }]);
    }

    switch (action.type) {
      case 'propose_trade': {
        const proposeAction = action as ProposeTradeAction;

        if (proposeAction.targetPlayer === ctx.playerId) {
          return invalidResult([{ message: 'Cannot trade with yourself' }]);
        }

        // Check offered items exist and are tradeable
        const myHand = getPlayerHand(ctx, ctx.playerId);
        if (!hasCards(myHand, proposeAction.offeredItems)) {
          return invalidResult([{ message: 'You do not have all offered items' }]);
        }

        if (config.allowedTypes && !areCardsTradeable(myHand, proposeAction.offeredItems, config.allowedTypes)) {
          return invalidResult([{ message: 'Some offered items are not tradeable' }]);
        }

        // Check requested items if not a gift
        if (proposeAction.requestedItems && proposeAction.requestedItems.length > 0) {
          const targetHand = getPlayerHand(ctx, proposeAction.targetPlayer);
          if (!hasCards(targetHand, proposeAction.requestedItems)) {
            return invalidResult([{ message: 'Target does not have all requested items' }]);
          }

          if (config.allowedTypes && !areCardsTradeable(targetHand, proposeAction.requestedItems, config.allowedTypes)) {
            return invalidResult([{ message: 'Some requested items are not tradeable' }]);
          }
        } else if (!config.allowGifts) {
          return invalidResult([{ message: 'Gifts (one-sided trades) are not allowed' }]);
        }

        // Check card limits
        const totalCards = proposeAction.offeredItems.length + (proposeAction.requestedItems?.length ?? 0);
        if (totalCards > config.maxCardsPerTrade!) {
          return invalidResult([{ message: `Trade exceeds maximum of ${config.maxCardsPerTrade} cards` }]);
        }

        // Check location requirements
        if (config.requireSameLocation || config.requireAdjacent) {
          const myPos = ctx.getMechanicPlayerState<{ position: { x: number; y: number } }>('grid', ctx.playerId)?.position;
          const targetPos = ctx.getMechanicPlayerState<{ position: { x: number; y: number } }>('grid', proposeAction.targetPlayer)?.position;

          if (myPos && targetPos) {
            if (config.requireSameLocation && (myPos.x !== targetPos.x || myPos.y !== targetPos.y)) {
              return invalidResult([{ message: 'Must be at same location to trade' }]);
            }
            if (config.requireAdjacent) {
              const dx = Math.abs(myPos.x - targetPos.x);
              const dy = Math.abs(myPos.y - targetPos.y);
              if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
                return invalidResult([{ message: 'Must be adjacent to trade' }]);
              }
            }
          }
        }

        return validResult();
      }

      case 'respond_trade': {
        const respondAction = action as RespondTradeAction;
        const trade = gameState.pendingTrades.find(t => t.id === respondAction.tradeId);

        if (!trade) {
          return invalidResult([{ message: 'Trade not found' }]);
        }

        if (trade.target !== ctx.playerId) {
          return invalidResult([{ message: 'This trade is not for you' }]);
        }

        if (trade.status !== 'pending') {
          return invalidResult([{ message: 'Trade is no longer pending' }]);
        }

        if (respondAction.response === 'counter' && !respondAction.counterOffer) {
          return invalidResult([{ message: 'Counter offer required' }]);
        }

        return validResult();
      }

      case 'cancel_trade': {
        const cancelAction = action as CancelTradeAction;
        const trade = gameState.pendingTrades.find(t => t.id === cancelAction.tradeId);

        if (!trade) {
          return invalidResult([{ message: 'Trade not found' }]);
        }

        if (trade.initiator !== ctx.playerId) {
          return invalidResult([{ message: 'Only the initiator can cancel' }]);
        }

        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<TradingGameState, TradingPlayerState>,
    action: TradingAction
  ): ExecutionResult<TradingGameState, TradingPlayerState> {
    const { gameState } = ctx;

    switch (action.type) {
      case 'propose_trade': {
        const proposeAction = action as ProposeTradeAction;
        const tradeId = generateTradeId();

        const newTrade: PendingTrade = {
          id: tradeId,
          initiator: ctx.playerId,
          target: proposeAction.targetPlayer,
          offeredItems: proposeAction.offeredItems,
          requestedItems: proposeAction.requestedItems ?? [],
          status: 'pending',
          createdAt: ctx.timestamp,
        };

        return {
          success: true,
          message: `Trade proposed to ${proposeAction.targetPlayer}`,
          gameStateChanges: {
            pendingTrades: [...gameState.pendingTrades, newTrade],
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'trade_proposed',
            player: ctx.playerId,
            data: {
              tradeId,
              target: proposeAction.targetPlayer,
              offeredCount: proposeAction.offeredItems.length,
              requestedCount: proposeAction.requestedItems?.length ?? 0,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'respond_trade': {
        const respondAction = action as RespondTradeAction;
        const tradeIndex = gameState.pendingTrades.findIndex(t => t.id === respondAction.tradeId);
        const trade = gameState.pendingTrades[tradeIndex];

        if (respondAction.response === 'decline') {
          const newPending = gameState.pendingTrades.filter(t => t.id !== respondAction.tradeId);

          return {
            success: true,
            message: 'Trade declined',
            gameStateChanges: { pendingTrades: newPending },
            events: [{
              timestamp: ctx.timestamp,
              event: 'trade_declined',
              player: ctx.playerId,
              data: { tradeId: respondAction.tradeId },
            }],
            nextTurn: { type: 'same_player' },
          };
        }

        if (respondAction.response === 'counter') {
          const updatedTrade: PendingTrade = {
            ...trade,
            status: 'countered',
            counterOffer: respondAction.counterOffer,
          };

          const newPending = [...gameState.pendingTrades];
          newPending[tradeIndex] = updatedTrade;

          return {
            success: true,
            message: 'Counter offer made',
            gameStateChanges: { pendingTrades: newPending },
            events: [{
              timestamp: ctx.timestamp,
              event: 'trade_countered',
              player: ctx.playerId,
              data: { tradeId: respondAction.tradeId },
            }],
            nextTurn: { type: 'same_player' },
          };
        }

        // Accept - execute the trade
        const newPending = gameState.pendingTrades.filter(t => t.id !== respondAction.tradeId);

        // Get initiator's player state for trade count
        const initiatorState = ctx.getMechanicPlayerState<TradingPlayerState>('trading', trade.initiator);

        return {
          success: true,
          message: 'Trade accepted',
          gameStateChanges: {
            pendingTrades: newPending,
            completedTradesThisRound: gameState.completedTradesThisRound + 1,
          },
          playerStateChanges: {
            [ctx.playerId]: { completedTrades: (ctx.playerState.completedTrades ?? 0) + 1 },
            [trade.initiator]: { completedTrades: (initiatorState?.completedTrades ?? 0) + 1 },
          },
          // Effects to move cards between hands
          effects: [
            {
              type: 'transfer_cards',
              fromPlayer: trade.initiator,
              toPlayer: trade.target,
              cardIds: trade.offeredItems,
            } as any,
            ...(trade.requestedItems.length > 0 ? [{
              type: 'transfer_cards',
              fromPlayer: trade.target,
              toPlayer: trade.initiator,
              cardIds: trade.requestedItems,
            } as any] : []),
          ],
          events: [{
            timestamp: ctx.timestamp,
            event: 'trade_completed',
            data: {
              tradeId: respondAction.tradeId,
              initiator: trade.initiator,
              target: trade.target,
              offeredItems: trade.offeredItems,
              requestedItems: trade.requestedItems,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'cancel_trade': {
        const cancelAction = action as CancelTradeAction;
        const newPending = gameState.pendingTrades.filter(t => t.id !== cancelAction.tradeId);

        return {
          success: true,
          message: 'Trade cancelled',
          gameStateChanges: { pendingTrades: newPending },
          events: [{
            timestamp: ctx.timestamp,
            event: 'trade_cancelled',
            player: ctx.playerId,
            data: { tradeId: cancelAction.tradeId },
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
    ctx: ActionContext<TradingGameState, TradingPlayerState>
  ): ActionAvailability<TradingAction>[] {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<TradingConfig>('trading')!;
    const actions: ActionAvailability<TradingAction>[] = [];

    if (!config.enabled || playerState.blockedFromTrading) {
      return actions;
    }

    // Check for pending trades targeting this player
    const pendingForMe = gameState.pendingTrades.filter(t => t.target === ctx.playerId && t.status === 'pending');

    if (pendingForMe.length > 0) {
      actions.push({
        type: 'respond_trade',
        enabled: true,
        description: `Respond to ${pendingForMe.length} pending trade offer(s)`,
        examples: pendingForMe.slice(0, 2).map(t => ({
          type: 'respond_trade' as const,
          tradeId: t.id,
          response: 'accept' as const,
        })),
      });
    }

    // Check for trades I initiated that I can cancel
    const myPending = gameState.pendingTrades.filter(t => t.initiator === ctx.playerId);
    if (myPending.length > 0) {
      actions.push({
        type: 'cancel_trade',
        enabled: true,
        description: 'Cancel a pending trade you initiated',
        examples: [{ type: 'cancel_trade' as const, tradeId: myPending[0].id }],
      });
    }

    // Can propose new trades
    const myHand = getPlayerHand(ctx, ctx.playerId);
    const tradeableCards = config.allowedTypes
      ? myHand.filter(c => !c.type || config.allowedTypes!.includes(c.type))
      : myHand;

    if (tradeableCards.length > 0) {
      const otherPlayers = ctx.state.turnOrder.filter(p => p !== ctx.playerId);

      actions.push({
        type: 'propose_trade',
        enabled: true,
        description: 'Propose a trade with another player',
        examples: otherPlayers.slice(0, 1).map(target => ({
          type: 'propose_trade' as const,
          targetPlayer: target,
          offeredItems: [tradeableCards[0].id],
          requestedItems: [],
        })),
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly TradingEffect['type'][] {
    return ['block_trade', 'force_trade'] as const;
  },

  applyEffect(
    ctx: EffectContext<TradingGameState, TradingPlayerState>,
    effect: TradingEffect
  ): EffectResult<TradingGameState, TradingPlayerState> {
    const { gameState } = ctx;

    switch (effect.type) {
      case 'block_trade': {
        const blockEffect = effect as BlockTradeEffect;
        const newPending = gameState.pendingTrades.filter(t => t.id !== blockEffect.tradeId);

        return {
          gameStateChanges: { pendingTrades: newPending },
          events: [{
            timestamp: ctx.timestamp,
            event: 'trade_blocked',
            player: ctx.playerId,
            data: { tradeId: blockEffect.tradeId },
          }],
        };
      }

      case 'force_trade': {
        const forceEffect = effect as ForceTradeEffect;
        // Note: Actual card transfer must be triggered separately via cards mechanic
        // This effect logs the forced trade event for tracking purposes

        return {
          events: [{
            timestamp: ctx.timestamp,
            event: 'forced_trade',
            data: {
              from: forceEffect.fromPlayer,
              to: forceEffect.toPlayer,
              items: forceEffect.itemIds,
            },
          }],
        };
      }

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<TradingGameState, TradingPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<TradingGameState, TradingPlayerState> {
    if (boundary === 'round') {
      // Reset round counters
      return {
        gameStateChanges: { completedTradesThisRound: 0 },
        playerStateChanges: {
          [ctx.playerId]: { tradesThisTurn: 0, blockedFromTrading: false },
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
    state: TradingGameState,
    playerId: string
  ): Record<string, unknown> {
    // Only show trades involving this player
    const relevantTrades = state.pendingTrades.filter(
      t => t.initiator === playerId || t.target === playerId
    );

    return {
      pendingTrades: relevantTrades,
      completedTradesThisRound: state.completedTradesThisRound,
    };
  },

  filterPlayerStateForViewer(
    state: TradingPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    return {
      completedTrades: state.completedTrades,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<TradingGameState, TradingPlayerState>
  ): WinConditionResult | null {
    // Trading doesn't have its own win condition
    // "The Trader" objective (complete 4 trades) is tracked via completedTrades
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'trade_proposed',
      'trade_accepted',
      'trade_declined',
      'trade_countered',
      'trade_completed',
      'trade_cancelled',
      'trade_blocked',
      'forced_trade',
    ];
  },
});

export default tradingMechanic;
export * from './types.js';
