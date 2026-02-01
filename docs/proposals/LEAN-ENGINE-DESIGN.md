# Lean Engine Design Proposal

## Executive Summary

Redesign the playtest engine around a minimal, stable core with pluggable mechanics. The goal is to optimize for:
1. **Agent ergonomics** - Predictable, simple API surface
2. **Game-agnostic extensibility** - New games require zero engine code
3. **Pluggable mechanics** - Add new mechanics without touching core
4. **Type-driven completeness** - TypeScript enforces mechanic contracts

---

## Part 1: Current Architecture Analysis

### Pain Points

| Issue | Impact | Example |
|-------|--------|---------|
| Monolithic `game.ts` | Hard to understand, modify, test | 2000+ lines, all actions interleaved |
| Hardcoded action types | Adding actions requires multiple file changes | `PlayCardAction \| MoveAction \| ...` union |
| Ad-hoc mechanics | Inconsistent implementation patterns | `if (config.probability_movement)` scattered |
| No mechanic contract | Unclear what "adding a mechanic" means | Each mechanic implemented differently |
| String-based effects | No compile-time safety | `effect.type: "probability_boost"` |
| Mixed validation | Business logic tangled with schema checks | `validateAction()` does everything |

### What Works Well

- RULES.md as single source of truth
- Agent separation (GM/Player roles)
- File-based persistence (simple, portable)
- Information hiding via player views
- Contest system for disputes
- Event logging for replay/analysis

---

## Part 2: Core Design Principles

### Principle 1: Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  (index.ts - command routing, arg parsing, output format)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Engine Core                             │
│  - State machine (turn advancement, game lifecycle)          │
│  - Persistence (load/save)                                   │
│  - Information hiding (player views)                         │
│  - Event logging                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mechanic Registry                          │
│  - Registers mechanics by slug                               │
│  - Composes state extensions                                 │
│  - Routes actions to handlers                                │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Cards Mech    │  │ Probability Mech│  │   Grid Mech     │
│ - hand mgmt     │  │ - edge weights  │  │ - positions     │
│ - draw/discard  │  │ - roll logic    │  │ - adjacency     │
│ - play actions  │  │ - boost effects │  │ - move actions  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Principle 2: Type-Driven Contracts

```typescript
// A mechanic MUST provide all of these - TypeScript enforces at compile time
interface Mechanic<
  TConfig extends object,      // What RULES.md provides
  TStateExt extends object,    // What this mechanic adds to GameState
  TPlayerExt extends object,   // What this mechanic adds to PlayerState
  TActions extends Action,     // Action types this mechanic handles
  TEffects extends Effect      // Effect types this mechanic provides
> {
  readonly slug: string;
  readonly version: string;

  // Configuration
  parseConfig(raw: unknown): Result<TConfig, ValidationError[]>;
  validateConfig(config: TConfig, otherMechanics: string[]): ValidationError[];

  // State initialization
  initGameState(config: TConfig): TStateExt;
  initPlayerState(config: TConfig, playerId: string): TPlayerExt;

  // Actions
  getActionTypes(): TActions['type'][];
  validateAction(ctx: ActionContext, action: TActions): ValidationResult;
  executeAction(ctx: ActionContext, action: TActions): ExecutionResult<TStateExt & TPlayerExt>;
  getAvailableActions(ctx: ActionContext): ActionExample<TActions>[];

  // Effects
  getEffectTypes(): TEffects['type'][];
  applyEffect(ctx: EffectContext, effect: TEffects): EffectResult;

  // Player view filtering (information hiding)
  filterForPlayer(state: TStateExt, playerId: string): Partial<TStateExt>;
  filterPlayerState(state: TPlayerExt, isOwner: boolean): Partial<TPlayerExt>;

  // Event logging
  getLogEventTypes(): string[];
}
```

### Principle 3: Composition Over Configuration

