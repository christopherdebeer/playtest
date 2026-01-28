// Core game types

export type GameStatus = 'initializing' | 'waiting_for_players' | 'in_progress' | 'completed';
export type Role = 'gamemaster' | 'player';

export interface Card {
  name: string;
  type: string;
  effect: {
    type: string;
    value?: number;
    duration?: number;
    target?: string;
    color?: string;  // For card games like UNO
  };
}

export interface PlayerState {
  agentId?: string;
  state: string;  // position/status in game
  hand: Card[];
  effects: Effect[];
  score?: number;
}

export interface Effect {
  type: string;
  value?: number;
  duration: number;  // turns remaining
  source?: string;   // who applied it
}

export interface GameConfig {
  name: string;
  version: string;
  players: number | { min: number; max: number };
  win_condition: string;
  max_turns: number;
  starting_cards?: number;
  deck?: DeckConfig[];
  board?: BoardConfig;
  [key: string]: unknown;  // game-specific config
}

export interface DeckConfig {
  name: string;
  count: number;
  type?: string;
  effect?: {
    type: string;
    value?: number;
    duration?: number;
    color?: string;  // For card games like UNO
  };
}

export interface BoardConfig {
  states: string[];
  start?: string;
  edges: EdgeConfig[];
}

export interface EdgeConfig {
  from: string | string[];
  to: string | string[];
  probability?: number;
  cost?: number;
}

export interface PendingAction {
  player: string;
  turn: number;
  action: Record<string, unknown>;
  submittedAt: string;
}

export interface GameState {
  gameId: string;
  gameName: string;
  status: GameStatus;
  turn: number;
  currentPlayer: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  shared: Record<string, unknown>;  // game-specific shared state
  deck: Card[];
  discardPile: Card[];
  config: GameConfig;
  rulesMarkdown: string;
  log: string;  // path to log file
}

export interface WaitResult {
  status: 'your_turn' | 'game_over' | 'timeout' | 'error' | 'game_not_found';
  gameState?: PlayerView;
  winner?: string;
  reason?: string;
  error?: string;
}

export interface PlayerView {
  gameId: string;
  turn: number;
  currentPlayer: string;
  myState: {
    state: string;
    hand: Card[];
    effects: Effect[];
  };
  opponents: OpponentView[];
  shared: Record<string, unknown>;
}

export interface OpponentView {
  playerId: string;
  state: string;
  handSize: number;
  effects: Effect[];
}

export interface ActionResult {
  accepted: boolean;
  result?: {
    type: string;
    success?: boolean;
    details?: Record<string, unknown>;
  };
  error?: string;
  nextPlayer?: string;
}

export interface RollResult {
  roll: number;
  threshold: number;
  success: boolean;
  context: string;
}

export interface LogEvent {
  timestamp: string;
  event: string;
  turn?: number;
  player?: string;
  data?: Record<string, unknown>;
}
