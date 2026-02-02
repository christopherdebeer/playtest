/**
 * Trading Mechanic
 *
 * Player-to-player trading system with configurable constraints.
 * Supports location requirements, item-only trading, and gift restrictions.
 *
 * Hooks used:
 * - preValidateAction: Validate trade_offer and trade_respond actions
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

interface TradeConfig {
  enabled?: boolean;
  require_same_location?: boolean;
  require_adjacent_location?: boolean;
  item_types_only?: boolean;
  allow_gifts?: boolean;
}

interface PendingTrade {
  id: string;
  from: string;
  to: string;
  offer: string[];
  request: string[];
}

export const tradingMechanic: MechanicHooks = {
  slug: 'trading',
  name: 'Trading',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type === 'trade_offer') {
      return validateTradeOffer(ctx, action);
    }

    if (action.type === 'trade_respond') {
      return validateTradeRespond(ctx, action);
    }

    return null;
  }
};

function validateTradeOffer(ctx: HookContext, action: GameAction): ValidationResult | null {
  const tradeAction = action as { target: string; offer: string[]; request: string[] };
  const tradeConfig = ctx.config.engine_mechanics?.trade as TradeConfig | undefined;

  // Check if trading is enabled
  if (!tradeConfig?.enabled) {
    return { valid: false, error: 'Trading is not enabled for this game.' };
  }

  // Validate target player exists
  if (!ctx.state.players[tradeAction.target]) {
    return { valid: false, error: `Invalid trade target "${tradeAction.target}". Player not found.` };
  }

  if (tradeAction.target === ctx.playerId) {
    return { valid: false, error: 'Cannot trade with yourself.' };
  }

  // Check location constraints
  if (tradeConfig.require_same_location) {
    const targetPlayer = ctx.state.players[tradeAction.target];
    if (ctx.player.state !== targetPlayer.state) {
      return {
        valid: false,
        error: `Cannot trade with ${tradeAction.target}. You must be at the same location. You are at "${ctx.player.state}", they are at "${targetPlayer.state}".`
      };
    }
  }

  // Validate offered cards exist in player's hand
  for (const cardName of tradeAction.offer) {
    const card = ctx.player.hand.find(c => c.name === cardName);
    if (!card) {
      return { valid: false, error: `Card "${cardName}" not in your hand. Cannot offer it.` };
    }
    if (tradeConfig.item_types_only && card.type !== 'item') {
      return { valid: false, error: `Card "${cardName}" is not an item. Only items can be traded.` };
    }
  }

  // Validate requested cards exist in target's hand
  const targetPlayer = ctx.state.players[tradeAction.target];
  for (const cardName of tradeAction.request) {
    const card = targetPlayer.hand.find(c => c.name === cardName);
    if (!card) {
      return { valid: false, error: `Card "${cardName}" not in ${tradeAction.target}'s hand. Cannot request it.` };
    }
    if (tradeConfig.item_types_only && card.type !== 'item') {
      return { valid: false, error: `Card "${cardName}" is not an item. Only items can be traded.` };
    }
  }

  // Check if gifts are allowed
  if (tradeAction.request.length === 0 && !tradeConfig.allow_gifts) {
    return { valid: false, error: 'One-sided trades (gifts) are not allowed. You must request something in return.' };
  }

  if (tradeAction.offer.length === 0) {
    return { valid: false, error: 'You must offer at least one card to trade.' };
  }

  return { valid: true };
}

function validateTradeRespond(ctx: HookContext, action: GameAction): ValidationResult | null {
  const respondAction = action as { offerId: string; accept: boolean };
  const pendingTrades = (ctx.state.shared.pendingTrades as PendingTrade[]) || [];
  const trade = pendingTrades.find(t => t.id === respondAction.offerId);

  if (!trade) {
    return { valid: false, error: `Trade offer "${respondAction.offerId}" not found or has expired.` };
  }

  if (trade.to !== ctx.playerId) {
    return { valid: false, error: `This trade offer is not for you. It was sent to ${trade.to}.` };
  }

  // If accepting, verify both players still have the cards
  if (respondAction.accept) {
    const fromPlayer = ctx.state.players[trade.from];

    for (const cardName of trade.offer) {
      if (!fromPlayer.hand.find(c => c.name === cardName)) {
        return { valid: false, error: `Offerer no longer has card "${cardName}". Trade cannot be completed.` };
      }
    }

    for (const cardName of trade.request) {
      if (!ctx.player.hand.find(c => c.name === cardName)) {
        return { valid: false, error: `You no longer have card "${cardName}". Trade cannot be completed.` };
      }
    }
  }

  return { valid: true };
}
