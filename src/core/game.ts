// Game state management

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Debug logging flag (can be set from CLI)
let DEBUG_MODE = false;

export function setDebugMode(enabled: boolean): void {
  DEBUG_MODE = enabled;
}

function debug(...args: any[]): void {
  if (DEBUG_MODE) {
    console.error(...args);
  }
}
import type {
  GameState,
  GameStatus,
  PlayerState,
  PlayerView,
  OpponentView,
  Card,
  LogEvent,
  GameAction,
  ResignAction,
  PlacedCard,
  ActionValidationResult,
  LastAction,
  PendingContest,
  PendingResignation,
  PendingVictoryClaim,
  ContestHistoryEntry,
  ResignationEntry,
  ContestState,
  AvailableAction,
  AvailableActionsResult,
  GameAnalysis,
  KeyMoment
} from '../types/game.js';
import { parseRules, getPlayerCount } from './rules.js';

// Mechanics stub (all execution routes through Lean engine)
import { mechanicRegistry } from '../mechanics/index.js';
import type { ActionSchema } from '../mechanics/types.js';

// Lean engine (primary mechanic execution)
import {
  leanExecuteAction,
  leanValidateAction,
  leanGetAvailableActions,
  leanCheckWin,
  leanTurnStart,
  leanTurnEnd,
  leanInitState,
  leanGetPlayerView,
  isLeanEngineAvailable
} from '../lean-engine.js';

// ============ Out-of-Turn Mechanics ============
// Lean engine handles action aliases (buy_market↔buy_card, add_to_tableau↔play_to_tableau)
// directly, so no TS-side mapping is needed.

function canPlayerActNow(state: GameState, playerId: string, actionType: string): boolean {
  // Resign is always allowed
  if (actionType === 'resign') return true;

  // Current player can always act
  if (state.currentPlayer === playerId) return true;

  const em = (state.config.engine_mechanics || {}) as Record<string, unknown>;
  const shared = state.shared as Record<string, unknown>;

  // Simultaneous action selection: all players can submit select_action
  if (actionType === 'select_action' && (em.simultaneous_action_selection || shared.sas_selections !== undefined)) {
    return true;
  }

  // Prisoner's dilemma: all players can submit dilemma_choice
  if (actionType === 'dilemma_choice' && (em.prisoners_dilemma || shared.pd_choices !== undefined)) {
    return true;
  }

  return false;
}

// Card matching and simultaneous mechanics (SAS, PD) are handled by the Lean engine.
// The TS bridge only initializes shared state structures and syncs Lean results back.

// Helper: merge Lean engine player state back into game state
function mergeLeanPlayers(state: GameState, leanState: GameState | null): void {
  if (!leanState) return;
  const leanPlayers = (leanState as unknown as Record<string, unknown>).players as Record<string, Record<string, unknown>> | undefined;
  if (leanPlayers) {
    for (const [pid, lps] of Object.entries(leanPlayers)) {
      if (state.players[pid]) Object.assign(state.players[pid], lps);
    }
  }
  const leanShared = (leanState as unknown as Record<string, unknown>).shared as Record<string, unknown> | undefined;
  if (leanShared) {
    Object.assign(state.shared, leanShared);
  }
}

// Find project root (parent of src directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const GAMES_DIR = join(PROJECT_ROOT, 'games');
const PERSONAS_DIR = join(PROJECT_ROOT, '.claude', 'agents', 'personas');

// ============ Auto-Adjudication Configuration ============
// If a contest/resignation is pending for longer than this, auto-adjudicate (allow)
// This prevents games from deadlocking when the gamemaster agent times out
const AUTO_ADJUDICATION_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Check if a pending contest has timed out and should be auto-adjudicated.
 * Returns true if auto-adjudication was performed, false otherwise.
 */
export function checkAndAutoAdjudicateContest(state: GameState): boolean {
  const contestState = ensureContestState(state);

  if (!contestState.pendingContest) {
    return false;
  }

  const contestTimestamp = new Date(contestState.pendingContest.timestamp).getTime();
  const elapsed = Date.now() - contestTimestamp;

  if (elapsed >= AUTO_ADJUDICATION_TIMEOUT_MS) {
    // Auto-adjudicate: allow the contested action (reject the contest)
    const contest = contestState.pendingContest;
    const originalAction = contest.originalAction;

    // Record in history with auto-adjudication note
    contestState.contestHistory.push({
      round: originalAction.round,
      turnNumber: originalAction.turnNumber,
      action: originalAction.action,
      player: originalAction.player,
      contestedBy: contest.contestedBy,
      contestReason: contest.reason,
      ruling: 'allowed',
      rulingReason: `[AUTO-ADJUDICATED] Gamemaster did not respond within ${AUTO_ADJUDICATION_TIMEOUT_MS / 1000}s. Action allowed by default.`,
      timestamp: new Date().toISOString()
    });

    // Clear pending contest
    delete contestState.pendingContest;
    saveState(state);

    // Log the auto-adjudication
    logEvent(state, {
      event: 'contest_auto_adjudicated',
      round: state.round,
      turnNumber: state.turnNumber,
      player: originalAction.player,
      data: {
        contestedBy: contest.contestedBy,
        reason: contest.reason,
        ruling: 'allowed',
        autoReason: 'Gamemaster timeout - action allowed by default',
        elapsedMs: elapsed
      }
    });

    debug(`[AUTO-ADJUDICATION] Contest timed out after ${elapsed}ms. Action allowed.`);

    // Check if the allowed action includes a victory declaration
    processVictoryDeclarationIfPresent(state, originalAction);

    return true;
  }

  return false;
}

/**
 * Check if an allowed action includes a victory declaration and create pending claim.
 * Called after a contest is resolved as 'allowed' to ensure victory claims are verified.
 */
function processVictoryDeclarationIfPresent(state: GameState, originalAction: LastAction): void {
  const action = originalAction.action as GameAction & { declareVictory?: boolean; victoryReason?: string };

  if (!action.declareVictory) {
    return;
  }

  const contestState = ensureContestState(state);
  const playerBoardState = state.players[originalAction.player]?.state ?? 'unknown';

  // Create pending victory claim for GM verification
  contestState.pendingVictoryClaim = {
    player: originalAction.player,
    reason: action.victoryReason || 'Victory declared with action',
    fromState: playerBoardState,
    toState: playerBoardState,
    action: action,
    timestamp: new Date().toISOString()
  };

  saveState(state);

  logEvent(state, {
    event: 'victory_claim_pending',
    round: state.round,
    turnNumber: state.turnNumber,
    player: originalAction.player,
    data: {
      reason: action.victoryReason || 'Victory declared with action',
      note: 'Contest allowed - victory claim requires GM verification'
    }
  });

  debug(`[VICTORY CLAIM] Created pending victory claim for ${originalAction.player} after contest allowed`);
}

/**
 * Check if a pending resignation has timed out and should be auto-adjudicated.
 * Returns true if auto-adjudication was performed, false otherwise.
 */
export function checkAndAutoAdjudicateResignation(state: GameState): boolean {
  const contestState = ensureContestState(state);

  if (!contestState.pendingResignation) {
    return false;
  }

  const resignTimestamp = new Date(contestState.pendingResignation.timestamp).getTime();
  const elapsed = Date.now() - resignTimestamp;

  if (elapsed >= AUTO_ADJUDICATION_TIMEOUT_MS) {
    // Auto-adjudicate: accept the resignation
    const resignation = contestState.pendingResignation;
    const rulingReason = `[AUTO-ADJUDICATED] Gamemaster did not respond within ${AUTO_ADJUDICATION_TIMEOUT_MS / 1000}s. Resignation accepted by default.`;

    // Record in history
    contestState.resignations.push({
      player: resignation.player,
      reason: resignation.reason,
      accepted: true,
      rulingReason,
      timestamp: new Date().toISOString()
    });

    // End game - the resigning player loses (same as manual adjudication)
    const otherPlayers = state.turnOrder.filter(p => p !== resignation.player);
    const winner = otherPlayers.length === 1 ? otherPlayers[0] : 'none';

    state.status = 'pending_analysis';
    state.shared.winner = winner;
    state.shared.endReason = `${resignation.player} resigned: ${resignation.reason}`;

    logEvent(state, {
      event: 'game_end',
      round: state.round,
      turnNumber: state.turnNumber,
      data: {
        winner,
        reason: `Resignation auto-accepted: ${resignation.reason}`,
        resignedPlayer: resignation.player
      }
    });

    // Clear pending resignation
    delete contestState.pendingResignation;
    saveState(state);

    logEvent(state, {
      event: 'resignation_adjudicated',
      round: state.round,
      turnNumber: state.turnNumber,
      data: {
        player: resignation.player,
        accepted: true,
        rulingReason,
        autoAdjudicated: true
      }
    });

    debug(`[AUTO-ADJUDICATION] Resignation timed out after ${elapsed}ms. Resignation accepted.`);
    return true;
  }

  return false;
}

