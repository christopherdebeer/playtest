/**
 * Auction (English) Mechanic
 *
 * English-style ascending bid auctions.
 *
 * Hooks used:
 * - preValidateAction: Validate bid action (sufficient funds, min increment)
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, BidAction } from '../types/game.js';

interface AuctionConfig {
  type: string;
  currency: string;
  min_increment?: number;
}

export const auctionEnglishMechanic: MechanicHooks = {
  slug: 'auction-english',
  name: 'Auction (English)',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type !== 'bid') return null;

    const auctionConfig = ctx.config.engine_mechanics?.auction as AuctionConfig | undefined;
    if (!auctionConfig) {
      return { valid: false, error: 'Bidding is not enabled for this game.' };
    }

    const bidAction = action as BidAction;
    const currency = auctionConfig.currency;
    const available = ctx.player.resources?.[currency] ?? 0;

    if (bidAction.amount > available) {
      return {
        valid: false,
        error: `Not enough ${currency} to bid. You have ${available}, trying to bid ${bidAction.amount}.`
      };
    }

    // Check minimum increment for English auctions
    if (auctionConfig.type === 'english') {
      const currentHighBid = (ctx.state.shared.currentBid as number) ?? 0;
      if (bidAction.amount <= currentHighBid) {
        const minBid = currentHighBid + (auctionConfig.min_increment ?? 1);
        return {
          valid: false,
          error: `Bid too low. Current high bid is ${currentHighBid}. Minimum bid: ${minBid}.`
        };
      }
    }

    return { valid: true };
  }
};
