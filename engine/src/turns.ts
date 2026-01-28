// Turn management - handles blocking waits for player turns

import { watch } from 'fs';
import { loadState, getStateFile, getPlayerView } from './game.js';
import type { WaitResult, GameState } from './types.js';

const DEFAULT_TIMEOUT = 300000; // 5 minutes
const POLL_INTERVAL = 500; // Check every 500ms

export async function waitForTurn(
  gameName: string,
  playerId: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<WaitResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const stateFile = getStateFile(gameName);

    // Set up file watcher
    const watcher = watch(stateFile, () => {
      checkState();
    });

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

        // Check if it's this player's turn
        if (state.currentPlayer === playerId) {
          cleanup();
          resolve({
            status: 'your_turn',
            gameState: getPlayerView(state, playerId)
          });
          return;
        }

        // Not our turn, keep waiting
      } catch (e) {
        // State file might be mid-write, ignore and retry
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