// ============ Persona Management ============

/**
 * Get list of available persona slugs (filenames without .md extension)
 * Excludes README.md
 */
export function getAvailablePersonas(): string[] {
  if (!existsSync(PERSONAS_DIR)) {
    return [];
  }
  return readdirSync(PERSONAS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => f.replace('.md', ''));
}

/**
 * Load persona content by slug
 * Returns the full markdown content of the persona file
 */
export function loadPersonaContent(slug: string): string | null {
  const personaPath = join(PERSONAS_DIR, `${slug}.md`);
  if (!existsSync(personaPath)) {
    return null;
  }
  return readFileSync(personaPath, 'utf-8');
}

/**
 * Select a random persona from available personas
 * Returns the slug, or null if no personas available
 */
export function selectRandomPersona(): string | null {
  const personas = getAvailablePersonas();
  if (personas.length === 0) {
    return null;
  }
  return personas[Math.floor(Math.random() * personas.length)];
}

export function getGamePath(gameName: string): string {
  return join(GAMES_DIR, gameName);
}

// Instance-based state path (supports concurrent instances)
export function getStatePath(gameName: string, instanceId?: string): string {
  const basePath = join(getGamePath(gameName), 'state');
  return instanceId ? join(basePath, instanceId) : basePath;
}

export function getStateFile(gameName: string, instanceId?: string): string {
  return join(getStatePath(gameName, instanceId), 'game.json');
}

export function getLogPath(gameName: string, gameId: string): string {
  return join(getGamePath(gameName), 'logs', `${gameId}.jsonl`);
}

export function getRulesPath(gameName: string): string {
  return join(getGamePath(gameName), 'RULES.md');
}

export function gameExists(gameName: string): boolean {
  return existsSync(getRulesPath(gameName));
}

// Check if state exists - supports both game name and instance ID
export function stateExists(gameNameOrInstanceId: string): boolean {
  // Try as instance ID first (format: gameName-timestamp)
  const resolved = resolveGameInstance(gameNameOrInstanceId);
  if (resolved) {
    return existsSync(getStateFile(resolved.gameName, resolved.instanceId));
  }
  // Fall back to legacy single-instance path
  return existsSync(getStateFile(gameNameOrInstanceId));
}

// Cache for resolveGameInstance to avoid repeated statSync calls during polling.
// Keyed by game name/instance ID, cached for 2 seconds (long enough to help
// with 100ms polling, short enough to pick up new instances promptly).
const instanceCache = new Map<string, { result: { gameName: string; instanceId: string } | null; expiry: number }>();
const INSTANCE_CACHE_TTL_MS = 2000;

// Resolve a game name or instance ID to {gameName, instanceId}
// Returns null if cannot be resolved
export function resolveGameInstance(gameNameOrInstanceId: string): { gameName: string; instanceId: string } | null {
  // Check cache first
  const cached = instanceCache.get(gameNameOrInstanceId);
  if (cached && Date.now() < cached.expiry) {
    return cached.result;
  }

  const result = resolveGameInstanceUncached(gameNameOrInstanceId);
  instanceCache.set(gameNameOrInstanceId, { result, expiry: Date.now() + INSTANCE_CACHE_TTL_MS });
  return result;
}

function resolveGameInstanceUncached(gameNameOrInstanceId: string): { gameName: string; instanceId: string } | null {
  // Check if it's an instance ID (format: gameName-timestamp)
  const match = gameNameOrInstanceId.match(/^(.+)-(\d{13,})$/);
  if (match) {
    const [, gameName, timestamp] = match;
    const instanceId = `${gameName}-${timestamp}`;
    if (existsSync(getStateFile(gameName, instanceId))) {
      return { gameName, instanceId };
    }
  }

  // Try as game name - find most recent instance
  const statePath = getStatePath(gameNameOrInstanceId);
  if (existsSync(statePath)) {
    try {
      const entries = readdirSync(statePath);
      // Filter to instance directories (format: gameName-timestamp)
      const instances = entries
        .filter((e: string) => e.match(/^.+-\d{13,}$/))
        .filter((e: string) => existsSync(join(statePath, e, 'game.json')))
        .sort((a: string, b: string) => {
          // Sort by timestamp in the directory name (avoids statSync calls)
          const aTs = a.match(/-(\d{13,})$/)?.[1] || '0';
          const bTs = b.match(/-(\d{13,})$/)?.[1] || '0';
          return bTs.localeCompare(aTs);
        });

      if (instances.length > 0) {
        return { gameName: gameNameOrInstanceId, instanceId: instances[0] };
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    // Fall back to legacy single-instance path (game.json directly in state/)
    if (existsSync(getStateFile(gameNameOrInstanceId))) {
      // Legacy: no instance ID, gameName only
      return { gameName: gameNameOrInstanceId, instanceId: '' };
    }
  }

  return null;
}

// List all active game instances for a game name
export function listGameInstances(gameName: string): string[] {
  const statePath = getStatePath(gameName);
  if (!existsSync(statePath)) return [];

  try {
    return readdirSync(statePath)
      .filter((e: string) => e.match(/^.+-\d{13,}$/))
      .filter((e: string) => existsSync(join(statePath, e, 'game.json')));
  } catch {
    return [];
  }
}

// ============ File Locking ============

function getLockFile(gameName: string, instanceId?: string): string {
  return `${getStateFile(gameName, instanceId)}.lock`;
}

function acquireLock(gameName: string, instanceId?: string, timeoutMs: number = 5000): boolean {
  const lockFile = getLockFile(gameName, instanceId);
  const startTime = Date.now();
  const retryInterval = 10; // Check every 10ms

  debug(`[LOCK DEBUG] Attempting to acquire lock: ${lockFile}`);

  // Ensure the directory exists for the lock file
  const lockDir = dirname(lockFile);
  if (!existsSync(lockDir)) {
    debug(`[LOCK DEBUG] Creating lock directory: ${lockDir}`);
    mkdirSync(lockDir, { recursive: true });
  }

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try to create lock file exclusively (fails if exists)
      writeFileSync(lockFile, `${process.pid}\n${new Date().toISOString()}`, { flag: 'wx' });
      debug(`[LOCK DEBUG] Lock acquired by PID ${process.pid}`);
      return true;
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        // Lock file exists, check if stale
        try {
          const lockContent = readFileSync(lockFile, 'utf-8');
          const lockAge = Date.now() - new Date(lockContent.split('\n')[1]).getTime();

          // If lock is older than 2 seconds, consider it stale and remove
          if (lockAge > 2000) {
            debug(`[LOCK DEBUG] Stale lock detected (${lockAge}ms old), removing...`);
            unlinkSync(lockFile);
            continue;
          }
        } catch {
          // Lock file might have been removed, try again
        }

        // Wait before retrying
        const elapsed = Date.now() - startTime;
        if (elapsed < timeoutMs) {
          // Busy wait (not ideal but simple for now)
          const waitUntil = Date.now() + retryInterval;
          while (Date.now() < waitUntil) { /* busy wait */ }
        }
      } else {
        // Other error, fail
        debug(`[LOCK DEBUG] Lock acquisition failed:`, e);
        return false;
      }
    }
  }

  debug(`[LOCK DEBUG] Lock acquisition timeout after ${timeoutMs}ms`);
  return false;
}

function releaseLock(gameName: string, instanceId?: string): void {
  const lockFile = getLockFile(gameName, instanceId);

  try {
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
      debug(`[LOCK DEBUG] Lock released by PID ${process.pid}`);
    }
  } catch (e) {
    debug(`[LOCK DEBUG] Error releasing lock:`, e);
  }
}

// ============ State Management with Locking ============

// Internal functions without locking (for use within locked operations)
function loadStateUnsafe(gameName: string, instanceId?: string): GameState {
  const stateFile = getStateFile(gameName, instanceId);
  debug(`[LOADSTATE DEBUG] Loading state for ${gameName}/${instanceId || 'default'} from ${stateFile}`);

  if (!existsSync(stateFile)) {
    debug(`[LOADSTATE DEBUG] ERROR: State file not found`);
    throw new Error(`No active game found for ${instanceId || gameName}`);
  }

  const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
  debug(`[LOADSTATE DEBUG] Loaded successfully, status: ${state.status}`);
  return state;
}

function saveStateUnsafe(state: GameState, instanceId?: string): void {
  // Use gameId as instanceId if not provided
  const effectiveInstanceId = instanceId || state.gameId;
  const stateDir = getStatePath(state.gameName, effectiveInstanceId);
  const stateFile = getStateFile(state.gameName, effectiveInstanceId);

  debug(`[SAVESTATE DEBUG] Saving state for ${state.gameName}/${effectiveInstanceId} to ${stateFile}`);
  debug(`[SAVESTATE DEBUG] Status: ${state.status}, Round: ${state.round}, TurnNumber: ${state.turnNumber}`);

  if (!existsSync(stateDir)) {
    debug(`[SAVESTATE DEBUG] Creating state directory: ${stateDir}`);
    mkdirSync(stateDir, { recursive: true });
  }

  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  debug(`[SAVESTATE DEBUG] State saved successfully`);
}

