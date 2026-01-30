// Core game types

export type GameStatus = 'initializing' | 'waiting_for_players' | 'in_progress' | 'completed' | 'cancelled';
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
  placeable?: boolean;  // Can this card be placed on board states?
  targetMode?: 'owner' | 'opponents' | 'all';  // Who the placed card affects
}

export interface PlayerState {
  agentId?: string;
  state: string;  // position/status in game
  hand: Card[];
  effects: Effect[];
  score?: number;
  lastActionTurn?: number;  // Track last turn player acted (prevents multiple actions per turn)
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
  mechanics?: string[];  // References to mechanic slugs (e.g., ['hand-management', 'set-collection'])
  [key: string]: unknown;  // game-specific config
}

// Mechanic definition from mechanics/ folder
export interface MechanicDef {
  id: string;
  name: string;
  slug: string;
  category: string;
  path: string;
}

export interface MechanicsIndex {
  generated: string;
  source: string;
  count: number;
  categories: string[];
  mechanics: MechanicDef[];
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
  placeable?: boolean;  // Can this card be placed on board states?
  targetMode?: 'owner' | 'opponents' | 'all';  // Who the placed card affects
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
  status: 'your_turn' | 'game_over' | 'game_cancelled' | 'timeout' | 'error' | 'game_not_found';
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

// ============ Contest-Based Adjudication Types ============

// Action schemas for validation
export type ActionType = 'play_card' | 'draw' | 'pass' | 'move' | 'place_card' | 'resign';

export interface BaseAction {
  type: ActionType;
  reasoning?: string;
}

export interface PlayCardAction extends BaseAction {
  type: 'play_card';
  card: string;
  declaredColor?: string;  // For wild cards
  target?: string;  // Target player for interference cards (Block, Friction, Sabotage, etc.)
}

export interface DrawAction extends BaseAction {
  type: 'draw';
  count?: number;  // defaults to 1
}

export interface PassAction extends BaseAction {
  type: 'pass';
}

export interface MoveAction extends BaseAction {
  type: 'move';
  target: string;
  useCard?: string;  // Optional card to play with movement
}

export interface ResignAction extends BaseAction {
  type: 'resign';
  reason: string;  // Required: why player is resigning
}

// ============ State Cards (Game-Agnostic Board Placement) ============

/**
 * A card placed on a board state/location.
 * When players interact with that state, the placed card's effect triggers.
 */
export interface PlacedCard {
  cardName: string;
  placedBy: string;           // Player who placed this card
  state: string;              // Board state where the card is placed
  effect: {
    type: string;             // Effect type (probability_penalty, probability_boost, force_discard, etc.)
    value?: number;
    duration?: number;        // How long the effect lasts after triggering
  };
  targetMode: 'owner' | 'opponents' | 'all';  // Who the effect applies to
  triggersRemaining?: number; // How many times it can trigger (undefined = unlimited until removed)
}

/**
 * Action to place a card on a board state.
 * The card must be marked as `placeable: true` in the game's deck config.
 */
export interface PlaceCardAction extends BaseAction {
  type: 'place_card';
  card: string;               // Card name to place
  targetState: string;        // Board state to place the card on
}

export type GameAction = PlayCardAction | DrawAction | PassAction | MoveAction | PlaceCardAction | ResignAction;

// Action validation result
export interface ActionValidationResult {
  valid: boolean;
  errors: string[];  // Actionable error messages for player
  warnings?: string[];  // Non-blocking issues
}

// Last action tracking (for contests)
export interface LastAction {
  player: string;
  action: GameAction;
  timestamp: string;
  turn: number;
  result?: {
    success: boolean;
    details?: Record<string, unknown>;
  };
}

// Pending contest state
export interface PendingContest {
  contestedBy: string;
  reason: string;
  originalAction: LastAction;
  timestamp: string;
}

// Pending resignation (awaiting gamemaster adjudication)
export interface PendingResignation {
  player: string;
  reason: string;
  timestamp: string;
}

// Contest history entry
export interface ContestHistoryEntry {
  turn: number;
  action: GameAction;
  player: string;
  contestedBy: string;
  contestReason: string;
  ruling: 'allowed' | 'rejected';
  rulingReason: string;
  timestamp: string;
}

// Resignation history entry
export interface ResignationEntry {
  player: string;
  reason: string;
  accepted: boolean;
  rulingReason?: string;
  timestamp: string;
}

// Extended game state with contest system
export interface ContestState {
  lastAction?: LastAction;
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  contestHistory: ContestHistoryEntry[];
  resignations: ResignationEntry[];
}

// Act command result
export interface ActResult {
  success: boolean;
  action?: GameAction;
  validation?: ActionValidationResult;
  effect?: {
    type: string;
    details?: Record<string, unknown>;
  };
  handSize?: number;
  nextPlayer?: string;
  error?: string;
}

// Contest result
export interface ContestResult {
  success: boolean;
  contestId?: string;
  message?: string;
  error?: string;
}

// Adjudication result
export interface AdjudicationResult {
  success: boolean;
  ruling?: 'allowed' | 'rejected';
  reason?: string;
  reversedAction?: boolean;
  error?: string;
}

// Wait result extended with contest info
export interface ExtendedWaitResult {
  status: 'your_turn' | 'game_over' | 'game_cancelled' | 'timeout' | 'error' | 'game_not_found' | 'contest_pending' | 'resignation_pending';
  gameState?: PlayerView;
  winner?: string;
  reason?: string;
  error?: string;
  lastAction?: LastAction;  // Previous player's action (for potential contest)
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
}
