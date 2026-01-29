// Turn management - handles blocking waits for player turns

import { watch, existsSync, type FSWatcher } from 'fs';
import { loadState, getStateFile, getPlayerView, ensureContestState } from './game.js';
import type { WaitResult, GameState, ContestState, LastAction } from './types.js';

// Extended wait result with contest info
export interface ExtendedWaitResult extends WaitResult {
  lastAction?: LastAction;
  contestState?: {
    pendingContest?: boolean;
    pendingResignation?: boolean;
  };
}

const DEFAULT_TIMEOUT = 300000; // 5 minutes
const POLL_INTERVAL = 500; // Check every 500ms

export async function waitForTurn(
  gameName: string,
  playerId: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<ExtendedWaitResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const stateFile = getStateFile(gameName);

    // Check if game exists before setting up watcher
    if (!existsSync(stateFile)) {
      resolve({
        status: 'game_not_found',
        error: `No active game found for ${gameName}`
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

    // Timeout handler
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ status: 'timeout' });
    }, timeoutMs);

    // Cleanup function
    function cleanup() {
      watcher.close();
      clearTimeout(timeout);
      clearInterval(pollInterval);
    }

    // Check current state
    function checkState() {
      try {
        const state = loadState(gameName);

        // Game completed
        if (state.status === 'completed') {
          cleanup();
          resolve({
            status: 'game_over',
            winner: state.shared.winner as string,
            reason: state.shared.endReason as string
          });
          return;
        }

        // Not started yet
        if (state.status === 'waiting_for_players') {
          return; // Keep waiting
        }

        // Get contest state
        const contestState = ensureContestState(state);

        // Check if it's this player's turn
        if (state.currentPlayer === playerId) {
          cleanup();
          resolve({
            status: 'your_turn',
            gameState: getPlayerView(state, playerId),
            lastAction: contestState.lastAction,
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
