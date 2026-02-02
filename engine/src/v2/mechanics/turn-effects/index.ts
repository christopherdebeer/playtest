/**
 * Turn Effects Mechanic
 *
 * Handles turn order modifications common in card games:
 * - Skip: Next player loses their turn
 * - Reverse: Play direction changes
 * - Draw N: Next player must draw cards and loses turn
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
  TurnEffectsConfig,
  TurnEffectsGameState,
  TurnEffectsPlayerState,
  TurnEffectsAction,
  TurnEffectsEffect,
  SkipEffect,
  ReverseEffect,
  DrawNEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const turnEffectsMechanic = defineMechanic<
  'turn-effects',
  TurnEffectsConfig,
  TurnEffectsGameState,
  TurnEffectsPlayerState,
  TurnEffectsAction,
  TurnEffectsEffect
>({
  slug: 'turn-effects',
  version: '1.0.0',
  displayName: 'Turn Effects',
  description: 'Turn order modifications: skip, reverse, draw-N',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<TurnEffectsConfig, ValidationError[]> {
    const config = (raw || {}) as TurnEffectsConfig;
    return ok({
      allowStacking: config.allowStacking ?? false,
      reverseIn2Player: config.reverseIn2Player ?? 'skip',
    });
  },

  validateConfig(config: TurnEffectsConfig, registry: MechanicRegistryView): ValidationError[] {
    return [];
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        allowStacking: { type: 'boolean', default: false },
        reverseIn2Player: { type: 'string', enum: ['skip', 'reverse'], default: 'skip' },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: TurnEffectsConfig, context: InitContext): TurnEffectsGameState {
    return {
      direction: 'clockwise',
      pendingDraws: 0,
      skipNextPlayer: false,
    };
  },

  initPlayerState(config: TurnEffectsConfig, playerId: string, context: InitContext): TurnEffectsPlayerState {
    return {
      mustDraw: 0,
      isSkipped: false,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly TurnEffectsAction['type'][] {
    return ['accept_draws'] as const;
  },

  validateAction(
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>,
    action: TurnEffectsAction
  ): ValidationResult {
    if (action.type === 'accept_draws') {
      const { playerState } = ctx;
      if (playerState.mustDraw === 0) {
        return invalidResult([{ message: 'No pending draws to accept' }]);
      }
      return validResult();
    }
    return invalidResult([{ message: `Unknown action type: ${action.type}` }]);
  },

  executeAction(
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>,
    action: TurnEffectsAction
  ): ExecutionResult<TurnEffectsGameState, TurnEffectsPlayerState> {
    if (action.type === 'accept_draws') {
      const { playerState } = ctx;
      const drawCount = playerState.mustDraw;

      return {
        success: true,
        message: `Must draw ${drawCount} cards`,
        playerStateChanges: {
          [ctx.playerId]: { mustDraw: 0 },
        },
        effects: [
          { type: 'draw_cards', count: drawCount } as any, // Cards mechanic effect
        ],
        events: [
          {
            timestamp: ctx.timestamp,
            event: 'draws_accepted',
            player: ctx.playerId,
            data: { count: drawCount },
          },
        ],
        nextTurn: { type: 'advance' }, // Lose turn after drawing
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
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>
  ): ActionAvailability<TurnEffectsAction>[] {
    const { playerState } = ctx;
    const actions: ActionAvailability<TurnEffectsAction>[] = [];

    if (playerState.mustDraw > 0) {
      actions.push({
        type: 'accept_draws',
        enabled: true,
        description: `Accept ${playerState.mustDraw} penalty draws (ends turn)`,
        examples: [{ type: 'accept_draws' }],
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly TurnEffectsEffect['type'][] {
    return ['skip', 'reverse', 'draw_n', 'clear_pending'] as const;
  },

  applyEffect(
    ctx: EffectContext<TurnEffectsGameState, TurnEffectsPlayerState>,
    effect: TurnEffectsEffect
  ): EffectResult<TurnEffectsGameState, TurnEffectsPlayerState> {
    const { gameState } = ctx;
    const config = ctx.getMechanicConfig<TurnEffectsConfig>('turn-effects')!;
    const playerCount = ctx.state.turnOrder.length;

    switch (effect.type) {
      case 'skip': {
        const skipEffect = effect as SkipEffect;
        const skipCount = skipEffect.count ?? 1;

        return {
          gameStateChanges: { skipNextPlayer: true },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'skip_applied',
              data: { count: skipCount },
            },
          ],
        };
      }

      case 'reverse': {
        // In 2-player games, reverse typically acts as skip
        if (playerCount === 2 && config.reverseIn2Player === 'skip') {
          return {
            gameStateChanges: { skipNextPlayer: true },
            events: [
              {
                timestamp: ctx.timestamp,
                event: 'reverse_as_skip',
                data: { playerCount: 2 },
              },
            ],
          };
        }

        const newDirection = gameState.direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
        return {
          gameStateChanges: { direction: newDirection },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'direction_reversed',
              data: { newDirection },
            },
          ],
        };
      }

      case 'draw_n': {
        const drawEffect = effect as DrawNEffect;
        let newPending = drawEffect.count;

        if (config.allowStacking && drawEffect.stackable) {
          newPending = gameState.pendingDraws + drawEffect.count;
        }

        // Find next player and set their mustDraw
        const currentIdx = ctx.state.turnOrder.indexOf(ctx.playerId);
        const direction = gameState.direction === 'clockwise' ? 1 : -1;
        const nextIdx = (currentIdx + direction + playerCount) % playerCount;
        const nextPlayer = ctx.state.turnOrder[nextIdx];

        return {
          gameStateChanges: { pendingDraws: 0 },
          playerStateChanges: {
            [nextPlayer]: { mustDraw: newPending },
          },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'draw_penalty_applied',
              player: nextPlayer,
              data: { count: newPending },
            },
          ],
        };
      }

      case 'clear_pending': {
        return {
          gameStateChanges: { pendingDraws: 0, skipNextPlayer: false },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'pending_effects_cleared',
            },
          ],
        };
      }
    }

    return { events: [] };
  },

  tickEffects(
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<TurnEffectsGameState, TurnEffectsPlayerState> {
    // Clear skip flag at end of turn (it was already applied)
    if (boundary === 'turn' && ctx.gameState.skipNextPlayer) {
      return {
        gameStateChanges: { skipNextPlayer: false },
        events: [],
      };
    }
    return { events: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Turn Order Override
  // ─────────────────────────────────────────────────────────────

  getNextPlayer(
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>
  ): string | null {
    const { gameState } = ctx;
    const turnOrder = ctx.state.turnOrder;
    const playerCount = turnOrder.length;
    const currentIdx = turnOrder.indexOf(ctx.state.currentPlayer!);

    // Determine direction
    const direction = gameState.direction === 'clockwise' ? 1 : -1;

    // Calculate next player, accounting for skip
    let skip = gameState.skipNextPlayer ? 2 : 1;
    const nextIdx = (currentIdx + direction * skip + playerCount * 2) % playerCount;

    return turnOrder[nextIdx];
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: TurnEffectsGameState,
    playerId: string
  ): Record<string, unknown> {
    return {
      direction: state.direction,
      pendingDraws: state.pendingDraws,
      skipNextPlayer: state.skipNextPlayer,
    };
  },

  filterPlayerStateForViewer(
    state: TurnEffectsPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    return {
      mustDraw: state.mustDraw,
      isSkipped: state.isSkipped,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<TurnEffectsGameState, TurnEffectsPlayerState>
  ): WinConditionResult | null {
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'skip_applied',
      'reverse_as_skip',
      'direction_reversed',
      'draw_penalty_applied',
      'draws_accepted',
      'pending_effects_cleared',
    ];
  },
});

export default turnEffectsMechanic;
export * from './types.js';