// Public functions with locking
// Accepts game name OR instance ID (format: gameName-timestamp)
export function loadState(gameNameOrInstanceId: string): GameState {
  // Resolve to gameName + instanceId
  const resolved = resolveGameInstance(gameNameOrInstanceId);
  if (!resolved) {
    throw new Error(`No active game found for ${gameNameOrInstanceId}`);
  }
  const { gameName, instanceId } = resolved;

  // Acquire lock before reading
  if (!acquireLock(gameName, instanceId)) {
    throw new Error(`Failed to acquire lock for ${instanceId || gameName}`);
  }

  try {
    return loadStateUnsafe(gameName, instanceId);
  } finally {
    // Always release lock
    releaseLock(gameName, instanceId);
  }
}

// Lock-free read for status checks and polling operations.
// Skips lock acquisition since read-only JSON parsing is safe against
// concurrent writes (writeFileSync is atomic enough on Linux for small files;
// worst case JSON.parse fails and we retry on next poll cycle).
export function loadStateReadOnly(gameNameOrInstanceId: string): GameState {
  const resolved = resolveGameInstance(gameNameOrInstanceId);
  if (!resolved) {
    throw new Error(`No active game found for ${gameNameOrInstanceId}`);
  }
  const { gameName, instanceId } = resolved;
  return loadStateUnsafe(gameName, instanceId);
}

export function saveState(state: GameState): void {
  // Use gameId as instanceId for instance-specific storage
  const instanceId = state.gameId;

  // Acquire lock before writing
  if (!acquireLock(state.gameName, instanceId)) {
    throw new Error(`Failed to acquire lock for ${instanceId}`);
  }

  try {
    saveStateUnsafe(state, instanceId);
  } finally {
    // Always release lock
    releaseLock(state.gameName, instanceId);
  }
}

export function logEvent(state: GameState, event: Omit<LogEvent, 'timestamp'>): void {
  const logDir = dirname(state.log);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const fullEvent: LogEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };

  appendFileSync(state.log, JSON.stringify(fullEvent) + '\n');
}

export interface InitGameOptions {
  personas?: Record<string, string>;  // Map of playerId -> persona slug (or "random")
}

export function initGame(gameName: string, playerCount: number, options?: InitGameOptions): GameState {
  if (!gameExists(gameName)) {
    throw new Error(`Game '${gameName}' not found. Create games/${gameName}/RULES.md first.`);
  }

  const rulesPath = getRulesPath(gameName);
  const { config, markdown } = parseRules(rulesPath);

  // Validate player count
  const { min, max } = getPlayerCount(config);
  if (playerCount < min || playerCount > max) {
    throw new Error(`Player count ${playerCount} out of range [${min}, ${max}] for ${gameName}`);
  }

  // Validate mechanic dependencies and conflicts
  const mechanicErrors = mechanicRegistry.validateDependencies(config);
  if (mechanicErrors.length > 0) {
    const errorMessages = mechanicErrors.map(e => `  - ${e.message}`).join('\n');
    throw new Error(`Mechanic configuration errors for ${gameName}:\n${errorMessages}`);
  }

  const gameId = `${gameName}-${Date.now()}`;

  // Build turn order first (needed for initSharedState)
  const turnOrder: string[] = [];
  for (let i = 1; i <= playerCount; i++) {
    turnOrder.push(`player-${i}`);
  }

  // ============ Lean Engine: State initialization ============
  // Lean engine handles: deck building, shuffling, dealing, board setup, resources
  let shared: Record<string, unknown> = {};
  const players: Record<string, PlayerState> = {};

  if (isLeanEngineAvailable()) {
    const leanState = leanInitState(config, turnOrder);
    if (leanState) {
      // Merge Lean-initialized player states
      for (const pid of turnOrder) {
        const leanPlayers = leanState.players as unknown as Record<string, Record<string, unknown>>;
        const leanPlayer = leanPlayers?.[pid] || {};
        players[pid] = {
          state: (leanPlayer.state as string) || 'start',
          hand: (leanPlayer.hand as Card[]) || [],
          effects: (leanPlayer.effects as PlayerState['effects']) || [],
          score: (leanPlayer.score as number) ?? 0,
          resources: (leanPlayer.resources as Record<string, number>) || {},
          ...(leanPlayer.actionPoints !== undefined ? { actionPoints: leanPlayer.actionPoints as number } : {}),
          ...(leanPlayer.visitedLocations ? { visitedLocations: leanPlayer.visitedLocations as string[] } : {}),
        } as PlayerState;
      }
      // Merge Lean-initialized shared state
      shared = (leanState.shared as Record<string, unknown>) || {};

      // Shuffle: collect ALL cards (deck + dealt hands + topCard from Lean), shuffle, re-deal
      if (Array.isArray(shared.deck) && (shared.deck as Card[]).length > 0) {
        const allCards: Card[] = [...(shared.deck as Card[])];
        // Add back cards Lean dealt to players
        for (const pid of turnOrder) {
          if (players[pid]?.hand?.length) {
            allCards.push(...players[pid].hand);
          }
        }
        // Add back topCard if Lean card-matching init flipped one
        if (shared.topCard) {
          allCards.push(shared.topCard as Card);
          delete shared.topCard;
          delete shared.currentColor;
        }
        // Shuffle all cards using Math.random (externally seedable for determinism)
        for (let i = allCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
        }
        // Re-deal hands from shuffled deck
        const cardsConfig = config.engine_mechanics?.cards as { starting_hand?: number } | undefined;
        const startingHand = cardsConfig?.starting_hand ?? 0;
        let deckIndex = 0;
        if (startingHand > 0) {
          for (const pid of turnOrder) {
            const hand = allCards.slice(deckIndex, deckIndex + startingHand);
            deckIndex += startingHand;
            players[pid].hand = hand;
          }
        }
        shared.deck = allCards.slice(deckIndex);
      }
    }
  }

  // ============ Initialize game-specific shared state from config ============
  const em = (config.engine_mechanics || {}) as Record<string, unknown>;

  // Card matching (UNO): flip top card to establish currentColor
  if (config.mechanics?.includes('card-matching')) {
    const deck = shared.deck as Card[] | undefined;
    if (deck && deck.length > 0) {
      // Flip top card to discard to establish the starting color
      const topCard = deck.shift()!;
      shared.topCard = topCard;
      shared.discardPile = [topCard];
      // Extract color from card's effect
      const effect = (topCard as unknown as Record<string, unknown>).effect as Record<string, unknown> | undefined;
      if (effect?.color) {
        shared.currentColor = effect.color;
      }
    }
  }

  // Cooperative shared state (alliance) — not yet in Lean
  const cooperativeConfig = em.cooperative_actions as Record<string, unknown> | undefined;
  if (cooperativeConfig) {
    const sharedPool = cooperativeConfig.shared_pool as Record<string, number> | undefined;
    shared.cooperative = { sharedPool: sharedPool || {}, threatLevel: 0 };
  }

  // Worker placement (battle-forge) — not yet in Lean
  const workerConfig = em.worker_placement as Record<string, unknown> | undefined;
  if (workerConfig?.spaces) {
    shared.workerSpaces = (workerConfig.spaces as Array<Record<string, unknown>>).map(s => ({ ...s, occupants: [] }));
  }

  // Market commodities (battle-forge) — not yet in Lean
  const marketConfig = em.market as Record<string, unknown> | undefined;
  if (marketConfig?.commodities) {
    const commodities = marketConfig.commodities as Array<Record<string, unknown>>;
    shared.market = {
      ...((shared.market || {}) as Record<string, unknown>),
      prices: Object.fromEntries(commodities.map(c => [c.id || c.name, c.base_price || 1])),
      commodities,
    };
  }

  // Trading shared state (aaote) — not yet in Lean
  if (config.mechanics?.includes('trading') || em.trade) {
    shared.pendingTrades = shared.pendingTrades || [];
  }

  // SAS, PD, semi-cooperative — handled by Lean engine
  // Lean-canonical state: sas_selections, pd_choices, pd_round, pd_resolved,
  // collective_progress are all at the top level of shared (via extra RBMap)

  // Apply personas and fill any uninitialized players
  for (let i = 1; i <= playerCount; i++) {
    const playerId = `player-${i}`;

    // Assign persona if specified
    const assignedPersona = options?.personas?.[playerId];
    let persona: string | undefined;
    if (assignedPersona === '') {
      persona = '_none_';
    } else if (assignedPersona && assignedPersona !== 'random') {
      persona = assignedPersona;
    }

    if (!players[playerId]) {
      // Fallback: create minimal player state if Lean didn't initialize
      players[playerId] = {
        state: 'start',
        effects: [],
        persona,
        score: 0
      } as PlayerState;
    } else {
      // Attach persona to Lean-initialized state
      (players[playerId] as unknown as Record<string, unknown>).persona = persona;
      // Ensure effects array exists
      if (!players[playerId].effects) {
        players[playerId].effects = [];
      }
    }
  }

  const logPath = getLogPath(gameName, gameId);

  const state: GameState = {
    gameId,
    gameName,
    status: 'waiting_for_players',
    round: 0,
    turnNumber: 0,
    currentPlayer: null,
    turnOrder,
    players,
    shared,
    config,
    rulesMarkdown: markdown,
    log: logPath,
    created: Date.now()
  };

  saveState(state);

  logEvent(state, {
    event: 'game_init',
    data: { gameId, playerCount, config: config.name }
  });

  return state;
}

