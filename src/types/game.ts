// Core game types

export type GameStatus = 'initializing' | 'waiting_for_players' | 'in_progress' | 'pending_analysis' | 'completed' | 'cancelled';
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
  persona?: string;  // Persona slug for this player's personality
  state: string;  // position/status in game
  hand: Card[];
  effects: Effect[];
  score?: number;
  lastActionRound?: number;  // Track last round player acted (prevents multiple actions per round)

  // New mechanic state
  resources?: Record<string, number>;     // Resource amounts (e.g., { "gold": 10 })
  actionPoints?: number;                  // Remaining action points this turn
  actionPointsUsed?: number;              // Action points used this turn
  collectedSets?: string[];               // Names of completed sets
  currentBid?: number;                    // Current bid in auction

  // Additional mechanic state
  rollAccumulator?: number;               // Accumulated points from push-your-luck rolls
  rollCount?: number;                     // Number of rolls this turn
  powerId?: string;                       // Assigned player power ID
  completedTrades?: number;               // Number of completed trades (for The Trader objective)

  // Proposal 010: Hidden objectives for role-based games
  objective?: {
    name: string;        // Objective name (e.g., "The Enemy", "The Collector")
    type: string;        // Objective type (e.g., "enemy", "regular")
    condition?: string;  // Win condition description
    revealed?: boolean;  // Whether the objective has been revealed
  };
}

export interface Effect {
  type: string;
  value?: number;
  duration: number;  // player turns remaining (decrements when effect holder's turn ends)
  source?: string;   // who applied it
}

// Engine mechanics that can be enabled per-game
export interface EngineMechanics {
  probability_movement?: boolean;  // Moves use edge probabilities (default: true if board.edges have probability)
  card_boosts?: boolean;           // Cards can modify move probability (default: true if deck exists)
  victory_declaration?: boolean;   // Players must declare victory for GM adjudication (default: false)

  // New mechanics from mechanics library
  action_points?: ActionPointsConfig;   // Action points budget per turn
  resources?: ResourceConfig[];         // Resource types to track
  income?: IncomeConfig;                // Per-turn resource generation
  set_collection?: SetCollectionConfig; // Set detection and scoring
  auction?: AuctionConfig;              // Auction/bidding system
  turn_order?: TurnOrderConfig;         // Turn order determination

  // Additional mechanics
  push_your_luck?: PushYourLuckConfig;  // Risk/reward dice rolling
  variable_powers?: VariablePlayerPowersConfig;  // Asymmetric player abilities
  open_drafting?: OpenDraftingConfig;   // Draft from visible card pool
  simultaneous?: SimultaneousActionConfig;  // All players act at once

  // Proposal 007: Grid-based movement
  grid?: GridConfig;                   // Grid configuration for tile-placement games

  // Trading mechanic
  trade?: TradeConfig;                 // Trading configuration

  // Proposal 008: Hand limits and card type restrictions
  hand_limit?: number;                 // Maximum cards in hand
  hand_limit_policy?: 'cannot_draw' | 'discard_choice' | 'discard_oldest';  // What happens when limit exceeded
  card_type_rules?: Record<string, CardTypeRules>;  // Per-type playability rules

  // Proposal 010: Configurable default winner on timeout
  timeout_winner?: TimeoutWinnerConfig;  // Who wins when max_turns is reached

  // Win condition mechanics (composable)
  win_reach_state?: WinReachStateConfig;      // Win by reaching a board state
  win_score_threshold?: WinScoreThresholdConfig;  // Win by reaching a score threshold
  win_empty_hand?: boolean;                   // Win by emptying hand
  win_elimination?: boolean;                  // Win by being last player standing
  win_timeout?: WinTimeoutConfig;             // Winner determination on timeout
}

// Proposal 007: Grid configuration
export interface GridConfig {
  type: 'infinite' | 'bounded';
  starting_tile: string;
  adjacency: 'orthogonal' | 'diagonal' | 'hexagonal';
  bounds?: { width: number; height: number };
}

