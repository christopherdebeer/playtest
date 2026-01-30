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
  ActionValidationResult,
  LastAction,
  PendingContest,
  PendingResignation,
  PendingVictoryClaim,
  ContestHistoryEntry,
  ResignationEntry,
  VictoryClaimEntry,
  ContestState,
  EngineMechanics
} from './types.js';
import { parseRules, buildDeck, shuffleDeck, getPlayerCount } from './rules.js';

// Find project root (parent of engine directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const GAMES_DIR = join(PROJECT_ROOT, 'games');

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

export function initGame(gameName: string, playerCount: number): GameState {
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
    players[playerId] = {
      state: config.board?.start ?? 'start',
      hand: [],
      effects: []
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
  const shared: Record<string, unknown> = {};

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
): { registered: boolean; role: string; playerId?: string; rules: string; instanceId: string; config: object } {
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

    saveStateUnsafe(state, instanceId);
    debug(`[REGISTER DEBUG] State saved for ${playerId}`);

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
      rules: state.rulesMarkdown,
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
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;

  // If we wrapped around, increment turn number
  if (nextIndex === 0) {
    state.turn++;
  }

  state.currentPlayer = state.turnOrder[nextIndex];

  // Decrement effect durations
  for (const player of Object.values(state.players)) {
    player.effects = player.effects
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

// Helper: Get edge probability from board config
export function getEdgeProbability(state: GameState, from: string, to: string): number {
  const board = state.config.board;
  if (!board?.edges) return 1.0; // No board = auto-success

  for (const edge of board.edges) {
    const fromMatch = Array.isArray(edge.from)
      ? edge.from.includes(from)
      : edge.from === from;
    const toMatch = Array.isArray(edge.to)
      ? edge.to.includes(to)
      : edge.to === to;

    if (fromMatch && toMatch) {
      return edge.probability ?? 1.0;
    }
  }

  return 0.5; // Default probability if edge not found
}

// Helper: Find card in player's hand by name
export function findCardInHand(player: PlayerState, cardName: string): Card | null {
  return player.hand.find(c => c.name === cardName) || null;
}

// Helper: Remove card from player's hand by name
export function removeCardFromHand(player: PlayerState, cardName: string): Card | null {
  const idx = player.hand.findIndex(c => c.name === cardName);
  if (idx !== -1) {
    return player.hand.splice(idx, 1)[0];
  }
  return null;
}

// Helper: Check if an engine mechanic is enabled for this game
// Mechanics can be explicitly set in engine_mechanics, or inferred from config
export function isMechanicEnabled(state: GameState, mechanic: keyof EngineMechanics): boolean {
  const explicit = state.config.engine_mechanics?.[mechanic];
  if (explicit !== undefined) {
    return explicit;
  }

  // Infer from config if not explicitly set
  switch (mechanic) {
    case 'probability_movement':
      // Enabled if board has edges with probability defined
      return state.config.board?.edges?.some(e => e.probability !== undefined) ?? false;

    case 'card_boosts':
      // Enabled if deck exists with boost-type effects
      return state.config.deck?.some(d =>
        d.effect?.type === 'probability_boost' || d.effect?.type === 'auto_success'
      ) ?? false;

    case 'victory_declaration':
      // Default to false - must be explicitly enabled
      return false;

    default:
      return false;
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

  const validTypes = ['play_card', 'draw', 'pass', 'move', 'resign'];
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

  // Check for pending contest/resignation
  const contestState = ensureContestState(state);
  if (contestState.pendingContest) {
    return { valid: false, errors: ['Cannot act while a contest is pending. Wait for adjudication.'] };
  }
  if (contestState.pendingResignation) {
    return { valid: false, errors: ['Cannot act while a resignation is pending adjudication.'] };
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
      if (topCard && card.type !== 'wild') {
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
} {
  const player = state.players[playerId];
  const contestState = ensureContestState(state);

  try {
    switch (action.type) {
      case 'play_card': {
        const playAction = action as PlayCardAction;
        const card = playCardByName(state, playerId, playAction.card, playAction.declaredColor);
        if (!card) {
          return { success: false, error: `Failed to play card "${playAction.card}"` };
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
              newTopCard: state.shared.topCard,
              currentColor: state.shared.currentColor
            }
          }
        };

        // Advance turn (action cards effects handled by engine)
        advanceTurn(state);

        logEvent(state, {
          event: 'action_executed',
          turn: state.turn,
          player: playerId,
          data: {
            type: 'play_card',
            card: card.name,
            effect: card.effect,
            declaredColor: playAction.declaredColor
          }
        });

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
        // Board game movement - mechanics applied based on game config
        const moveAction = action as MoveAction;
        const fromState = player.state;
        const toState = moveAction.target;

        // Check if probability_movement mechanic is enabled
        const useProbability = isMechanicEnabled(state, 'probability_movement');
        const useCardBoosts = isMechanicEnabled(state, 'card_boosts');
        const useVictoryDeclaration = isMechanicEnabled(state, 'victory_declaration');

        let moveSucceeded = true;
        let boostCard: Card | null = null;
        let boostValue = 0;
        let baseProbability = 1.0;
        let effectiveProbability = 1.0;
        let rollValue = 0;

        // Apply probability mechanics if enabled
        if (useProbability) {
          baseProbability = getEdgeProbability(state, fromState, toState);

          // Apply card boost if enabled and specified
          if (useCardBoosts && moveAction.boost) {
            boostCard = findCardInHand(player, moveAction.boost);
            if (boostCard) {
              if (boostCard.effect?.type === 'probability_boost') {
                boostValue = boostCard.effect.value || 0;
              } else if (boostCard.effect?.type === 'auto_success') {
                boostValue = 1.0; // Auto-success cards guarantee move
              }
            }
          }

          effectiveProbability = Math.min(1.0, baseProbability + boostValue);
          const rollResult = roll(effectiveProbability);
          rollValue = rollResult.roll;
          moveSucceeded = rollResult.success;

          // Log probability roll
          logEvent(state, {
            event: 'probability_roll',
            turn: state.turn,
            player: playerId,
            data: {
              fromState,
              toState,
              baseProbability,
              boost: boostCard ? { card: boostCard.name, value: boostValue } : null,
              effectiveProbability,
              roll: rollValue,
              success: moveSucceeded
            }
          });
        }

        if (moveSucceeded) {
          // Apply state change
          player.state = toState;

          // Consume boost card if used
          if (boostCard) {
            removeCardFromHand(player, boostCard.name);
            state.discardPile.push(boostCard);
          }

          // Log state transition
          logEvent(state, {
            event: 'state_transition',
            turn: state.turn,
            player: playerId,
            data: { fromState, toState }
          });

          // Handle victory declaration if mechanic is enabled
          if (useVictoryDeclaration && moveAction.declareVictory) {
            contestState.pendingVictoryClaim = {
              player: playerId,
              reason: moveAction.victoryReason || `Reached ${toState}`,
              fromState,
              toState,
              action: moveAction,
              timestamp: new Date().toISOString()
            };

            logEvent(state, {
              event: 'victory_claimed',
              turn: state.turn,
              player: playerId,
              data: {
                reason: moveAction.victoryReason,
                state: toState
              }
            });

            contestState.lastAction = {
              player: playerId,
              action,
              timestamp: new Date().toISOString(),
              turn: state.turn,
              result: {
                success: true,
                details: { newState: toState, victoryPending: true }
              }
            };

            // Don't advance turn - wait for gamemaster adjudication
            saveState(state);

            return {
              success: true,
              effect: {
                type: 'victory_pending',
                details: {
                  newState: toState,
                  awaitingAdjudication: true
                }
              }
            };
          }

          // Record last action
          contestState.lastAction = {
            player: playerId,
            action,
            timestamp: new Date().toISOString(),
            turn: state.turn,
            result: {
              success: true,
              details: { newState: toState }
            }
          };

          advanceTurn(state);

          // Log action with reasoning
          logEvent(state, {
            event: 'action_executed',
            turn: state.turn,
            player: playerId,
            data: {
              type: 'move',
              target: toState,
              success: true,
              reasoning: moveAction.reasoning
            }
          });

          return {
            success: true,
            effect: {
              type: 'move',
              details: { newState: player.state }
            }
          };
        } else {
          // Move failed (probability roll failed)
          logEvent(state, {
            event: 'move_failed',
            turn: state.turn,
            player: playerId,
            data: {
              fromState,
              toState,
              probability: effectiveProbability,
              reasoning: moveAction.reasoning
            }
          });

          contestState.lastAction = {
            player: playerId,
            action,
            timestamp: new Date().toISOString(),
            turn: state.turn,
            result: {
              success: false,
              details: { fromState, toState, probability: effectiveProbability }
            }
          };

          advanceTurn(state);

          return {
            success: true, // Action was processed, even if move failed
            effect: {
              type: 'move_failed',
              details: { fromState, toState, stayedAt: fromState }
            }
          };
        }
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
