/**
 * Action Points Mechanic
 *
 * First mechanic extracted from game.ts as proof of concept.
 * Provides action economy: points per turn, costs per action type.
 *
 * Hooks used:
 * - initPlayerState: Set initial action points
 * - preValidateAction: Block if insufficient AP
 * - postExecuteAction: Deduct AP cost
 * - onTurnStart: Reset AP for new turn
 * - shouldAutoEndTurn: Force end when AP depleted
 */

import { MechanicHooks, HookContext, ValidationResult, StateChanges, PlayerInitResult } from './types.js';
import { GameConfig, GameAction, DrawAction } from '../types/game.js';

export const actionPointsMechanic: MechanicHooks = {
  slug: 'action-points',
  name: 'Action Points',

  initPlayerState(config: GameConfig, _playerId: string): PlayerInitResult | null {
    const apConfig = config.engine_mechanics?.action_points;
    if (!apConfig) return null;

    return {
      actionPoints: apConfig.points_per_turn,
      actionPointsUsed: 0
    };
  },

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    const apConfig = ctx.config.engine_mechanics?.action_points;
    if (!apConfig) return null;

    // Skip validation for pass (end turn)
    if (action.type === 'pass') return null;

    const baseCost = apConfig.action_costs[action.type] ?? 1;
    let actionCost = baseCost;

    // For draw actions, cost is per card drawn
    if (action.type === 'draw') {
      const drawAction = action as DrawAction;
      const count = drawAction.count ?? 1;
      actionCost = baseCost * count;
    }

    const remainingAP = ctx.player.actionPoints ?? 0;

    if (actionCost > remainingAP) {
      const costExplanation = action.type === 'draw' && (action as DrawAction).count && (action as DrawAction).count! > 1
        ? ` (${(action as DrawAction).count} cards × ${baseCost} AP each)`
        : '';
      return {
        valid: false,
        error: `Insufficient action points: need ${actionCost}${costExplanation}, have ${remainingAP}`
      };
    }

    return { valid: true };
  },

  postExecuteAction(ctx: HookContext, action: GameAction): StateChanges | null {
    const apConfig = ctx.config.engine_mechanics?.action_points;
    if (!apConfig) return null;
    if (ctx.player.actionPoints === undefined) return null;

    // Skip for pass (end turn)
    if (action.type === 'pass') return null;

    const baseCost = apConfig.action_costs[action.type] ?? 1;
    let cost = baseCost;

    // For draw actions, cost is per card drawn
    if (action.type === 'draw') {
      const drawAction = action as DrawAction;
      const count = drawAction.count ?? 1;
      cost = baseCost * count;
    }

    const newAP = ctx.player.actionPoints - cost;
    const newUsed = (ctx.player.actionPointsUsed ?? 0) + cost;

    return {
      playerStateChanges: {
        [ctx.playerId]: {
          actionPoints: newAP,
          actionPointsUsed: newUsed
        }
      }
    };
  },

  onTurnStart(ctx: HookContext): StateChanges | null {
    const apConfig = ctx.config.engine_mechanics?.action_points;
    if (!apConfig) return null;

    const rollover = apConfig.rollover ? (ctx.player.actionPoints || 0) : 0;
    const newAP = apConfig.points_per_turn + rollover;

    return {
      playerStateChanges: {
        [ctx.playerId]: {
          actionPoints: newAP,
          actionPointsUsed: 0
        }
      }
    };
  },

  shouldAutoEndTurn(ctx: HookContext): boolean {
    const apConfig = ctx.config.engine_mechanics?.action_points;
    if (!apConfig) return false;
    if (ctx.player.actionPoints === undefined) return false;

    // Auto-end turn when AP is 0 (and no rollover configured)
    // Don't auto-end if rollover is enabled - player may want to save AP
    if (!apConfig.rollover && ctx.player.actionPoints <= 0) {
      return true;
    }

    return false;
  }
};