// Trading configuration
export interface TradeConfig {
  enabled: boolean;                    // Whether trading is enabled
  require_same_location?: boolean;     // Players must be at same location to trade
  require_adjacent_location?: boolean; // Players must be at adjacent locations
  item_types_only?: boolean;           // Only cards with type 'item' can be traded
  allow_gifts?: boolean;               // Allow one-sided trades (giving without receiving)
  max_cards_per_trade?: number;        // Maximum cards that can be exchanged in one trade
}

// Pending trade offer (stored in state.shared.pendingTrades)
export interface PendingTrade {
  id: string;                          // Unique offer ID
  from: string;                        // Player ID offering
  to: string;                          // Player ID receiving offer
  offer: string[];                     // Card names being offered
  request: string[];                   // Card names being requested (empty for gifts)
  timestamp: string;                   // When offer was created
  expiresAtTurn?: number;              // Optional expiration turn
}

// Proposal 008: Card type rules
export interface CardTypeRules {
  playable?: boolean;     // Can this card type be played with play_card action?
  tradeable?: boolean;    // Can this card type be traded?
  holdable?: boolean;     // Can this card type be held in hand?
  placeable?: boolean;    // Can this card type be placed on the grid/board?
}

// Proposal 010: Timeout winner configuration
export interface TimeoutWinnerConfig {
  type: 'role' | 'highest_score' | 'specific_player' | 'no_winner';  // How to determine winner
  role?: string;           // For type "role": the role/objective type that wins
  role_name?: string;      // For type "role": match by objective name
  player_condition?: string;  // For type "specific_player": condition to evaluate
  reveal_role?: boolean;   // Whether to reveal the winner's hidden role
  reason?: string;         // Custom reason message (for "no_winner")
}

// Win condition mechanic configs (composable)
export interface WinReachStateConfig {
  target_state: string;    // The board state to reach to win
}

export interface WinScoreThresholdConfig {
  threshold: number;       // Score threshold to reach
  operator?: '>=' | '>' | '==' | '=';  // Comparison operator (default: ">=")
}

export interface WinTimeoutConfig {
  type?: 'highest_score' | 'role' | 'specific_player' | 'no_winner';  // How to determine winner
  role?: string;           // For type "role": the role/objective type that wins
  role_name?: string;      // For type "role": match by objective name
  player_condition?: string;  // For type "specific_player": condition to evaluate
  reveal_role?: boolean;   // Whether to reveal the winner's hidden role
  reason?: string;         // Custom reason message (for "no_winner")
}

export interface TimeoutResult {
  winner: string | null;
  reason: string;
  revealRole: boolean;
}

// Action Points mechanic (slug: action-points)
export interface ActionPointsConfig {
  points_per_turn: number;           // How many action points per turn
  action_costs: Record<string, number>; // Cost per action type (e.g., { "move": 1, "play_card": 1, "draw": 1 })
  rollover?: boolean;                // Do unused points carry over? (default: false)
}

// Resource mechanic (slug: income, commodity-speculation)
export interface ResourceConfig {
  name: string;                      // e.g., "gold", "mana", "wood"
  starting_amount: number;           // How much each player starts with
  max?: number;                      // Optional cap
}

// Income mechanic (slug: income)
export interface IncomeConfig {
  per_turn: Record<string, number>;  // Resources generated per turn (e.g., { "gold": 2 })
  per_round?: Record<string, number>; // Resources generated per full round
}

// Set Collection mechanic (slug: set-collection)
export interface SetCollectionConfig {
  sets: SetDefinition[];             // Define what constitutes a set
  scoring: 'per_set' | 'largest_set' | 'most_sets';
  points_per_set?: number;           // Points awarded per complete set
}

export interface SetDefinition {
  name: string;                      // e.g., "Color Set", "Number Run"
  match_field: string;               // Card field to match (e.g., "effect.color", "type")
  size: number;                      // How many cards needed for a set
  unique?: boolean;                  // Must cards be unique?
}