// Accepts game name OR instance ID
export function registerAgent(
  gameNameOrInstanceId: string,
  role: 'gamemaster' | 'player',
  agentId: string,
  playerId?: string
): { registered: boolean; role: string; playerId?: string; persona?: string; rules: string; instanceId: string; config: object } {
  debug(`[REGISTER DEBUG] === Starting registration ===`);
  debug(`[REGISTER DEBUG] Game: ${gameNameOrInstanceId}, Role: ${role}, AgentId: ${agentId}, PlayerId: ${playerId || 'auto'}`);

  // Resolve to gameName + instanceId
  const resolved = resolveGameInstance(gameNameOrInstanceId);
  if (!resolved) {
    throw new Error(`No active game found for ${gameNameOrInstanceId}`);
  }
  const { gameName, instanceId } = resolved;
  debug(`[REGISTER DEBUG] Resolved: gameName=${gameName}, instanceId=${instanceId}`);

  // Acquire lock for the entire registration operation
  if (!acquireLock(gameName, instanceId)) {
    throw new Error(`Failed to acquire lock for ${instanceId || gameName}`);
  }

  try {
    const state = loadStateUnsafe(gameName, instanceId);

    if (role === 'gamemaster') {
      debug(`[REGISTER DEBUG] Gamemaster registration path`);
      debug(`[REGISTER DEBUG] Before: gamemasterAgentId = ${state.shared.gamemasterAgentId || 'null'}`);

      // Gamemaster registration - store in shared state
      state.shared.gamemasterAgentId = agentId;
      debug(`[REGISTER DEBUG] After assignment: gamemasterAgentId = ${state.shared.gamemasterAgentId}`);

      saveStateUnsafe(state, instanceId);
      debug(`[REGISTER DEBUG] State saved for gamemaster`);

      // Check if all players also registered - if so, auto-start
      const allPlayersRegistered = state.turnOrder.every(pid => state.players[pid].agentId);
      debug(`[REGISTER DEBUG] All players registered? ${allPlayersRegistered}`);
      if (allPlayersRegistered) {
        debug(`[REGISTER DEBUG] Starting game automatically...`);
        startGameUnsafe(gameName, instanceId);
      }

      return {
        registered: true,
        role: 'gamemaster',
        rules: state.rulesMarkdown,
        instanceId: state.gameId,
        config: state.config
      };
    }

    // Player registration
    debug(`[REGISTER DEBUG] Player registration path`);

    if (!playerId) {
      debug(`[REGISTER DEBUG] Auto-assigning player slot...`);
      // Auto-assign to first unregistered player
      for (const pid of state.turnOrder) {
        if (!state.players[pid].agentId) {
          playerId = pid;
          debug(`[REGISTER DEBUG] Assigned to ${playerId}`);
          break;
        }
      }
    }

    if (!playerId || !state.players[playerId]) {
      debug(`[REGISTER DEBUG] ERROR: No available player slot`);
      throw new Error(`No available player slot for registration`);
    }

    debug(`[REGISTER DEBUG] Before: ${playerId}.agentId = ${state.players[playerId].agentId || 'null'}`);

    if (state.players[playerId].agentId) {
      debug(`[REGISTER DEBUG] ERROR: Player already registered`);
      throw new Error(`Player ${playerId} already registered`);
    }

    state.players[playerId].agentId = agentId;
    debug(`[REGISTER DEBUG] After assignment: ${playerId}.agentId = ${state.players[playerId].agentId}`);

    // Assign persona if not pre-assigned
    // - undefined = random assignment
    // - '_none_' = explicit no persona
    // - any other string = specific persona
    let persona = state.players[playerId].persona;
    if (persona === '_none_') {
      // Explicit opt-out - no persona
      persona = undefined;
      state.players[playerId].persona = undefined;
      debug(`[REGISTER DEBUG] Persona explicitly disabled`);
    } else if (!persona) {
      // Random assignment
      const randomPersona = selectRandomPersona();
      if (randomPersona) {
        persona = randomPersona;
        state.players[playerId].persona = persona;
        debug(`[REGISTER DEBUG] Randomly assigned persona: ${persona}`);
      }
    } else {
      debug(`[REGISTER DEBUG] Using pre-assigned persona: ${persona}`);
    }

    saveStateUnsafe(state, instanceId);
    debug(`[REGISTER DEBUG] State saved for ${playerId}`);

    // Build rules with persona injection
    let rulesWithPersona = state.rulesMarkdown;
    if (persona) {
      const personaContent = loadPersonaContent(persona);
      if (personaContent) {
        rulesWithPersona = `${state.rulesMarkdown}\n\n---\n\n# Your Persona\n\n${personaContent}`;
        debug(`[REGISTER DEBUG] Injected persona content for ${persona}`);
      }
    }

    // Check if all players registered
    const allRegistered = state.turnOrder.every(pid => state.players[pid].agentId);
    debug(`[REGISTER DEBUG] All players registered? ${allRegistered}`);
    debug(`[REGISTER DEBUG] Gamemaster registered? ${!!state.shared.gamemasterAgentId}`);

    if (allRegistered && state.shared.gamemasterAgentId) {
      debug(`[REGISTER DEBUG] Starting game automatically...`);
      startGameUnsafe(gameName, instanceId);
    }

    return {
      registered: true,
      role: 'player',
      playerId,
      persona,
      rules: rulesWithPersona,
      instanceId: state.gameId,
      config: state.config
    };
  } finally {
    // Always release lock
    releaseLock(gameName, instanceId);
  }
}

// Internal unsafe version (called within locked operations)
function startGameUnsafe(gameName: string, instanceId?: string): void {
  debug(`[STARTGAME DEBUG] === Starting game ${gameName}/${instanceId || 'default'} ===`);

  const state = loadStateUnsafe(gameName, instanceId);
  debug(`[STARTGAME DEBUG] Current status: ${state.status}`);

  if (state.status !== 'waiting_for_players') {
    debug(`[STARTGAME DEBUG] Game already started, skipping`);
    return; // Already started
  }

  debug(`[STARTGAME DEBUG] Changing status to in_progress`);
  state.status = 'in_progress';
  state.round = 1;
  state.turnNumber = 1;
  state.currentPlayer = state.turnOrder[0];
  debug(`[STARTGAME DEBUG] First player: ${state.currentPlayer}`);

  // Initialize first player's turn (refreshes AP, applies income, etc.)
  if (isLeanEngineAvailable()) {
    const startState = leanTurnStart(state, state.currentPlayer, true);
    if (startState) {
      mergeLeanPlayers(state, startState);
    }
  }

  saveStateUnsafe(state, instanceId);
  debug(`[STARTGAME DEBUG] State saved, game started`);

  logEvent(state, {
    event: 'game_start',
    round: 1,
    turnNumber: 1,
    data: {
      players: state.turnOrder,
      firstPlayer: state.currentPlayer
    }
  });
}