Instead of:
```typescript
// Current: flags enable ad-hoc behavior
interface EngineMechanics {
  probability_movement?: boolean;
  card_boosts?: boolean;
  action_points?: ActionPointsConfig;
  // ... 20+ optional fields
}
```

Use:
```typescript
// New: explicit mechanic composition
interface GameConfig {
  mechanics: MechanicConfig[];  // e.g., ["cards", "probability", "grid"]
}

// Each mechanic declares its own config shape
type MechanicConfig =
  | { slug: "cards"; config: CardsConfig }
  | { slug: "probability"; config: ProbabilityConfig }
  | { slug: "grid"; config: GridConfig }
  // Extensible via module augmentation
```

---

## Part 3: Core Primitives

### 3.1 Minimal GameState

```typescript
// Core state - always present, mechanics extend this
interface CoreGameState {
  // Identity
  readonly gameId: string;
  readonly gameName: string;
  readonly instanceId: string;

  // Lifecycle
  status: GameStatus;

  // Turn tracking (simple, mechanics can override)
  round: number;
  turnNumber: number;
  currentPlayer: string | null;
  turnOrder: string[];

  // Players - core info only
  players: Record<string, CorePlayerState>;

  // Configuration
  config: ParsedGameConfig;

  // Mechanics add their state here via composition
  mechanicState: Record<string, unknown>;

  // Logging
  log: LogHandle;

  // Adjudication (separate concern, could be its own "mechanic")
  adjudication: AdjudicationState;
}

interface CorePlayerState {
  playerId: string;
  agentId?: string;
  persona?: string;
  isActive: boolean;  // false if resigned/eliminated

  // Mechanics add their player state here
  mechanicState: Record<string, unknown>;
}

type GameStatus =
  | 'initializing'
  | 'waiting_for_players'
  | 'in_progress'
  | 'pending_analysis'
  | 'completed'
  | 'cancelled';
```

### 3.2 Action System

```typescript
// Base action - all actions extend this
interface BaseAction {
  readonly type: string;
}

// Result types for validation and execution
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

interface ExecutionResult<TState = unknown> {
  success: boolean;
  stateChanges: Partial<TState>;
  events: LogEvent[];
  nextAction?: 'advance_turn' | 'same_player' | 'game_over';
  message?: string;
}

// Context passed to mechanics for action handling
interface ActionContext {
  state: Readonly<CoreGameState>;
  playerId: string;
  timestamp: string;
  getMechanicState<T>(slug: string): T | undefined;
  getPlayerMechanicState<T>(slug: string, playerId: string): T | undefined;
}
```

### 3.3 Effect System

```typescript
// Base effect - all effects extend this
interface BaseEffect {
  readonly type: string;
  readonly source?: string;  // What created this effect
  readonly duration?: EffectDuration;
}

type EffectDuration =
  | { type: 'instant' }
  | { type: 'turns'; count: number }
  | { type: 'rounds'; count: number }
  | { type: 'until_condition'; condition: string }
  | { type: 'permanent' };

// Context for applying effects
interface EffectContext {
  state: CoreGameState;
  target: string;  // Player or entity ID
  source: string;  // Player who triggered effect
  timestamp: string;
}
```

---

## Part 4: Mechanic Interface (Full Contract)

### 4.1 Complete Mechanic Type