// Auction mechanic (slug: auction-english, auction-sealed-bid, etc.)
export interface AuctionConfig {
  type: 'english' | 'sealed' | 'dutch' | 'once-around';
  currency: string;                  // Resource used for bidding (e.g., "gold")
  min_increment?: number;            // Minimum bid increase (for english)
  time_limit?: number;               // Seconds per auction (optional)
}

// Turn Order mechanic (slug: turn-order-*)
export interface TurnOrderConfig {
  type: 'fixed' | 'random' | 'stat-based' | 'bid' | 'pass-order';
  stat?: string;                     // For stat-based: which stat determines order
  shuffle_frequency?: 'never' | 'per_round' | 'per_turn';
}

// Push Your Luck mechanic (slug: push-your-luck)
export interface PushYourLuckConfig {
  dice_sides: number;                // Sides on the die (e.g., 6)
  bust_threshold: number;            // Roll this or below = bust (e.g., 1)
  points_per_success: number;        // Points gained per successful roll
  max_rolls?: number;                // Optional cap on rolls per turn
}

// Variable Player Powers mechanic (slug: variable-player-powers)
export interface VariablePlayerPowersConfig {
  powers: PlayerPower[];             // Available powers
  assignment: 'random' | 'draft' | 'fixed';  // How powers are assigned
}

export interface PlayerPower {
  id: string;                        // Unique identifier
  name: string;                      // Display name
  description: string;               // What it does
  effect: PowerEffect;               // Mechanical effect
}

export interface PowerEffect {
  type: 'bonus_action_points' | 'bonus_draw' | 'bonus_income' | 'discount' | 'reroll' | 'immunity' | 'extra_cards';
  value?: number;                    // Effect magnitude
  condition?: string;                // When it applies
}

// Open Drafting mechanic (slug: open-drafting)
export interface OpenDraftingConfig {
  display_size: number;              // Cards visible in the draft pool
  picks_per_turn: number;            // How many cards player can pick per turn
  refill: 'immediate' | 'end_of_round' | 'never';  // When to refill display
}

// Simultaneous Action mechanic (slug: simultaneous-action-selection)
export interface SimultaneousActionConfig {
  enabled: boolean;                  // Use simultaneous resolution
  resolution_order: 'random' | 'clockwise' | 'priority';  // How to resolve conflicts
}

export interface GameConfig {
  name: string;
  version: string;
  players: number | { min: number; max: number };
  win_condition: string;
  max_rounds: number;
  starting_cards?: number;
  deck?: DeckConfig[];
  board?: BoardConfig;
  mechanics?: string[];  // References to mechanic slugs (e.g., ['hand-management', 'set-collection'])
  engine_mechanics?: EngineMechanics;  // Enable/disable engine capabilities
  engine_debug?: {
    hook_telemetry?: boolean;  // Enable hook telemetry logging
  };
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
  round: number;
  action: Record<string, unknown>;
  submittedAt: string;
}

export interface GameState {
  gameId: string;
  gameName: string;
  status: GameStatus;
  round: number;
  turnNumber: number;
  currentPlayer: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  shared: Record<string, unknown>;  // game-specific shared state
  deck: Card[];
  discardPile: Card[];
  config: GameConfig;
  rulesMarkdown: string;
  log: string;  // path to log file
  created?: number;  // Unix timestamp in milliseconds when game was initialized
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
  round: number;
  turnNumber: number;
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

/**
 * Log event structure for game event logging.
 *
 * SOURCE OF TRUTH: /shared/types/log-events.ts
 *
 * Keep in sync with:
 * - shared/types/log-events.ts (canonical event definitions)
 * - site/src/types/logs.ts (TypedLogEvent union)
 *
 * Event types include:
 * - game_init, game_start, game_end, game_cancelled
 * - action_executed
 * - probability_roll, state_transition, move_failed (probability_movement)
 * - victory_claimed, victory_adjudicated, victory_rejected (victory_declaration)
 * - contest_filed, contest_adjudicated
 * - resignation_submitted, resignation_adjudicated
 */
export interface LogEvent {
  timestamp: string;
  event: string;
  round?: number;
  turnNumber?: number;
  player?: string;
  data?: Record<string, unknown>;
}

// ============ Contest-Based Adjudication Types ============

// Action schemas for validation
export type ActionType = 'play_card' | 'draw' | 'pass' | 'move' | 'place_card' | 'place_location' | 'trade_offer' | 'trade_respond' | 'resign' | 'bid' | 'spend' | 'collect_set' | 'roll' | 'bank' | 'draft';

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
  boost?: string;           // Card name to use for probability boost
  declareVictory?: boolean; // Player believes this move wins
  victoryReason?: string;   // Why they believe they won
}