// Public version with locking
export function startGame(gameNameOrInstanceId: string): void {
  const resolved = resolveGameInstance(gameNameOrInstanceId);
  if (!resolved) {
    throw new Error(`No active game found for ${gameNameOrInstanceId}`);
  }
  const { gameName, instanceId } = resolved;

  if (!acquireLock(gameName, instanceId)) {
    throw new Error(`Failed to acquire lock for ${instanceId || gameName}`);
  }

  try {
    startGameUnsafe(gameName, instanceId);
  } finally {
    releaseLock(gameName, instanceId);
  }
}

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  // Use Lean engine for visibility-filtered view when available
  if (isLeanEngineAvailable()) {
    const leanView = leanGetPlayerView(state, playerId);
    if (leanView) {
      return {
        gameId: leanView.gameId || state.gameId,
        round: leanView.round,
        turnNumber: leanView.turnNumber,
        currentPlayer: leanView.currentPlayer,
        myState: {
          state: leanView.myState.state,
          hand: (leanView.myState.hand ?? []) as Card[],
          effects: (leanView.myState.effects ?? []) as PlayerState['effects'],
          score: leanView.myState.score,
          resources: leanView.myState.resources,
          actionPoints: leanView.myState.actionPoints,
          actionPointsUsed: leanView.myState.actionPointsUsed,
          visitedLocations: leanView.myState.visitedLocations,
          placedLocationCount: leanView.myState.placedLocationCount,
          completedTrades: leanView.myState.completedTrades,
        },
        opponents: leanView.opponents.map(op => ({
          playerId: op.playerId,
          state: op.state,
          handSize: op.handSize,
          effects: (op.effects ?? []) as PlayerState['effects'],
          score: op.score,
          resources: op.resources,
          placedLocationCount: op.placedLocationCount,
          completedTrades: op.completedTrades,
        })),
        shared: {
          ...state.shared,
          // Override: hide deck contents, show size only
          deck: undefined,
          deckSize: leanView.shared.deckSize,
          discard: leanView.shared.discard ?? state.shared.discard,
          boardStates: leanView.shared.boardStates,
          placedLocations: leanView.shared.placedLocations,
        }
      };
    }
  }

  // Fallback: basic TS-side view
  const opponents: OpponentView[] = state.turnOrder
    .filter(pid => pid !== playerId)
    .map(pid => ({
      playerId: pid,
      state: state.players[pid].state,
      handSize: (state.players[pid].hand || []).length,
      effects: state.players[pid].effects
    }));

  return {
    gameId: state.gameId,
    round: state.round,
    turnNumber: state.turnNumber,
    currentPlayer: state.currentPlayer!,
    myState: {
      state: player.state,
      hand: player.hand ?? [],
      effects: player.effects
    },
    opponents,
    shared: state.shared
  };
}

/**
 * End game when timeout is reached (max_turns or max_rounds).
 * Delegates winner determination to mechanic hooks (timeout-winner),
 * falls back to highest score if no mechanic handles it.
 */
function endGameOnTimeout(state: GameState, endType: string): void {
  // Guard against duplicate end calls
  if (state.status === 'pending_analysis' || state.status === 'completed' || state.status === 'cancelled') {
    return;
  }

  // Let Lean engine determine timeout winner
  let mechanicWinner: { winner: string; reason: string } | null = null;
  if (isLeanEngineAvailable()) {
    for (const pid of state.turnOrder) {
      const result = leanCheckWin(state, pid, 'timeout');
      if (result?.won) {
        mechanicWinner = { winner: pid, reason: result.reason || 'Timeout win condition met' };
        break;
      }
    }
  }

  let winner: string | null;
  let reason: string;

  if (mechanicWinner) {
    winner = mechanicWinner.winner;
    reason = mechanicWinner.reason;
  } else {
    // Fallback: highest score
    let highestScore = -Infinity;
    winner = 'none';
    for (const [playerId, player] of Object.entries(state.players)) {
      const score = player.score ?? 0;
      if (score > highestScore) {
        highestScore = score;
        winner = playerId;
      }
    }
    const limit = endType === 'turn_limit' ? `Max turns (${state.config.max_turns})` : `Max rounds (${state.config.max_rounds})`;
    reason = `${limit} reached. ${winner} wins with ${highestScore} points.`;
  }

  state.status = 'pending_analysis';
  state.shared.winner = winner;
  state.shared.endReason = reason;

  logEvent(state, {
    event: 'game_end',
    round: state.round,
    turnNumber: state.turnNumber,
    data: { winner, reason, endType }
  });

  saveState(state);
}

