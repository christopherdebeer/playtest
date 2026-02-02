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
  AvailableActionsResult,
  BidAction,
  SpendAction,
  CollectSetAction,
  SetDefinition,
  RollAction,
  BankAction,
  DraftAction,
  PlayerPower,
  GameAnalysis,
  KeyMoment
} from '../types/game.js';
import { parseRules, buildDeck, shuffleDeck, getPlayerCount } from './rules.js';

// Mechanics hook system (incremental extraction)
import { mechanicRegistry, applyStateChanges } from '../mechanics/index.js';

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
  const player = state.players[originalAction.player];

  // Create pending victory claim for GM verification
  contestState.pendingVictoryClaim = {
    player: originalAction.player,
    reason: action.victoryReason || 'Victory declared with action',
    fromState: player?.state || 'unknown',
    toState: player?.state || 'unknown',
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

    // Initialize resources if configured
    let resources: Record<string, number> | undefined;
    if (config.engine_mechanics?.resources) {
      resources = {};
      for (const res of config.engine_mechanics.resources) {
        resources[res.name] = res.starting_amount;
      }
    }

    // ============ Mechanic Hooks: Player initialization ============
    // Get initial player state from all enabled mechanics
    const mechanicState = mechanicRegistry.initPlayerState(config, playerId);
    const actionPoints = mechanicState.actionPoints as number | undefined;
    const actionPointsUsed = mechanicState.actionPointsUsed as number | undefined;

    // Assign player power if variable powers enabled
    let powerId: string | undefined;
    if (config.engine_mechanics?.variable_powers) {
      const powers = config.engine_mechanics.variable_powers.powers;
      if (config.engine_mechanics.variable_powers.assignment === 'random') {
        // Random assignment - each player gets a different power
        const availablePowers = powers.filter(p =>
          !Object.values(players).some(pl => pl.powerId === p.id)
        );
        if (availablePowers.length > 0) {
          powerId = availablePowers[Math.floor(Math.random() * availablePowers.length)].id;
        }
      } else if (config.engine_mechanics.variable_powers.assignment === 'fixed') {
        // Fixed assignment by player index
        const playerIndex = parseInt(playerId.replace('player-', '')) - 1;
        if (playerIndex < powers.length) {
          powerId = powers[playerIndex].id;
        }
      }
    }

    players[playerId] = {
      state: config.board?.start ?? 'start',
      hand: [],
      effects: [],
      persona,
      resources,
      actionPoints,
      actionPointsUsed,
      collectedSets: [],
      rollAccumulator: 0,
      rollCount: 0,
      powerId
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

  // Initialize draft display if open drafting enabled
  if (config.engine_mechanics?.open_drafting && deck.length > 0) {
    const displaySize = config.engine_mechanics.open_drafting.display_size;
    const draftDisplay = deck.splice(0, Math.min(displaySize, deck.length));
    shared.draftDisplay = draftDisplay;
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
  state.round = 1;
  state.turnNumber = 1;
  state.currentPlayer = state.turnOrder[0];
  debug(`[STARTGAME DEBUG] First player: ${state.currentPlayer}`);

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
    round: state.round,
    turnNumber: state.turnNumber,
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
  const isNewRound = nextIndex === 0;

  // Always increment turnNumber (absolute action counter)
  state.turnNumber++;

  // If we wrapped around, increment round number
  if (isNewRound) {
    state.round++;

    // Check max_rounds limit
    if (state.config.max_rounds && state.round > state.config.max_rounds) {
      // Proposal 010: Use configurable timeout winner
      const result = determineTimeoutWinner(state);

      state.status = 'pending_analysis';
      state.shared.winner = result.winner;
      state.shared.endReason = result.reason;

      logEvent(state, {
        event: 'game_end',
        round: state.round,
        turnNumber: state.turnNumber,
        data: {
          winner: result.winner,
          reason: result.reason,
          endType: 'timeout',
          revealedRole: result.revealRole
        }
      });

      saveState(state);
      return;
    }
  }

  state.currentPlayer = state.turnOrder[nextIndex];
  const nextPlayer = state.players[state.currentPlayer];

  // Decrement effect durations ONLY for the player whose turn just ended
  // This ensures effects like "Block for 1 turn" last until the blocked player's turn
  // Effects on OTHER players are decremented when THEIR turn ends
  const prevPlayer = state.players[previousPlayer];
  if (prevPlayer) {
    prevPlayer.effects = prevPlayer.effects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);
  }

  // ============ Mechanic Hooks: Turn start ============
  // Run onTurnStart hooks for all enabled mechanics (e.g., refresh AP, income)
  const turnStartChanges = mechanicRegistry.onTurnStart(state, state.currentPlayer, isNewRound);
  applyStateChanges(state, turnStartChanges);

  saveState(state);
}

export function endGame(gameName: string, winner: string, reason: string): GameState {
  const state = loadState(gameName);

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

/**
 * Proposal 010: Determine winner when game times out (max_rounds reached).
 * Uses configurable timeout_winner rules, falling back to highest score.
 */
export function determineTimeoutWinner(state: GameState): { winner: string | null; reason: string; revealRole: boolean } {
  const config = state.config.engine_mechanics?.timeout_winner;
  const maxRounds = state.config.max_rounds;

  // Default fallback: highest score
  const defaultWinner = (): { winner: string | null; reason: string; revealRole: boolean } => {
    let highestScore = -Infinity;
    let winner: string | null = 'none';

    for (const [playerId, player] of Object.entries(state.players)) {
      const score = player.score ?? 0;
      if (score > highestScore) {
        highestScore = score;
        winner = playerId;
      }
    }

    return {
      winner,
      reason: `Max rounds (${maxRounds}) reached. ${winner} wins with ${highestScore} points.`,
      revealRole: false
    };
  };

  if (!config) {
    return defaultWinner();
  }

  switch (config.type) {
    case 'role': {
      // Find player with specified role/objective
      const targetRole = config.role;
      const targetRoleName = config.role_name;

      for (const [playerId, player] of Object.entries(state.players)) {
        const objective = player.objective as { name?: string; type?: string } | undefined;

        if (objective) {
          const matchesRole = targetRole && objective.type === targetRole;
          const matchesName = targetRoleName && objective.name === targetRoleName;

          if (matchesRole || matchesName) {
            const roleName = objective.name || targetRole || 'The Enemy';
            return {
              winner: playerId,
              reason: `Time limit reached. ${roleName} wins by default.`,
              revealRole: config.reveal_role ?? true
            };
          }
        }
      }
      // No player with matching role found - fall back to default
      return defaultWinner();
    }

    case 'specific_player': {
      // Simple condition evaluation (could be extended)
      // For now, support "has_objective:Name" format
      const condition = config.player_condition;
      if (condition?.startsWith('has_objective:')) {
        const objName = condition.replace('has_objective:', '');
        for (const [playerId, player] of Object.entries(state.players)) {
          const objective = player.objective as { name?: string } | undefined;
          if (objective?.name === objName) {
            return {
              winner: playerId,
              reason: `Time limit reached. Player with "${objName}" wins by condition.`,
              revealRole: config.reveal_role ?? false
            };
          }
        }
      }
      return defaultWinner();
    }

    case 'no_winner':
      return {
        winner: null,
        reason: config.reason || 'Game ended in a draw.',
        revealRole: false
      };

    case 'highest_score':
    default:
      return defaultWinner();
  }
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
  const gridConfig = state.config.engine_mechanics?.grid as { type?: string; starting_tile?: string; adjacency?: string } | undefined;
  const hasGrid = !!gridConfig;
  const hasDeck = state.deck.length > 0 || state.discardPile.length > 0;
  const handCards = player.hand.map(c => c.name);
  const placeableCards = player.hand.filter(c => c.placeable).map(c => c.name);
  const locationCards = player.hand.filter(c => c.type === 'location').map(c => c.name);
  const playableCards = player.hand.filter(c => !c.placeable && c.type !== 'location').map(c => c.name);
  const boardStates = state.config.board?.states || [];
  const placedCards = (state.shared.placedCards || []) as PlacedCard[];
  const placedLocations = (state.shared.placedLocations as string[]) || [];
  const startingTile = gridConfig?.starting_tile || 'origin';

  // Check for blocking effects
  const isBlocked = player.effects.some(e => {
    const effectType = e.type.toLowerCase();
    return effectType === 'block_turn' || effectType === 'block' || effectType === 'skip';
  });

  // Get valid move targets from current state
  const getValidMoveTargets = (): string[] => {
    // For board games - use edges
    if (state.config.board) {
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
    }

    // For grid games - all placed locations are valid targets
    if (gridConfig) {
      const validLocations = [startingTile, ...placedLocations];
      // Could filter by adjacency here, but for simplicity allow moving to any placed location
      return validLocations.filter(loc => loc !== player.state);
    }

    return [];
  };

  const moveTargets = getValidMoveTargets();
  const opponents = state.turnOrder.filter(pid => pid !== playerId);

  const actions: AvailableAction[] = [];

  // === MOVE action (for board or grid games) ===
  if (hasBoard || hasGrid) {
    const moveEnabled = isYourTurn && !isBlocked && moveTargets.length > 0;
    const description = hasGrid
      ? 'Move to a placed location on the grid'
      : 'Move to an adjacent state on the board';
    actions.push({
      type: 'move',
      description,
      enabled: moveEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              moveTargets.length === 0 ? (hasGrid ? 'No other locations to move to' : 'No valid move targets from current state') :
              undefined,
      required: { target: hasGrid ? 'The location to move to' : 'The state to move to' },
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

  // === PLACE_CARD action (for state/placeable cards on board games) ===
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

  // === PLACE_LOCATION action (for grid games with location cards) ===
  if (hasGrid && locationCards.length > 0) {
    const placeEnabled = isYourTurn && !isBlocked;
    const validAdjacentTargets = [startingTile, ...placedLocations];
    actions.push({
      type: 'place_location',
      description: 'Place a location card on the grid adjacent to an existing location',
      enabled: placeEnabled,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              undefined,
      required: {
        card: 'The name of the location card to place',
        adjacentTo: 'The existing location to place adjacent to'
      },
      optional: { reasoning: 'Explanation of your placement strategy' },
      examples: locationCards.slice(0, 2).map(card => ({
        type: 'place_location' as const,
        card,
        adjacentTo: player.state || startingTile
      })),
      cards: locationCards,
      targets: validAdjacentTargets
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

  // === TRADE_OFFER action (for trading games) ===
  const tradeConfig = state.config.engine_mechanics?.trade as { enabled?: boolean; require_same_location?: boolean; item_types_only?: boolean; allow_gifts?: boolean } | undefined;
  if (tradeConfig?.enabled) {
    const tradeableCards = tradeConfig.item_types_only
      ? player.hand.filter(c => c.type === 'item').map(c => c.name)
      : player.hand.map(c => c.name);
    const tradeEnabled = isYourTurn && !isBlocked && tradeableCards.length > 0;

    // Find valid trade targets based on location constraints
    let validTradeTargets = opponents;
    if (tradeConfig.require_same_location) {
      validTradeTargets = opponents.filter(pid => state.players[pid].state === player.state);
    }

    actions.push({
      type: 'trade_offer',
      description: tradeConfig.require_same_location
        ? 'Offer a trade to a player at your location'
        : 'Offer a trade to another player',
      enabled: tradeEnabled && validTradeTargets.length > 0,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              tradeableCards.length === 0 ? 'No tradeable cards in hand' :
              validTradeTargets.length === 0 ? 'No valid trade targets at your location' :
              undefined,
      required: {
        target: `Player to trade with (${validTradeTargets.join(', ')})`,
        offer: 'Array of card names you are offering',
        request: 'Array of card names you want in return (empty array for gifts)'
      },
      optional: { reasoning: 'Why you want this trade' },
      examples: validTradeTargets.slice(0, 1).flatMap(target => {
        const targetCards = state.players[target].hand
          .filter(c => !tradeConfig.item_types_only || c.type === 'item')
          .map(c => c.name);
        return [{
          type: 'trade_offer' as const,
          target,
          offer: tradeableCards.slice(0, 1),
          request: targetCards.slice(0, 1)
        }];
      }),
      cards: tradeableCards,
      targets: validTradeTargets
    });
  }

  // === TRADE_RESPOND action (for pending trades) ===
  const pendingTrades = (state.shared.pendingTrades as Array<{ id: string; from: string; to: string; offer: string[]; request: string[] }>) || [];
  const myPendingTrades = pendingTrades.filter(t => t.to === playerId);
  if (myPendingTrades.length > 0) {
    for (const trade of myPendingTrades) {
      actions.push({
        type: 'trade_respond',
        description: `Respond to trade offer from ${trade.from}: offering [${trade.offer.join(', ')}] for [${trade.request.join(', ') || 'nothing (gift)'}]`,
        enabled: true,  // Can respond anytime you have a pending trade
        required: {
          offerId: trade.id,
          accept: 'true to accept, false to decline'
        },
        optional: { reasoning: 'Why you are accepting/declining' },
        examples: [
          { type: 'trade_respond' as const, offerId: trade.id, accept: true },
          { type: 'trade_respond' as const, offerId: trade.id, accept: false }
        ]
      });
    }
  }

  // === NEW MECHANICS: BID action (for auction games) ===
  const auctionConfig = state.config.engine_mechanics?.auction;
  if (auctionConfig && player.resources) {
    const currency = auctionConfig.currency;
    const available = player.resources[currency] ?? 0;
    const currentHighBid = (state.shared.currentBid as number) ?? 0;
    const minBid = auctionConfig.type === 'english'
      ? currentHighBid + (auctionConfig.min_increment ?? 1)
      : 1;
    const canBid = isYourTurn && !isBlocked && available >= minBid;

    actions.push({
      type: 'bid',
      description: `Place a bid using ${currency} (${auctionConfig.type} auction)`,
      enabled: canBid,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              available < minBid ? `Not enough ${currency} (need ${minBid}, have ${available})` :
              undefined,
      required: { amount: `Bid amount in ${currency}` },
      optional: { item: 'What you are bidding on' },
      examples: [{ type: 'bid' as const, amount: minBid }]
    });
  }

  // === NEW MECHANICS: SPEND action (for resource management) ===
  if (player.resources) {
    const resourceNames = Object.keys(player.resources);
    const canSpend = isYourTurn && !isBlocked && resourceNames.some(r => (player.resources?.[r] ?? 0) > 0);

    if (resourceNames.length > 0) {
      actions.push({
        type: 'spend',
        description: 'Spend resources for effects or purchases',
        enabled: canSpend,
        reason: !isYourTurn ? 'Not your turn' :
                isBlocked ? 'You are blocked this turn' :
                !canSpend ? 'No resources to spend' :
                undefined,
        required: {
          resource: `Resource type (${resourceNames.join(', ')})`,
          amount: 'Amount to spend'
        },
        optional: { target: 'What to spend on' },
        examples: resourceNames
          .filter(r => (player.resources?.[r] ?? 0) > 0)
          .slice(0, 2)
          .map(r => ({ type: 'spend' as const, resource: r, amount: 1 }))
      });
    }
  }

  // === NEW MECHANICS: COLLECT_SET action (for set collection games) ===
  const setConfig = state.config.engine_mechanics?.set_collection;
  if (setConfig && handCards.length >= Math.min(...setConfig.sets.map(s => s.size))) {
    const canCollect = isYourTurn && !isBlocked;

    actions.push({
      type: 'collect_set',
      description: 'Claim a set of cards for points',
      enabled: canCollect,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              undefined,
      required: {
        cards: 'Array of card names that form the set',
        setType: `Set definition (${setConfig.sets.map(s => s.name).join(', ')})`
      },
      examples: setConfig.sets.slice(0, 1).map(setDef => ({
        type: 'collect_set' as const,
        cards: handCards.slice(0, setDef.size),
        setType: setDef.name
      }))
    });
  }

  // === NEW MECHANICS: ROLL action (for push your luck) ===
  const pylConfig = state.config.engine_mechanics?.push_your_luck;
  if (pylConfig) {
    const accumulated = player.rollAccumulator ?? 0;
    const rollCount = player.rollCount ?? 0;
    const canRoll = isYourTurn && !isBlocked && (!pylConfig.max_rolls || rollCount < pylConfig.max_rolls);
    const canBank = isYourTurn && !isBlocked && accumulated > 0;

    actions.push({
      type: 'roll',
      description: `Roll the dice (bust on ${pylConfig.bust_threshold} or less, gain ${pylConfig.points_per_success} pts on success)`,
      enabled: canRoll,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              !canRoll ? `Max rolls (${pylConfig.max_rolls}) reached` :
              undefined,
      required: {},
      examples: [{ type: 'roll' as const }]
    });

    actions.push({
      type: 'bank',
      description: `Bank your ${accumulated} accumulated points`,
      enabled: canBank,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              accumulated === 0 ? 'No points to bank' :
              undefined,
      required: {},
      examples: [{ type: 'bank' as const }]
    });
  }

  // === NEW MECHANICS: DRAFT action (for open drafting) ===
  const draftConfig = state.config.engine_mechanics?.open_drafting;
  if (draftConfig) {
    const display = (state.shared.draftDisplay || []) as Card[];
    const canDraft = isYourTurn && !isBlocked && display.length > 0;

    actions.push({
      type: 'draft',
      description: 'Draft a card from the display',
      enabled: canDraft,
      reason: !isYourTurn ? 'Not your turn' :
              isBlocked ? 'You are blocked this turn' :
              display.length === 0 ? 'No cards in display' :
              undefined,
      required: { card: 'Card name to draft' },
      examples: display.slice(0, 2).map(c => ({ type: 'draft' as const, card: c.name })),
      cards: display.map(c => c.name)
    });
  }

  // === RESIGN action (always available) ===
  actions.push({
    type: 'resign',
    description: 'Forfeit the game (requires gamemaster approval)',
    enabled: isYourTurn,
    reason: !isYourTurn ? 'Not your turn' : undefined,
    required: { reason: 'Explanation for why you are resigning' },
    examples: [{ type: 'resign', reason: 'I cannot win from this position' }]
  });

  // Add resource and action point info to result
  const result: AvailableActionsResult = {
    playerId,
    isYourTurn,
    currentState: player.state,
    hand: handCards,
    actions,
    placedCards,
    activeEffects: player.effects
  };

  // Add extended info for new mechanics
  if (player.resources) {
    (result as any).resources = player.resources;
  }
  if (player.actionPoints !== undefined) {
    (result as any).actionPoints = player.actionPoints;
    (result as any).actionPointsUsed = player.actionPointsUsed ?? 0;
  }
  if (player.collectedSets && player.collectedSets.length > 0) {
    (result as any).collectedSets = player.collectedSets;
  }

  // Push your luck state
  if (state.config.engine_mechanics?.push_your_luck) {
    (result as any).rollAccumulator = player.rollAccumulator ?? 0;
    (result as any).rollCount = player.rollCount ?? 0;
  }

  // Draft display
  if (state.config.engine_mechanics?.open_drafting) {
    const display = (state.shared.draftDisplay || []) as Card[];
    (result as any).draftDisplay = display.map(c => c.name);
  }

  // Player power
  if (player.powerId && state.config.engine_mechanics?.variable_powers) {
    const power = state.config.engine_mechanics.variable_powers.powers.find(p => p.id === player.powerId);
    if (power) {
      (result as any).power = { id: power.id, name: power.name, description: power.description };
    }
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

  const validTypes = ['play_card', 'draw', 'pass', 'move', 'place_card', 'place_location', 'resign', 'bid', 'spend', 'collect_set', 'roll', 'bank', 'draft', 'trade_offer', 'trade_respond'];
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

    case 'place_location':
      if (!act.card || typeof act.card !== 'string') {
        errors.push('place_location action requires "card" field (string) - the location card name to place');
      }
      if (!act.adjacentTo || typeof act.adjacentTo !== 'string') {
        errors.push('place_location action requires "adjacentTo" field (string) - existing location to place adjacent to');
      }
      break;

    case 'resign':
      if (!act.reason || typeof act.reason !== 'string' || act.reason.trim().length === 0) {
        errors.push('resign action requires "reason" field (non-empty string) - explanation for resignation');
      }
      break;

    // === NEW MECHANIC ACTIONS ===

    case 'bid':
      if (act.amount === undefined || typeof act.amount !== 'number' || act.amount < 0) {
        errors.push('bid action requires "amount" field (non-negative number)');
      }
      break;

    case 'spend':
      if (!act.resource || typeof act.resource !== 'string') {
        errors.push('spend action requires "resource" field (string) - the resource type to spend');
      }
      if (act.amount === undefined || typeof act.amount !== 'number' || act.amount < 1) {
        errors.push('spend action requires "amount" field (positive number)');
      }
      break;

    case 'collect_set':
      if (!act.cards || !Array.isArray(act.cards) || act.cards.length === 0) {
        errors.push('collect_set action requires "cards" field (array of card names)');
      }
      if (!act.setType || typeof act.setType !== 'string') {
        errors.push('collect_set action requires "setType" field (string) - which set definition to use');
      }
      break;

    // === NEW MECHANIC ACTIONS ===

    case 'roll':
      // No additional fields required - just roll the dice
      break;

    case 'bank':
      // No additional fields required - bank accumulated points
      break;

    case 'draft':
      if (!act.card || typeof act.card !== 'string') {
        errors.push('draft action requires "card" field (string) - the card name to draft from display');
      }
      break;

    case 'trade_offer':
      if (!act.target || typeof act.target !== 'string') {
        errors.push('trade_offer action requires "target" field (string) - player ID to trade with');
      }
      if (!act.offer || !Array.isArray(act.offer)) {
        errors.push('trade_offer action requires "offer" field (array) - card names you are offering');
      }
      if (!act.request || !Array.isArray(act.request)) {
        errors.push('trade_offer action requires "request" field (array) - card names you want (empty array for gifts)');
      }
      break;

    case 'trade_respond':
      if (!act.offerId || typeof act.offerId !== 'string') {
        errors.push('trade_respond action requires "offerId" field (string) - ID of the pending trade');
      }
      if (act.accept === undefined || typeof act.accept !== 'boolean') {
        errors.push('trade_respond action requires "accept" field (boolean) - whether to accept the trade');
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

  // Note: Blocking effects check moved to lose-a-turn mechanic

  // ============ NEW: Check for multiple actions per round ============
  // Prevent players from submitting multiple actions in the same round
  // UNLESS action_points is enabled (which allows multiple actions per round)
  const apConfig = state.config.engine_mechanics?.action_points;
  if (!apConfig && player.lastActionRound === state.round && action.type !== 'pass') {
    return {
      valid: false,
      errors: ['You have already acted this round. Wait for your next turn.']
    };
  }

  // ============ Mechanic Hooks: Pre-validation ============
  // Run preValidateAction hooks for all enabled mechanics
  const preValidationResult = mechanicRegistry.preValidateAction(state, playerId, action);
  if (!preValidationResult.valid) {
    return {
      valid: false,
      errors: [preValidationResult.error || 'Action blocked by mechanic']
    };
  }

  // ============ NEW: Resource spending validation ============
  if (action.type === 'spend') {
    const spendAction = action as SpendAction;
    const available = player.resources?.[spendAction.resource] ?? 0;
    if (spendAction.amount > available) {
      return {
        valid: false,
        errors: [`Not enough ${spendAction.resource}. You have ${available}, trying to spend ${spendAction.amount}.`]
      };
    }
  }

  // ============ NEW: Bid validation ============
  if (action.type === 'bid') {
    const bidAction = action as BidAction;
    const auctionConfig = state.config.engine_mechanics?.auction;
    if (!auctionConfig) {
      return { valid: false, errors: ['Bidding is not enabled for this game.'] };
    }
    const currency = auctionConfig.currency;
    const available = player.resources?.[currency] ?? 0;
    if (bidAction.amount > available) {
      return {
        valid: false,
        errors: [`Not enough ${currency} to bid. You have ${available}, trying to bid ${bidAction.amount}.`]
      };
    }
    // Check minimum increment for English auctions
    const currentHighBid = (state.shared.currentBid as number) ?? 0;
    if (auctionConfig.type === 'english' && bidAction.amount <= currentHighBid) {
      const minBid = currentHighBid + (auctionConfig.min_increment ?? 1);
      return {
        valid: false,
        errors: [`Bid too low. Current high bid is ${currentHighBid}. Minimum bid: ${minBid}.`]
      };
    }
  }

  // ============ NEW: Set collection validation ============
  if (action.type === 'collect_set') {
    const collectAction = action as CollectSetAction;
    const setConfig = state.config.engine_mechanics?.set_collection;
    if (!setConfig) {
      return { valid: false, errors: ['Set collection is not enabled for this game.'] };
    }
    const setDef = setConfig.sets.find(s => s.name === collectAction.setType);
    if (!setDef) {
      return {
        valid: false,
        errors: [`Unknown set type "${collectAction.setType}". Available: ${setConfig.sets.map(s => s.name).join(', ')}`]
      };
    }
    // Verify player has all the cards
    for (const cardName of collectAction.cards) {
      if (!player.hand.find(c => c.name === cardName)) {
        return {
          valid: false,
          errors: [`Card "${cardName}" not in your hand.`]
        };
      }
    }
    // Verify set size matches
    if (collectAction.cards.length !== setDef.size) {
      return {
        valid: false,
        errors: [`Set "${collectAction.setType}" requires exactly ${setDef.size} cards, you provided ${collectAction.cards.length}.`]
      };
    }
  }

  // ============ NEW: Push Your Luck validation ============
  if (action.type === 'roll' || action.type === 'bank') {
    const pylConfig = state.config.engine_mechanics?.push_your_luck;
    if (!pylConfig) {
      return { valid: false, errors: ['Push your luck is not enabled for this game.'] };
    }
    if (action.type === 'bank' && (player.rollAccumulator ?? 0) === 0) {
      return { valid: false, errors: ['No accumulated points to bank. Roll first!'] };
    }
    if (action.type === 'roll' && pylConfig.max_rolls && (player.rollCount ?? 0) >= pylConfig.max_rolls) {
      return { valid: false, errors: [`Maximum rolls (${pylConfig.max_rolls}) reached. You must bank.`] };
    }
  }

  // ============ NEW: Draft validation ============
  if (action.type === 'draft') {
    const draftAction = action as DraftAction;
    const draftConfig = state.config.engine_mechanics?.open_drafting;
    if (!draftConfig) {
      return { valid: false, errors: ['Open drafting is not enabled for this game.'] };
    }
    const display = (state.shared.draftDisplay || []) as Card[];
    if (!display.find(c => c.name === draftAction.card)) {
      return {
        valid: false,
        errors: [`Card "${draftAction.card}" not in draft display. Available: ${display.map(c => c.name).join(', ')}`]
      };
    }
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
      // Note: Card type playable validation moved to card-type-rules mechanic

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

      // Note: Interference card targeting validation moved to take-that mechanic
      break;
    }

    case 'draw': {
      // Basic validation - draws are generally allowed
      if (state.deck.length === 0 && state.discardPile.length <= 1) {
        warnings.push('Draw pile is empty and cannot be reshuffled');
      }
      // Note: Hand limit validation (cannot_draw policy) moved to hand-management mechanic
      // Other policies (discard_choice, discard_oldest) are handled in executeAction
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
      // Note: Move validation moved to grid-movement and board-state mechanics
      break;
    }

    case 'place_card': {
      // Note: place_card validation moved to place-card mechanic
      // Core still handles card-in-hand check
      const placeAction = action as PlaceCardAction;
      const cardIndex = player.hand.findIndex(c => c.name === placeAction.card);
      if (cardIndex === -1) {
        errors.push(`Card "${placeAction.card}" not in your hand. Your cards: ${player.hand.map(c => c.name).join(', ')}`);
      }
      break;
    }

    case 'place_location': {
      // Note: place_location validation moved to place-location mechanic
      // Core still handles card-in-hand check
      const placeAction = action as { card: string; adjacentTo: string };
      const cardIndex = player.hand.findIndex(c => c.name === placeAction.card);
      if (cardIndex === -1) {
        errors.push(`Card "${placeAction.card}" not in your hand. Your cards: ${player.hand.map(c => c.name).join(', ')}`);
      }
      break;
    }

    case 'trade_offer': {
      const tradeAction = action as { target: string; offer: string[]; request: string[] };
      const tradeConfig = state.config.engine_mechanics?.trade as { enabled?: boolean; require_same_location?: boolean; require_adjacent_location?: boolean; item_types_only?: boolean; allow_gifts?: boolean } | undefined;

      // Check if trading is enabled
      if (!tradeConfig?.enabled) {
        errors.push('Trading is not enabled for this game.');
        break;
      }

      // Validate target player exists
      if (!state.players[tradeAction.target]) {
        errors.push(`Invalid trade target "${tradeAction.target}". Player not found.`);
        break;
      }

      if (tradeAction.target === playerId) {
        errors.push('Cannot trade with yourself.');
        break;
      }

      // Check location constraints
      if (tradeConfig.require_same_location) {
        const targetPlayer = state.players[tradeAction.target];
        if (player.state !== targetPlayer.state) {
          errors.push(`Cannot trade with ${tradeAction.target}. You must be at the same location. You are at "${player.state}", they are at "${targetPlayer.state}".`);
        }
      }

      if (tradeConfig.require_adjacent_location) {
        // For grid games, check if players are at adjacent locations
        const gridConfig = state.config.engine_mechanics?.grid;
        if (gridConfig) {
          const targetPlayer = state.players[tradeAction.target];
          // For now, allow if same location (adjacent includes same)
          // Full adjacency check would need grid coordinate tracking
          if (player.state !== targetPlayer.state) {
            warnings.push(`Trading with non-adjacent player. Full adjacency validation not implemented yet.`);
          }
        }
      }

      // Validate offered cards exist in player's hand
      for (const cardName of tradeAction.offer) {
        const cardIndex = player.hand.findIndex(c => c.name === cardName);
        if (cardIndex === -1) {
          errors.push(`Card "${cardName}" not in your hand. Cannot offer it.`);
        } else if (tradeConfig.item_types_only) {
          const card = player.hand[cardIndex];
          if (card.type !== 'item') {
            errors.push(`Card "${cardName}" is not an item. Only items can be traded.`);
          }
        }
      }

      // Validate requested cards exist in target's hand
      const targetPlayer = state.players[tradeAction.target];
      for (const cardName of tradeAction.request) {
        const cardIndex = targetPlayer.hand.findIndex(c => c.name === cardName);
        if (cardIndex === -1) {
          errors.push(`Card "${cardName}" not in ${tradeAction.target}'s hand. Cannot request it.`);
        } else if (tradeConfig.item_types_only) {
          const card = targetPlayer.hand[cardIndex];
          if (card.type !== 'item') {
            errors.push(`Card "${cardName}" is not an item. Only items can be traded.`);
          }
        }
      }

      // Check if gifts are allowed
      if (tradeAction.request.length === 0 && !tradeConfig.allow_gifts) {
        errors.push('One-sided trades (gifts) are not allowed. You must request something in return.');
      }

      if (tradeAction.offer.length === 0) {
        errors.push('You must offer at least one card to trade.');
      }
      break;
    }

    case 'trade_respond': {
      const respondAction = action as { offerId: string; accept: boolean };
      const pendingTrades = (state.shared.pendingTrades as Array<{ id: string; from: string; to: string; offer: string[]; request: string[] }>) || [];
      const trade = pendingTrades.find(t => t.id === respondAction.offerId);

      if (!trade) {
        errors.push(`Trade offer "${respondAction.offerId}" not found or has expired.`);
        break;
      }

      if (trade.to !== playerId) {
        errors.push(`This trade offer is not for you. It was sent to ${trade.to}.`);
        break;
      }

      // If accepting, verify both players still have the cards
      if (respondAction.accept) {
        const fromPlayer = state.players[trade.from];
        for (const cardName of trade.offer) {
          if (!fromPlayer.hand.find(c => c.name === cardName)) {
            errors.push(`Offerer no longer has card "${cardName}". Trade cannot be completed.`);
          }
        }
        for (const cardName of trade.request) {
          if (!player.hand.find(c => c.name === cardName)) {
            errors.push(`You no longer have card "${cardName}". Trade cannot be completed.`);
          }
        }
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

  // Mark that player has acted this round (prevents multiple actions without action points)
  player.lastActionRound = state.round;

  // ============ Mechanic Hooks: Post-execution state changes ============
  // Run postExecuteAction hooks for all enabled mechanics (e.g., deduct AP)
  const postExecuteChanges = mechanicRegistry.postExecuteAction(state, playerId, action);
  applyStateChanges(state, postExecuteChanges);

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
              round: state.round,
        turnNumber: state.turnNumber,
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

        // Proposal 007: Track placed locations for grid-based games
        const gridConfig = state.config.grid as { type?: string } | undefined;
        if (gridConfig && card.type === 'location') {
          if (!state.shared.placedLocations) {
            state.shared.placedLocations = [];
          }
          (state.shared.placedLocations as string[]).push(card.name);
        }

        // Record last action
        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
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
        });

        logEvent(state, {
          event: 'action_executed',
          round: state.round,
        turnNumber: state.turnNumber,
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
          state.status = 'pending_analysis';
          state.shared.winner = winCheck.winner;
          state.shared.endReason = winCheck.reason;
          saveState(state);
          logEvent(state, {
            event: 'game_end',
            round: state.round,
        turnNumber: state.turnNumber,
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

        // Proposal 008: Hand limit enforcement (for discard_choice and discard_oldest policies)
        const handLimit = state.config.engine_mechanics?.hand_limit as number | undefined;
        const handPolicy = (state.config.engine_mechanics?.hand_limit_policy as string) || 'cannot_draw';
        let discardedCards: Card[] = [];

        if (handLimit !== undefined && player.hand.length > handLimit) {
          const excess = player.hand.length - handLimit;

          if (handPolicy === 'discard_oldest') {
            // Auto-discard the oldest (first) cards in hand
            discardedCards = player.hand.splice(0, excess);
            state.discardPile.push(...discardedCards);
          } else if (handPolicy === 'discard_choice') {
            // Note: Full implementation would require a pending_discard state
            // For now, log a warning - the player should discard manually
            logEvent(state, {
              event: 'hand_limit_exceeded',
              round: state.round,
        turnNumber: state.turnNumber,
              player: playerId,
              data: {
                handSize: player.hand.length,
                limit: handLimit,
                excess: excess,
                policy: handPolicy,
                message: `Hand limit (${handLimit}) exceeded by ${excess}. Player should discard ${excess} cards.`
              }
            });
          }
          // 'cannot_draw' is handled in validation, should never reach here
        }

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: {
            success: true,
            details: { drawnCount: cards.length, discarded: discardedCards.length || undefined }
          }
        });

        // Log event BEFORE advancing turn (to capture correct turnNumber)
        logEvent(state, {
          event: 'action_executed',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: { type: 'draw', count: cards.length }
        });

        // After drawing, advance turn
        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'draw',
            details: { drawn: cards.length, handSize: player.hand.length }
          }
        };
      }

      case 'pass': {
        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true }
        });

        // Log event BEFORE advancing turn (to capture correct turnNumber)
        logEvent(state, {
          event: 'action_executed',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: { type: 'pass' }
        });

        advanceTurn(state);

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
          round: state.round,
        turnNumber: state.turnNumber,
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
            round: state.round,
        turnNumber: state.turnNumber,
            player: playerId,
            data: {
              targetState: moveAction.target,
              effects: placedCardEffects.effectsApplied,
              probabilityModifier: placedCardEffects.probabilityModifier
            }
          });
        }

        player.state = moveAction.target;

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: {
            success: true,
            details: {
              newState: moveAction.target,
              placedCardEffects: placedCardEffects.effectsApplied
            }
          }
        });

        logEvent(state, {
          event: 'action_executed',
          round: state.round,
        turnNumber: state.turnNumber,
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
          state.status = 'pending_analysis';
          state.shared.winner = winCheck.winner;
          state.shared.endReason = winCheck.reason;
          saveState(state);
          logEvent(state, {
            event: 'game_end',
            round: state.round,
        turnNumber: state.turnNumber,
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

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: {
            success: true,
            details: {
              card: placedCard.cardName,
              targetState: placedCard.state,
              targetMode: placedCard.targetMode,
              effect: placedCard.effect
            }
          }
        });

        logEvent(state, {
          event: 'action_executed',
          round: state.round,
        turnNumber: state.turnNumber,
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

      case 'place_location': {
        const placeAction = action as { card: string; adjacentTo: string };
        const cardIndex = player.hand.findIndex(c => c.name === placeAction.card);

        if (cardIndex === -1) {
          return { success: false, error: `Card "${placeAction.card}" not in your hand` };
        }

        const card = player.hand[cardIndex];

        if (card.type !== 'location') {
          return { success: false, error: `Card "${placeAction.card}" is not a location card` };
        }

        // Remove card from hand
        player.hand.splice(cardIndex, 1);

        // Add to placed locations
        if (!state.shared.placedLocations) {
          state.shared.placedLocations = [];
        }
        (state.shared.placedLocations as string[]).push(placeAction.card);

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
          turnNumber: state.turnNumber,
          result: {
            success: true,
            details: {
              card: placeAction.card,
              adjacentTo: placeAction.adjacentTo
            }
          }
        });

        logEvent(state, {
          event: 'action_executed',
          round: state.round,
          turnNumber: state.turnNumber,
          player: playerId,
          data: {
            type: 'place_location',
            card: placeAction.card,
            adjacentTo: placeAction.adjacentTo
          }
        });

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'place_location',
            details: {
              card: placeAction.card,
              adjacentTo: placeAction.adjacentTo,
              handSize: player.hand.length
            }
          }
        };
      }

      case 'trade_offer': {
        const tradeAction = action as { target: string; offer: string[]; request: string[] };

        // Generate unique trade ID
        const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Initialize pending trades array if needed
        if (!state.shared.pendingTrades) {
          state.shared.pendingTrades = [];
        }

        const pendingTrade = {
          id: tradeId,
          from: playerId,
          to: tradeAction.target,
          offer: tradeAction.offer,
          request: tradeAction.request,
          timestamp: new Date().toISOString(),
          expiresAtTurn: state.turnNumber + 8  // Expires in 2 full rounds (4 players * 2)
        };

        (state.shared.pendingTrades as Array<typeof pendingTrade>).push(pendingTrade);

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
          turnNumber: state.turnNumber,
          result: {
            success: true,
            details: {
              tradeId,
              target: tradeAction.target,
              offer: tradeAction.offer,
              request: tradeAction.request
            }
          }
        });

        logEvent(state, {
          event: 'trade_offered',
          round: state.round,
          turnNumber: state.turnNumber,
          player: playerId,
          data: {
            tradeId,
            target: tradeAction.target,
            offer: tradeAction.offer,
            request: tradeAction.request
          }
        });

        // Don't advance turn - player may have more actions
        // advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'trade_offer',
            details: {
              tradeId,
              target: tradeAction.target,
              offer: tradeAction.offer,
              request: tradeAction.request
            }
          }
        };
      }

      case 'trade_respond': {
        const respondAction = action as { offerId: string; accept: boolean };
        const pendingTrades = (state.shared.pendingTrades as Array<{ id: string; from: string; to: string; offer: string[]; request: string[] }>) || [];
        const tradeIndex = pendingTrades.findIndex(t => t.id === respondAction.offerId);

        if (tradeIndex === -1) {
          return { success: false, error: `Trade offer "${respondAction.offerId}" not found` };
        }

        const trade = pendingTrades[tradeIndex];
        const fromPlayer = state.players[trade.from];

        // Remove the trade from pending
        pendingTrades.splice(tradeIndex, 1);

        if (respondAction.accept) {
          // Execute the trade - swap cards between players
          // Remove offered cards from offerer and add to responder
          for (const cardName of trade.offer) {
            const cardIndex = fromPlayer.hand.findIndex(c => c.name === cardName);
            if (cardIndex !== -1) {
              const [card] = fromPlayer.hand.splice(cardIndex, 1);
              player.hand.push(card);
            }
          }

          // Remove requested cards from responder and add to offerer
          for (const cardName of trade.request) {
            const cardIndex = player.hand.findIndex(c => c.name === cardName);
            if (cardIndex !== -1) {
              const [card] = player.hand.splice(cardIndex, 1);
              fromPlayer.hand.push(card);
            }
          }

          // Track completed trades for objectives
          if (!player.completedTrades) player.completedTrades = 0;
          if (!fromPlayer.completedTrades) fromPlayer.completedTrades = 0;
          player.completedTrades++;
          fromPlayer.completedTrades++;

          logEvent(state, {
            event: 'trade_completed',
            round: state.round,
            turnNumber: state.turnNumber,
            player: playerId,
            data: {
              tradeId: trade.id,
              from: trade.from,
              to: trade.to,
              offer: trade.offer,
              request: trade.request
            }
          });
        } else {
          logEvent(state, {
            event: 'trade_declined',
            round: state.round,
            turnNumber: state.turnNumber,
            player: playerId,
            data: {
              tradeId: trade.id,
              from: trade.from
            }
          });
        }

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
          turnNumber: state.turnNumber,
          result: {
            success: true,
            details: {
              tradeId: trade.id,
              accepted: respondAction.accept,
              from: trade.from
            }
          }
        });

        return {
          success: true,
          effect: {
            type: 'trade_respond',
            details: {
              tradeId: trade.id,
              accepted: respondAction.accept,
              from: trade.from,
              handSize: player.hand.length
            }
          }
        };
      }

      // === NEW MECHANIC ACTIONS ===

      case 'bid': {
        const bidAction = action as BidAction;
        const auctionConfig = state.config.engine_mechanics?.auction;
        if (!auctionConfig) {
          return { success: false, error: 'Auction not configured for this game' };
        }

        const currency = auctionConfig.currency;
        const previousHighBid = (state.shared.currentBid as number) ?? 0;
        const previousHighBidder = state.shared.highBidder as string | undefined;

        // Update current bid
        state.shared.currentBid = bidAction.amount;
        state.shared.highBidder = playerId;
        player.currentBid = bidAction.amount;

        // For sealed bids, don't reveal until all bids are in
        if (auctionConfig.type !== 'sealed') {
          logEvent(state, {
            event: 'bid_placed',
            round: state.round,
        turnNumber: state.turnNumber,
            player: playerId,
            data: {
              amount: bidAction.amount,
              item: bidAction.item,
              previousBid: previousHighBid,
              previousBidder: previousHighBidder
            }
          });
        }

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true, details: { amount: bidAction.amount } }
        });

        // For once-around auctions, advance turn; for English, player can bid again
        if (auctionConfig.type === 'once-around' || auctionConfig.type === 'sealed') {
          advanceTurn(state);
        } else {
          saveState(state);
        }

        return {
          success: true,
          effect: {
            type: 'bid',
            details: { amount: bidAction.amount, isHighBid: true }
          }
        };
      }

      case 'spend': {
        const spendAction = action as SpendAction;
        if (!player.resources) {
          return { success: false, error: 'Resources not configured for this game' };
        }

        // Deduct resource
        player.resources[spendAction.resource] -= spendAction.amount;

        logEvent(state, {
          event: 'resource_spent',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: {
            resource: spendAction.resource,
            amount: spendAction.amount,
            target: spendAction.target,
            remaining: player.resources[spendAction.resource]
          }
        });

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true, details: { spent: spendAction.amount } }
        });

        // Spending doesn't end your turn (allows multi-action turns with action points)
        saveState(state);

        return {
          success: true,
          effect: {
            type: 'spend',
            details: {
              resource: spendAction.resource,
              amount: spendAction.amount,
              remaining: player.resources[spendAction.resource]
            }
          }
        };
      }

      case 'collect_set': {
        const collectAction = action as CollectSetAction;
        const setConfig = state.config.engine_mechanics?.set_collection;
        if (!setConfig) {
          return { success: false, error: 'Set collection not configured for this game' };
        }

        const setDef = setConfig.sets.find(s => s.name === collectAction.setType);
        if (!setDef) {
          return { success: false, error: `Unknown set type: ${collectAction.setType}` };
        }

        // Remove cards from hand
        const collectedCards: Card[] = [];
        for (const cardName of collectAction.cards) {
          const cardIndex = player.hand.findIndex(c => c.name === cardName);
          if (cardIndex !== -1) {
            const [card] = player.hand.splice(cardIndex, 1);
            collectedCards.push(card);
          }
        }

        // Validate the set matches the definition
        const isValidSet = validateSet(collectedCards, setDef);
        if (!isValidSet) {
          // Put cards back
          player.hand.push(...collectedCards);
          return { success: false, error: `Cards do not form a valid "${collectAction.setType}" set` };
        }

        // Add to collected sets
        if (!player.collectedSets) player.collectedSets = [];
        player.collectedSets.push(collectAction.setType);

        // Award points if configured
        if (setConfig.points_per_set) {
          player.score = (player.score ?? 0) + setConfig.points_per_set;
        }

        // Move cards to discard
        state.discardPile.push(...collectedCards);

        logEvent(state, {
          event: 'set_collected',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: {
            setType: collectAction.setType,
            cards: collectAction.cards,
            points: setConfig.points_per_set,
            totalSets: player.collectedSets.length
          }
        });

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true, details: { setType: collectAction.setType } }
        });

        // Check win condition
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
            effect: { type: 'collect_set', details: { setType: collectAction.setType } }
          };
        }

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'collect_set',
            details: {
              setType: collectAction.setType,
              points: setConfig.points_per_set,
              totalSets: player.collectedSets.length
            }
          }
        };
      }

      // === NEW MECHANICS: Push Your Luck ===

      case 'roll': {
        const pylConfig = state.config.engine_mechanics?.push_your_luck;
        if (!pylConfig) {
          return { success: false, error: 'Push your luck not configured' };
        }

        // Roll the dice
        const rollValue = Math.floor(Math.random() * pylConfig.dice_sides) + 1;
        const isBust = rollValue <= pylConfig.bust_threshold;

        player.rollCount = (player.rollCount ?? 0) + 1;

        if (isBust) {
          // Bust! Lose all accumulated points
          const lostPoints = player.rollAccumulator ?? 0;
          player.rollAccumulator = 0;
          player.rollCount = 0;

          logEvent(state, {
            event: 'push_your_luck_bust',
            round: state.round,
        turnNumber: state.turnNumber,
            player: playerId,
            data: { roll: rollValue, lostPoints }
          });

          recordAction(contestState, {
            player: playerId,
            action,
            timestamp: new Date().toISOString(),
            round: state.round,
        turnNumber: state.turnNumber,
            result: { success: false, details: { roll: rollValue, bust: true, lostPoints } }
          });

          advanceTurn(state);

          return {
            success: true,
            effect: {
              type: 'roll',
              details: { roll: rollValue, bust: true, lostPoints, accumulated: 0 }
            }
          };
        } else {
          // Success! Add points to accumulator
          player.rollAccumulator = (player.rollAccumulator ?? 0) + pylConfig.points_per_success;

          logEvent(state, {
            event: 'push_your_luck_roll',
            round: state.round,
        turnNumber: state.turnNumber,
            player: playerId,
            data: { roll: rollValue, points: pylConfig.points_per_success, accumulated: player.rollAccumulator }
          });

          recordAction(contestState, {
            player: playerId,
            action,
            timestamp: new Date().toISOString(),
            round: state.round,
        turnNumber: state.turnNumber,
            result: { success: true, details: { roll: rollValue, accumulated: player.rollAccumulator } }
          });

          // Don't advance turn - player can roll again or bank
          saveState(state);

          return {
            success: true,
            effect: {
              type: 'roll',
              details: { roll: rollValue, bust: false, points: pylConfig.points_per_success, accumulated: player.rollAccumulator }
            }
          };
        }
      }

      case 'bank': {
        const bankedPoints = player.rollAccumulator ?? 0;
        player.score = (player.score ?? 0) + bankedPoints;
        player.rollAccumulator = 0;
        player.rollCount = 0;

        logEvent(state, {
          event: 'push_your_luck_bank',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: { bankedPoints, totalScore: player.score }
        });

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true, details: { bankedPoints, totalScore: player.score } }
        });

        // Check win condition
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
            effect: { type: 'bank', details: { bankedPoints, totalScore: player.score } }
          };
        }

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'bank',
            details: { bankedPoints, totalScore: player.score }
          }
        };
      }

      // === NEW MECHANICS: Open Drafting ===

      case 'draft': {
        const draftAction = action as DraftAction;
        const draftConfig = state.config.engine_mechanics?.open_drafting;
        if (!draftConfig) {
          return { success: false, error: 'Open drafting not configured' };
        }

        const display = (state.shared.draftDisplay || []) as Card[];
        const cardIndex = display.findIndex(c => c.name === draftAction.card);
        if (cardIndex === -1) {
          return { success: false, error: `Card "${draftAction.card}" not in display` };
        }

        // Remove card from display and add to player's hand
        const [draftedCard] = display.splice(cardIndex, 1);
        player.hand.push(draftedCard);
        state.shared.draftDisplay = display;

        // Refill display if configured
        if (draftConfig.refill === 'immediate' && state.deck.length > 0) {
          const newCard = state.deck.shift()!;
          display.push(newCard);
          state.shared.draftDisplay = display;
        }

        logEvent(state, {
          event: 'card_drafted',
          round: state.round,
        turnNumber: state.turnNumber,
          player: playerId,
          data: { card: draftedCard.name, displayRemaining: display.length }
        });

        recordAction(contestState, {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
        turnNumber: state.turnNumber,
          result: { success: true, details: { card: draftedCard.name } }
        });

        advanceTurn(state);

        return {
          success: true,
          effect: {
            type: 'draft',
            details: { card: draftedCard.name, handSize: player.hand.length }
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

// Helper function to validate a set matches its definition
function validateSet(cards: Card[], setDef: SetDefinition): boolean {
  if (cards.length !== setDef.size) return false;

  // Get the field values to match
  const getFieldValue = (card: Card, field: string): unknown => {
    const parts = field.split('.');
    let value: unknown = card;
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  };

  const values = cards.map(c => getFieldValue(c, setDef.match_field));

  // All values must be the same for a matching set
  const firstValue = values[0];
  const allMatch = values.every(v => v === firstValue);

  // If unique is required, all cards must be different
  if (setDef.unique) {
    const cardNames = cards.map(c => c.name);
    const uniqueNames = new Set(cardNames);
    if (uniqueNames.size !== cards.length) return false;
  }

  return allMatch;
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
    const player = state.players[claim.player];
    player.state = claim.fromState; // Roll back to previous state

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