export interface ResignAction extends BaseAction {
  type: 'resign';
  reason: string;  // Required: why player is resigning
}

// New mechanic actions

export interface BidAction extends BaseAction {
  type: 'bid';
  amount: number;                    // Bid amount
  item?: string;                     // Optional: what you're bidding on
}

export interface SpendAction extends BaseAction {
  type: 'spend';
  resource: string;                  // Resource to spend (e.g., "gold")
  amount: number;                    // Amount to spend
  target?: string;                   // Optional: what to spend on
}

export interface CollectSetAction extends BaseAction {
  type: 'collect_set';
  cards: string[];                   // Card names to claim as a set
  setType: string;                   // Which set definition to use
}

// Push Your Luck actions
export interface RollAction extends BaseAction {
  type: 'roll';
  // No additional fields - just roll the dice
}

export interface BankAction extends BaseAction {
  type: 'bank';
  // Bank current accumulated points and end rolling
}

// Open Drafting action
export interface DraftAction extends BaseAction {
  type: 'draft';
  card: string;                      // Card name to draft from display
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

export interface PlaceLocationAction extends BaseAction {
  type: 'place_location';
  card: string;               // Location card name to place
  adjacentTo: string;         // Existing location to place adjacent to (e.g., "origin", "Forest Clearing")
}

export interface TradeOfferAction extends BaseAction {
  type: 'trade_offer';
  target: string;             // Player ID to trade with
  offer: string[];            // Card names you are offering
  request: string[];          // Card names you want in return (empty for gifts)
}

export interface TradeRespondAction extends BaseAction {
  type: 'trade_respond';
  offerId: string;            // ID of the pending trade offer
  accept: boolean;            // Whether to accept the trade
}

export type GameAction = PlayCardAction | DrawAction | PassAction | MoveAction | PlaceCardAction | PlaceLocationAction | TradeOfferAction | TradeRespondAction | ResignAction | BidAction | SpendAction | CollectSetAction | RollAction | BankAction | DraftAction;

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
  round: number;
  turnNumber: number;
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

// Pending victory claim (awaiting gamemaster adjudication)
export interface PendingVictoryClaim {
  player: string;
  reason: string;           // Why they believe they won
  fromState: string;        // State before the move
  toState: string;          // Claimed victory state
  action: GameAction;       // The action that led to claim
  timestamp: string;
}

// Victory claim history entry
export interface VictoryClaimEntry {
  player: string;
  reason: string;
  ruling: 'accepted' | 'rejected';
  rulingReason: string;
  timestamp: string;
}

// Contest history entry
export interface ContestHistoryEntry {
  round: number;
  turnNumber: number;
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

// Operator hint entry (for unblocking agents)
export interface OperatorHint {
  message: string;
  reason: string;
  timestamp: string;
  createdAtRound: number;
  createdAtTurn: number;
  targetPlayer?: string;  // Optional: specific player, or all if undefined
  expiresAfterRounds?: number;  // Optional: expire after N rounds
  expiresAfterTurns?: number;   // Optional: expire after N turns
}

// Extended game state with contest system
export interface ContestState {
  lastAction?: LastAction;
  actionHistory: LastAction[];  // Recent actions for player visibility (last N turns)
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;
  contestHistory: ContestHistoryEntry[];
  resignations: ResignationEntry[];
  victoryHistory: VictoryClaimEntry[];
  operatorHints?: OperatorHint[];  // Ephemeral hints from operator to help agents
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
  status: 'your_turn' | 'game_over' | 'game_cancelled' | 'timeout' | 'error' | 'game_not_found' | 'contest_pending' | 'resignation_pending' | 'victory_pending';
  gameState?: PlayerView;
  winner?: string;
  reason?: string;
  error?: string;
  lastAction?: LastAction;  // Previous player's action (for potential contest)
  pendingContest?: PendingContest;
  pendingResignation?: PendingResignation;
  pendingVictoryClaim?: PendingVictoryClaim;
}

// ============ Dynamic Action Discovery ============

/**
 * Describes an available action with usage instructions.
 * Used to procedurally expose available commands based on game rules and state.
 */
export interface AvailableAction {
  type: ActionType;
  description: string;
  enabled: boolean;              // Whether this action is currently available
  reason?: string;               // Why it's enabled/disabled
  required: Record<string, string>;  // field name -> description
  optional?: Record<string, string>;
  examples: GameAction[];        // Concrete examples the agent can use
  cards?: string[];              // Specific cards that can be used (for play_card, place_card)
  targets?: string[];            // Valid targets (for move, place_card)
}

/**
 * Result of getAvailableActions() - shows what a player can do.
 */
export interface AvailableActionsResult {
  playerId: string;
  isYourTurn: boolean;
  currentState: string;
  hand: string[];                // Card names in hand
  actions: AvailableAction[];
  placedCards: PlacedCard[];     // Cards placed on board (if any)
  activeEffects: Effect[];       // Effects currently on this player
}

// ============ Game Analysis Types ============

/**
 * A notable moment during the game (for analysis).
 */
export interface KeyMoment {
  round: number;
  turnNumber: number;
  player: string;
  action: string;
  significance: string;          // Why this moment mattered
}

/**
 * Gamemaster analysis of a completed game.
 */
export interface GameAnalysis {
  summary: string;               // Brief game summary
  winner: string;                // Winner player ID
  winCondition: string;          // How they won
  keyMoments: KeyMoment[];       // Notable moments/decisions
  mechanicsObserved: string[];   // Which mechanics were used
  playerStrategies?: Record<string, string>;  // Brief strategy notes per player
  recommendations?: string[];    // Suggestions for game balance/rules
}

// ============ Validation Types ============

/**
 * A validation error or warning from rules validation.
 */
export interface ValidationIssue {
  code: string;                  // Machine-readable error code
  message: string;               // Human-readable message
  severity: 'error' | 'warning'; // Severity level
  location?: string;             // Where in the config (e.g., "config.deck[0].name")
  suggestion?: string;           // How to fix it
}

/**
 * An extracted markdown section from RULES.md.
 */
export interface ExtractedSection {
  heading: string;               // Original heading text
  level: number;                 // Heading level (1-6)
  content: string;               // Content under this heading
  startLine: number;             // Line number where section starts
  endLine: number;               // Line number where section ends
}

/**
 * All extracted sections from a RULES.md file.
 */
export interface ExtractedSections {
  // Standard sections (normalized names)
  overview?: string;
  setup?: string;
  gameplay?: string;
  winning?: string;
  cardTypes?: string;
  gamemasterNotes?: string;
  strategy?: string;
  designNotes?: string;

  // All sections by heading (raw)
  allSections: Record<string, ExtractedSection>;
}

/**
 * Result of validating a RULES.md file.
 */
export interface ValidationResult {
  valid: boolean;                // True if no errors (warnings OK)
  errors: ValidationIssue[];     // Validation errors
  warnings: ValidationIssue[];   // Validation warnings
  config?: GameConfig;           // Parsed config (if YAML valid)
  markdown?: string;             // Raw markdown content
  sections?: ExtractedSections;  // Extracted sections (if requested)
}