export function advanceTurn(state: GameState): void {
  const previousPlayer = state.currentPlayer!;
  const currentIndex = state.turnOrder.indexOf(previousPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  const isNewRound = nextIndex === 0;

  // Always increment turnNumber (absolute action counter)
  state.turnNumber++;

  // Proposal 012: Check max_turns limit (takes precedence over max_rounds)
  const maxTurns = state.config.max_turns as number | undefined;
  if (maxTurns && state.turnNumber > maxTurns) {
    endGameOnTimeout(state, 'turn_limit');
    return;
  }

  // If we wrapped around, increment round number
  if (isNewRound) {
    state.round++;

    // Check max_rounds limit (legacy - use max_turns for turn-based limits)
    if (state.config.max_rounds && state.round > state.config.max_rounds) {
      endGameOnTimeout(state, 'timeout');
      return;
    }
  }

  // ============ Lean Engine: Turn lifecycle ============
  // Route turn end/start through Lean engine for AP refresh, effect ticks, etc.
  if (isLeanEngineAvailable()) {
    // Turn end for previous player
    const endState = leanTurnEnd(state, previousPlayer, state.turnOrder[nextIndex], isNewRound);
    if (endState) {
      mergeLeanPlayers(state, endState);
    }

    state.currentPlayer = state.turnOrder[nextIndex];

    // Turn start for next player (refreshes AP, etc.)
    const startState = leanTurnStart(state, state.currentPlayer, isNewRound);
    if (startState) {
      mergeLeanPlayers(state, startState);
    }
  } else {
    state.currentPlayer = state.turnOrder[nextIndex];
  }

  saveState(state);
}

export function endGame(gameName: string, winner: string, reason: string): GameState {
  const state = loadState(gameName);

  // Guard against duplicate end calls — game can only end once
  if (state.status === 'pending_analysis' || state.status === 'completed' || state.status === 'cancelled') {
    return state;
  }

  state.status = 'pending_analysis';
  state.shared.winner = winner;
  state.shared.endReason = reason;
  saveState(state);

  logEvent(state, {
    event: 'game_end',
    round: state.round,
    turnNumber: state.turnNumber,
    data: { winner, reason }
  });

  return state;
}

export function cancelGame(gameName: string, reason: string): GameState {
  const state = loadState(gameName);

  state.status = 'cancelled';
  state.shared.cancelReason = reason;
  saveState(state);

  logEvent(state, {
    event: 'game_cancelled',
    round: state.round,
        turnNumber: state.turnNumber,
    data: { reason }
  });

  return state;
}

/**
 * Check if multi-action per round is allowed (e.g., action-points mechanic is enabled).
 * Without this, engine enforces single action per round.
 */
function isMultiActionAllowed(state: GameState): boolean {
  return !!state.config.engine_mechanics?.action_points;
}

/**
 * Conditionally advance turn based on action type and mechanic hooks.
 * For games with action points, only advances when AP is depleted.
 * For games without action points, always advances (each action = one turn).
 *
 * @param state - Current game state
 * @param playerId - Player who just acted
 * @param action - The action that was executed
 * @returns true if turn was advanced, false if player can continue
 */
export function maybeAdvanceTurn(state: GameState, playerId: string, _action: GameAction): boolean {
  // Auto-advance for single-action-per-round games (no action points).
  if (!isMultiActionAllowed(state)) {
    advanceTurn(state);
    return true;
  }

  // For multi-action games, check if AP depleted
  const player = state.players[playerId];
  if (player?.actionPoints !== undefined && player?.actionPointsUsed !== undefined) {
    if (player.actionPointsUsed >= player.actionPoints) {
      advanceTurn(state);
      return true;
    }
  }

  // Turn continues - save state but don't advance
  saveState(state);
  return false;
}

/**
 * Submit gamemaster analysis for a completed game.
 * Transitions status from 'pending_analysis' to 'completed'.
 */
export function submitAnalysis(gameName: string, analysis: GameAnalysis): GameState {
  const state = loadState(gameName);

  if (state.status !== 'pending_analysis') {
    throw new Error(`Cannot submit analysis: game status is '${state.status}', expected 'pending_analysis'`);
  }

  // Store analysis in shared state
  state.shared.analysis = analysis;
  state.status = 'completed';
  saveState(state);

  logEvent(state, {
    event: 'analysis_submitted',
    round: state.round,
        turnNumber: state.turnNumber,
    data: {
      summary: analysis.summary,
      winner: analysis.winner,
      mechanicsUsed: analysis.mechanicsObserved
    }
  });

  return state;
}

/**
 * Skip analysis and mark game as completed directly.
 * Use when no analysis is needed or GM is unavailable.
 */
export function skipAnalysis(gameName: string): GameState {
  const state = loadState(gameName);

  if (state.status !== 'pending_analysis') {
    throw new Error(`Cannot skip analysis: game status is '${state.status}', expected 'pending_analysis'`);
  }

  state.status = 'completed';
  saveState(state);

  return state;
}

/**
 * Submit gamemaster analysis as markdown file.
 * Writes to: games/{gameName}/logs/playtest-analysis-{version}-{timestamp}.md
 * Transitions status from 'pending_analysis' to 'completed'.
 */
export function submitAnalysisMarkdown(gameNameOrId: string, version: string, markdownContent: string): GameState {
  const state = loadState(gameNameOrId);

  if (state.status !== 'pending_analysis') {
    throw new Error(`Cannot submit analysis: game status is '${state.status}', expected 'pending_analysis'`);
  }

  // Extract timestamp from gameId (e.g., "fortune-seekers-1769871590604" -> "1769871590604")
  const timestampMatch = state.gameId.match(/(\d{13})$/);
  if (!timestampMatch) {
    throw new Error(`Cannot extract timestamp from gameId: ${state.gameId}`);
  }
  const timestamp = timestampMatch[1];

  // Ensure version starts with 'v' for consistency
  const normalizedVersion = version.startsWith('v') ? version : `v${version}`;

  // Build analysis file path
  const logsDir = join(GAMES_DIR, state.gameName, 'logs');
  const analysisFilename = `playtest-analysis-${normalizedVersion}-${timestamp}.md`;
  const analysisPath = join(logsDir, analysisFilename);

  // Ensure logs directory exists
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  // Write markdown file
  writeFileSync(analysisPath, markdownContent, 'utf-8');

  // Store reference in game state
  state.shared.analysisFile = analysisFilename;
  state.shared.analysisVersion = normalizedVersion;
  state.status = 'completed';
  saveState(state);

  logEvent(state, {
    event: 'analysis_submitted',
    round: state.round,
        turnNumber: state.turnNumber,
    data: {
      file: analysisFilename,
      version: normalizedVersion
    }
  });

  return state;
}

// Randomization functions (engine-controlled)

export function roll(probability: number): { roll: number; success: boolean } {
  const rollValue = Math.random();
  return {
    roll: rollValue,
    success: rollValue <= probability
  };
}

// ============ Win Condition Detection ============

/**
 * Check all players for win conditions after an action.
 * Delegates to mechanic registry's onCheckWin hooks (win condition mechanics
 * are auto-derived from win_condition string during config normalization).
 */
export function checkAllWinConditions(state: GameState): { winner: string; reason: string } | null {
  // Route through Lean engine for win condition checks
  if (isLeanEngineAvailable()) {
    for (const pid of state.turnOrder) {
      const result = leanCheckWin(state, pid, 'action');
      if (result?.won) {
        return { winner: pid, reason: result.reason || 'Win condition met' };
      }
    }
  }

  // Bridge-layer: highest_score win condition check
  // Lean only checks this on round_end/turn_limit triggers, but
  // games like council-of-whispers need it checked when PD completes
  const wc = state.config.win_condition;
  if (wc && (wc.includes('highest_score') || wc.includes('single_loser'))) {
    // Check if game-end condition has been triggered (e.g., PD completed)
    if (state.shared.gameOver) {
      let maxScore = -Infinity;
      let winner: string | null = null;
      for (const [pid, player] of Object.entries(state.players)) {
        const score = player.score ?? 0;
        if (score > maxScore) {
          maxScore = score;
          winner = pid;
        }
      }
      if (winner) {
        return { winner, reason: `Highest score: ${maxScore}` };
      }
    }
  }

  return null;
}

// determineTimeoutWinner logic moved to timeout-winner mechanic (onCheckWin with trigger='timeout')
// Engine fallback (highest score) is in endGameOnTimeout() above

// drawCards moved to cards core mechanic (src/mechanics/core/cards.ts)

export function discardCard(state: GameState, playerId: string, cardIndex: number): Card | null {
  const player = state.players[playerId];
  if (!player || !player.hand || cardIndex < 0 || cardIndex >= player.hand.length) return null;
  const [card] = player.hand.splice(cardIndex, 1);
  const discard = (state.shared.discard || state.shared.discardPile || []) as Card[];
  discard.push(card);
  state.shared.discard = discard;
  saveState(state);
  return card;
}

export function playCardByName(state: GameState, playerId: string, cardName: string): Card | null {
  const player = state.players[playerId];
  if (!player || !player.hand) return null;
  const idx = player.hand.findIndex(c => c.name === cardName);
  if (idx === -1) return null;
  const [card] = player.hand.splice(idx, 1);
  const discard = (state.shared.discard || state.shared.discardPile || []) as Card[];
  discard.push(card);
  state.shared.discard = discard;
  saveState(state);
  return card;
}

// getPlacedCardsOnState and applyPlacedCardEffects moved to board-state mechanic

// applyLocationEffects removed - location-effects mechanic handles via applyEffect hook

/**
 * Place a card on a board state.
 */
// ============ Dynamic Action Discovery ============

/**
 * Get all available actions for a player based on game rules and current state.
 * Routes through the Lean engine for action discovery, with engine-level
 * actions (pass, resign) always available.
 */
export function getAvailableActions(state: GameState, playerId: string): AvailableActionsResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const isCurrentPlayer = state.currentPlayer === playerId;
  const placedCards = (state.shared.placedCards || []) as PlacedCard[];
  const actions: AvailableAction[] = [];

  // === Lean Engine: get mechanic-provided actions ===
  if (isLeanEngineAvailable() && isCurrentPlayer) {
    const leanActions = leanGetAvailableActions(state, playerId);
    for (const la of leanActions) {
      let targets = la.targets;
      let cards = la.cards;

      const actionType = la.action.type;

      // Augment move actions with board targets if not provided by Lean
      if (actionType === 'move' && !targets) {
        const boardConfig = state.config.board || (state.config.engine_mechanics as Record<string, unknown>)?.board as typeof state.config.board;
        if (boardConfig?.edges) {
          const currentPos = player.state;
          const edge = boardConfig.edges.find(e => {
            const from = Array.isArray(e.from) ? e.from : [e.from];
            return from.includes(currentPos);
          });
          if (edge) {
            targets = Array.isArray(edge.to) ? edge.to : [edge.to];
          }
        }
      }

      actions.push({
        type: actionType as GameAction['type'],
        description: la.description || `${actionType}`,
        enabled: la.enabled !== false,
        required: {},
        examples: [la.action as unknown as GameAction],
        ...(targets ? { targets } : {}),
        ...(cards ? { cards } : {}),
      });
    }
  }

  // === Out-of-turn actions (SAS/PD) for ALL players ===
  // Lean-canonical state: sas_selections, pd_choices, pd_resolved at shared top level
  {
    const em = (state.config.engine_mechanics || {}) as Record<string, unknown>;
    const shared = state.shared as Record<string, unknown>;

    // Simultaneous Action Selection: show select_action if not already selected
    if (em.simultaneous_action_selection || shared.sas_selections !== undefined) {
      const selections = shared.sas_selections as Record<string, string> | undefined;
      const alreadySelected = selections && typeof selections === 'object' && playerId in selections;
      if (!alreadySelected && !actions.some(a => a.type === 'select_action')) {
        actions.push({
          type: 'select_action' as GameAction['type'],
          description: 'Choose your action for this round',
          enabled: true,
          required: {},
          examples: [{ type: 'select_action', selectedAction: 'Scheme' } as unknown as GameAction]
        });
      }
    }

    // Prisoner's Dilemma: show dilemma_choice if not already chosen
    if (em.prisoners_dilemma || shared.pd_choices !== undefined) {
      const choices = shared.pd_choices as Record<string, string> | undefined;
      const resolved = shared.pd_resolved as boolean | undefined;
      const alreadyChosen = choices && typeof choices === 'object' && playerId in choices;
      if (!alreadyChosen && !resolved && !actions.some(a => a.type === 'dilemma_choice')) {
        actions.push({
          type: 'dilemma_choice' as GameAction['type'],
          description: 'Choose cooperate or defect',
          enabled: true,
          required: {},
          examples: [{ type: 'dilemma_choice', choice: 'cooperate' } as unknown as GameAction]
        });
      }
    }
  }

  // === PASS action (if not already from Lean) ===
  if (!actions.some(a => a.type === 'pass')) {
    // For out-of-turn players in SAS/PD games, pass should be disabled
    const em = (state.config.engine_mechanics || {}) as Record<string, unknown>;
    const shared = state.shared as Record<string, unknown>;
    const hasSasOrPd = em.simultaneous_action_selection || em.prisoners_dilemma ||
      shared.sas_selections !== undefined || shared.pd_choices !== undefined;
    const passEnabled = isCurrentPlayer || !hasSasOrPd;

    actions.push({
      type: 'pass',
      description: 'Skip your turn without taking an action',
      enabled: passEnabled,
      reason: !passEnabled ? 'Not your turn' : undefined,
      required: {},
      optional: { reasoning: 'Why you are passing' },
      examples: [{ type: 'pass' }]
    });
  } else if (!isCurrentPlayer) {
    // Disable pass for non-current players in SAS/PD games
    const em = (state.config.engine_mechanics || {}) as Record<string, unknown>;
    const shared = state.shared as Record<string, unknown>;
    const hasSasOrPd = em.simultaneous_action_selection || em.prisoners_dilemma ||
      shared.sas_selections !== undefined || shared.pd_choices !== undefined;
    if (hasSasOrPd) {
      const passAction = actions.find(a => a.type === 'pass');
      if (passAction) {
        passAction.enabled = false;
        passAction.reason = 'Not your turn';
      }
    }
  }

  // === RESIGN action (always available) ===
  actions.push({
    type: 'resign',
    description: 'Forfeit the game (requires gamemaster approval)',
    enabled: true,
    required: { reason: 'Explanation for why you are resigning' },
    examples: [{ type: 'resign', reason: 'I cannot win from this position' }]
  });

  const result: AvailableActionsResult = {
    playerId,
    isYourTurn: isCurrentPlayer,
    currentState: player.state,
    hand: (player.hand ?? []).map(c => c.name),
    actions,
    placedCards,
    activeEffects: player.effects
  };

  // Add resource/AP info if present
  if (player.actionPoints !== undefined) {
    (result as Record<string, unknown>).actionPoints = player.actionPoints;
  }
  if (player.actionPointsUsed !== undefined) {
    (result as Record<string, unknown>).actionPointsUsed = player.actionPointsUsed;
  }
  if (player.resources) {
    (result as Record<string, unknown>).resources = player.resources;
  }

  return result;
}

