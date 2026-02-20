/**
 * Lean Engine Bridge — Delegates mechanic execution to the compiled Lean binary.
 *
 * Instead of routing through TypeScript MechanicHooks, this spawns the
 * Lean engine binary and communicates via JSON on stdin/stdout.
 *
 * The Lean engine handles: validation, execution, available actions,
 * win conditions, state initialization, and turn lifecycle.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GameState, GameConfig, GameAction, PlayerState } from './types/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Locate the Lean engine binary
function findLeanEngine(): string {
  const candidates = [
    resolve(__dirname, '..', 'lean', '.lake', 'build', 'bin', 'lean-engine'),
    resolve(__dirname, '..', '..', 'lean', '.lake', 'build', 'bin', 'lean-engine'),
    resolve(process.cwd(), 'lean', '.lake', 'build', 'bin', 'lean-engine'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Lean engine binary not found. Build it with: cd lean && lake build lean-engine\n' +
    `Searched: ${candidates.join(', ')}`
  );
}

let cachedBinaryPath: string | null = null;

function getLeanBinary(): string {
  if (!cachedBinaryPath) {
    cachedBinaryPath = findLeanEngine();
  }
  return cachedBinaryPath;
}

/**
 * Check if the Lean engine binary is available.
 */
export function isLeanEngineAvailable(): boolean {
  try {
    getLeanBinary();
    return true;
  } catch {
    return false;
  }
}

interface LeanCommand {
  command: string;
  [key: string]: unknown;
}

interface LeanResponse {
  success: boolean;
  error?: string;
  validation?: { valid: boolean; error?: string };
  execution?: {
    handled: boolean;
    stateChanges?: {
      playerStateChanges?: Record<string, Record<string, unknown>>;
      sharedStateChanges?: Record<string, unknown>;
    };
    advanceTurn?: boolean;
    checkWin?: boolean;
    logMessage?: string;
  };
  availableActions?: Array<{
    action: GameAction;
    priority?: number;
    category?: string;
    enabled?: boolean;
    reason?: string;
  }>;
  winResult?: { won: boolean; reason?: string };
  state?: GameState;
}

/**
 * Call the Lean engine with a command and return the response.
 */