```typescript
/**
 * A Mechanic is a self-contained game system that can be composed with others.
 *
 * TypeScript enforces that all required methods are implemented.
 * The registry validates compatibility between mechanics at runtime.
 */
interface Mechanic<
  TSlug extends string = string,
  TConfig extends object = object,
  TGameState extends object = object,
  TPlayerState extends object = object,
  TActions extends BaseAction = BaseAction,
  TEffects extends BaseEffect = BaseEffect
> {
  // ═══════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════

  /** Unique identifier for this mechanic */
  readonly slug: TSlug;

  /** Semver version for compatibility checking */
  readonly version: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Dependencies on other mechanics (e.g., "cards" depends on nothing, "card-effects" depends on "cards") */
  readonly dependencies: readonly string[];

  /** Mechanics this conflicts with (cannot be used together) */
  readonly conflicts: readonly string[];

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parse raw config from RULES.md YAML into typed config.
   * Called during game initialization.
   */
  parseConfig(raw: unknown): Result<TConfig, ParseError[]>;

  /**
   * Validate config against other enabled mechanics.
   * Called after all mechanics parse their configs.
   */
  validateConfig(
    config: TConfig,
    registry: MechanicRegistry
  ): ValidationError[];

  /**
   * JSON Schema for config (used for RULES.md validation)
   */
  getConfigSchema(): JsonSchema;

  // ═══════════════════════════════════════════════════════════════
  // STATE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize game-level state for this mechanic.
   * Called once when game is created.
   */
  initGameState(config: TConfig, playerCount: number): TGameState;

  /**
   * Initialize player-level state for this mechanic.
   * Called once per player when they register.
   */
  initPlayerState(config: TConfig, playerId: string): TPlayerState;

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * List of action types this mechanic handles.
   * Used for routing and documentation.
   */
  getActionTypes(): readonly TActions['type'][];

  /**
   * Validate an action before execution.
   * Should be pure (no side effects).
   */
  validateAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ValidationResult;

  /**
   * Execute a validated action.
   * Returns state changes to apply (immutable pattern).
   */
  executeAction(
    ctx: ActionContext<TGameState, TPlayerState>,
    action: TActions
  ): ExecutionResult<TGameState, TPlayerState>;

  /**
   * Get available actions for a player.
   * Used by CLI to show options to agents.
   */
  getAvailableActions(
    ctx: ActionContext<TGameState, TPlayerState>
  ): ActionAvailability<TActions>[];

  // ═══════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * List of effect types this mechanic provides.
   */
  getEffectTypes(): readonly TEffects['type'][];

  /**
   * Apply an effect to the game state.
   */
  applyEffect(
    ctx: EffectContext<TGameState, TPlayerState>,
    effect: TEffects
  ): EffectResult<TGameState, TPlayerState>;

  /**
   * Called at turn/round boundaries to tick effect durations.
   */
  tickEffects(
    ctx: EffectContext<TGameState, TPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<TGameState, TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // INFORMATION HIDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Filter game-level state for a player's view.
   * Hide information the player shouldn't see (e.g., deck contents).
   */
  filterGameStateForPlayer(
    state: TGameState,
    playerId: string
  ): Partial<TGameState>;

  /**
   * Filter player state for viewing.
   * @param isOwner - true if viewer is the player themselves
   */
  filterPlayerStateForViewer(
    state: TPlayerState,
    viewerId: string,
    ownerId: string
  ): Partial<TPlayerState>;

  // ═══════════════════════════════════════════════════════════════
  // WIN CONDITIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if this mechanic's win condition is met.
   * Return null if this mechanic doesn't define a win condition.
   */
  checkWinCondition(
    ctx: ActionContext<TGameState, TPlayerState>
  ): WinConditionResult | null;

  // ═══════════════════════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Event types this mechanic may emit.
   */
  getLogEventTypes(): readonly string[];
}
```

### 4.2 Supporting Types

```typescript
// Result type for operations that can fail
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; errors: E };

// Action availability for agent display
interface ActionAvailability<T extends BaseAction> {
  type: T['type'];
  enabled: boolean;
  reason?: string;  // Why disabled, if applicable
  examples: T[];    // Concrete examples the agent can use
}

// Win condition result
interface WinConditionResult {
  winner: string | null;  // null for draw
  reason: string;
  isTie?: boolean;
  tiedPlayers?: string[];
}

// Effect application result
interface EffectResult<TGameState, TPlayerState> {
  gameStateChanges: Partial<TGameState>;
  playerStateChanges: Record<string, Partial<TPlayerState>>;
  events: LogEvent[];
  expiredEffects: string[];  // Effect IDs that expired
}
```

