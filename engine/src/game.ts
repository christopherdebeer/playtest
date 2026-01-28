// Game state management

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  GameState,
  GameStatus,
  PlayerState,
  PlayerView,
  OpponentView,
  Card,
  LogEvent
} from './types.js';
import { parseRules, buildDeck, shuffleDeck, getPlayerCount } from './rules.js';

// Find project root (parent of engine directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const GAMES_DIR = join(PROJECT_ROOT, 'games');

export function getGamePath(gameName: string): string {
  return join(GAMES_DIR, gameName);
}

export function getStatePath(gameName: string): string {
  return join(getGamePath(gameName), 'state');
}

export function getStateFile(gameName: string): string {
  return join(getStatePath(gameName), 'game.json');
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

export function stateExists(gameName: string): boolean {
  return existsSync(getStateFile(gameName));
}

export function loadState(gameName: string): GameState {
  const stateFile = getStateFile(gameName);
  if (!existsSync(stateFile)) {
    throw new Error(`No active game found for ${gameName}`);
  }
  return JSON.parse(readFileSync(stateFile, 'utf-8'));
}

export function saveState(state: GameState): void {
  const stateDir = getStatePath(state.gameName);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  writeFileSync(getStateFile(state.gameName), JSON.stringify(state, null, 2));
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

export function registerAgent(
  gameName: string,
  role: 'gamemaster' | 'player',
  agentId: string,
  playerId?: string
): { registered: boolean; role: string; playerId?: string; rules: string } {
  const state = loadState(gameName);

  if (role === 'gamemaster') {
    // Gamemaster registration - store in shared state
    state.shared.gamemasterAgentId = agentId;
    saveState(state);

    return {
      registered: true,
      role: 'gamemaster',
      rules: state.rulesMarkdown
    };
  }

  // Player registration
  if (!playerId) {
    // Auto-assign to first unregistered player
    for (const pid of state.turnOrder) {
      if (!state.players[pid].agentId) {
        playerId = pid;
        break;
      }
    }
  }

  if (!playerId || !state.players[playerId]) {
    throw new Error(`No available player slot for registration`);
  }

  if (state.players[playerId].agentId) {
    throw new Error(`Player ${playerId} already registered`);
  }

  state.players[playerId].agentId = agentId;
  saveState(state);

  // Check if all players registered
  const allRegistered = state.turnOrder.every(pid => state.players[pid].agentId);
  if (allRegistered && state.shared.gamemasterAgentId) {
    startGame(gameName);
  }

  return {
    registered: true,
    role: 'player',
    playerId,
    rules: state.rulesMarkdown
  };
}

export function startGame(gameName: string): void {
  const state = loadState(gameName);

  if (state.status !== 'waiting_for_players') {
    return; // Already started
  }

  state.status = 'in_progress';
  state.turn = 1;
  state.currentPlayer = state.turnOrder[0];
  saveState(state);

  logEvent(state, {
    event: 'game_start',
    turn: 1,
    data: {
      players: state.turnOrder,
      firstPlayer: state.currentPlayer
    }
  });
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

// Randomization functions (engine-controlled)

export function roll(probability: number): { roll: number; success: boolean } {
  const rollValue = Math.random();
  return {
    roll: rollValue,
    success: rollValue <= probability
  };
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
