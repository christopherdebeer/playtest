/**
 * Push Your Luck Mechanic
 *
 * Risk/reward dice rolling with banking.
 *
 * Hooks used:
 * - preValidateAction: Validate roll and bank actions
 * - onExecuteAction: Handle roll and bank execution
 * - getAvailableActions: Expose roll and bank actions
 * - describeAction: Describe roll and bank actions
 */

import {
  MechanicHooks,
  HookContext,
  ValidationResult,
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription
} from './types.js';
import { GameAction } from '../types/game.js';

interface PushYourLuckConfig {
  max_rolls?: number;
  dice_sides: number;
  bust_threshold: number;
  points_per_success: number;
}

export const pushYourLuckMechanic: MechanicHooks = {
  slug: 'push-your-luck',
  name: 'Push Your Luck',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (action.type !== 'roll' && action.type !== 'bank') return null;

    const pylConfig = ctx.config.engine_mechanics?.push_your_luck as PushYourLuckConfig | undefined;
    if (!pylConfig) {
      return { valid: false, error: 'Push your luck is not enabled for this game.' };
    }

    if (action.type === 'bank') {
      const accumulated = ctx.player.rollAccumulator ?? 0;
      if (accumulated === 0) {
        return { valid: false, error: 'No accumulated points to bank. Roll first!' };
      }
    }

    if (action.type === 'roll') {
      const rollCount = ctx.player.rollCount ?? 0;
      if (pylConfig.max_rolls && rollCount >= pylConfig.max_rolls) {
        return { valid: false, error: `Maximum rolls (${pylConfig.max_rolls}) reached. You must bank.` };
      }
    }

    return { valid: true };
  },

  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const { action, player, playerId, state } = ctx;

    if (action.type !== 'roll' && action.type !== 'bank') return null;

    const pylConfig = ctx.config.engine_mechanics?.push_your_luck as PushYourLuckConfig | undefined;
    if (!pylConfig) return null;

    if (action.type === 'roll') {
      // Roll the dice
      const rollValue = Math.floor(Math.random() * pylConfig.dice_sides) + 1;
      const isBust = rollValue <= pylConfig.bust_threshold;

      const newRollCount = (player.rollCount ?? 0) + 1;

      if (isBust) {
        // Bust! Lose all accumulated points
        const lostPoints = player.rollAccumulator ?? 0;

        return {
          handled: true,
          stateChanges: {
            playerStateChanges: {
              [playerId]: {
                rollAccumulator: 0,
                rollCount: 0
              }
            }
          },
          advanceTurn: true,
          checkWin: false,
          logMessage: 'push_your_luck_bust',
          logData: { roll: rollValue, lostPoints }
        };
      } else {
        // Success! Add points to accumulator
        const newAccumulated = (player.rollAccumulator ?? 0) + pylConfig.points_per_success;

        return {
          handled: true,
          stateChanges: {
            playerStateChanges: {
              [playerId]: {
                rollAccumulator: newAccumulated,
                rollCount: newRollCount
              }
            }
          },
          advanceTurn: false, // Player can roll again or bank
          checkWin: false,
          logMessage: 'push_your_luck_roll',
          logData: { roll: rollValue, points: pylConfig.points_per_success, accumulated: newAccumulated }
        };
      }
    }

    if (action.type === 'bank') {
      const bankedPoints = player.rollAccumulator ?? 0;
      const newScore = (player.score ?? 0) + bankedPoints;

      return {
        handled: true,
        stateChanges: {
          playerStateChanges: {
            [playerId]: {
              score: newScore,
              rollAccumulator: 0,
              rollCount: 0
            }
          }
        },
        advanceTurn: true,
        checkWin: true, // Check win after banking
        logMessage: 'push_your_luck_bank',
        logData: { bankedPoints, totalScore: newScore }
      };
    }

    return null;
  },

  getAvailableActions(ctx: HookContext): AvailableAction[] {
    const pylConfig = ctx.config.engine_mechanics?.push_your_luck as PushYourLuckConfig | undefined;
    if (!pylConfig) return [];

    const actions: AvailableAction[] = [];
    const accumulated = ctx.player.rollAccumulator ?? 0;
    const rollCount = ctx.player.rollCount ?? 0;
    const canRoll = !pylConfig.max_rolls || rollCount < pylConfig.max_rolls;
    const canBank = accumulated > 0;

    if (canRoll) {
      actions.push({
        action: { type: 'roll' } as GameAction,
        priority: 50,
        category: 'push-your-luck'
      });
    }

    if (canBank) {
      actions.push({
        action: { type: 'bank' } as GameAction,
        priority: 49,
        category: 'push-your-luck'
      });
    }

    return actions;
  },

  describeAction(action: GameAction): ActionDescription | null {
    if (action.type === 'roll') {
      return {
        type: 'roll',
        label: 'Roll Dice',
        description: 'Roll the dice to accumulate points. Risk busting and losing accumulated points.',
        examples: ['roll']
      };
    }

    if (action.type === 'bank') {
      return {
        type: 'bank',
        label: 'Bank Points',
        description: 'Bank your accumulated points to add them to your score safely.',
        examples: ['bank']
      };
    }

    return null;
  }
};