---

## Part 5: Mechanic Registry

### 5.1 Registry Interface

```typescript
interface MechanicRegistry {
  // Registration
  register<M extends Mechanic>(mechanic: M): void;

  // Lookup
  get<TSlug extends string>(slug: TSlug): Mechanic | undefined;
  getRequired<TSlug extends string>(slug: TSlug): Mechanic;
  has(slug: string): boolean;

  // Composition
  compose(slugs: string[]): ComposedMechanics;

  // Validation
  validateCompatibility(slugs: string[]): ValidationError[];
  resolveDependencies(slugs: string[]): string[];  // Topological sort

  // Introspection
  listAll(): MechanicInfo[];
  listByCategory(category: string): MechanicInfo[];
  getActionRouter(): ActionRouter;
  getEffectRouter(): EffectRouter;
}

interface ComposedMechanics {
  // Aggregated from all composed mechanics
  readonly actionTypes: readonly string[];
  readonly effectTypes: readonly string[];
  readonly logEventTypes: readonly string[];

  // Routers for handling
  routeAction(action: BaseAction): Mechanic;
  routeEffect(effect: BaseEffect): Mechanic;

  // Composed initialization
  initGameState(configs: Record<string, unknown>, playerCount: number): Record<string, unknown>;
  initPlayerState(configs: Record<string, unknown>, playerId: string): Record<string, unknown>;

  // Composed views
  getPlayerView(state: CoreGameState, playerId: string): PlayerView;
}
```

### 5.2 Auto-Discovery

```typescript
// Mechanics are auto-discovered from the filesystem
// File: engine/src/mechanics/cards/index.ts
export const cardsMechanic: Mechanic<...> = { ... };

// File: engine/src/mechanics/index.ts (generated or manual)
export const allMechanics = [
  cardsMechanic,
  probabilityMechanic,
  gridMechanic,
  // ...
];

// Registry loads all at startup
const registry = new MechanicRegistry();
allMechanics.forEach(m => registry.register(m));
```

---

## Part 6: Example Mechanic Implementation

### 6.1 Cards Mechanic

```typescript
// File: engine/src/mechanics/cards/types.ts

export interface CardsConfig {
  deck: DeckDefinition[];
  startingCards: number;
  handLimit?: number;
  handLimitPolicy?: 'cannot_draw' | 'discard_choice' | 'discard_oldest';
  reshuffleDiscard?: boolean;
}

export interface CardsGameState {
  deck: Card[];
  discardPile: Card[];
}

export interface CardsPlayerState {
  hand: Card[];
}

export type CardsAction =
  | { type: 'draw'; count?: number }
  | { type: 'play_card'; cardName: string; target?: string }
  | { type: 'discard'; cardName: string };

export type CardsEffect =
  | { type: 'draw_cards'; count: number }
  | { type: 'force_discard'; count: number }
  | { type: 'steal_card'; from: string };
```

