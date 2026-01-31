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
  PlayCardAction,
  DrawAction,
  PassAction,
  MoveAction,
  ResignAction,
  PlaceCardAction,
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
  AvailableActionsResult
} from './types.js';
import { parseRules, buildDeck, shuffleDeck, getPlayerCount } from './rules.js';

// Find project root (parent of engine directory)
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
      turn: originalAction.turn,
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
      turn: state.turn,
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
    return true;
  }

  return false;
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

    // Record in history
    contestState.resignations.push({
      player: resignation.player,
      reason: resignation.reason,
      accepted: true,
      rulingReason: `[AUTO-ADJUDICATED] Gamemaster did not respond within ${AUTO_ADJUDICATION_TIMEOUT_MS / 1000}s. Resignation accepted by default.`,
      timestamp: new Date().toISOString()
    });

    // Clear pending resignation
    delete contestState.pendingResignation;
    saveState(state);

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

// Resolve a game name or instance ID to {gameName, instanceId}
// Returns null if cannot be resolved
export function resolveGameInstance(gameNameOrInstanceId: string): { gameName: string; instanceId: string } | null {
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
          // Sort by modification time, most recent first
          const aStat = statSync(join(statePath, a, 'game.json'));
          const bStat = statSync(join(statePath, b, 'game.json'));
          return bStat.mtime.getTime() - aStat.mtime.getTime();
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
  debug(`[SAVESTATE DEBUG] Status: ${state.status}, Turn: ${state.turn}`);

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

  const gameId = `${gameName}-${Date.now()}`;

  // Build and shuffle deck if configured
  let deck: Card[] = [];
  if (config.deck) {
    deck = shuffleDeck(buildDeck(config.deck));
  }

  // Create player slots
  const players: Record<string, PlayerState> = {};
  const turnOrder: string[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const playerId = `player-${i}`;
    turnOrder.push(playerId);

    // Assign persona if specified
    // - undefined or "random" = assign random at registration
    // - empty string "" = no persona (explicit opt-out)
    // - any other string = specific persona slug
    const assignedPersona = options?.personas?.[playerId];
    let persona: string | undefined;
    if (assignedPersona === '') {
      persona = '_none_';  // Marker for explicit no-persona
    } else if (assignedPersona && assignedPersona !== 'random') {
      persona = assignedPersona;
    }
    // else undefined = random assignment at registration

    players[playerId] = {
      state: config.board?.start ?? 'start',
      hand: [],
      effects: [],
      persona
    };
  }

  // Deal starting cards
  const startingCards = config.starting_cards ?? 0;
  if (startingCards > 0 && deck.length > 0) {
    for (const playerId of turnOrder) {
      const drawn = deck.splice(0, startingCards);
      players[playerId].hand = drawn;
    }
  }

  // Initialize discard pile for card games (flip top card from deck)
  let discardPile: Card[] = [];
  const shared: Record<string, unknown> = {
    placedCards: []  // Track cards placed on board states (state cards mechanic)
  };

  if (deck.length > 0 && startingCards > 0) {
    const topCard = deck.shift()!;
    discardPile = [topCard];
    shared.topCard = topCard;
    shared.currentColor = topCard.effect?.color ?? null;
  }

  const logPath = getLogPath(gameName, gameId);

  const state: GameState = {
    gameId,
    gameName,
    status: 'waiting_for_players',
    turn: 0,
    currentPlayer: null,
    turnOrder,
    players,
    shared,
    deck,
    discardPile,
    config,
    rulesMarkdown: markdown,
    log: logPath
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
  state.turn = 1;
  state.currentPlayer = state.turnOrder[0];
  debug(`[STARTGAME DEBUG] First player: ${state.currentPlayer}`);

  saveStateUnsafe(state, instanceId);
  debug(`[STARTGAME DEBUG] State saved, game started`);

  logEvent(state, {
    event: 'game_start',
    turn: 1,
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

  const opponents: OpponentView[] = state.turnOrder
    .filter(pid => pid !== playerId)
    .map(pid => ({
      playerId: pid,
      state: state.players[pid].state,
      handSize: state.players[pid].hand.length,
      effects: state.players[pid].effects
    }));

  return {
    gameId: state.gameId,
    turn: state.turn,
    currentPlayer: state.currentPlayer!,
    myState: {
      state: player.state,
      hand: player.hand,
      effects: player.effects
    },
    opponents,
    shared: state.shared
  };
}

export function advanceTurn(state: GameState): void {
  const previousPlayer = state.currentPlayer!;
  const currentIndex = state.turnOrder.indexOf(previousPlayer);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;

  // If we wrapped around, increment turn number
  if (nextIndex === 0) {
    state.turn++;
  }

  state.currentPlayer = state.turnOrder[nextIndex];

  // Decrement effect durations ONLY for the player whose turn just ended
  // This ensures effects like "Block for 1 turn" last until the blocked player's turn
  // Effects on OTHER players are decremented when THEIR turn ends
  const prevPlayer = state.players[previousPlayer];
  if (prevPlayer) {
    prevPlayer.effects = prevPlayer.effects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);
  }

  saveState(state);
}

export function endGame(gameName: string, winner: string, reason: string): GameState {
  const state = loadState(gameName);

  state.status = 'completed';
  state.shared.winner = winner;
  state.shared.endReason = reason;
  saveState(state);

  logEvent(state, {
    event: 'game_end',
    turn: state.turn,
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
    turn: state.turn,
    data: { reason }
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

// ============ Win Condition Detection (Game-Agnostic) ============

/**
 * Check if a player has met the win condition defined in config.
 * Supports various game-agnostic patterns:
 * - "reach <state>" / "First player to reach the <state> state" - board games
 * - "empty hand" - card games
 * - "score >= <n>" / "score > <n>" - point-based games
 * - "eliminate opponents" - last player standing
 */
export function checkWinCondition(state: GameState, playerId: string): { won: boolean; reason?: string } {
  const player = state.players[playerId];
  if (!player) return { won: false };

  const condition = state.config.win_condition?.toLowerCase() || '';

  // Pattern: "reach <state>" or "First player to reach the <state> state"
  // Match patterns like "reach Victory", "First player to reach the Victory state"
  const reachMatch = condition.match(/reach\s+(?:the\s+)?(\w+)(?:\s+state)?/i);
  if (reachMatch) {
    const targetState = reachMatch[1];
    if (player.state.toLowerCase() === targetState.toLowerCase()) {
      return { won: true, reason: `${playerId} reached ${player.state} state` };
    }
  }

  // Pattern: "empty hand" - card games where emptying hand wins
  if (condition.includes('empty hand') || condition.includes('emptied their hand')) {
    if (player.hand.length === 0) {
      return { won: true, reason: `${playerId} emptied their hand` };
    }
  }

  // Pattern: "score >= N" or "score > N"
  const scoreMatch = condition.match(/score\s*(>=|>|==|=)\s*(\d+)/);
  if (scoreMatch && player.score !== undefined) {
    const operator = scoreMatch[1];
    const threshold = parseInt(scoreMatch[2], 10);
    let met = false;

    switch (operator) {
      case '>=': met = player.score >= threshold; break;
      case '>': met = player.score > threshold; break;
      case '==': case '=': met = player.score === threshold; break;
    }

    if (met) {
      return { won: true, reason: `${playerId} reached score ${player.score}` };
    }
  }

  // Pattern: "eliminate opponents" / "last player standing"
  if (condition.includes('eliminate') || condition.includes('last player')) {
    const activePlayers = state.turnOrder.filter(pid => {
      const p = state.players[pid];
      // Consider a player eliminated if they have a "eliminated" effect or are in "eliminated" state
      return !p.effects.some(e => e.type === 'eliminated') && p.state !== 'eliminated';
    });
    if (activePlayers.length === 1 && activePlayers[0] === playerId) {
      return { won: true, reason: `${playerId} is the last player standing` };
    }
  }

  return { won: false };
}

/**
 * Check all players for win condition after an action.
 * Returns winner info if someone won, null otherwise.
 */
export function checkAllWinConditions(state: GameState): { winner: string; reason: string } | null {
  for (const playerId of state.turnOrder) {
    const result = checkWinCondition(state, playerId);
    if (result.won) {
      return { winner: playerId, reason: result.reason! };
    }
  }
  return null;
}

export function drawCards(state: GameState, playerId: string, count: number): Card[] {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      // Reshuffle discard pile
      if (state.discardPile.length === 0) {
        break; // No cards left anywhere
      }
      state.deck = shuffleDeck(state.discardPile);
      state.discardPile = [];
    }

    const card = state.deck.shift();
    if (card) {
      drawn.push(card);
      player.hand.push(card);
    }
  }

  saveState(state);
  return drawn;
}

export function discardCard(state: GameState, playerId: string, cardIndex: number): Card | null {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    return null;
  }

  const [card] = player.hand.splice(cardIndex, 1);
  state.discardPile.push(card);

  // Update top card tracking
  state.shared.topCard = card;
  if (card.effect?.color) {
    state.shared.currentColor = card.effect.color;
  }

  saveState(state);

  return card;
}

export function playCardByName(state: GameState, playerId: string, cardName: string, declaredColor?: string): Card | null {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  // Find card in hand by name
  const cardIndex = player.hand.findIndex(c => c.name === cardName);
  if (cardIndex === -1) {
    return null;
  }

  const [card] = player.hand.splice(cardIndex, 1);
  state.discardPile.push(card);

  // Update top card tracking
  state.shared.topCard = card;

  // Handle wild cards - use declared color
  if (card.type === 'wild' && declaredColor) {
    state.shared.currentColor = declaredColor;
  } else if (card.effect?.color) {
    state.shared.currentColor = card.effect.color;
  }

  saveState(state);

  return card;
}

// ============ State Cards (Placed Card Effects) ============

/**
 * Get all cards placed on a specific state.
 */
export function getPlacedCardsOnState(state: GameState, targetState: string): PlacedCard[] {
  const placedCards = (state.shared.placedCards || []) as PlacedCard[];
  return placedCards.filter(pc => pc.state === targetState);
}

/**
 * Apply effects from placed cards when a player enters a state.
 * Returns the net probability modifier and any effects applied.
 */
export function applyPlacedCardEffects(
  state: GameState,
  playerId: string,
  targetState: string
): { probabilityModifier: number; effectsApplied: string[] } {
  const placedCards = getPlacedCardsOnState(state, targetState);
  let probabilityModifier = 0;
  const effectsApplied: string[] = [];

  for (const pc of placedCards) {
    // Determine if this card affects this player
    let affectsPlayer = false;
    switch (pc.targetMode) {
      case 'owner':
        affectsPlayer = pc.placedBy === playerId;
        break;
      case 'opponents':
        affectsPlayer = pc.placedBy !== playerId;
        break;
      case 'all':
        affectsPlayer = true;
        break;
    }

    if (!affectsPlayer) continue;

    // Apply effect based on type
    switch (pc.effect.type) {
      case 'probability_boost':
        probabilityModifier += pc.effect.value ?? 0;
        effectsApplied.push(`${pc.cardName}: +${((pc.effect.value ?? 0) * 100).toFixed(0)}% probability (placed by ${pc.placedBy})`);
        break;

      case 'probability_penalty':
        probabilityModifier += pc.effect.value ?? 0;  // value should be negative
        effectsApplied.push(`${pc.cardName}: ${((pc.effect.value ?? 0) * 100).toFixed(0)}% probability (placed by ${pc.placedBy})`);
        break;

      case 'force_discard':
        // Force player to discard cards
        const discardCount = Math.abs(pc.effect.value ?? 1);
        const player = state.players[playerId];
        for (let i = 0; i < discardCount && player.hand.length > 0; i++) {
          const discardedCard = player.hand.pop();
          if (discardedCard) {
            state.discardPile.push(discardedCard);
            effectsApplied.push(`${pc.cardName}: Forced discard of ${discardedCard.name} (placed by ${pc.placedBy})`);
          }
        }
        break;

      default:
        // Add effect to player's effect list for other effect types
        const player2 = state.players[playerId];
        player2.effects.push({
          type: pc.effect.type,
          value: pc.effect.value,
          duration: pc.effect.duration ?? 1,
          source: pc.placedBy
        });
        effectsApplied.push(`${pc.cardName}: Applied ${pc.effect.type} effect (placed by ${pc.placedBy})`);
        break;
    }

    // Decrement triggers remaining if applicable
    if (pc.triggersRemaining !== undefined) {
      pc.triggersRemaining--;
    }
  }

  // Remove placed cards with no triggers remaining
  const allPlacedCards = (state.shared.placedCards || []) as PlacedCard[];
  state.shared.placedCards = allPlacedCards.filter(
    pc => pc.triggersRemaining === undefined || pc.triggersRemaining > 0
  );

  return { probabilityModifier, effectsApplied };
}

/**
 * Place a card on a board state.
 */
export function placeCard(
  state: GameState,
  playerId: string,
  cardName: string,
  targetState: string
): PlacedCard | null {
  const player = state.players[playerId];
  if (!player) return null;

  // Find and remove card from hand
  const cardIndex = player.hand.findIndex(c => c.name === cardName);
  if (cardIndex === -1) return null;

  const [card] = player.hand.splice(cardIndex, 1);

  // Verify card is placeable
  if (!card.placeable) return null;

  // Create placed card entry
  const placedCard: PlacedCard = {
    cardName: card.name,
    placedBy: playerId,
    state: targetState,
    effect: card.effect,
    targetMode: card.targetMode ?? 'opponents',
    triggersRemaining: card.effect.duration  // Use duration as trigger count, undefined = unlimited
  };

  // Add to placed cards list
  const placedCards = (state.shared.placedCards || []) as PlacedCard[];
  placedCards.push(placedCard);
  state.shared.placedCards = placedCards;

  saveState(state);
  return placedCard;
}

// ============ Dynamic Action Discovery ============

/**
 * Get all available actions for a player based on game rules and current state.
 * This function procedurally exposes what actions are possible, enabling
 * game-agnostic action discovery.
 */
export function getAvailableActions(state: GameState, playerId: string): AvailableActionsResult {
  const player = state.players[playerId];
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const isYourTurn = state.currentPlayer === playerId;
  const hasBoard = !!state.config.board;
  const hasDeck = state.deck.length > 0 || state.discardPile.length > 0;
  const handCards = player.hand.map(c => c.name);
  const placeableCards = player.hand.filter(c => c.placeable).map(c => c.name);
  const playableCards = player.hand.filter(c => !c.placeable).map(c => c.name);
  const boardStates = state.config.board?.states || [];
  const placedCards = (state.shared.placedCards || []) as PlacedCard[];

  // Check for blocking effects
  const isBlocked = player.effects.some(e => {
    const effectType = e.type.toLowerCase();
    return effectType === 'block_turn' || effectType === 'block' || effectType === 'skip';
  });

  // Get valid move targets from current state
  const getValidMoveTargets = (): string[] => {
    if (!state.config.board) return [];
    const currentState = player.state;
    const targets: string[] = [];

    for (const edge of state.config.board.edges) {
      const fromStates = Array.isArray(edge.from) ? edge.from : [edge.from];
      const toStates = Array.isArray(edge.to) ? edge.to : [edge.to];

      if (fromStates.includes(currentState)) {
        targets.push(...toStates);
      }
    }

    return [...new Set(targets)]; // Remove duplicates
  };

  const moveTargets = getValidMoveTargets();
  const opponents = state.turnOrder.filter(pid => pid !== playerId);

  const actions: AvailableAction[] = [];

  // === MOVE action (for board games) ===
  if (hasBoard) {
    const moveEnabled = isYourTurn && !isBlocked && moveTargets.length > 0;
    actions.push({
      type: 'move',
      description: 'Move to an adjacent state on the board',
      enabled: moveEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              moveTargets.length === 0 ? 'No valid move targets from current state' :
              undefined,
      required: { target: 'The state to move to' },
      optional: { reasoning: 'Explanation of your move choice' },
      examples: moveTargets.slice(0, 2).map(target => ({
        type: 'move' as const,
        target
      })),
      targets: moveTargets
    });
  }

  // === PLAY_CARD action (for regular cards) ===
  if (playableCards.length > 0) {
    const playEnabled = isYourTurn && !isBlocked;
    const interferenceCards = player.hand.filter(c =>
      c.type === 'interference' ||
      ['block_turn', 'probability_penalty', 'force_discard', 'skip'].includes(c.effect?.type || '')
    ).map(c => c.name);

    actions.push({
      type: 'play_card',
      description: 'Play a card from your hand to apply its effect',
      enabled: playEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              undefined,
      required: { card: 'The exact name of the card to play' },
      optional: Object.fromEntries(
        Object.entries({
          target: interferenceCards.length > 0 && opponents.length > 1 ?
                  `Target player for interference cards (${interferenceCards.join(', ')}). Options: ${opponents.join(', ')}` :
                  undefined,
          declaredColor: 'For wild cards: Red, Blue, Green, or Yellow',
          reasoning: 'Explanation of your play'
        }).filter(([_, v]) => v !== undefined)
      ) as Record<string, string>,
      examples: playableCards.slice(0, 2).map(card => {
        const c = player.hand.find(h => h.name === card)!;
        const isInterference = interferenceCards.includes(card);
        const example: PlayCardAction = { type: 'play_card', card };
        if (isInterference && opponents.length > 0) {
          example.target = opponents[0];
        }
        return example;
      }),
      cards: playableCards
    });
  }

  // === PLACE_CARD action (for state/placeable cards) ===
  if (hasBoard && placeableCards.length > 0) {
    const placeEnabled = isYourTurn && !isBlocked;
    actions.push({
      type: 'place_card',
      description: 'Place a state card on a board location to create a trap or buff',
      enabled: placeEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              undefined,
      required: {
        card: 'The name of the placeable card (Hazard, Safe Haven, Toll Gate, etc.)',
        targetState: 'The board state to place the card on'
      },
      optional: { reasoning: 'Explanation of your placement strategy' },
      examples: placeableCards.slice(0, 2).flatMap(card => {
        const c = player.hand.find(h => h.name === card)!;
        // Suggest strategic placements
        return boardStates.slice(0, 2).map(targetState => ({
          type: 'place_card' as const,
          card,
          targetState
        }));
      }).slice(0, 3),
      cards: placeableCards,
      targets: boardStates
    });
  }

  // === DRAW action (for card games) ===
  if (hasDeck) {
    const drawEnabled = isYourTurn && !isBlocked;
    actions.push({
      type: 'draw',
      description: 'Draw a card from the deck',
      enabled: drawEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              undefined,
      required: {},
      optional: { count: 'Number of cards to draw (default: 1)' },
      examples: [{ type: 'draw' }]
    });
  }

  // === PASS action (always available on your turn) ===
  actions.push({
    type: 'pass',
    description: 'Skip your turn without taking an action',
    enabled: isYourTurn,  // Pass is always allowed, even when blocked
    reason: !isYourTurn ? 'Not your turn' : undefined,
    required: {},
    optional: { reasoning: 'Why you are passing' },
    examples: [{ type: 'pass' }]
  });

  // === RESIGN action (always available) ===
  actions.push({
    type: 'resign',
    description: 'Forfeit the game (requires gamemaster approval)',
    enabled: isYourTurn,
    reason: !isYourTurn ? 'Not your turn' : undefined,
    required: { reason: 'Explanation for why you are resigning' },
    examples: [{ type: 'resign', reason: 'I cannot win from this position' }]
  });

  return {
    playerId,
    isYourTurn,
    currentState: player.state,
    hand: handCards,
    actions,
    placedCards,
    activeEffects: player.effects
  };
}

// ============ Contest-Based Adjudication Functions ============

// Initialize contest state in game state if not present
export function ensureContestState(state: GameState): ContestState {
  if (!state.shared.contestState) {
    state.shared.contestState = {
      contestHistory: [],
      resignations: [],
      victoryHistory: []
    };
  }
  // Ensure victoryHistory exists for older game states
  const cs = state.shared.contestState as ContestState;
  if (!cs.victoryHistory) {
    cs.victoryHistory = [];
  }
  return cs;
}

// Validate action schema/type
export function validateActionSchema(action: unknown): ActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!action || typeof action !== 'object') {
    return { valid: false, errors: ['Action must be a JSON object'] };
  }

  const act = action as Record<string, unknown>;

  if (!act.type || typeof act.type !== 'string') {
    return { valid: false, errors: ['Action must have a "type" field (string): "play_card", "draw", "pass", "move", or "resign"'] };
  }

  const validTypes = ['play_card', 'draw', 'pass', 'move', 'place_card', 'resign'];
  if (!validTypes.includes(act.type)) {
    return { valid: false, errors: [`Invalid action type "${act.type}". Valid types: ${validTypes.join(', ')}`] };
  }

  // Type-specific validation
  switch (act.type) {
    case 'play_card':
      if (!act.card || typeof act.card !== 'string') {
        errors.push('play_card action requires "card" field (string) - the exact name of the card to play');
      }
      if (act.declaredColor !== undefined && typeof act.declaredColor !== 'string') {
        errors.push('declaredColor must be a string (e.g., "Red", "Blue", "Green", "Yellow")');
      }
      break;

    case 'draw':
      if (act.count !== undefined && (typeof act.count !== 'number' || act.count < 1)) {
        errors.push('draw count must be a positive number (default: 1)');
      }
      break;

    case 'pass':
      // No additional fields required
      break;

    case 'move':
      if (!act.target || typeof act.target !== 'string') {
        errors.push('move action requires "target" field (string) - the state/position to move to');
      }
      break;

    case 'place_card':
      if (!act.card || typeof act.card !== 'string') {
        errors.push('place_card action requires "card" field (string) - the exact name of the card to place');
      }
      if (!act.targetState || typeof act.targetState !== 'string') {
        errors.push('place_card action requires "targetState" field (string) - the board state to place the card on');
      }
      break;

    case 'resign':
      if (!act.reason || typeof act.reason !== 'string' || act.reason.trim().length === 0) {
        errors.push('resign action requires "reason" field (non-empty string) - explanation for resignation');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// Validate action against game rules (basic engine-level validation)
export function validateAction(state: GameState, playerId: string, action: GameAction): ActionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const player = state.players[playerId];
  if (!player) {
    return { valid: false, errors: [`Player ${playerId} not found`] };
  }

  // Check if it's the player's turn
  if (state.currentPlayer !== playerId) {
    return { valid: false, errors: [`Not your turn. Current player: ${state.currentPlayer}`] };
  }

  // Check game status
  if (state.status !== 'in_progress') {
    return { valid: false, errors: [`Game is not in progress. Status: ${state.status}`] };
  }

  // Check for pending contest/resignation (with auto-adjudication timeout)
  const contestState = ensureContestState(state);
  if (contestState.pendingContest) {
    // Check if contest has timed out and should be auto-adjudicated
    const wasAutoAdjudicated = checkAndAutoAdjudicateContest(state);
    if (!wasAutoAdjudicated) {
      // Still pending - block the action
      const elapsed = Date.now() - new Date(contestState.pendingContest.timestamp).getTime();
      const remainingMs = AUTO_ADJUDICATION_TIMEOUT_MS - elapsed;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      return {
        valid: false,
        errors: [`Cannot act while a contest is pending. Wait for adjudication (auto-adjudication in ${remainingSec}s).`]
      };
    }
    // Auto-adjudicated - continue with validation
  }
  if (contestState.pendingResignation) {
    // Check if resignation has timed out and should be auto-adjudicated
    const wasAutoAdjudicated = checkAndAutoAdjudicateResignation(state);
    if (!wasAutoAdjudicated) {
      return { valid: false, errors: ['Cannot act while a resignation is pending adjudication.'] };
    }
  }

  // ============ NEW: Check for blocking effects ============
  // Effects like 'block_turn', 'skip', 'Block' prevent the player from taking actions
  const blockingEffects = player.effects.filter(e => {
    const effectType = e.type.toLowerCase();
    return effectType === 'block_turn' || effectType === 'block' || effectType === 'skip';
  });

  if (blockingEffects.length > 0 && action.type !== 'pass') {
    // Player is blocked - they can only pass (or draw in some games)
    const effectNames = blockingEffects.map(e => e.type).join(', ');
    return {
      valid: false,
      errors: [`You are blocked this turn by effect: ${effectNames}. You can only pass.`]
    };
  }

  // ============ NEW: Check for multiple actions per turn ============
  // Prevent players from submitting multiple actions in the same turn
  if (player.lastActionTurn === state.turn && action.type !== 'pass') {
    return {
      valid: false,
      errors: ['You have already acted this turn. Wait for your next turn.']
    };
  }

  // Action-specific validation
  switch (action.type) {
    case 'play_card': {
      const playAction = action as PlayCardAction;
      const cardIndex = player.hand.findIndex(c => c.name === playAction.card);
      if (cardIndex === -1) {
        errors.push(`Card "${playAction.card}" not in your hand. Your cards: ${player.hand.map(c => c.name).join(', ')}`);
        break;
      }

      const card = player.hand[cardIndex];
      const topCard = state.shared.topCard as Card | undefined;
      const currentColor = state.shared.currentColor as string | undefined;

      // Basic UNO matching validation (color or number match, or wild)
      // ONLY apply to games that use color-based card matching (e.g., UNO)
      // Skip for board games or games without color mechanics
      const hasColorMechanics = currentColor !== null && currentColor !== undefined;
      const isColorBasedCardGame = hasColorMechanics && topCard && topCard.effect?.color;

      if (isColorBasedCardGame && card.type !== 'wild') {
        const colorMatch = card.effect?.color === currentColor;
        const numberMatch = card.effect?.value !== undefined &&
                          topCard.effect?.value !== undefined &&
                          card.effect.value === topCard.effect.value;
        const typeMatch = card.type === topCard.type && card.type === 'action' &&
                         card.effect?.type === topCard.effect?.type;

        if (!colorMatch && !numberMatch && !typeMatch) {
          errors.push(`Card "${playAction.card}" doesn't match current color (${currentColor}) or top card (${topCard.name}). Play a matching card or draw.`);
        }
      }

      // Wild card color declaration
      if (card.type === 'wild' && !playAction.declaredColor) {
        errors.push('Wild cards require "declaredColor" field. Specify: "Red", "Blue", "Green", or "Yellow"');
      }

      if (playAction.declaredColor) {
        const validColors = ['Red', 'Blue', 'Green', 'Yellow'];
        if (!validColors.includes(playAction.declaredColor)) {
          errors.push(`Invalid color "${playAction.declaredColor}". Valid colors: ${validColors.join(', ')}`);
        }
      }

      // ============ NEW: Interference card target validation ============
      // Cards that affect other players require a target specification
      const interferenceEffects = ['block_turn', 'probability_penalty', 'force_discard', 'skip'];
      const isInterferenceCard = card.type === 'interference' ||
                                 (card.effect?.type && interferenceEffects.includes(card.effect.type));

      if (isInterferenceCard) {
        const opponents = state.turnOrder.filter(pid => pid !== playerId);

        if (opponents.length > 1 && !playAction.target) {
          // Multiple opponents - require explicit target
          errors.push(`Interference card "${card.name}" requires a "target" field. Valid targets: ${opponents.join(', ')}`);
        } else if (playAction.target) {
          // Validate target is a valid opponent
          if (!opponents.includes(playAction.target)) {
            errors.push(`Invalid target "${playAction.target}". Valid targets: ${opponents.join(', ')}`);
          }
        }
        // If only 1 opponent, target is implicit (no need to specify)
      }
      break;
    }

    case 'draw': {
      // Basic validation - draws are generally allowed
      if (state.deck.length === 0 && state.discardPile.length <= 1) {
        warnings.push('Draw pile is empty and cannot be reshuffled');
      }
      break;
    }

    case 'pass': {
      // Pass might be invalid if the player has playable cards
      // But we leave complex rule interpretation to contests
      warnings.push('Pass action will be recorded. Other players may contest if rules require you to play.');
      break;
    }

    case 'resign': {
      // Resignations are always schema-valid, but require gamemaster approval
      break;
    }

    case 'move': {
      // For board games - check if target is valid
      if (state.config.board) {
        const validStates = state.config.board.states || [];
        const moveAction = action as { target: string };
        if (!validStates.includes(moveAction.target)) {
          errors.push(`Invalid move target "${moveAction.target}". Valid states: ${validStates.join(', ')}`);
        }
      }
      break;
    }

    case 'place_card': {
      const placeAction = action as PlaceCardAction;
      const cardIndex = player.hand.findIndex(c => c.name === placeAction.card);

      if (cardIndex === -1) {
        errors.push(`Card "${placeAction.card}" not in your hand. Your cards: ${player.hand.map(c => c.name).join(', ')}`);
        break;
      }

      const card = player.hand[cardIndex];

      // Check if card is placeable
      if (!card.placeable) {
        errors.push(`Card "${placeAction.card}" cannot be placed on states. Only cards marked as placeable can be used with place_card action.`);
        break;
      }

      // Check if target state is valid
      if (state.config.board) {
        const validStates = state.config.board.states || [];
        if (!validStates.includes(placeAction.targetState)) {
          errors.push(`Invalid target state "${placeAction.targetState}". Valid states: ${validStates.join(', ')}`);
        }
      } else {
        errors.push('place_card action requires a game with board states defined.');
      }
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// Execute an action directly (the core of the contest system)
export function executeAction(state: GameState, playerId: string, action: GameAction): {
  success: boolean;
  effect?: { type: string; details?: Record<string, unknown> };
  error?: string;
  gameOver?: boolean;
  winner?: string;
} {
  const player = state.players[playerId];
  const contestState = ensureContestState(state);

  // Mark that player has acted this turn (prevents multiple actions)
  player.lastActionTurn = state.turn;

  try {
    switch (action.type) {
      case 'play_card': {
        const playAction = action as PlayCardAction;
        const card = playCardByName(state, playerId, playAction.card, playAction.declaredColor);
        if (!card) {
          return { success: false, error: `Failed to play card "${playAction.card}"` };
        }

        // ============ NEW: Apply card effects to target player ============
        // For interference cards, apply the effect to the target player
        const interferenceEffects = ['block_turn', 'probability_penalty', 'force_discard', 'skip'];
        const isInterferenceCard = card.type === 'interference' ||
                                   (card.effect?.type && interferenceEffects.includes(card.effect.type));

        let effectTarget: string | undefined;
        if (isInterferenceCard && card.effect) {
          const opponents = state.turnOrder.filter(pid => pid !== playerId);
          // Use explicit target or default to single opponent
          effectTarget = playAction.target || (opponents.length === 1 ? opponents[0] : undefined);

          if (effectTarget && state.players[effectTarget]) {
            const targetPlayer = state.players[effectTarget];
            const effectDuration = card.effect.duration ?? 1;

            // Add effect to target player
            targetPlayer.effects.push({
              type: card.effect.type,
              value: card.effect.value,
              duration: effectDuration,
              source: playerId
            });

            // Log effect application
            logEvent(state, {
              event: 'effect_applied',
              turn: state.turn,
              player: effectTarget,
              data: {
                effectType: card.effect.type,
                appliedBy: playerId,
                card: card.name,
                duration: effectDuration
              }
            });
          }
        }

        // Record last action
        contestState.lastAction = {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          turn: state.turn,
          result: {
            success: true,
            details: {
              card: card.name,
              effect: card.effect,
              declaredColor: playAction.declaredColor,
              effectTarget,
              newTopCard: state.shared.topCard,
              currentColor: state.shared.currentColor
            }
          }
        };

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: {
            type: 'play_card',
            card: card.name,
            effect: card.effect,
            effectTarget,
            declaredColor: playAction.declaredColor
          }
        });

        // Check win condition BEFORE advancing turn
        const winCheck = checkAllWinConditions(state);
        if (winCheck) {
          // Auto-end the game
          state.status = 'completed';
          state.shared.winner = winCheck.winner;
          state.shared.endReason = winCheck.reason;
          saveState(state);
          logEvent(state, {
            event: 'game_end',
            turn: state.turn,
            data: { winner: winCheck.winner, reason: winCheck.reason, autoDetected: true }
          });
          return {
            success: true,
            gameOver: true,
            winner: winCheck.winner,
            effect: {
              type: card.effect?.type || 'none',
              details: {
                card: card.name,
                handSize: player.hand.length,
                currentColor: state.shared.currentColor,
                gameEnded: true,
                winner: winCheck.winner
              }
            }
          };
        }

        // Advance turn (action cards effects handled by engine)
        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: card.effect?.type || 'none',
            details: {
              card: card.name,
              handSize: player.hand.length,
              currentColor: state.shared.currentColor
            }
          }
        };
      }

      case 'draw': {
        const drawAction = action as DrawAction;
        const count = drawAction.count || 1;
        const cards = drawCards(state, playerId, count);

        contestState.lastAction = {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          turn: state.turn,
          result: {
            success: true,
            details: { drawnCount: cards.length }
          }
        };

        // After drawing, advance turn
        advanceTurn(state);

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: { type: 'draw', count: cards.length }
        });

        return {
          success: true,
          effect: {
            type: 'draw',
            details: { drawn: cards.length, handSize: player.hand.length }
          }
        };
      }

      case 'pass': {
        contestState.lastAction = {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          turn: state.turn,
          result: { success: true }
        };

        advanceTurn(state);

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: { type: 'pass' }
        });

        return {
          success: true,
          effect: { type: 'pass' }
        };
      }

      case 'resign': {
        const resignAction = action as ResignAction;
        // Queue resignation for gamemaster adjudication
        contestState.pendingResignation = {
          player: playerId,
          reason: resignAction.reason,
          timestamp: new Date().toISOString()
        };
        saveState(state);

        logEvent(state, {
          event: 'resignation_submitted',
          turn: state.turn,
          player: playerId,
          data: { reason: resignAction.reason }
        });

        return {
          success: true,
          effect: {
            type: 'resignation_pending',
            details: { reason: resignAction.reason }
          }
        };
      }

      case 'move': {
        // Board game movement
        const moveAction = action as { target: string; useCard?: string };

        // Apply effects from placed cards at the destination state
        const placedCardEffects = applyPlacedCardEffects(state, playerId, moveAction.target);

        // Log placed card effects if any were applied
        if (placedCardEffects.effectsApplied.length > 0) {
          logEvent(state, {
            event: 'placed_card_triggered',
            turn: state.turn,
            player: playerId,
            data: {
              targetState: moveAction.target,
              effects: placedCardEffects.effectsApplied,
              probabilityModifier: placedCardEffects.probabilityModifier
            }
          });
        }

        player.state = moveAction.target;

        contestState.lastAction = {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          turn: state.turn,
          result: {
            success: true,
            details: {
              newState: moveAction.target,
              placedCardEffects: placedCardEffects.effectsApplied
            }
          }
        };

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: {
            type: 'move',
            target: moveAction.target,
            placedCardEffects: placedCardEffects.effectsApplied
          }
        });

        // Check win condition BEFORE advancing turn (critical for board games!)
        const winCheck = checkAllWinConditions(state);
        if (winCheck) {
          // Auto-end the game
          state.status = 'completed';
          state.shared.winner = winCheck.winner;
          state.shared.endReason = winCheck.reason;
          saveState(state);
          logEvent(state, {
            event: 'game_end',
            turn: state.turn,
            data: { winner: winCheck.winner, reason: winCheck.reason, autoDetected: true }
          });
          return {
            success: true,
            gameOver: true,
            winner: winCheck.winner,
            effect: {
              type: 'move',
              details: {
                newState: player.state,
                gameEnded: true,
                winner: winCheck.winner,
                placedCardEffects: placedCardEffects.effectsApplied
              }
            }
          };
        }

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'move',
            details: {
              newState: player.state,
              placedCardEffects: placedCardEffects.effectsApplied
            }
          }
        };
      }

      case 'place_card': {
        const placeAction = action as PlaceCardAction;
        const placedCard = placeCard(state, playerId, placeAction.card, placeAction.targetState);

        if (!placedCard) {
          return { success: false, error: `Failed to place card "${placeAction.card}"` };
        }

        contestState.lastAction = {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          turn: state.turn,
          result: {
            success: true,
            details: {
              card: placedCard.cardName,
              targetState: placedCard.state,
              targetMode: placedCard.targetMode,
              effect: placedCard.effect
            }
          }
        };

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: {
            type: 'place_card',
            card: placedCard.cardName,
            targetState: placedCard.state,
            targetMode: placedCard.targetMode,
            effect: placedCard.effect
          }
        });

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'place_card',
            details: {
              card: placedCard.cardName,
              targetState: placedCard.state,
              targetMode: placedCard.targetMode,
              handSize: player.hand.length
            }
          }
        };
      }

      default:
        return { success: false, error: `Unknown action type: ${(action as GameAction).type}` };
    }
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

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
    turn: state.turn,
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
    turn: originalAction.turn,
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
    turn: state.turn,
    data: {
      ruling,
      rulingReason,
      reversed,
      contestedPlayer: originalAction.player,
      contestedBy: contest.contestedBy
    }
  });

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

    state.status = 'completed';
    state.shared.winner = winner;
    state.shared.endReason = `${resignation.player} resigned: ${resignation.reason}`;

    logEvent(state, {
      event: 'game_end',
      turn: state.turn,
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
    turn: state.turn,
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
    state.status = 'completed';
    state.shared.winner = claim.player;
    state.shared.endReason = `Victory claim accepted: ${rulingReason}`;

    logEvent(state, {
      event: 'game_end',
      turn: state.turn,
      data: {
        winner: claim.player,
        reason: rulingReason,
        claimedState: claim.toState
      }
    });
  } else {
    // Rejected - ROLL BACK the move, then advance turn
    const player = state.players[claim.player];
    player.state = claim.fromState; // Roll back to previous state

    logEvent(state, {
      event: 'victory_rejected',
      turn: state.turn,
      player: claim.player,
      data: {
        reason: rulingReason,
        rolledBackFrom: claim.toState,
        rolledBackTo: claim.fromState
      }
    });

    advanceTurn(state);
  }

  // Clear pending victory claim
  delete contestState.pendingVictoryClaim;
  saveState(state);

  logEvent(state, {
    event: 'victory_adjudicated',
    turn: state.turn,
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
  const action = lastAction.action;
  const playerId = lastAction.player;
  const player = state.players[playerId];

  if (!player) return false;

  try {
    switch (action.type) {
      case 'play_card': {
        // Move card back from discard to hand
        const playAction = action as PlayCardAction;
        const discardIndex = state.discardPile.findIndex(c => c.name === playAction.card);
        if (discardIndex !== -1) {
          const [card] = state.discardPile.splice(discardIndex, 1);
          player.hand.push(card);

          // Restore previous top card
          if (state.discardPile.length > 0) {
            state.shared.topCard = state.discardPile[state.discardPile.length - 1];
            state.shared.currentColor = (state.shared.topCard as Card).effect?.color;
          }
        }

        // Reverse turn advancement
        reverseTurn(state);
        saveState(state);
        return true;
      }

      case 'draw': {
        // Can't really reverse a draw without knowing which cards were drawn
        // For now, just reverse the turn
        reverseTurn(state);
        saveState(state);
        return true;
      }

      case 'pass':
      case 'move': {
        // Reverse turn advancement
        reverseTurn(state);
        saveState(state);
        return true;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

// Reverse turn advancement
function reverseTurn(state: GameState): void {
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
  const prevIndex = (currentIndex - 1 + state.turnOrder.length) % state.turnOrder.length;

  // If we're at the start of a new round, decrement turn counter
  if (currentIndex === 0) {
    state.turn = Math.max(1, state.turn - 1);
  }

  state.currentPlayer = state.turnOrder[prevIndex];
}

// Get contest state for a game
export function getContestState(gameName: string): ContestState {
  const state = loadState(gameName);
  return ensureContestState(state);
}