// ============ Contest-Based Adjudication Functions ============

// Initialize contest state in game state if not present
export function ensureContestState(state: GameState): ContestState {
  if (!state.shared.contestState) {
    state.shared.contestState = {
      actionHistory: [],
      contestHistory: [],
      resignations: [],
      victoryHistory: []
    };
  }
  // Ensure arrays exist for older game states
  const cs = state.shared.contestState as ContestState;
  if (!cs.victoryHistory) {
    cs.victoryHistory = [];
  }
  if (!cs.actionHistory) {
    cs.actionHistory = [];
  }
  return cs;
}

// Record an action in both lastAction and actionHistory
const MAX_ACTION_HISTORY = 12;  // Keep last 12 actions (3 full rounds for 4 players)

export function recordAction(contestState: ContestState, action: LastAction): void {
  contestState.lastAction = action;

  // Add to history and trim to max size
  contestState.actionHistory.push(action);
  if (contestState.actionHistory.length > MAX_ACTION_HISTORY) {
    contestState.actionHistory = contestState.actionHistory.slice(-MAX_ACTION_HISTORY);
  }
}

// Validate an action against an ActionSchema returned by a mechanic
function validateAgainstSchema(action: Record<string, unknown>, schema: ActionSchema): string[] {
  const errors: string[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (action[field] === undefined || action[field] === null) {
        errors.push(`${action.type} action requires "${field}" field`);
      }
    }
  }

  // Check field types
  if (schema.fields) {
    for (const [field, def] of Object.entries(schema.fields)) {
      const value = action[field];
      if (value === undefined || value === null) continue; // Missing fields caught by required check

      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== def.type) {
        errors.push(`${action.type} "${field}" must be ${def.type === 'array' ? 'an array' : `a ${def.type}`}`);
        continue;
      }

      if (def.type === 'number' && typeof value === 'number') {
        if (def.minimum !== undefined && value < def.minimum) {
          errors.push(`${action.type} "${field}" must be at least ${def.minimum}`);
        }
        if (def.maximum !== undefined && value > def.maximum) {
          errors.push(`${action.type} "${field}" must be at most ${def.maximum}`);
        }
      }

      if (def.enum && !def.enum.includes(value)) {
        errors.push(`${action.type} "${field}" must be one of: ${def.enum.join(', ')}`);
      }
    }
  }

  // Check conditional requirements
  if (schema.conditional) {
    for (const cond of schema.conditional) {
      const matches = Object.entries(cond.if).every(([k, v]) => action[k] === v);
      if (matches) {
        if (cond.require) {
          for (const field of cond.require) {
            if (action[field] === undefined || action[field] === null) {
              errors.push(`${action.type} requires "${field}" when ${Object.entries(cond.if).map(([k, v]) => `${k}=${v}`).join(', ')}`);
            }
          }
        }
        if (cond.forbid) {
          for (const field of cond.forbid) {
            if (action[field] !== undefined) {
              errors.push(`${action.type} forbids "${field}" when ${Object.entries(cond.if).map(([k, v]) => `${k}=${v}`).join(', ')}`);
            }
          }
        }
      }
    }
  }

  return errors;
}

// Built-in schemas for engine-owned actions (not owned by any mechanic)
const BUILTIN_SCHEMAS: Record<string, ActionSchema> = {
  resign: {
    required: ['reason'],
    fields: {
      reason: { type: 'string' },
    },
  },
};

// Validate action schema/type (stateless check — called before game state is loaded)
export function validateActionSchema(action: unknown): ActionValidationResult {
  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['Action must be a JSON object'] };
  }

  const act = action as Record<string, unknown>;

  if (!act.type || typeof act.type !== 'string') {
    return { valid: false, errors: ['Action must have a "type" field (string)'] };
  }

  // Validate against built-in schema if this is an engine-owned action
  const builtinSchema = BUILTIN_SCHEMAS[act.type];
  if (builtinSchema) {
    const errors = validateAgainstSchema(act, builtinSchema);
    if (errors.length > 0) {
      return { valid: false, errors };
    }
  }

  // Mechanic-owned action schemas are validated in validateAction() where game state is available
  return { valid: true, errors: [] };
}

// Schema validation now handled by Lean engine

