/**
 * Board State Mechanic
 *
 * Validates player movement on board games with defined states.
 * Players can only move to valid states defined in the board config.
 *
 * Hooks used:
 * - preValidateAction: Validate move target is a valid board state
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction } from '../types/game.js';

export const boardStateMechanic: MechanicHooks = {
  slug: 'board-state',
  name: 'Board State',

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate move actions
    if (action.type !== 'move') return null;

    // Only for board games (not grid games)
    if (!ctx.config.board) return null;
    if (ctx.config.engine_mechanics?.grid) return null; // Grid takes precedence

    const moveAction = action as { target: string };
    const validStates = ctx.config.board.states || [];

    if (!validStates.includes(moveAction.target)) {
      return {
        valid: false,
        error: `Invalid move target "${moveAction.target}". Valid states: ${validStates.join(', ')}`
      };
    }

    return { valid: true };
  }
};