```typescript
// File: engine/src/mechanics/cards/index.ts

import { Mechanic, ActionContext, ... } from '../../core/types';
import { CardsConfig, CardsGameState, CardsPlayerState, CardsAction, CardsEffect } from './types';
import { buildDeck, shuffleDeck } from './deck';

export const cardsMechanic: Mechanic<
  'cards',
  CardsConfig,
  CardsGameState,
  CardsPlayerState,
  CardsAction,
  CardsEffect
> = {
  slug: 'cards',
  version: '1.0.0',
  displayName: 'Cards',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw) {
    // Zod or similar for parsing
    const result = CardsConfigSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, errors: result.error.errors };
    }
    return { ok: true, value: result.data };
  },

  validateConfig(config, registry) {
    const errors: ValidationError[] = [];

    if (config.deck.length === 0) {
      errors.push({ path: 'deck', message: 'Deck cannot be empty' });
    }

    const totalCards = config.deck.reduce((sum, d) => sum + d.count, 0);
    if (config.startingCards * registry.getPlayerCount() > totalCards) {
      errors.push({
        path: 'startingCards',
        message: 'Not enough cards in deck for all players'
      });
    }

    return errors;
  },

  getConfigSchema() {
    return {
      type: 'object',
      required: ['deck', 'startingCards'],
      properties: {
        deck: { type: 'array', items: { $ref: '#/definitions/DeckEntry' } },
        startingCards: { type: 'number', minimum: 0 },
        handLimit: { type: 'number', minimum: 1 },
        handLimitPolicy: { enum: ['cannot_draw', 'discard_choice', 'discard_oldest'] },
        reshuffleDiscard: { type: 'boolean' }
      }
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config, playerCount) {
    const deck = buildDeck(config.deck);
    return {
      deck: shuffleDeck(deck),
      discardPile: []
    };
  },

  initPlayerState(config, playerId) {
    return {
      hand: []  // Cards dealt separately after all players registered
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes() {
    return ['draw', 'play_card', 'discard'] as const;
  },

  validateAction(ctx, action) {
    const gameState = ctx.getMechanicState<CardsGameState>('cards')!;
    const playerState = ctx.getPlayerMechanicState<CardsPlayerState>('cards', ctx.playerId)!;
    const config = ctx.getMechanicConfig<CardsConfig>('cards')!;

    switch (action.type) {
      case 'draw': {
        const count = action.count ?? 1;
        if (gameState.deck.length < count) {
          if (!config.reshuffleDiscard || gameState.discardPile.length === 0) {
            return { valid: false, errors: [{ message: 'Not enough cards in deck' }] };
          }
        }
        if (config.handLimit && config.handLimitPolicy === 'cannot_draw') {
          if (playerState.hand.length + count > config.handLimit) {
            return { valid: false, errors: [{ message: 'Would exceed hand limit' }] };
          }
        }
        return { valid: true, errors: [] };
      }

      case 'play_card': {
        const card = playerState.hand.find(c => c.name === action.cardName);
        if (!card) {
          return { valid: false, errors: [{ message: `Card "${action.cardName}" not in hand` }] };
        }
        // Check if card requires target and target is valid
        if (card.targetRequired && !action.target) {
          return { valid: false, errors: [{ message: 'Card requires a target' }] };
        }
        return { valid: true, errors: [] };
      }

      case 'discard': {
        const card = playerState.hand.find(c => c.name === action.cardName);
        if (!card) {
          return { valid: false, errors: [{ message: `Card "${action.cardName}" not in hand` }] };
        }
        return { valid: true, errors: [] };
      }
    }
  },

  executeAction(ctx, action) {
    const gameState = ctx.getMechanicState<CardsGameState>('cards')!;
    const playerState = ctx.getPlayerMechanicState<CardsPlayerState>('cards', ctx.playerId)!;

    switch (action.type) {
      case 'draw': {
        const count = action.count ?? 1;
        const drawn = gameState.deck.slice(0, count);
        return {
          success: true,
          stateChanges: {
            game: { deck: gameState.deck.slice(count) },
            players: {
              [ctx.playerId]: { hand: [...playerState.hand, ...drawn] }
            }
          },
          events: [{ event: 'cards_drawn', player: ctx.playerId, data: { count } }],
          nextAction: 'same_player'  // Drawing doesn't end turn
        };
      }

      case 'play_card': {
        const cardIndex = playerState.hand.findIndex(c => c.name === action.cardName);
        const card = playerState.hand[cardIndex];
        const newHand = [...playerState.hand];
        newHand.splice(cardIndex, 1);

        return {
          success: true,
          stateChanges: {
            game: { discardPile: [...gameState.discardPile, card] },
            players: {
              [ctx.playerId]: { hand: newHand }
            }
          },
          events: [{ event: 'card_played', player: ctx.playerId, data: { card: card.name, target: action.target } }],
          effects: card.effect ? [{ ...card.effect, source: ctx.playerId, target: action.target }] : [],
          nextAction: 'advance_turn'
        };
      }

      case 'discard': {
        const cardIndex = playerState.hand.findIndex(c => c.name === action.cardName);
        const card = playerState.hand[cardIndex];
        const newHand = [...playerState.hand];
        newHand.splice(cardIndex, 1);

        return {
          success: true,
          stateChanges: {
            game: { discardPile: [...gameState.discardPile, card] },
            players: {
              [ctx.playerId]: { hand: newHand }
            }
          },
          events: [{ event: 'card_discarded', player: ctx.playerId, data: { card: card.name } }],
          nextAction: 'same_player'
        };
      }
    }
  },

  getAvailableActions(ctx) {
    const gameState = ctx.getMechanicState<CardsGameState>('cards')!;
    const playerState = ctx.getPlayerMechanicState<CardsPlayerState>('cards', ctx.playerId)!;
    const config = ctx.getMechanicConfig<CardsConfig>('cards')!;

    const actions: ActionAvailability<CardsAction>[] = [];

    // Draw action
    const canDraw = gameState.deck.length > 0 ||
      (config.reshuffleDiscard && gameState.discardPile.length > 0);
    const handLimitBlocks = config.handLimit &&
      config.handLimitPolicy === 'cannot_draw' &&
      playerState.hand.length >= config.handLimit;

    actions.push({
      type: 'draw',
      enabled: canDraw && !handLimitBlocks,
      reason: !canDraw ? 'Deck is empty' : handLimitBlocks ? 'Hand limit reached' : undefined,
      examples: [{ type: 'draw' }, { type: 'draw', count: 2 }]
    });

    // Play card actions
    for (const card of playerState.hand) {
      actions.push({
        type: 'play_card',
        enabled: true,
        examples: [{ type: 'play_card', cardName: card.name }]
      });
    }

    // Discard actions
    for (const card of playerState.hand) {
      actions.push({
        type: 'discard',
        enabled: true,
        examples: [{ type: 'discard', cardName: card.name }]
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes() {
    return ['draw_cards', 'force_discard', 'steal_card'] as const;
  },

  applyEffect(ctx, effect) {
    switch (effect.type) {
      case 'draw_cards': {
        // Implementation
      }
      case 'force_discard': {
        // Implementation
      }
      case 'steal_card': {
        // Implementation
      }
    }
  },

  tickEffects(ctx, boundary) {
    // Cards mechanic has no duration-based effects
    return { gameStateChanges: {}, playerStateChanges: {}, events: [], expiredEffects: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(state, playerId) {
    return {
      deckCount: state.deck.length,  // Only count, not contents
      discardPile: state.discardPile  // Discard is public
    };
  },

  filterPlayerStateForViewer(state, viewerId, ownerId) {
    if (viewerId === ownerId) {
      return state;  // Full hand for owner
    }
    return {
      handCount: state.hand.length  // Only count for opponents
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(ctx) {
    // Cards mechanic doesn't define win conditions
    // Other mechanics (e.g., "card-shedding") would extend this
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes() {
    return ['cards_drawn', 'card_played', 'card_discarded', 'deck_reshuffled'] as const;
  }
};
```

