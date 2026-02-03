/**
 * Turns Core Service
 *
 * Manages turn and round operations.
 * This is a "trunk" mechanic that turn-based mechanics depend on.
 *
 * Uses existing hooks:
 * - onTurnStart: Called at start of player's turn
 * - onTurnEnd: Called at end of player's turn (before advancing)
 */

import { GameState } from '../../types/game.js';
import { mechanicRegistry, applyStateChanges } from '../registry.js';

/**
 * Get the current player's ID.
 */
export function getCurrentPlayer(state: GameState): string | null {
  return state.currentPlayer;
}

/**
 * Get the turn order array.
 */
export function getTurnOrder(state: GameState): string[] {
  return [...state.turnOrder];
}

/**
 * Check if it's a specific player's turn.
 */
export function isPlayersTurn(state: GameState, playerId: string): boolean {
  return state.currentPlayer === playerId;
}

/**
 * Get the current round number.
 */
export function getCurrentRound(state: GameState): number {
  return state.round;
}

/**
 * Get the current turn number (total turns taken).
 */
export function getTurnNumber(state: GameState): number {
  return state.turnNumber;
}

/**
 * Get the index of the current player in turn order.
 */
export function getCurrentPlayerIndex(state: GameState): number {
  if (!state.currentPlayer) return -1;
  return state.turnOrder.indexOf(state.currentPlayer);
}

/**
 * Get the next player in turn order.
 * Does not modify state - just returns who would be next.
 */
export function getNextPlayer(state: GameState): string | null {
  if (!state.currentPlayer) return null;
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  return state.turnOrder[nextIndex];
}

/**
 * Get the previous player in turn order.
 */
export function getPreviousPlayer(state: GameState): string | null {
  if (!state.currentPlayer) return null;
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  const prevIndex = (currentIndex - 1 + state.turnOrder.length) % state.turnOrder.length;
  return state.turnOrder[prevIndex];
}

/**
 * Check if the current turn is the last turn of the round.
 * (i.e., advancing would start a new round)
 */
export function isLastTurnOfRound(state: GameState): boolean {
  if (!state.currentPlayer) return false;
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer);
  return currentIndex === state.turnOrder.length - 1;
}

/**
 * Get the number of players in the game.
 */
export function getPlayerCount(state: GameState): number {
  return state.turnOrder.length;
}

/**
 * Get all active player IDs (not eliminated).
 */
export function getActivePlayers(state: GameState): string[] {
  return state.turnOrder.filter(playerId => {
    const player = state.players[playerId];
    if (!player) return false;
    if (player.state === 'eliminated') return false;
    if (player.effects?.some(e => e.type === 'eliminated')) return false;
    return true;
  });
}

/**
 * Check if a player is active (not eliminated).
 */
export function isPlayerActive(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (player.state === 'eliminated') return false;
  if (player.effects?.some(e => e.type === 'eliminated')) return false;
  return true;
}

/**
 * Get opponent player IDs (all players except the specified one).
 */
export function getOpponents(state: GameState, playerId: string): string[] {
  return state.turnOrder.filter(pid => pid !== playerId);
}

/**
 * Get active opponent player IDs.
 */
export function getActiveOpponents(state: GameState, playerId: string): string[] {
  return getActivePlayers(state).filter(pid => pid !== playerId);
}

/**
 * Check if only one active player remains.
 */
export function isOnlyOnePlayerRemaining(state: GameState): boolean {
  return getActivePlayers(state).length === 1;
}

/**
 * Get the last remaining player (if only one active).
 * Returns null if more than one player is active.
 */
export function getLastRemainingPlayer(state: GameState): string | null {
  const active = getActivePlayers(state);
  return active.length === 1 ? active[0] : null;
}

/**
 * Advance to the next turn.
 * Handles round incrementing and fires turn hooks.
 *
 * Note: This is a high-level operation. The game.ts still handles
 * the full advanceTurn logic including effect decrement and saving.
 * This service provides helper functions and may be used for
 * turn-related queries.
 */
export function advanceTurn(state: GameState): void {
  const previousPlayer = state.currentPlayer!;
  const currentIndex = state.turnOrder.indexOf(previousPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  const isNewRound = nextIndex === 0;

  // Fire onTurnEnd hooks for the player whose turn is ending
  const nextPlayerId = state.turnOrder[nextIndex];
  const turnEndChanges = mechanicRegistry.onTurnEnd(state, previousPlayer, nextPlayerId, isNewRound);
  applyStateChanges(state, turnEndChanges);

  // Increment round if wrapping around
  if (isNewRound) {
    state.round++;
  }
  state.turnNumber++;

  // Set new current player
  state.currentPlayer = state.turnOrder[nextIndex];

  // Fire onTurnStart hooks for the new current player
  const turnStartChanges = mechanicRegistry.onTurnStart(state, state.currentPlayer, isNewRound);
  applyStateChanges(state, turnStartChanges);
}

/**
 * Force set the current player (for special game mechanics).
 * Does not fire turn hooks - use with caution.
 */
export function setCurrentPlayer(state: GameState, playerId: string): boolean {
  if (!state.turnOrder.includes(playerId)) {
    return false;
  }
  state.currentPlayer = playerId;
  return true;
}

/**
 * Skip a player's turn by advancing to the next player.
 * Fires turn hooks appropriately.
 */
export function skipTurn(state: GameState): void {
  advanceTurn(state);
}

/**
 * Get turn info as a summary object.
 */
export function getTurnInfo(state: GameState): {
  currentPlayer: string | null;
  round: number;
  turnNumber: number;
  playerIndex: number;
  totalPlayers: number;
  isLastTurnOfRound: boolean;
} {
  return {
    currentPlayer: state.currentPlayer,
    round: state.round,
    turnNumber: state.turnNumber,
    playerIndex: getCurrentPlayerIndex(state),
    totalPlayers: state.turnOrder.length,
    isLastTurnOfRound: isLastTurnOfRound(state)
  };
}
