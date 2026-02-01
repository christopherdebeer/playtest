/**
 * Probability Mechanic
 *
 * Provides probability-based movement and actions:
 * - Graph-based state machine (nodes connected by weighted edges)
 * - Probability rolls to traverse edges
 * - Boost/penalty effects that modify probabilities
 *
 * This mechanic demonstrates:
 * - Interaction with other mechanics (e.g., card effects modify probabilities)
 * - Effect system for temporary modifiers
 * - Complex state management
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
  BaseEffect,
} from '../core';
import {
  Mechanic,
  InitContext,
  MechanicRegistryView,
  JsonSchema,
  defineMechanic,
} from '../mechanic';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Configuration (from RULES.md)
// ─────────────────────────────────────────────────────────────

export interface ProbabilityConfig {
  board: BoardDefinition;
  startState?: string;        // Default: first state in list
  victoryState?: string;      // State that triggers victory
  allowBoosts?: boolean;      // Can effects modify probability (default: true)
  maxBoost?: number;          // Max probability after boosts (default: 0.95)
  minProbability?: number;    // Min probability after penalties (default: 0.05)
}

export interface BoardDefinition {
  states: string[];
  edges: EdgeDefinition[];
}

export interface EdgeDefinition {
  from: string | string[];    // Can specify multiple sources
  to: string | string[];      // Can specify multiple targets
  probability: number;        // Base probability (0-1)
  bidirectional?: boolean;    // If true, edge works both ways
}

// Normalized edge for internal use
interface NormalizedEdge {
  from: string;
  to: string;
  probability: number;
}

// ─────────────────────────────────────────────────────────────
// Game State
// ─────────────────────────────────────────────────────────────

export interface ProbabilityGameState {
  board: {
    states: string[];
    edges: NormalizedEdge[];
    adjacency: Map<string, NormalizedEdge[]>;  // Pre-computed for fast lookup
  };
  placedEffects: PlacedEffect[];  // Effects placed on states
}

export interface PlacedEffect {
  id: string;
  state: string;            // State where effect is placed
  effect: ProbabilityEffect;
  placedBy: string;         // Player who placed it
  targetMode: 'owner' | 'opponents' | 'all';
}

// ─────────────────────────────────────────────────────────────
// Player State
// ─────────────────────────────────────────────────────────────

export interface ProbabilityPlayerState {
  currentState: string;
  activeEffects: ActiveEffect[];  // Temporary effects on this player
  moveHistory: string[];          // States visited (for game analysis)
}

export interface ActiveEffect {
  id: string;
  effect: ProbabilityEffect;
  remainingTurns?: number;
  source: string;
}

// ─────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────

export type ProbabilityAction =
  | MoveAction
  | PlaceEffectAction;

export interface MoveAction {
  type: 'move';
  target: string;           // Target state
  boost?: string;           // Optional: card name to use as boost (handled by cards mechanic)
}

export interface PlaceEffectAction {
  type: 'place_effect';
  state: string;
  effect: ProbabilityEffect;
  targetMode: 'owner' | 'opponents' | 'all';
}

// ─────────────────────────────────────────────────────────────
// Effects
// ─────────────────────────────────────────────────────────────

export type ProbabilityEffect =
  | ProbabilityBoostEffect
  | ProbabilityPenaltyEffect
  | AutoSuccessEffect
  | BlockMoveEffect;

export interface ProbabilityBoostEffect {
  type: 'probability_boost';
  value: number;            // e.g., 0.2 for +20%
  duration?: { type: 'turns'; count: number };
  source?: string;
  target?: string;
}

export interface ProbabilityPenaltyEffect {
  type: 'probability_penalty';
  value: number;            // e.g., -0.25 for -25%
  duration?: { type: 'turns'; count: number };
  source?: string;
  target?: string;
}

export interface AutoSuccessEffect {
  type: 'auto_success';
  duration?: { type: 'turns'; count: number };
  source?: string;
  target?: string;
}

export interface BlockMoveEffect {
  type: 'block_move';
  duration?: { type: 'turns'; count: number };
  source?: string;
  target?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE AUGMENTATION
// ═══════════════════════════════════════════════════════════════════════════

declare module '../core' {
  interface MechanicStateMap {
    probability: ProbabilityGameState;
  }
  interface PlayerMechanicStateMap {
    probability: ProbabilityPlayerState;
  }
}

declare module '../mechanic' {
  interface MechanicTypeRegistry {
    probability: {
      config: ProbabilityConfig;
      gameState: ProbabilityGameState;
      playerState: ProbabilityPlayerState;
      actions: ProbabilityAction;
      effects: ProbabilityEffect;
    };
  }
}

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

function buildAdjacencyMap(edges: NormalizedEdge[]): Map<string, NormalizedEdge[]> {
  const adjacency = new Map<string, NormalizedEdge[]>();

  for (const edge of edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge);
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
        probability += active.effect.value;  // value is negative
        break;
      case 'auto_success':
        return 1.0;  // Guaranteed success
    }
  }

  // Clamp to configured bounds
  const maxBoost = config.maxBoost ?? 0.95;
  const minProbability = config.minProbability ?? 0.05;

  return Math.max(minProbability, Math.min(maxBoost, probability));
}

function roll(probability: number, random: () => number): boolean {
  return random() < probability;
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
  // ─────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────

  slug: 'probability',
  version: '1.0.0',
  displayName: 'Probability Movement',
  description: 'Graph-based state machine with probability-weighted edges',
  dependencies: [],
  conflicts: ['grid'],  // Can't use both graph and grid movement

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<ProbabilityConfig, any[]> {
    const config = raw as ProbabilityConfig;
    const errors: any[] = [];

    if (!config.board || !config.board.states || !config.board.edges) {
      errors.push({ path: 'board', message: 'board with states and edges is required' });
    }

    if (config.board?.edges) {
      for (let i = 0; i < config.board.edges.length; i++) {
        const edge = config.board.edges[i];
        if (edge.probability < 0 || edge.probability > 1) {
          errors.push({
            path: `board.edges[${i}].probability`,
            message: `probability must be between 0 and 1, got ${edge.probability}`,
          });
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, error: errors };
    }

    return { ok: true, value: config };
  },

  validateConfig(config: ProbabilityConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];
    const states = new Set(config.board.states);

    // Validate all edge references exist
    for (const edge of config.board.edges) {
      const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
      const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

      for (const from of fromStates) {
        if (!states.has(from)) {
          errors.push({
            path: 'board.edges',
            message: `Edge references unknown state "${from}"`,
          });
        }
      }

      for (const to of toStates) {
        if (!states.has(to)) {
          errors.push({
            path: 'board.edges',
            message: `Edge references unknown state "${to}"`,
          });
        }
      }
    }

    // Validate start state exists
    const startState = config.startState ?? config.board.states[0];
    if (!states.has(startState)) {
      errors.push({
        path: 'startState',
        message: `Start state "${startState}" not in states list`,
      });
    }

    // Validate victory state exists if specified
    if (config.victoryState && !states.has(config.victoryState)) {
      errors.push({
        path: 'victoryState',
        message: `Victory state "${config.victoryState}" not in states list`,
      });
    }

    // Check all states are reachable from start
    const reachable = new Set<string>([startState]);
    const edges = normalizeEdges(config.board.edges);
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
          message: `State "${state}" is not reachable from start state "${startState}"`,
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
                  from: {}, // string or array of strings
                  to: {},
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
    const adjacency = buildAdjacencyMap(edges);

    return {
      board: {
        states: config.board.states,
        edges,
        adjacency,
      },
      placedEffects: [],
    };
  },

  initPlayerState(
    config: ProbabilityConfig,
    playerId: string,
    context: InitContext
  ): ProbabilityPlayerState {
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
        // Check if player is blocked
        const blockEffect = playerState.activeEffects.find(e => e.effect.type === 'block_move');
        if (blockEffect) {
          return {
            valid: false,
            errors: [{
              code: 'BLOCKED',
              message: `You are blocked from moving for ${blockEffect.remainingTurns} more turn(s)`,
            }],
          };
        }

        // Check if target is adjacent
        const adjacentEdges = gameState.board.adjacency.get(playerState.currentState) ?? [];
        const validTargets = adjacentEdges.map(e => e.to);

        if (!validTargets.includes(action.target)) {
          return {
            valid: false,
            errors: [{
              code: 'NOT_ADJACENT',
              message: `Cannot move to "${action.target}" from "${playerState.currentState}"`,
              suggestion: `Valid targets: ${validTargets.join(', ')}`,
            }],
          };
        }

        return { valid: true, errors: [] };
      }

      case 'place_effect': {
        // Check if state exists
        if (!gameState.board.states.includes(action.state)) {
          return {
            valid: false,
            errors: [{
              code: 'INVALID_STATE',
              message: `State "${action.state}" does not exist`,
            }],
          };
        }

        return { valid: true, errors: [] };
      }

      default:
        return {
          valid: false,
          errors: [{ message: `Unknown action type: ${(action as any).type}` }],
        };
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
        // Find the edge
        const adjacentEdges = gameState.board.adjacency.get(playerState.currentState) ?? [];
        const edge = adjacentEdges.find(e => e.to === action.target)!;

        // Calculate effective probability with all active effects
        const effectiveProbability = calculateEffectiveProbability(
          edge.probability,
          playerState.activeEffects,
          config
        );

        // Roll for success
        const success = roll(effectiveProbability, Math.random);

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

          // Create active effects from triggered placed effects
          const newActiveEffects = triggeredEffects.map(pe => ({
            id: `active-${Date.now()}-${Math.random()}`,
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

          // Remove triggered placed effects
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
            success: true,  // Action was valid, roll just failed
            message: `Move to ${action.target} failed (needed ${(effectiveProbability * 100).toFixed(0)}%)`,
            events,
            nextTurn: { type: 'advance' },
          };
        }
      }

      case 'place_effect': {
        const newPlacedEffect: PlacedEffect = {
          id: `placed-${Date.now()}-${Math.random()}`,
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

    // Check if blocked
    const blockEffect = playerState.activeEffects.find(e => e.effect.type === 'block_move');

    // Move actions
    const adjacentEdges = gameState.board.adjacency.get(playerState.currentState) ?? [];

    if (adjacentEdges.length === 0) {
      actions.push({
        type: 'move',
        enabled: false,
        description: 'Move to an adjacent state',
        reason: 'No valid moves from current state',
        examples: [],
      });
    } else if (blockEffect) {
      actions.push({
        type: 'move',
        enabled: false,
        description: 'Move to an adjacent state',
        reason: `Blocked for ${blockEffect.remainingTurns} more turn(s)`,
        examples: [],
      });
    } else {
      const examples: MoveAction[] = adjacentEdges.map(edge => {
        const effectiveProbability = calculateEffectiveProbability(
          edge.probability,
          playerState.activeEffects,
          config
        );
        return {
          type: 'move' as const,
          target: edge.to,
          // Include probability in example for agent context
          ...(({ _probability: effectiveProbability } as any)),
        };
      });

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
    const targetState = ctx.getMechanicPlayerState<ProbabilityPlayerState>('probability', targetId)!;

    const newActiveEffect: ActiveEffect = {
      id: `active-${Date.now()}-${Math.random()}`,
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
    if (boundary !== 'turn') {
      return { events: [] };
    }

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
  ): Partial<ProbabilityGameState> {
    // Board is public knowledge
    // Placed effects are public (visible traps/boosts)
    return {
      board: state.board,
      placedEffects: state.placedEffects,
    };
  },

  filterPlayerStateForViewer(
    state: ProbabilityPlayerState,
    viewerId: string,
    ownerId: string
  ): Partial<ProbabilityPlayerState> {
    // All probability state is public
    // (opponents can see each other's positions and active effects)
    return state;
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<ProbabilityGameState, ProbabilityPlayerState>
  ): WinConditionResult | null {
    const config = ctx.getMechanicConfig<ProbabilityConfig>('probability')!;

    if (!config.victoryState) {
      return null;  // No victory state configured
    }

    for (const playerId of ctx.state.turnOrder) {
      const playerState = ctx.getMechanicPlayerState<ProbabilityPlayerState>('probability', playerId);
      if (playerState?.currentState === config.victoryState) {
        return {
          triggered: true,
          winner: playerId,
          reason: `${playerId} reached the victory state "${config.victoryState}"`,
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