---

## Part 7: Agent Ergonomics

### 7.1 Simplified CLI Interface

```bash
# Current (complex)
./playtest player:turn <instance> -p <playerId>
./playtest player:act <instance> -p <playerId> -a '{"type":"move","target":"B"}'

# New (agent-friendly)
./playtest turn <instance> <playerId>
# Returns structured JSON with:
# - status: "your_turn" | "waiting" | "game_over"
# - state: PlayerView
# - actions: [{ type, enabled, reason, examples }]

./playtest act <instance> <playerId> <action-json>
# Returns structured JSON with:
# - success: boolean
# - message: string
# - state: PlayerView (updated)
# - nextActions: (if still your turn)
```

### 7.2 Structured Action Discovery

Instead of agents parsing complex state, provide explicit action menus:

```json
{
  "status": "your_turn",
  "round": 3,
  "turn": 7,
  "state": { /* filtered player view */ },
  "actions": [
    {
      "type": "move",
      "enabled": true,
      "description": "Move to an adjacent state",
      "examples": [
        { "type": "move", "target": "A" },
        { "type": "move", "target": "B" }
      ],
      "schema": { /* JSON schema for this action */ }
    },
    {
      "type": "play_card",
      "enabled": true,
      "description": "Play a card from your hand",
      "examples": [
        { "type": "play_card", "cardName": "Catalyst" },
        { "type": "play_card", "cardName": "Momentum", "target": "player-2" }
      ]
    },
    {
      "type": "draw",
      "enabled": false,
      "reason": "Hand limit reached (max 7 cards)",
      "examples": []
    }
  ]
}
```