// Validate action against game rules (basic engine-level + Lean engine validation)
export function validateAction(state: GameState, playerId: string, action: GameAction): ActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const player = state.players[playerId];
  if (!player) {
    return { valid: false, errors: [`Player ${playerId} not found`] };
  }

  // Check if it's the player's turn (with out-of-turn mechanics support)
  if (state.currentPlayer !== playerId && !canPlayerActNow(state, playerId, action.type)) {
    return { valid: false, errors: [`Not your turn. Current player: ${state.currentPlayer}`] };
  }

  // Check game status
  if (state.status !== 'in_progress') {
    return { valid: false, errors: [`Game is not in progress. Status: ${state.status}`] };
  }

  // Check for pending contest/resignation (with auto-adjudication timeout)
  const contestState = ensureContestState(state);
  if (contestState.pendingContest) {
    const wasAutoAdjudicated = checkAndAutoAdjudicateContest(state);
    if (!wasAutoAdjudicated) {
      const elapsed = Date.now() - new Date(contestState.pendingContest.timestamp).getTime();
      const remainingMs = AUTO_ADJUDICATION_TIMEOUT_MS - elapsed;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      return {
        valid: false,
        errors: [`Cannot act while a contest is pending. Wait for adjudication (auto-adjudication in ${remainingSec}s).`]
      };
    }
  }
  if (contestState.pendingResignation) {
    const wasAutoAdjudicated = checkAndAutoAdjudicateResignation(state);
    if (!wasAutoAdjudicated) {
      return { valid: false, errors: ['Cannot act while a resignation is pending adjudication.'] };
    }
  }

  // Prevent multiple actions per round unless multi-action is allowed (e.g., action-points)
  if (state.currentPlayer === playerId && !isMultiActionAllowed(state) && player.lastActionRound === state.round && action.type !== 'pass') {
    return {
      valid: false,
      errors: ['You have already acted this round. Wait for your next turn.']
    };
  }

  // ============ Lean Engine Validation ============
  if (isLeanEngineAvailable()) {
    const leanResult = leanValidateAction(state, playerId, action);
    if (leanResult && !leanResult.valid) {
      return { valid: false, errors: [leanResult.error || 'Action blocked by Lean engine'] };
    }
  }

  if (action.type === 'pass') {
    warnings.push('Pass action will be recorded. Other players may contest if rules require you to play.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// Execute an action directly (routes through Lean engine)
export function executeAction(state: GameState, playerId: string, action: GameAction): {
  success: boolean;
  effect?: { type: string; details?: Record<string, unknown> };
  error?: string;
  gameOver?: boolean;
  winner?: string;
} {
  const player = state.players[playerId];
  if (!player) {
    return { success: false, error: `Player ${playerId} not found` };
  }

  const contestState = ensureContestState(state);

  // ============ Engine-level: resign (not a game mechanic) ============
  if (action.type === 'resign') {
    const resignAction = action as ResignAction;
    contestState.pendingResignation = {
      player: playerId,
      reason: resignAction.reason,
      timestamp: new Date().toISOString()
    };
    saveState(state);

    logEvent(state, {
      event: 'resignation_submitted',
      round: state.round,
      turnNumber: state.turnNumber,
      player: playerId,
      data: { reason: resignAction.reason }
    });

    return {
      success: true,
      effect: { type: 'resignation_pending', details: { reason: resignAction.reason } }
    };
  }

  // ============ Lean Engine Execution ============
  if (isLeanEngineAvailable()) {
    const leanResult = leanExecuteAction(state, playerId, action);
    if (!leanResult.success) {
      return { success: false, error: leanResult.error || 'Lean engine execution failed' };
    }

    // Merge Lean state changes back (players + shared state)
    if (leanResult.state) {
      mergeLeanPlayers(state, leanResult.state);
    }

    // Log the action
    logEvent(state, {
      event: 'action_executed',
      round: state.round,
      turnNumber: state.turnNumber,
      player: playerId,
      data: {
        type: action.type,
        message: leanResult.execution?.logMessage
      }
    });

    // Check win conditions if requested
    if (leanResult.execution?.checkWin) {
      const winCheck = checkAllWinConditions(state);
      if (winCheck) {
        state.status = 'pending_analysis';
        state.shared.winner = winCheck.winner;
        state.shared.endReason = winCheck.reason;
        saveState(state);
        return {
          success: true,
          gameOver: true,
          winner: winCheck.winner,
          effect: { type: action.type }
        };
      }
    }

    // Mark that player has acted this round
    player.lastActionRound = state.round;

    // Handle turn advancement
    if (leanResult.execution?.advanceTurn) {
      advanceTurn(state);
    } else if (!isMultiActionAllowed(state)) {
      // Single-action-per-round games always advance
      advanceTurn(state);
    } else {
      saveState(state);
    }

    return {
      success: true,
      effect: { type: action.type, details: { message: leanResult.execution?.logMessage } }
    };
  }

  // No Lean engine available
  return { success: false, error: `Lean engine not available. Build with: cd lean && lake build lean-engine` };
}

// validateSet moved to set-collection mechanic

// File a contest against the previous action
export function fileContest(state: GameState, contestingPlayer: string, reason: string): {
  success: boolean;
  error?: string;
} {
  const contestState = ensureContestState(state);

  if (!contestState.lastAction) {
    return { success: false, error: 'No previous action to contest' };
  }

  if (contestState.lastAction.player === contestingPlayer) {
    return { success: false, error: 'Cannot contest your own action' };
  }

  if (contestState.pendingContest) {
    return { success: false, error: 'A contest is already pending' };
  }

  if (contestState.pendingResignation) {
    return { success: false, error: 'A resignation is pending adjudication' };
  }

  contestState.pendingContest = {
    contestedBy: contestingPlayer,
    reason,
    originalAction: contestState.lastAction,
    timestamp: new Date().toISOString()
  };

  saveState(state);

  logEvent(state, {
    event: 'contest_filed',
    round: state.round,
        turnNumber: state.turnNumber,
    player: contestingPlayer,
    data: {
      reason,
      contestedAction: contestState.lastAction.action,
      contestedPlayer: contestState.lastAction.player
    }
  });

  return { success: true };
}

// Adjudicate a pending contest
export function adjudicateContest(
  state: GameState,
  ruling: 'allowed' | 'rejected',
  rulingReason: string
): {
  success: boolean;
  reversed?: boolean;
  error?: string;
} {
  const contestState = ensureContestState(state);

  if (!contestState.pendingContest) {
    return { success: false, error: 'No pending contest to adjudicate' };
  }

  const contest = contestState.pendingContest;
  const originalAction = contest.originalAction;

  // Record in history
  contestState.contestHistory.push({
    round: originalAction.round,
    turnNumber: originalAction.turnNumber,
    action: originalAction.action,
    player: originalAction.player,
    contestedBy: contest.contestedBy,
    contestReason: contest.reason,
    ruling,
    rulingReason,
    timestamp: new Date().toISOString()
  });

  let reversed = false;

  // If action is rejected, try to reverse it
  if (ruling === 'rejected') {
    reversed = reverseAction(state, originalAction);
  }

  // Clear pending contest
  delete contestState.pendingContest;
  saveState(state);

  logEvent(state, {
    event: 'contest_adjudicated',
    round: state.round,
        turnNumber: state.turnNumber,
    data: {
      ruling,
      rulingReason,
      reversed,
      contestedPlayer: originalAction.player,
      contestedBy: contest.contestedBy
    }
  });

  // If ruling is 'allowed' and action includes victory declaration, create pending claim
  if (ruling === 'allowed') {
    processVictoryDeclarationIfPresent(state, originalAction);
  }

  return { success: true, reversed };
}

// Adjudicate a pending resignation
export function adjudicateResignation(
  state: GameState,
  accepted: boolean,
  rulingReason?: string
): {
  success: boolean;
  error?: string;
} {
  const contestState = ensureContestState(state);

  if (!contestState.pendingResignation) {
    return { success: false, error: 'No pending resignation to adjudicate' };
  }

  const resignation = contestState.pendingResignation;

  // Record in history
  contestState.resignations.push({
    player: resignation.player,
    reason: resignation.reason,
    accepted,
    rulingReason,
    timestamp: new Date().toISOString()
  });

  if (accepted) {
    // End game - the resigning player loses
    const otherPlayers = state.turnOrder.filter(p => p !== resignation.player);
    const winner = otherPlayers.length === 1 ? otherPlayers[0] : 'none';

    state.status = 'pending_analysis';
    state.shared.winner = winner;
    state.shared.endReason = `${resignation.player} resigned: ${resignation.reason}`;

    logEvent(state, {
      event: 'game_end',
      round: state.round,
        turnNumber: state.turnNumber,
      data: {
        winner,
        reason: `Resignation accepted: ${resignation.reason}`,
        resignedPlayer: resignation.player
      }
    });
  }

  // Clear pending resignation
  delete contestState.pendingResignation;
  saveState(state);

  logEvent(state, {
    event: 'resignation_adjudicated',
    round: state.round,
        turnNumber: state.turnNumber,
    data: {
      player: resignation.player,
      accepted,
      rulingReason
    }
  });

  return { success: true };
}

// Adjudicate a pending victory claim
export function adjudicateVictory(
  state: GameState,
  accepted: boolean,
  rulingReason: string
): { success: boolean; error?: string } {
  const contestState = ensureContestState(state);

  if (!contestState.pendingVictoryClaim) {
    return { success: false, error: 'No pending victory claim to adjudicate' };
  }

  const claim = contestState.pendingVictoryClaim;

  // Ensure victoryHistory array exists
  if (!contestState.victoryHistory) {
    contestState.victoryHistory = [];
  }

  // Record in history
  contestState.victoryHistory.push({
    player: claim.player,
    reason: claim.reason,
    ruling: accepted ? 'accepted' : 'rejected',
    rulingReason,
    timestamp: new Date().toISOString()
  });

  if (accepted) {
    state.status = 'pending_analysis';
    state.shared.winner = claim.player;
    state.shared.endReason = `Victory claim accepted: ${rulingReason}`;

    logEvent(state, {
      event: 'game_end',
      round: state.round,
        turnNumber: state.turnNumber,
      data: {
        winner: claim.player,
        reason: rulingReason,
        claimedState: claim.toState
      }
    });
  } else {
    // Rejected - ROLL BACK the move, then advance turn
    // Roll back to previous state
    if (state.players[claim.player]) {
      state.players[claim.player].state = claim.fromState;
    }

    logEvent(state, {
      event: 'victory_rejected',
      round: state.round,
        turnNumber: state.turnNumber,
      player: claim.player,
      data: {
        reason: rulingReason,
        rolledBackFrom: claim.toState,
        rolledBackTo: claim.fromState
      }
    });

    // Victory rejection always advances turn
    advanceTurn(state);
  }

  // Clear pending victory claim
  delete contestState.pendingVictoryClaim;
  saveState(state);

  logEvent(state, {
    event: 'victory_adjudicated',
    round: state.round,
        turnNumber: state.turnNumber,
    data: {
      player: claim.player,
      accepted,
      rulingReason
    }
  });

  return { success: true };
}

// Reverse a previous action (for rejected contests)
function reverseAction(state: GameState, lastAction: LastAction): boolean {
  const playerId = lastAction.player;
  const player = state.players[playerId];

  if (!player) return false;

  try {
    // Reverse turn and save (contest reversal is best-effort)
    reverseTurn(state);
    saveState(state);
    return true;
  } catch {
    return false;
  }
}

// Reverse turn advancement
function reverseTurn(state: GameState): void {
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
  const prevIndex = (currentIndex - 1 + state.turnOrder.length) % state.turnOrder.length;

  // Always decrement turnNumber
  state.turnNumber = Math.max(1, state.turnNumber - 1);

  // If we're at the start of a new round, decrement round counter
  if (currentIndex === 0) {
    state.round = Math.max(1, state.round - 1);
  }

  state.currentPlayer = state.turnOrder[prevIndex];
}

// Get contest state for a game
export function getContestState(gameName: string): ContestState {
  const state = loadState(gameName);
  return ensureContestState(state);
}
