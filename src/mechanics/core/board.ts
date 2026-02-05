/**
 * Board Core Service
 *
 * Manages board state operations for games with board/state-based movement.
 * This is a "trunk" mechanic that board-related mechanics depend on.
 *
 * Hooks:
 * - onBeforeMove: Can modify target or block move
 * - onAfterMove: Notified after player moved
 */

import { GameState, BoardConfig, EdgeConfig } from '../../types/game.js';
import { mechanicRegistry, applyStateChanges } from '../registry.js';

/**
 * Result from move operation
 */
export interface MoveResult {
  /** True if the move was successful */
  success: boolean;
  /** Previous state before move */
  previousState?: string;
  /** New state after move */
  newState?: string;
  /** True if move was blocked by a hook */
  blocked?: boolean;
  /** Reason for blocking or error */
  reason?: string;
}

/**
 * Get a player's current board state.
 */
export function getBoardState(state: GameState, playerId: string): string {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return player.state;
}

/**
 * Set a player's board state directly.
 * Calls onBeforeMove and onAfterMove hooks.
 *
 * @returns Result indicating success
 */
export function setBoardState(
  state: GameState,
  playerId: string,
  newState: string
): MoveResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const previousState = player.state;

  // Run onBeforeMove hooks (global - all mechanics)
  const beforeResult = mechanicRegistry.onBeforeMove(state, playerId, newState);
  if (beforeResult.blocked) {
    return {
      success: false,
      blocked: true,
      reason: beforeResult.blockReason
    };
  }

  let targetState = beforeResult.target ?? newState;

  // Board-defined hook (only board dependents) - strangler fig dual-fire
  const definedBeforeResult = mechanicRegistry.fire('board', 'onBeforePlayerMove', state, playerId, {
    fromState: previousState, toState: targetState
  });
  if (definedBeforeResult && (definedBeforeResult as Record<string, unknown>).blocked) {
    const blockReason = (definedBeforeResult as Record<string, unknown>).blockReason as string | undefined;
    return { success: false, blocked: true, reason: blockReason };
  }
  if (definedBeforeResult && typeof (definedBeforeResult as Record<string, unknown>).target === 'string') {
    targetState = (definedBeforeResult as Record<string, unknown>).target as string;
  }

  // Apply the state change
  player.state = targetState;

  // Run onAfterMove hooks (global - all mechanics)
  const afterChanges = mechanicRegistry.onAfterMove(state, playerId, previousState, targetState);
  applyStateChanges(state, afterChanges);

  // Board-defined hook (only board dependents) - strangler fig dual-fire
  const boardAfterChanges = mechanicRegistry.fire('board', 'onPlayerMoved', state, playerId, {
    fromState: previousState, toState: targetState
  });
  if (boardAfterChanges) applyStateChanges(state, boardAfterChanges);

  return {
    success: true,
    previousState,
    newState: targetState
  };
}

/**
 * Get all valid board states from the config.
 */
export function getBoardStates(state: GameState): string[] {
  if (!state.config.board) {
    return [];
  }

  return [...state.config.board.states];
}

/**
 * Get the starting state for the board.
 */
export function getStartingState(state: GameState): string | null {
  if (!state.config.board) {
    return null;
  }

  return state.config.board.start ?? state.config.board.states[0] ?? null;
}

/**
 * Check if a state is a valid board state.
 */
export function isValidState(state: GameState, targetState: string): boolean {
  if (!state.config.board) {
    return false;
  }

  return state.config.board.states.includes(targetState);
}

/**
 * Get valid move targets from a specific state based on edges.
 * If no edges are defined from the state, returns all states except current.
 */
export function getValidMoveTargets(state: GameState, fromState: string): string[] {
  if (!state.config.board) {
    return [];
  }

  const boardConfig = state.config.board;
  const targets: string[] = [];

  for (const edge of boardConfig.edges || []) {
    const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
    const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

    if (fromStates.includes(fromState)) {
      targets.push(...toStates);
    }
  }

  // Remove duplicates
  const uniqueTargets = [...new Set(targets)];

  // If no edges defined from this state, allow move to any state
  if (uniqueTargets.length === 0) {
    return boardConfig.states.filter(s => s !== fromState);
  }

  return uniqueTargets;
}

/**
 * Get valid move targets for a player from their current state.
 */
export function getValidMoveTargetsForPlayer(state: GameState, playerId: string): string[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  return getValidMoveTargets(state, player.state);
}

/**
 * Check if a move from one state to another is valid based on edges.
 */
export function isValidMove(state: GameState, fromState: string, toState: string): boolean {
  const validTargets = getValidMoveTargets(state, fromState);
  return validTargets.includes(toState);
}

/**
 * Get the edge config between two states (if exists).
 */
export function getEdge(state: GameState, fromState: string, toState: string): EdgeConfig | null {
  if (!state.config.board) {
    return null;
  }

  for (const edge of state.config.board.edges || []) {
    const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
    const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

    if (fromStates.includes(fromState) && toStates.includes(toState)) {
      return edge;
    }
  }

  return null;
}

/**
 * Get the probability for a move (from edge config).
 * Returns 1.0 (100%) if no probability is defined.
 */
export function getMoveProbability(state: GameState, fromState: string, toState: string): number {
  const edge = getEdge(state, fromState, toState);
  return edge?.probability ?? 1.0;
}

/**
 * Get all players at a specific board state.
 */
export function getPlayersAtState(state: GameState, boardState: string): string[] {
  return Object.entries(state.players)
    .filter(([_, player]) => player.state === boardState)
    .map(([playerId]) => playerId);
}

/**
 * Check if a board is configured for this game.
 */
export function hasBoard(state: GameState): boolean {
  return !!state.config.board;
}

/**
 * Get all edges from the board config.
 */
export function getEdges(state: GameState): EdgeConfig[] {
  if (!state.config.board) {
    return [];
  }

  return [...(state.config.board.edges || [])];
}
