/**
 * Probability Mechanic
 *
 * Graph-based state machine with probability-weighted edges.
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
  ProbabilityConfig,
  ProbabilityGameState,
  ProbabilityPlayerState,
  ProbabilityAction,
  ProbabilityEffect,
  NormalizedEdge,
  EdgeDefinition,
  ActiveEffect,
  PlacedEffect,
  MoveAction,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function normalizeEdges(edges: EdgeDefinition[]): NormalizedEdge[] {
  const normalized: NormalizedEdge[] = [];

  for (const edge of edges) {
    const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
    const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

    for (const from of fromStates) {
      for (const to of toStates) {
        normalized.push({ from, to, probability: edge.probability });
        if (edge.bidirectional) {
          normalized.push({ from: to, to: from, probability: edge.probability });
        }
      }
    }
  }

  return normalized;
}

function buildAdjacency(edges: NormalizedEdge[]): Record<string, NormalizedEdge[]> {
  const adjacency: Record<string, NormalizedEdge[]> = {};

  for (const edge of edges) {
    if (!adjacency[edge.from]) adjacency[edge.from] = [];
    adjacency[edge.from].push(edge);
  }

  return adjacency;
}

function calculateEffectiveProbability(
  baseProbability: number,
  effects: ActiveEffect[],
  config: ProbabilityConfig
): number {
  let probability = baseProbability;

  for (const active of effects) {
    switch (active.effect.type) {
      case 'probability_boost':
        probability += active.effect.value;
        break;
      case 'probability_penalty':
        probability += active.effect.value; // value is negative
        break;
      case 'auto_success':
        return 1.0;
    }
  }

  const maxBoost = config.maxBoost ?? 0.95;
  const minProbability = config.minProbability ?? 0.05;

  return Math.max(minProbability, Math.min(maxBoost, probability));
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const probabilityMechanic = defineMechanic<
  'probability',
  ProbabilityConfig,
  ProbabilityGameState,
  ProbabilityPlayerState,
  ProbabilityAction,
  ProbabilityEffect
>({
  slug: 'probability',
  version: '1.0.0',
  displayName: 'Probability Movement',
  description: 'Graph-based state machine with probability-weighted edges',
  dependencies: [],
  conflicts: ['grid'],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<ProbabilityConfig, ValidationError[]> {
    const config = raw as ProbabilityConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Probability config is required' }]);
    }

    if (!config.board) {
      errors.push({ path: 'board', message: 'board is required' });
    } else {
      if (!config.board.states || !Array.isArray(config.board.states) || config.board.states.length === 0) {
        errors.push({ path: 'board.states', message: 'states must be a non-empty array' });
      }

      if (!config.board.edges || !Array.isArray(config.board.edges)) {
        errors.push({ path: 'board.edges', message: 'edges must be an array' });
      } else {
        for (let i = 0; i < config.board.edges.length; i++) {
          const edge = config.board.edges[i];
          if (edge.probability < 0 || edge.probability > 1) {
            errors.push({
              path: `board.edges[${i}].probability`,
              message: `probability must be 0-1, got ${edge.probability}`,
            });
          }
        }
      }
    }

    if (errors.length > 0) return err(errors);
    return ok(config);
  },

  validateConfig(config: ProbabilityConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];
    const states = new Set(config.board.states);

    // Validate edge references
    for (const edge of config.board.edges) {
      const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
      const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

      for (const from of fromStates) {
        if (!states.has(from)) {
          errors.push({ path: 'board.edges', message: `Edge references unknown state "${from}"` });
        }
      }
      for (const to of toStates) {
        if (!states.has(to)) {
          errors.push({ path: 'board.edges', message: `Edge references unknown state "${to}"` });
        }
      }
    }

    // Validate start state
    const startState = config.startState ?? config.board.states[0];
    if (!states.has(startState)) {
      errors.push({ path: 'startState', message: `Start state "${startState}" not in states` });
    }

    // Validate victory state
    if (config.victoryState && !states.has(config.victoryState)) {
      errors.push({ path: 'victoryState', message: `Victory state "${config.victoryState}" not in states` });
    }

    // Check reachability from start
    const edges = normalizeEdges(config.board.edges);
    const reachable = new Set<string>([startState]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) {
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          changed = true;
        }
      }
    }

    for (const state of states) {
      if (!reachable.has(state)) {
        errors.push({
          path: 'board.states',
          message: `State "${state}" is unreachable from start "${startState}"`,
        });
      }
    }

    return errors;
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['board'],
      properties: {
        board: {
          type: 'object',
          required: ['states', 'edges'],
          properties: {
            states: { type: 'array', items: { type: 'string' } },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'to', 'probability'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  probability: { type: 'number', minimum: 0, maximum: 1 },
                  bidirectional: { type: 'boolean' },
                },
              },
            },
          },
        },
        startState: { type: 'string' },
        victoryState: { type: 'string' },
        allowBoosts: { type: 'boolean' },
        maxBoost: { type: 'number', minimum: 0, maximum: 1 },
        minProbability: { type: 'number', minimum: 0, maximum: 1 },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: ProbabilityConfig, context: InitContext): ProbabilityGameState {
    const edges = normalizeEdges(config.board.edges);
    const adjacency = buildAdjacency(edges);

    return {
      board: {
        states: config.board.states,
        edges,
        adjacency,
      },
      placedEffects: [],
    };
  },

  initPlayerState(config: ProbabilityConfig, playerId: string, context: InitContext): ProbabilityPlayerState {
    const startState = config.startState ?? config.board.states[0];
    return {
      currentState: startState,
      activeEffects: [],
      moveHistory: [startState],
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly ProbabilityAction['type'][] {
    return ['move', 'place_effect'] as const;
  },

  validateAction(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>,
    action: ProbabilityAction
  ): ValidationResult {
    const { gameState, playerState } = ctx;

    switch (action.type) {
      case 'move': {
        // Check if blocked
        const blocked = playerState.activeEffects.find(e => e.effect.type === 'block_move');
        if (blocked) {
          return invalidResult([{
            code: 'BLOCKED',
            message: `Blocked from moving for ${blocked.remainingTurns} more turn(s)`,
          }]);
        }

        // Check if target is adjacent
        const adjacentEdges = gameState.board.adjacency[playerState.currentState] ?? [];
        const validTargets = adjacentEdges.map(e => e.to);

        if (!validTargets.includes(action.target)) {
          return invalidResult([{
            code: 'NOT_ADJACENT',
            message: `Cannot move to "${action.target}" from "${playerState.currentState}"`,
            suggestion: `Valid targets: ${validTargets.join(', ')}`,
          }]);
        }

        return validResult();
      }

      case 'place_effect': {
        if (!gameState.board.states.includes(action.state)) {
          return invalidResult([{
            code: 'INVALID_STATE',
            message: `State "${action.state}" does not exist`,
          }]);
        }
        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>,
    action: ProbabilityAction
  ): ExecutionResult<ProbabilityGameState, ProbabilityPlayerState> {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<ProbabilityConfig>('probability')!;

    switch (action.type) {
      case 'move': {
        const adjacentEdges = gameState.board.adjacency[playerState.currentState] ?? [];
        const edge = adjacentEdges.find(e => e.to === action.target)!;

        const effectiveProbability = calculateEffectiveProbability(
          edge.probability,
          playerState.activeEffects,
          config
        );

        const success = ctx.random() < effectiveProbability;

        const events: LogEvent[] = [{
          timestamp: ctx.timestamp,
          event: 'probability_roll',
          player: ctx.playerId,
          data: {
            from: playerState.currentState,
            to: action.target,
            baseProbability: edge.probability,
            effectiveProbability,
            success,
          },
        }];

        if (success) {
          // Check for placed effects at destination
          const triggeredEffects = gameState.placedEffects.filter(pe => {
            if (pe.state !== action.target) return false;
            if (pe.targetMode === 'owner' && pe.placedBy !== ctx.playerId) return false;
            if (pe.targetMode === 'opponents' && pe.placedBy === ctx.playerId) return false;
            return true;
          });

          const newActiveEffects: ActiveEffect[] = triggeredEffects.map(pe => ({
            id: `active-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            effect: pe.effect,
            remainingTurns: pe.effect.duration?.type === 'turns' ? pe.effect.duration.count : undefined,
            source: pe.placedBy,
          }));

          events.push({
            timestamp: ctx.timestamp,
            event: 'state_transition',
            player: ctx.playerId,
            data: {
              from: playerState.currentState,
              to: action.target,
              triggeredEffects: triggeredEffects.length,
            },
          });

          const remainingPlacedEffects = gameState.placedEffects.filter(
            pe => !triggeredEffects.includes(pe)
          );

          return {
            success: true,
            message: `Moved to ${action.target}`,
            gameStateChanges: { placedEffects: remainingPlacedEffects },
            playerStateChanges: {
              [ctx.playerId]: {
                currentState: action.target,
                activeEffects: [...playerState.activeEffects, ...newActiveEffects],
                moveHistory: [...playerState.moveHistory, action.target],
              },
            },
            events,
            nextTurn: { type: 'advance' },
          };
        } else {
          events.push({
            timestamp: ctx.timestamp,
            event: 'move_failed',
            player: ctx.playerId,
            data: {
              from: playerState.currentState,
              attemptedTarget: action.target,
            },
          });

          return {
            success: true, // Action was valid, roll just failed
            message: `Move to ${action.target} failed (needed ${(effectiveProbability * 100).toFixed(0)}%)`,
            events,
            nextTurn: { type: 'advance' },
          };
        }
      }

      case 'place_effect': {
        const newPlacedEffect: PlacedEffect = {
          id: `placed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          state: action.state,
          effect: action.effect,
          placedBy: ctx.playerId,
          targetMode: action.targetMode,
        };

        return {
          success: true,
          message: `Placed ${action.effect.type} on ${action.state}`,
          gameStateChanges: {
            placedEffects: [...gameState.placedEffects, newPlacedEffect],
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'effect_placed',
            player: ctx.playerId,
            data: {
              state: action.state,
              effectType: action.effect.type,
              targetMode: action.targetMode,
            },
          }],
          nextTurn: { type: 'advance' },
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown action type',
          events: [],
          nextTurn: { type: 'same_player' },
        };
    }
  },

  getAvailableActions(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>
  ): ActionAvailability<ProbabilityAction>[] {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<ProbabilityConfig>('probability')!;
    const actions: ActionAvailability<ProbabilityAction>[] = [];

    const blocked = playerState.activeEffects.find(e => e.effect.type === 'block_move');
    const adjacentEdges = gameState.board.adjacency[playerState.currentState] ?? [];

    if (adjacentEdges.length === 0) {
      actions.push({
        type: 'move',
        enabled: false,
        description: 'Move to an adjacent state',
        reason: 'No valid moves from current state',
        examples: [],
      });
    } else if (blocked) {
      actions.push({
        type: 'move',
        enabled: false,
        description: 'Move to an adjacent state',
        reason: `Blocked for ${blocked.remainingTurns} more turn(s)`,
        examples: [],
      });
    } else {
      const examples: MoveAction[] = adjacentEdges.map(edge => ({
        type: 'move' as const,
        target: edge.to,
      }));

      actions.push({
        type: 'move',
        enabled: true,
        description: `Move from ${playerState.currentState} to an adjacent state`,
        examples,
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly ProbabilityEffect['type'][] {
    return ['probability_boost', 'probability_penalty', 'auto_success', 'block_move'] as const;
  },

  applyEffect(
    ctx: EffectContext<ProbabilityGameState, ProbabilityPlayerState>,
    effect: ProbabilityEffect
  ): EffectResult<ProbabilityGameState, ProbabilityPlayerState> {
    const targetId = effect.target ?? ctx.playerId;
    const targetState = ctx.getMechanicPlayerState<ProbabilityPlayerState>('probability', targetId);
    if (!targetState) return { events: [] };

    const newActiveEffect: ActiveEffect = {
      id: `active-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      effect,
      remainingTurns: effect.duration?.type === 'turns' ? effect.duration.count : undefined,
      source: effect.source ?? ctx.playerId,
    };

    return {
      playerStateChanges: {
        [targetId]: {
          activeEffects: [...targetState.activeEffects, newActiveEffect],
        },
      },
      events: [{
        timestamp: ctx.timestamp,
        event: 'effect_applied',
        player: targetId,
        data: {
          effectType: effect.type,
          value: 'value' in effect ? effect.value : undefined,
          duration: effect.duration,
          source: newActiveEffect.source,
        },
      }],
    };
  },

  tickEffects(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<ProbabilityGameState, ProbabilityPlayerState> {
    if (boundary !== 'turn') return { events: [] };

    const playerStateChanges: Record<string, Partial<ProbabilityPlayerState>> = {};
    const events: LogEvent[] = [];
    const expiredEffects: string[] = [];

    for (const playerId of ctx.state.turnOrder) {
      const playerState = ctx.getMechanicPlayerState<ProbabilityPlayerState>('probability', playerId);
      if (!playerState) continue;

      const updatedEffects = playerState.activeEffects
        .map(ae => {
          if (ae.remainingTurns === undefined) return ae;
          return { ...ae, remainingTurns: ae.remainingTurns - 1 };
        })
        .filter(ae => {
          if (ae.remainingTurns !== undefined && ae.remainingTurns <= 0) {
            expiredEffects.push(ae.id);
            events.push({
              timestamp: ctx.timestamp,
              event: 'effect_expired',
              player: playerId,
              data: { effectType: ae.effect.type, effectId: ae.id },
            });
            return false;
          }
          return true;
        });

      if (updatedEffects.length !== playerState.activeEffects.length) {
        playerStateChanges[playerId] = { activeEffects: updatedEffects };
      }
    }

    return { playerStateChanges, events, expiredEffects };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: ProbabilityGameState,
    playerId: string
  ): Record<string, unknown> {
    // Board and placed effects are public
    return {
      board: state.board,
      placedEffects: state.placedEffects,
    };
  },

  filterPlayerStateForViewer(
    state: ProbabilityPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    // All probability state is public
    return { ...state };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>
  ): WinConditionResult | null {
    const config = ctx.getMechanicConfig<ProbabilityConfig>('probability')!;

    if (!config.victoryState) return null;

    for (const playerId of ctx.state.turnOrder) {
      const playerState = ctx.getMechanicPlayerState<ProbabilityPlayerState>('probability', playerId);
      if (playerState?.currentState === config.victoryState) {
        return {
          triggered: true,
          winner: playerId,
          reason: `${playerId} reached victory state "${config.victoryState}"`,
        };
      }
    }

    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'probability_roll',
      'state_transition',
      'move_failed',
      'effect_placed',
      'effect_applied',
      'effect_expired',
      'effect_triggered',
    ] as const;
  },
});

export default probabilityMechanic;
export * from './types.js';
