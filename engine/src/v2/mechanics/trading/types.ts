/**
 * Trading Mechanic Types
 *
 * Handles item exchange between players.
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface TradingConfig {
  enabled: boolean;
  itemTypesOnly?: boolean;        // Only certain card types can be traded
  allowedTypes?: string[];        // Which card types are tradeable
  requireSameLocation?: boolean;  // Must be at same grid position
  requireAdjacent?: boolean;      // Must be at adjacent positions
  allowGifts?: boolean;           // One-sided trades allowed
  maxCardsPerTrade?: number;      // Limit on cards in a single trade
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface TradingGameState {
  pendingTrades: PendingTrade[];
  completedTradesThisRound: number;
}

export interface PendingTrade {
  id: string;
  initiator: string;
  target: string;
  offeredItems: string[];     // Card IDs from initiator
  requestedItems: string[];   // Card IDs from target (empty for gifts)
  status: 'pending' | 'accepted' | 'declined' | 'countered';
  createdAt: string;
  counterOffer?: {
    offeredItems: string[];
    requestedItems: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface TradingPlayerState {
  completedTrades: number;
  tradesThisTurn: number;
  blockedFromTrading?: boolean;  // Guardian ability
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type TradingAction =
  | ProposeTradeAction
  | RespondTradeAction
  | CancelTradeAction;

export interface ProposeTradeAction extends BaseAction {
  type: 'propose_trade';
  targetPlayer: string;
  offeredItems: string[];     // Card IDs to give
  requestedItems?: string[];  // Card IDs to receive (optional for gifts)
}

export interface RespondTradeAction extends BaseAction {
  type: 'respond_trade';
  tradeId: string;
  response: 'accept' | 'decline' | 'counter';
  counterOffer?: {
    offeredItems: string[];
    requestedItems: string[];
  };
}

export interface CancelTradeAction extends BaseAction {
  type: 'cancel_trade';
  tradeId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type TradingEffect =
  | BlockTradeEffect
  | ForceTradeEffect;

export interface BlockTradeEffect extends BaseEffect {
  type: 'block_trade';
  tradeId: string;
}

export interface ForceTradeEffect extends BaseEffect {
  type: 'force_trade';
  fromPlayer: string;
  toPlayer: string;
  itemIds: string[];
}
