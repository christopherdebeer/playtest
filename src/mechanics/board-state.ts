/**
 * Board State Mechanic
 *
 * Validates player movement on board games with defined states.
 * Players can only move to valid states defined in the board config.
 *
 * Hooks used:
 * - preValidateAction: Validate move target is a valid board state
 * - onExecuteAction: Handle move execution
 * - getAvailableActions: Expose move actions
 * - describeAction: Describe move action
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
import { GameAction, MoveAction, EdgeConfig } from '../types/game.js';
import { applyPlacedCardEffects } from '../core/game.js';

interface BoardConfig {
  states: string[];
  start?: string;
  edges: EdgeConfig[];
}

/**
 * Get valid move targets from the player's current state
 */
function getValidMoveTargets(config: BoardConfig, currentState: string): string[] {
  const targets: string[] = [];

  for (const edge of config.edges) {
    const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
    const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

    if (fromStates.includes(currentState)) {
      targets.push(...toStates);
    }
  }

  // Remove duplicates
  return [...new Set(targets)];
}

export const boardStateMechanic: MechanicHooks = {
  slug: 'board-state',
  name: 'Board State',
  requires: ['board'],

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate move actions
    if (action.type !== 'move') return null;

    // Only for board games (not grid games)
    if (!ctx.config.board) return null;
    if (ctx.config.engine_mechanics?.grid) return null; // Grid takes precedence

    const moveAction = action as MoveAction;
    const validStates = ctx.config.board.states || [];

    if (!validStates.includes(moveAction.target)) {
      return {
        valid: false,
        error: `Invalid move target "${moveAction.target}". Valid states: ${validStates.join(', ')}`
      };
    }

    return { valid: true };
  },

  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const { action, player, playerId, state } = ctx;

    if (action.type !== 'move') return null;

    // Only for board games (not grid games)
    if (!ctx.config.board) return null;
    if (ctx.config.engine_mechanics?.grid) return null;

    const moveAction = action as MoveAction;

    // Apply effects from placed cards at the destination state
    const placedCardEffects = applyPlacedCardEffects(state, playerId, moveAction.target);

    // Update player's state
    player.state = moveAction.target;

    return {
      handled: true,
      stateChanges: {
        playerStateChanges: {
          [playerId]: {
            state: moveAction.target
          }
        }
      },
      advanceTurn: true,
      checkWin: true, // Board games often check win after move
      logMessage: 'player_moved',
      logData: {
        target: moveAction.target,
        placedCardEffects: placedCardEffects.effectsApplied,
        probabilityModifier: placedCardEffects.probabilityModifier
      }
    };
  },

  getAvailableActions(ctx: HookContext): AvailableAction[] {
    // Only for board games (not grid games)
    if (!ctx.config.board) return [];
    if (ctx.config.engine_mechanics?.grid) return [];

    const boardConfig = ctx.config.board as BoardConfig;
    const currentState = ctx.player.state;

    // Get valid targets based on edges from current state
    const validTargets = getValidMoveTargets(boardConfig, currentState);

    if (validTargets.length === 0) {
      // If no edges defined, allow move to any state
      return boardConfig.states
        .filter(s => s !== currentState)
        .map(target => ({
          action: {
            type: 'move',
            target
          } as GameAction,
          priority: 50,
          category: 'movement'
        }));
    }

    return validTargets.map(target => ({
      action: {
        type: 'move',
        target
      } as GameAction,
      priority: 50,
      category: 'movement'
    }));
  },

  describeAction(action: GameAction): ActionDescription | null {
    if (action.type !== 'move') return null;

    const moveAction = action as MoveAction;
    return {
      type: 'move',
      label: 'Move',
      description: `Move to a different location on the board.${moveAction.target ? ` Target: ${moveAction.target}` : ''}`,
      examples: ['move target:"Forest"', 'move target:"Castle"']
    };
  }
};
