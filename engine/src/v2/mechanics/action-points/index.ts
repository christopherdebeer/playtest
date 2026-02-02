/**
 * Action Points Mechanic
 *
 * Provides action point economy for turn-based games.
 * Actions cost points, and points reset (or optionally rollover) each turn.
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
  ActionPointsConfig,
  ActionPointsGameState,
  ActionPointsPlayerState,
  ActionPointsAction,
  ActionPointsEffect,
  SpendPointsEffect,
  GainPointsEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const actionPointsMechanic = defineMechanic<
  'action-points',
  ActionPointsConfig,
  ActionPointsGameState,
  ActionPointsPlayerState,
  ActionPointsAction,
  ActionPointsEffect
>({
  slug: 'action-points',
  version: '1.0.0',
  displayName: 'Action Points',
  description: 'Action point economy - actions cost points that refresh each turn',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<ActionPointsConfig, ValidationError[]> {
    const config = raw as ActionPointsConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Action points config is required' }]);
    }

    if (typeof config.pointsPerTurn !== 'number' || config.pointsPerTurn < 1) {
      errors.push({ path: 'pointsPerTurn', message: 'pointsPerTurn must be a positive number' });
    }

    if (!config.actionCosts || typeof config.actionCosts !== 'object') {
      errors.push({ path: 'actionCosts', message: 'actionCosts must be an object' });
    } else {
      for (const [action, cost] of Object.entries(config.actionCosts)) {
        if (typeof cost !== 'number' || cost < 0) {
          errors.push({ path: `actionCosts.${action}`, message: 'cost must be a non-negative number' });
        }
      }
    }

    if (errors.length > 0) return err(errors);
    return ok(config);
  },

  validateConfig(config: ActionPointsConfig, registry: MechanicRegistryView): ValidationError[] {
    return [];
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['pointsPerTurn', 'actionCosts'],
      properties: {
        pointsPerTurn: { type: 'number', minimum: 1 },
        actionCosts: {
          type: 'object',
          additionalProperties: { type: 'number', minimum: 0 },
        },
        rollover: { type: 'boolean', default: false },
        maxPoints: { type: 'number', minimum: 1 },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: ActionPointsConfig, context: InitContext): ActionPointsGameState {
    return {};
  },

  initPlayerState(config: ActionPointsConfig, playerId: string, context: InitContext): ActionPointsPlayerState {
    const maxPoints = config.maxPoints ?? config.pointsPerTurn * 2;
    return {
      currentPoints: config.pointsPerTurn,
      maxPoints,
      usedThisTurn: 0,
    };
  },

  onGameStart(
    config: ActionPointsConfig,
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>
  ): ExecutionResult<ActionPointsGameState, ActionPointsPlayerState> {
    return {
      success: true,
      events: [],
      nextTurn: { type: 'same_player' },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly ActionPointsAction['type'][] {
    return ['end_turn'] as const;
  },

  validateAction(
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>,
    action: ActionPointsAction
  ): ValidationResult {
    if (action.type === 'end_turn') {
      return validResult();
    }
    return invalidResult([{ message: `Unknown action type: ${action.type}` }]);
  },

  executeAction(
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>,
    action: ActionPointsAction
  ): ExecutionResult<ActionPointsGameState, ActionPointsPlayerState> {
    const { playerState } = ctx;
    const config = ctx.getMechanicConfig<ActionPointsConfig>('action-points')!;

    if (action.type === 'end_turn') {
      // Calculate new points for next turn
      let newPoints = config.pointsPerTurn;
      if (config.rollover) {
        newPoints = Math.min(
          playerState.currentPoints + config.pointsPerTurn,
          playerState.maxPoints
        );
      }

      return {
        success: true,
        message: 'Turn ended',
        playerStateChanges: {
          [ctx.playerId]: {
            currentPoints: newPoints,
            usedThisTurn: 0,
          },
        },
        events: [
          {
            timestamp: ctx.timestamp,
            event: 'turn_ended',
            player: ctx.playerId,
            data: { pointsRemaining: playerState.currentPoints, newPoints },
          },
        ],
        nextTurn: { type: 'advance' },
      };
    }

    return {
      success: false,
      message: `Unknown action: ${action.type}`,
      events: [],
      nextTurn: { type: 'same_player' },
    };
  },

  getAvailableActions(
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>
  ): ActionAvailability<ActionPointsAction>[] {
    const { playerState } = ctx;

    return [
      {
        type: 'end_turn',
        enabled: true,
        description: `End turn (${playerState.currentPoints} AP remaining)`,
        examples: [{ type: 'end_turn' }],
      },
    ];
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly ActionPointsEffect['type'][] {
    return ['spend_points', 'gain_points', 'reset_points'] as const;
  },

  applyEffect(
    ctx: EffectContext<ActionPointsGameState, ActionPointsPlayerState>,
    effect: ActionPointsEffect
  ): EffectResult<ActionPointsGameState, ActionPointsPlayerState> {
    const { playerState } = ctx;

    switch (effect.type) {
      case 'spend_points': {
        const spendEffect = effect as SpendPointsEffect;
        const newPoints = playerState.currentPoints - spendEffect.cost;

        if (newPoints < 0) {
          return {
            events: [
              {
                timestamp: ctx.timestamp,
                event: 'spend_points_failed',
                player: ctx.playerId,
                data: { cost: spendEffect.cost, available: playerState.currentPoints },
              },
            ],
          };
        }

        return {
          playerStateChanges: {
            [ctx.playerId]: {
              currentPoints: newPoints,
              usedThisTurn: playerState.usedThisTurn + spendEffect.cost,
            },
          },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'points_spent',
              player: ctx.playerId,
              data: { cost: spendEffect.cost, remaining: newPoints, action: spendEffect.actionType },
            },
          ],
        };
      }

      case 'gain_points': {
        const gainEffect = effect as GainPointsEffect;
        const newPoints = Math.min(
          playerState.currentPoints + gainEffect.amount,
          playerState.maxPoints
        );

        return {
          playerStateChanges: {
            [ctx.playerId]: { currentPoints: newPoints },
          },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'points_gained',
              player: ctx.playerId,
              data: { amount: gainEffect.amount, newTotal: newPoints },
            },
          ],
        };
      }

      case 'reset_points': {
        const config = ctx.getMechanicConfig<ActionPointsConfig>('action-points')!;
        return {
          playerStateChanges: {
            [ctx.playerId]: {
              currentPoints: config.pointsPerTurn,
              usedThisTurn: 0,
            },
          },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'points_reset',
              player: ctx.playerId,
            },
          ],
        };
      }
    }

    return { events: [] };
  },

  tickEffects(
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<ActionPointsGameState, ActionPointsPlayerState> {
    // Reset points at turn boundary if this is the current player's turn ending
    if (boundary === 'turn') {
      const config = ctx.getMechanicConfig<ActionPointsConfig>('action-points')!;
      const { playerState } = ctx;

      let newPoints = config.pointsPerTurn;
      if (config.rollover) {
        newPoints = Math.min(
          playerState.currentPoints + config.pointsPerTurn,
          playerState.maxPoints
        );
      }

      return {
        playerStateChanges: {
          [ctx.playerId]: {
            currentPoints: newPoints,
            usedThisTurn: 0,
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
    state: ActionPointsGameState,
    playerId: string
  ): Record<string, unknown> {
    return {};
  },

  filterPlayerStateForViewer(
    state: ActionPointsPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    // AP is public knowledge
    return {
      currentPoints: state.currentPoints,
      maxPoints: state.maxPoints,
      usedThisTurn: state.usedThisTurn,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<ActionPointsGameState, ActionPointsPlayerState>
  ): WinConditionResult | null {
    // AP mechanic doesn't have its own win condition
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'turn_ended',
      'points_spent',
      'points_gained',
      'points_reset',
      'spend_points_failed',
    ];
  },
});

export default actionPointsMechanic;
export * from './types.js';

/**
 * Helper to check if player has enough AP for an action.
 * Other mechanics can use this to validate their actions.
 */
export function hasEnoughPoints(
  playerState: ActionPointsPlayerState,
  cost: number
): boolean {
  return playerState.currentPoints >= cost;
}

/**
 * Helper to get the cost of an action from config.
 */
export function getActionCost(
  config: ActionPointsConfig,
  actionType: string
): number {
  return config.actionCosts[actionType] ?? 0;
}