function callLeanEngine(command: LeanCommand): LeanResponse {
  const binary = getLeanBinary();
  const input = JSON.stringify(command);

  try {
    const output = execFileSync(binary, [], {
      input,
      encoding: 'utf-8',
      timeout: 10000, // 10 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return JSON.parse(output.trim());
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    return {
      success: false,
      error: `Lean engine error: ${error.stderr || error.message || 'unknown error'}`,
    };
  }
}

/**
 * Convert full GameState to the subset the Lean engine needs.
 * Strips fields the Lean engine doesn't understand (agentId, log paths, etc.)
 */
function toEngineState(state: GameState): Record<string, unknown> {
  return {
    gameId: state.gameId || '',
    gameName: state.gameName || '',
    config: {
      name: state.config?.name || '',
      max_rounds: state.config?.max_rounds,
      max_turns: state.config?.max_turns,
      mechanics: state.config?.mechanics || [],
      engine_mechanics: state.config?.engine_mechanics || {},
    },
    players: Object.fromEntries(
      Object.entries(state.players || {}).map(([pid, ps]) => [pid, {
        state: ps.state || 'active',
        hand: (ps.hand || []).map((c: unknown) => {
          const card = c as Record<string, unknown>;
          return {
            name: card.name,
            type: card.type || '',
            ...(card.id ? { id: card.id } : {}),
            ...(card.suit ? { suit: card.suit } : {}),
            ...(card.value !== undefined ? { value: card.value } : {}),
            ...(card.subtype ? { subtype: card.subtype } : {}),
            ...(card.effect ? { effect: card.effect } : {}),
            ...(card.placeable !== undefined ? { placeable: card.placeable } : {}),
            ...(card.targetMode ? { targetMode: card.targetMode } : {}),
          };
        }),
        effects: (ps.effects || []).map((e: unknown) => {
          const eff = e as Record<string, unknown>;
          return {
            type: eff.type || eff.effectType || '',
            ...(eff.value !== undefined ? { value: eff.value } : {}),
            duration: eff.duration ?? 0,
            ...(eff.source ? { source: eff.source } : {}),
          };
        }),
        score: ps.score,
        resources: ps.resources || {},
        actionPoints: ps.actionPoints,
        actionPointsUsed: ps.actionPointsUsed,
        visitedLocations: ps.visitedLocations || [],
        placedLocationCount: ps.placedLocationCount,
        completedTrades: ps.completedTrades,
        currentBid: ps.currentBid,
        tableau: (((ps as unknown) as Record<string, unknown>).tableau as unknown[] || []).map((c: unknown) => {
          const card = c as Record<string, unknown>;
          return {
            name: card.name,
            type: card.type || '',
            ...(card.id ? { id: card.id } : {}),
            ...(card.suit ? { suit: card.suit } : {}),
            ...(card.value !== undefined ? { value: card.value } : {}),
            ...(card.subtype ? { subtype: card.subtype } : {}),
            ...(card.effect ? { effect: card.effect } : {}),
          };
        }),
        diceResult: ((ps as unknown) as Record<string, unknown>).diceResult || [],
      }])
    ),
    turnOrder: state.turnOrder || [],
    currentPlayer: state.currentPlayer || '',
    round: state.round || 1,
    turnNumber: state.turnNumber || 1,
    status: state.status || 'in_progress',
    shared: {
      ...(state.shared || {}),
      deck: ((state.shared as Record<string, unknown>)?.deck as unknown[] || []).map((c: unknown) => {
        const card = c as Record<string, unknown>;
        return { name: card.name, type: card.type || '', ...card };
      }),
      market: ((state.shared as Record<string, unknown>)?.market as unknown[] || []).map((c: unknown) => {
        const card = c as Record<string, unknown>;
        return { name: card.name, type: card.type || '', ...card };
      }),
    },
  };
}

// ============ Public API ============

/**
 * Validate an action using the Lean engine.
 */
export function leanValidateAction(
  state: GameState,
  playerId: string,
  action: GameAction
): { valid: boolean; error?: string } {
  const response = callLeanEngine({
    command: 'validate_action',
    state: toEngineState(state),
    playerId,
    action,
  });

  if (!response.success) {
    return { valid: false, error: response.error || response.validation?.error };
  }
  return response.validation || { valid: true };
}

/**
 * Execute an action using the Lean engine.
 * Returns the execution result including state changes.
 */
export function leanExecuteAction(
  state: GameState,
  playerId: string,
  action: GameAction
): LeanResponse {
  return callLeanEngine({
    command: 'execute_action',
    state: toEngineState(state),
    playerId,
    action,
  });
}

/**
 * Get available actions for a player using the Lean engine.
 */
export function leanGetAvailableActions(
  state: GameState,
  playerId: string
): GameAction[] {
  const response = callLeanEngine({
    command: 'get_available_actions',
    state: toEngineState(state),
    playerId,
  });

  if (!response.success || !response.availableActions) return [];
  return response.availableActions
    .filter(a => a.enabled !== false)
    .map(a => a.action);
}

/**
 * Check win conditions using the Lean engine.
 */
export function leanCheckWin(
  state: GameState,
  playerId: string,
  trigger: string = 'action'
): { won: boolean; reason?: string } {
  const response = callLeanEngine({
    command: 'check_win',
    state: toEngineState(state),
    playerId,
    trigger,
  });

  return response.winResult || { won: false };
}

/**
 * Initialize game state using the Lean engine.
 */
export function leanInitState(
  config: GameConfig,
  playerIds: string[]
): GameState | null {
  const response = callLeanEngine({
    command: 'init_state',
    config: {
      name: config.name || '',
      max_rounds: config.max_rounds,
      max_turns: config.max_turns,
      mechanics: config.mechanics || [],
      engine_mechanics: config.engine_mechanics || {},
    },
    playerIds,
  });

  if (!response.success || !response.state) return null;
  return response.state;
}

/**
 * Handle turn start lifecycle using the Lean engine.
 */
export function leanTurnStart(
  state: GameState,
  playerId: string,
  isNewRound: boolean
): GameState | null {
  const response = callLeanEngine({
    command: 'turn_start',
    state: toEngineState(state),
    playerId,
    isNewRound,
  });

  return response.state || null;
}

/**
 * Handle turn end lifecycle using the Lean engine.
 */
export function leanTurnEnd(
  state: GameState,
  playerId: string,
  nextPlayerId: string,
  isRoundEnd: boolean
): GameState | null {
  const response = callLeanEngine({
    command: 'turn_end',
    state: toEngineState(state),
    playerId,
    nextPlayerId,
    isRoundEnd,
  });

  return response.state || null;
}

/**
 * Get visibility-filtered player view using the Lean engine.
 * Returns what a specific player can see (hides other players' hands, etc.)
 */
export function leanGetPlayerView(
  state: GameState,
  playerId: string
): {
  gameId: string;
  round: number;
  turnNumber: number;
  currentPlayer: string;
  myState: {
    state: string;
    hand: unknown[];
    effects: unknown[];
    score?: number;
    resources?: Record<string, number>;
    actionPoints?: number;
    actionPointsUsed?: number;
    visitedLocations?: string[];
    placedLocationCount?: number;
    completedTrades?: number;
    tableau?: unknown[];
    diceResult?: number[];
  };
  opponents: Array<{
    playerId: string;
    state: string;
    handSize: number;
    effects?: unknown[];
    score?: number;
    resources?: Record<string, number>;
    placedLocationCount?: number;
    completedTrades?: number;
    tableau?: unknown[];
  }>;
  shared: {
    deckSize: number;
    discard?: unknown[];
    boardStates?: string[];
    boardEdges?: Array<{ from: string; to: string }>;
    currentBoardState?: string;
    placedLocations?: string[];
    market?: unknown[];
  };
} | null {
  const response = callLeanEngine({
    command: 'get_player_view',
    state: toEngineState(state),
    playerId,
  });

  if (!response.success) return null;
  return (response as unknown as Record<string, unknown>).playerView as ReturnType<typeof leanGetPlayerView> || null;
}