### 7.3 Clear Error Messages

```json
{
  "success": false,
  "error": {
    "code": "INVALID_ACTION",
    "message": "Cannot move to state 'Victory': not adjacent to current state 'A'",
    "details": {
      "currentState": "A",
      "requestedTarget": "Victory",
      "validTargets": ["Checkpoint-X", "Checkpoint-Y"]
    },
    "suggestion": "Try: { \"type\": \"move\", \"target\": \"Checkpoint-X\" }"
  }
}
```

---

## Part 8: Type-Driven Integration Completeness

### 8.1 The Problem

Currently, adding a new mechanic requires touching multiple files without compile-time guidance:
- Add types to `types.ts`
- Add config parsing to `rules.ts`
- Add validation to `game.ts`
- Add execution to `game.ts`
- Add action types to union
- Add effect types to enum
- Update CLI commands
- Hope you didn't forget anything

### 8.2 The Solution: Interface-Driven Development

With the Mechanic interface, TypeScript enforces completeness:

```typescript
// This won't compile until ALL methods are implemented
export const auctionMechanic: Mechanic<
  'auction',
  AuctionConfig,
  AuctionGameState,
  AuctionPlayerState,
  AuctionAction,
  AuctionEffect
> = {
  slug: 'auction',
  version: '1.0.0',
  // ... TypeScript errors until all 20+ methods are implemented
};
```

### 8.3 Compile-Time Guarantees

```typescript
// Type-level registry ensures no orphan actions
type RegisteredActionTypes =
  | CardsAction['type']
  | ProbabilityAction['type']
  | GridAction['type'];

// If someone adds an action type without registering the mechanic,
// the router will have a type error

function routeAction(action: BaseAction): Mechanic {
  // TypeScript knows exactly which types are valid
  switch (action.type) {
    case 'draw':
    case 'play_card':
    case 'discard':
      return cardsMechanic;
    case 'move':
    case 'roll':
      return probabilityMechanic;
    // ... exhaustive matching
  }
}
```

### 8.4 Module Augmentation for Extension

```typescript
// In a new mechanic file
declare module '../../core/types' {
  interface MechanicConfigMap {
    'my-mechanic': MyMechanicConfig;
  }

  interface ActionTypeMap {
    'my_action': MyAction;
  }

  interface EffectTypeMap {
    'my_effect': MyEffect;
  }
}

// Now the registry knows about the new types
```

---

## Part 9: Implementation Roadmap

### Phase 1: Core Foundation (Week 1-2)
- [ ] Define core types (`Mechanic`, `ActionContext`, etc.)
- [ ] Implement `MechanicRegistry`
- [ ] Create base `CoreGameState` and `CorePlayerState`
- [ ] Implement state persistence layer
- [ ] Set up mechanic auto-discovery

### Phase 2: First Mechanics (Week 2-3)
- [ ] Implement `cards` mechanic (most games need this)
- [ ] Implement `turns` mechanic (turn order management)
- [ ] Implement `probability` mechanic (movement/rolls)
- [ ] Create mechanic composition tests

