/**
 * Lean Formal Verifier Mechanic
 *
 * Calls a compiled Lean 4 binary to validate game actions against
 * formally verified rules. The Lean binary acts as a stateless referee:
 * it checks moves, win conditions, and state invariants using the same
 * logic that has machine-checked proofs (no dead states, reachability,
 * resource conservation, etc.).
 *
 * Integration architecture:
 *   TS Engine (executeAction) → lean-verifier (preValidateAction)
 *     → spawns: ./lean-game <game> validate <player> <pos> <target>
 *     ← parses: {"valid":true} or {"valid":false,"error":"..."}
 *
 * Hooks used:
 * - preValidateAction: Check move legality against Lean-verified graph
 * - onCheckWin: Verify win conditions using Lean scoring logic
 *
 * Enable in RULES.md:
 *   engine_mechanics:
 *     lean_verifier: true
 *
 * Requires the Lean binary to be built:
 *   cd lean && lake build lean-game
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  MechanicHooks,
  HookContext,
  ValidationResult,
  WinCheckContext,
  WinCheckResult,
  MechanicConfigSchema
} from './types.js';
import { GameAction } from '../types/game.js';

// Resolve the Lean binary path relative to project root
const LEAN_BINARY_CANDIDATES = [
  resolve(process.cwd(), 'lean/.lake/build/bin/lean-game'),
  resolve(process.cwd(), '../lean/.lake/build/bin/lean-game'),
];

/**
 * Find the Lean binary, checking candidate paths.
 * Returns null if not found (Lean verifier silently disabled).
 */
function findLeanBinary(): string | null {
  for (const path of LEAN_BINARY_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Map a game name to its Lean model identifier.
 * Returns null if the game has no Lean model.
 */
function leanGameId(gameName: string): string | null {
  // Normalize: lowercase, strip special chars
  const normalized = gameName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const LEAN_GAMES: Record<string, string> = {
    'gem-collector': 'gem-collector',
    'gemcollector': 'gem-collector',
  };

  return LEAN_GAMES[normalized] ?? null;
}

/**
 * Call the Lean binary with arguments. Returns parsed JSON or null on failure.
 */
function callLean(binary: string, args: string[]): Record<string, unknown> | null {
  try {
    const result = execFileSync(binary, args, {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(result.trim());
  } catch {
    // Binary not available, timed out, or returned non-zero
    // Fail open: let the TS engine handle validation
    return null;
  }
}

export const leanVerifierMechanic: MechanicHooks = {
  slug: 'lean-verifier',
  name: 'Lean Formal Verifier',

  configSchema: {
    type: 'boolean',
    description: 'Enable Lean 4 formal verification of game actions. Requires lean-game binary (cd lean && lake build lean-game).',
  } satisfies MechanicConfigSchema,

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate move actions
    if (action.type !== 'move') return null;
    const moveAction = action as GameAction & { target?: string };
    if (!moveAction.target) return null;

    // Check if this game has a Lean model
    const gameId = leanGameId(ctx.state.gameName);
    if (!gameId) return null;

    // Find the binary
    const binary = findLeanBinary();
    if (!binary) return null;

    // Extract the player's current board position
    const playerState = ctx.player.state;
    if (!playerState) return null;

    // Call Lean: validate <player> <currentPosition> <target>
    const result = callLean(binary, [
      gameId, 'validate', ctx.playerId, playerState, moveAction.target
    ]);

    if (!result) return null; // Fail open

    if (result.valid === false) {
      return {
        valid: false,
        error: (result.error as string) || 'Move rejected by formal verifier',
      };
    }

    return { valid: true };
  },

  onCheckWin(ctx: WinCheckContext): WinCheckResult | null {
    const gameId = leanGameId(ctx.state.gameName);
    if (!gameId) return null;

    const binary = findLeanBinary();
    if (!binary) return null;

    // Build "name:score" pairs from player state
    const scoreArgs = Object.entries(ctx.state.players).map(
      ([id, ps]) => `${id}:${ps.score ?? 0}`
    );

    const result = callLean(binary, [gameId, 'check-win', ...scoreArgs]);
    if (!result) return null;

    if (result.won === true) {
      return {
        won: true,
        reason: (result.reason as string) || 'Formal verification: win condition met',
      };
    }

    return null;
  },
};
