// Turn management - handles blocking waits for player turns

import { watch, existsSync, type FSWatcher } from 'fs';
import { loadState, loadStateReadOnly, getStateFile, getPlayerView, ensureContestState, resolveGameInstance } from './game.js';
import type { WaitResult, GameState, ContestState, LastAction, OperatorHint } from '../types/game.js';
import { mechanicRegistry } from '../mechanics/index.js';

// Extended wait result with contest info
export interface ExtendedWaitResult extends WaitResult {
  lastAction?: LastAction;
  recentActions?: LastAction[];  // Last N actions for player visibility
  operatorHints?: OperatorHint[];  // Hints from operator to help unblock agents
  contestState?: {
    pendingContest?: boolean;
    pendingResignation?: boolean;
  };
  pendingAnalysis?: boolean;  // True if game ended but awaiting GM analysis
}

// Get active hints for a player (filters by target and round/turn-based expiry)
function getActiveHintsForPlayer(
  contestState: ContestState,
  playerId: string,
  currentRound: number,
  currentTurn: number
): OperatorHint[] {
  if (!contestState.operatorHints || contestState.operatorHints.length === 0) {
    return [];
  }

  return contestState.operatorHints.filter(hint => {
    // Check if expired by rounds
    if (hint.expiresAfterRounds !== undefined) {
      const roundsElapsed = currentRound - hint.createdAtRound;
      if (roundsElapsed > hint.expiresAfterRounds) {
        return false;
      }
    }
    // Check if expired by turns
    if (hint.expiresAfterTurns !== undefined) {
      const turnsElapsed = currentTurn - hint.createdAtTurn;
      if (turnsElapsed > hint.expiresAfterTurns) {
        return false;
      }
    }
    // Check if targeted to this player or all players
    if (hint.targetPlayer && hint.targetPlayer !== playerId) {
      return false;
    }
    return true;
  });
}

const DEFAULT_TIMEOUT = 0; // 0 = no timeout (block indefinitely)
const POLL_INTERVAL = 100; // Check every 100ms (reduced from 500ms for faster response)

export async function waitForTurn(
  gameNameOrInstanceId: string,
  playerId: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<ExtendedWaitResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Resolve instance ID to get proper game name and instance
    const resolved = resolveGameInstance(gameNameOrInstanceId);
    if (!resolved) {
      resolve({
        status: 'game_not_found',
        error: `No active game found for ${gameNameOrInstanceId}`
      });
      return;
    }
    const { gameName, instanceId } = resolved;
    const stateFile = getStateFile(gameName, instanceId);

    // Check if game exists before setting up watcher
    if (!existsSync(stateFile)) {
      resolve({
        status: 'game_not_found',
        error: `No active game found for ${gameNameOrInstanceId}`
      });
      return;
    }

    // Set up file watcher (may fail if file is deleted between check and watch)
    let watcher: FSWatcher;
    try {
      watcher = watch(stateFile, () => {
        checkState();
      });
    } catch (e) {
      resolve({
        status: 'game_not_found',
        error: (e as Error).message
      });
      return;
    }

    // Timeout handler (only if timeout > 0)
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      cleanup();
      resolve({ status: 'timeout' });
    }, timeoutMs) : null;

    // Cleanup function
    function cleanup() {
      watcher.close();
      if (timeout) clearTimeout(timeout);
      clearInterval(pollInterval);
    }

    // Check current state (lock-free read since we're only polling)
    function checkState() {
      try {
        const state = loadStateReadOnly(instanceId || gameName);

        // Game completed or pending analysis
        if (state.status === 'completed' || state.status === 'pending_analysis') {
          cleanup();
          resolve({
            status: 'game_over',
            winner: state.shared.winner as string,
            reason: state.shared.endReason as string,
            pendingAnalysis: state.status === 'pending_analysis'
          });
          return;
        }

        // Game cancelled
        if (state.status === 'cancelled') {
          cleanup();
          resolve({
            status: 'game_cancelled',
            reason: state.shared.cancelReason as string
          } as ExtendedWaitResult);
          return;
        }

        // Not started yet
        if (state.status === 'waiting_for_players') {
          return; // Keep waiting
        }

        // Get contest state
        const contestState = ensureContestState(state);

        // Check if it's this player's turn (or mechanics allow out-of-turn action)
        // Uses canPlayerActNow hook from mechanic registry
        const canActNow = mechanicRegistry.canPlayerActNow(state, playerId);

        if (canActNow || state.currentPlayer === playerId) {
          cleanup();
          const activeHints = getActiveHintsForPlayer(contestState, playerId, state.round || 1, state.turnNumber || 1);
          resolve({
            status: 'your_turn',
            gameState: getPlayerView(state, playerId),
            lastAction: contestState.lastAction,
            recentActions: contestState.actionHistory || [],  // Last N actions for player visibility
            operatorHints: activeHints.length > 0 ? activeHints : undefined,  // Include active hints
            contestState: {
              pendingContest: !!contestState.pendingContest,
              pendingResignation: !!contestState.pendingResignation
            }
          });
          return;
        }

        // Not our turn, keep waiting
      } catch (e) {
        const errorMsg = (e as Error).message;
        // Permanent error - game was reset or doesn't exist
        if (errorMsg.includes('No active game') || errorMsg.includes('not found')) {
          cleanup();
          resolve({
            status: 'game_not_found',
            error: errorMsg
          } as ExtendedWaitResult);
          return;
        }
        // Transient error (file mid-write), ignore and retry
      }
    }

    // Also poll periodically (in case fs.watch misses events)
    const pollInterval = setInterval(checkState, POLL_INTERVAL);

    // Initial check
    checkState();
  });
}

export function isPlayerTurn(state: GameState, playerId: string): boolean {
  return state.status === 'in_progress' && state.currentPlayer === playerId;
}

/**
 * Check if player can act now (synchronous version for simple checks).
 * For full mechanic-aware check, use mechanicRegistry.canPlayerActNow().
 */
export function canPlayerActBasic(state: GameState, playerId: string): boolean {
  if (state.status !== 'in_progress') return false;
  return state.currentPlayer === playerId;
}