### Phase 3: CLI Refactor (Week 3-4)
- [ ] Simplify command structure
- [ ] Implement structured JSON output
- [ ] Add action discovery endpoint
- [ ] Improve error messages

### Phase 4: Migration (Week 4-5)
- [ ] Migrate Markov's Chains to new engine
- [ ] Migrate UNO to new engine
- [ ] Validate existing tests pass
- [ ] Performance benchmarking

### Phase 5: Advanced Mechanics (Week 5+)
- [ ] Implement `grid` mechanic
- [ ] Implement `auction` mechanic
- [ ] Implement `resources` mechanic
- [ ] Document mechanic creation guide

---

## Part 10: Directory Structure

```
engine/
├── src/
│   ├── core/
│   │   ├── types.ts           # Core primitives
│   │   ├── state.ts           # State management
│   │   ├── persistence.ts     # File-based storage
│   │   ├── logging.ts         # Event logging
│   │   └── views.ts           # Player view generation
│   │
│   ├── mechanics/
│   │   ├── registry.ts        # MechanicRegistry implementation
│   │   ├── router.ts          # Action/effect routing
│   │   ├── types.ts           # Mechanic interface
│   │   │
│   │   ├── cards/
│   │   │   ├── index.ts       # cardsMechanic export
│   │   │   ├── types.ts       # CardsConfig, CardsAction, etc.
│   │   │   └── deck.ts        # Deck utilities
│   │   │
│   │   ├── probability/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── roll.ts
│   │   │
│   │   ├── grid/
│   │   │   └── ...
│   │   │
│   │   └── index.ts           # Auto-export all mechanics
│   │
│   ├── adjudication/
│   │   ├── contests.ts
│   │   ├── resignations.ts
│   │   └── victory.ts
│   │
│   ├── cli/
│   │   ├── index.ts           # Main entry point
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── turn.ts
│   │   │   ├── act.ts
│   │   │   └── ...
│   │   └── output.ts          # Structured JSON output
│   │
│   └── index.ts               # Public API
│
├── tests/
│   ├── mechanics/
│   │   ├── cards.test.ts
│   │   ├── probability.test.ts
│   │   └── ...
│   ├── integration/
│   │   └── markovs-chains.test.ts
│   └── ...
│
└── package.json
```

---

## Appendix A: Migration Strategy

### Backward Compatibility

1. **Keep existing CLI commands** working during transition
2. **Dual-mode engine** - detect old vs new game configs
3. **Gradual mechanic extraction** - pull out one mechanic at a time
4. **Feature flags** - `engine_version: 2` in RULES.md to opt-in

### Deprecation Path

```yaml
# RULES.md - Old format (deprecated)
engine_mechanics:
  probability_movement: true
  card_boosts: true

# RULES.md - New format
mechanics:
  - slug: cards
    config:
      deck: [...]
      startingCards: 5
  - slug: probability
    config:
      edgeWeights: [...]
```

---

## Appendix B: Design Decisions

| Decision | Rationale |
|----------|-----------|
| Mechanic as interface, not class | Enables tree-shaking, simpler testing |
| Immutable state changes | Predictable, easy to debug, enables undo |
| Result types over exceptions | Explicit error handling, better for agents |
| JSON Schema for validation | Self-documenting, can generate docs |
| Slug-based routing | Simple, extensible, no magic |
| Composition over inheritance | Avoids diamond problem, clearer contracts |
| File-based persistence | No infrastructure required, git-friendly |

---

## Appendix C: Open Questions

1. **Effect stacking**: How do multiple effects of the same type combine?
2. **Async mechanics**: Should mechanics support async operations (e.g., AI opponents)?
3. **Replay system**: Should we support full game replay from logs?
4. **Hot reload**: Can mechanics be updated without restarting games?
5. **Versioning**: How do we handle mechanic version upgrades mid-game?
