/**
 * Game Test Harness
 *
 * Integration test utilities for replaying game action logs against the engine.
 * Tests run against the real engine with real file I/O, cleaning up after each test.
 *
 * Supports seeded randomness for deterministic test replay: all 44 Math.random()
 * call sites in the engine become deterministic when a seed is provided.
 *
 * Usage:
 *   const h = GameTestHarness.create('markovs-chains', 2, { seed: 42 });
 *   h.start();
 *   h.step('player-1', { type: 'draw' });
 *   h.step('player-1', { type: 'pass' });
 *   expect(h.state.round).toBe(1);
 *   h.cleanup();  // also restores Math.random
 *
 * Or replay from a log file:
 *   const { harness, steps } = GameTestHarness.fromLog('games/.../xxx.jsonl', { seed: 42 });
 *   harness.start();
 *   harness.replay(steps);
 *   harness.cleanup();
 */

import { readFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { GameState, GameAction } from '../src/types/game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ============ Seedable PRNG ============

/**
 * Mulberry32 — a fast, seedable 32-bit PRNG.
 * Returns values in [0, 1) just like Math.random().
 */
function mulberry32(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options for creating a test harness */
export interface HarnessOptions {
  /** Seed for deterministic Math.random — omit for non-seeded tests */
  seed?: number;
}

// Import engine functions — these are the real engine, not mocks
import {
  initGame,
  startGame,
  executeAction,
  loadState,
  validateAction,
  validateActionSchema,
  getStatePath,
  getAvailableActions,
} from '../src/core/game.js';

// ============ Types ============

/** A single test step: execute an action and optionally assert */
export interface TestStep {
  /** Player executing the action */
  player: string;
  /** The action to execute */
  action: GameAction;
  /** Expected result (defaults to { success: true }) */
  expect?: {
    success?: boolean;
    error?: string;
    gameOver?: boolean;
    winner?: string;
  };
}

/** Parsed log entry from a .jsonl game log */
export interface LogEntry {
  timestamp: string;
  event: string;
  round?: number;
  turnNumber?: number;
  player?: string;
  data: Record<string, unknown>;
}

/** Options for log replay */
export interface ReplayOptions {
  /** Called after each action step with the step index, state, and action result */
  afterStep?: (
    index: number,
    state: GameState,
    result: { success: boolean; error?: string; gameOver?: boolean; winner?: string },
    step: TestStep
  ) => void;
  /** Called before each action step — return false to skip the step */
  beforeStep?: (index: number, step: TestStep) => boolean;
  /** Stop replay after this many steps */
  maxSteps?: number;
}

// ============ Harness ============

export class GameTestHarness {
  /** The live game state (modified in-place by executeAction) */
  state: GameState;

  /** Instance IDs to clean up */
  private instanceId: string;
  private gameName: string;

  /** Saved original Math.random (restored on cleanup) */
  private originalRandom: (() => number) | null = null;

  /** All steps that have been executed */
  readonly history: Array<{
    step: TestStep;
    result: { success: boolean; error?: string; gameOver?: boolean; winner?: string };
    stateSnapshot: { round: number; turnNumber: number; currentPlayer: string | null; status: string };
  }> = [];

  private constructor(state: GameState) {
    this.state = state;
    this.instanceId = state.gameId;
    this.gameName = state.gameName;
  }

  /**
   * Create a new game instance for testing.
   * If a seed is provided, Math.random is replaced with a deterministic PRNG
   * before initGame runs (so deck shuffling etc. is reproducible).
   */
  static create(gameName: string, playerCount: number, options?: HarnessOptions): GameTestHarness {
    let originalRandom: (() => number) | null = null;
    if (options?.seed !== undefined) {
      originalRandom = Math.random;
      Math.random = mulberry32(options.seed);
    }
    const state = initGame(gameName, playerCount);
    const harness = new GameTestHarness(state);
    harness.originalRandom = originalRandom;
    return harness;
  }

  /**
   * Parse a JSONL log file and create a harness with steps ready for replay.
   * Initializes a fresh game matching the log's game config.
   */
  static fromLog(logPath: string, options?: HarnessOptions): { harness: GameTestHarness; steps: TestStep[] } {
    const absPath = logPath.startsWith('/') ? logPath : join(PROJECT_ROOT, logPath);
    const content = readFileSync(absPath, 'utf-8');
    const entries: LogEntry[] = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    // Find game_init to determine game name and player count
    const initEntry = entries.find(e => e.event === 'game_init');
    if (!initEntry) {
      throw new Error(`No game_init event found in log: ${logPath}`);
    }
    const gameName = inferGameName(initEntry);
    const playerCount = initEntry.data.playerCount as number;

    // Extract action steps from log
    const steps: TestStep[] = entries
      .filter(e => e.event === 'action_executed' && e.player && e.data?.type)
      .map(e => ({
        player: e.player!,
        action: logDataToAction(e.data),
        expect: { success: true },
      }));

    const harness = GameTestHarness.create(gameName, playerCount, options);
    return { harness, steps };
  }

  /**
   * Get available actions for a player (useful for assertions).
   * Returns the full AvailableActionsResult from the engine.
   */
  getActions(playerId: string) {
    return getAvailableActions(this.state, playerId);
  }

  /**
   * Validate an action without executing it.
   */
  validate(playerId: string, action: GameAction) {
    const schema = validateActionSchema(action);
    if (!schema.valid) return schema;
    return validateAction(this.state, playerId, action);
  }

  /**
   * Start the game (transitions from initializing → in_progress).
   */
  start(): void {
    startGame(this.instanceId);
    // Reload state after startGame (it saves to disk internally)
    this.state = loadState(this.instanceId);
  }

  /**
   * Execute a single action step.
   * Validates the action first (schema + rules), then executes.
   * Returns the engine result.
   */
  step(player: string, action: GameAction): {
    success: boolean;
    error?: string;
    gameOver?: boolean;
    winner?: string;
  } {
    // Validate before executing (same as CLI pipeline)
    const schemaCheck = validateActionSchema(action);
    if (!schemaCheck.valid) {
      const result = { success: false, error: schemaCheck.errors?.join('; ') ?? 'Schema validation failed' };
      this.history.push({
        step: { player, action },
        result,
        stateSnapshot: {
          round: this.state.round,
          turnNumber: this.state.turnNumber,
          currentPlayer: this.state.currentPlayer,
          status: this.state.status,
        },
      });
      return result;
    }
    const ruleCheck = validateAction(this.state, player, action);
    if (!ruleCheck.valid) {
      const result = { success: false, error: ruleCheck.errors?.join('; ') ?? 'Validation failed' };
      this.history.push({
        step: { player, action },
        result,
        stateSnapshot: {
          round: this.state.round,
          turnNumber: this.state.turnNumber,
          currentPlayer: this.state.currentPlayer,
          status: this.state.status,
        },
      });
      return result;
    }

    const result = executeAction(this.state, player, action);
    // Reload state after executeAction (it saves to disk internally)
    this.state = loadState(this.instanceId);

    this.history.push({
      step: { player, action },
      result,
      stateSnapshot: {
        round: this.state.round,
        turnNumber: this.state.turnNumber,
        currentPlayer: this.state.currentPlayer,
        status: this.state.status,
      },
    });

    return result;
  }

  /**
   * Execute a step and assert the expected result.
   * Throws if assertions fail.
   */
  stepExpect(step: TestStep): {
    success: boolean;
    error?: string;
    gameOver?: boolean;
    winner?: string;
  } {
    const result = this.step(step.player, step.action);

    if (step.expect) {
      if (step.expect.success !== undefined && result.success !== step.expect.success) {
        throw new Error(
          `Step ${this.history.length}: Expected success=${step.expect.success} but got ${result.success}` +
          (result.error ? ` (error: ${result.error})` : '') +
          ` | action: ${JSON.stringify(step.action)}`
        );
      }
      if (step.expect.gameOver !== undefined && result.gameOver !== step.expect.gameOver) {
        throw new Error(
          `Step ${this.history.length}: Expected gameOver=${step.expect.gameOver} but got ${result.gameOver}`
        );
      }
      if (step.expect.winner !== undefined && result.winner !== step.expect.winner) {
        throw new Error(
          `Step ${this.history.length}: Expected winner=${step.expect.winner} but got ${result.winner}`
        );
      }
    }

    return result;
  }

  /**
   * Replay a sequence of steps with optional hooks.
   */
  replay(steps: TestStep[], options?: ReplayOptions): void {
    const maxSteps = options?.maxSteps ?? steps.length;

    for (let i = 0; i < Math.min(steps.length, maxSteps); i++) {
      const step = steps[i];

      if (options?.beforeStep && !options.beforeStep(i, step)) {
        continue; // Skip this step
      }

      const result = this.stepExpect(step);

      if (options?.afterStep) {
        options.afterStep(i, this.state, result, step);
      }

      // Stop if game is over
      if (result.gameOver) {
        break;
      }
    }
  }

  /**
   * Clean up game state files created during the test.
   * Restores Math.random if it was seeded.
   */
  cleanup(): void {
    // Restore original Math.random
    if (this.originalRandom) {
      Math.random = this.originalRandom;
      this.originalRandom = null;
    }

    // Remove state directory
    const stateDir = getStatePath(this.gameName, this.instanceId);
    if (existsSync(stateDir)) {
      rmSync(stateDir, { recursive: true, force: true });
    }

    // Remove log file
    const logPath = this.state.log;
    if (existsSync(logPath)) {
      rmSync(logPath, { force: true });
    }
  }
}

// ============ Helpers ============

/**
 * Infer game name from a game_init log entry.
 * The gameId format is `<gameName>-<timestamp>`.
 */
function inferGameName(initEntry: LogEntry): string {
  const gameId = initEntry.data.gameId as string;
  // Strip the timestamp suffix: "markovs-chains-1770216120437" → "markovs-chains"
  const parts = gameId.split('-');
  // The timestamp is always the last segment (numeric)
  while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join('-');
}

/**
 * Convert log event data to a GameAction.
 * Log data includes the action type plus any additional fields.
 */
function logDataToAction(data: Record<string, unknown>): GameAction {
  // The log data IS the action, plus some extra fields added by the engine
  // (e.g., placedCardEffects, cardsDrawn). We extract just the action fields.
  const action: Record<string, unknown> = { type: data.type };

  // Copy known action fields
  if (data.card !== undefined) action.card = data.card;
  if (data.target !== undefined) action.target = data.target;
  if (data.count !== undefined) action.count = data.count;
  if (data.cards !== undefined) action.cards = data.cards;
  if (data.choice !== undefined) action.choice = data.choice;
  if (data.declaredColor !== undefined) action.declaredColor = data.declaredColor;
  if (data.resource !== undefined) action.resource = data.resource;
  if (data.amount !== undefined) action.amount = data.amount;
  if (data.targetPlayer !== undefined) action.targetPlayer = data.targetPlayer;
  if (data.reason !== undefined) action.reason = data.reason;
  if (data.adjacentTo !== undefined) action.adjacentTo = data.adjacentTo;

  return action as GameAction;
}

/**
 * Parse a JSONL log file into entries.
 */
export function parseLog(logPath: string): LogEntry[] {
  const absPath = logPath.startsWith('/') ? logPath : join(PROJECT_ROOT, logPath);
  const content = readFileSync(absPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Extract action steps from parsed log entries.
 */
export function extractSteps(entries: LogEntry[]): TestStep[] {
  return entries
    .filter(e => e.event === 'action_executed' && e.player && e.data?.type)
    .map(e => ({
      player: e.player!,
      action: logDataToAction(e.data),
      expect: { success: true },
    }));
}
