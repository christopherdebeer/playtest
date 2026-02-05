# Playtest Mechanics System

> **Unified Documentation** for the playtest engine mechanics system.
>
> This document supersedes and consolidates:
> - [MECHANIC_EXTRACTION_ROADMAP.md](./MECHANIC_EXTRACTION_ROADMAP.md) (historical extraction progress)
> - [MECHANIC_EXPANSION_ROADMAP.md](./MECHANIC_EXPANSION_ROADMAP.md) (mechanic coverage targets)
>
> Those documents are retained for historical reference and contain detailed commit histories.

---

## Table of Contents

1. [Vision & Design Principles](#vision--design-principles)
2. [Architecture Overview](#architecture-overview)
3. [Hook Infrastructure](#hook-infrastructure)
4. [Mechanic-Defined Hooks](#mechanic-defined-hooks)
5. [Core Services](#core-services)
6. [Game.ts Agnosticism](#gamets-agnosticism)
7. [Mechanic Implementation Guide](#mechanic-implementation-guide)
8. [Current Status](#current-status)
9. [Roadmap](#roadmap)

---

## Vision & Design Principles

### Target State

A game engine where:
- **Core is mechanic-agnostic**: game.ts only handles primitives (state persistence, hook orchestration, turn cycling)
- **Mechanics are composable**: Enable/disable via config, combine freely without conflicts
- **Self-registering**: Mechanics declare their hooks, actions, config schemas, and requirements
- **Action exposure**: Available actions dynamically generated from enabled mechanics
- **Zero knowledge**: game.ts has no knowledge of specific mechanic configs, effect types, card types, or state properties

### Design Principles

1. **Strangler Fig Pattern** - Incremental extraction, no big-bang rewrites
2. **Backwards Compatible** - Existing games continue to work during migration
3. **Config-Driven** - Mechanics enabled via `engine_mechanics` in RULES.md
4. **Hook Composition** - Multiple mechanics can intercept the same event
5. **First Responder Wins** - For exclusive hooks (validation, execution), first non-null result wins
6. **Mechanic-Defined Hooks** - Any mechanic can define hook methods that its dependents implement
7. **Explicit Requirements** - Mechanics declare `requires` to express dependencies on other mechanics

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Game Config                             │
│  { engine_mechanics: { action_points, hand_management, ... } │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MechanicRegistry                          │
│  - Routes hooks to enabled mechanics                         │
│  - Validates dependencies/conflicts                          │
│  - Collects available actions from all mechanics             │
│  - Orchestrates state changes                                │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Core Services  │ │ Leaf Mechanics  │ │ Win Conditions  │
│  (Trunk)        │ │                 │ │                 │
│  - card-piles   │ │ - action-points │ │ - reach-state   │
│  - hand         │ │ - trading       │ │ - score-thresh  │
│  - resources    │ │ - push-luck     │ │ - empty-hand    │
│  - effects      │ │ - ladder-climb  │ │ - elimination   │
│  - board        │ │ - trick-taking  │ │ - timeout       │
│  - turns        │ │ - 45+ more      │ │ - race          │
│  - dice         │ │                 │ │ - sudden-death  │
│  - visibility   │ │                 │ │                 │
│  - social       │ │                 │ │                 │
│  - combat (NEW) │ │                 │ │                 │
│  - workers (NEW)│ │                 │ │                 │
│  - pass         │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     game.ts (Minimal)                        │
│  - State persistence (file I/O)                              │
│  - Hook orchestration (delegates to registry)                │
│  - Event logging                                             │
│  - Player/turn management                                    │
│  - Contest resolution                                        │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/mechanics/
├── types.ts              # All hook interfaces and contexts
├── registry.ts           # MechanicRegistry singleton, hook routing
├── index.ts              # Registration and exports
├── core/                 # Trunk mechanics (foundational services)
│   ├── card-piles.ts     # Deck/discard operations
│   ├── hand.ts           # Hand operations
│   ├── resources.ts      # Resource/currency tracking
│   ├── effects.ts        # Effect lifecycle
│   ├── board.ts          # Board state and movement
│   ├── turns.ts          # Turn/round management
│   ├── dice.ts           # Dice rolling system
│   ├── visibility.ts     # Information hiding
│   ├── social.ts         # Voting and negotiation
│   └── pass.ts           # Pass action handling (NEW)
├── win-conditions/       # Pluggable win conditions
│   ├── reach-state.ts
│   ├── score-threshold.ts
│   ├── empty-hand.ts
│   ├── elimination.ts
│   ├── timeout-winner.ts
│   ├── race.ts
│   └── sudden-death.ts
└── [50+ leaf mechanics]  # Individual mechanic implementations
```

---

## Hook Infrastructure

### Hook Categories

The system provides hooks across two tiers:

#### Global Hooks (engine-fired, all enabled mechanics receive)

##### Action & Validation (5 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `preValidateAction` | `(ctx, action) → ValidationResult \| null` | Block invalid actions before execution |
| `postExecuteAction` | `(ctx, action) → StateChanges \| null` | Apply post-action modifications |
| `onExecuteAction` | `(ctx) → ActionExecutionResult \| null` | **Full action ownership** |
| `getAvailableActions` | `(ctx) → AvailableAction[]` | Expose available actions dynamically |
| `describeAction` | `(action) → ActionDescription \| null` | Describe action for UI/agents |

##### Turn Lifecycle (3 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onTurnStart` | `(ctx, isNewRound) → StateChanges \| null` | Turn initialization |
| `onTurnEnd` | `(ctx, nextPlayerId, isRoundEnd) → StateChanges \| null` | Turn cleanup |
| `shouldAutoEndTurn` | `(ctx) → boolean` | Force turn advancement |

##### Player & Win (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initPlayerState` | `(ctx) → PlayerInitResult \| null` | Initialize player state |
| `onCheckWin` | `(ctx, trigger) → WinCheckResult \| null` | Check win conditions |

##### Visibility Query (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `getVisibleState` | `(ctx) → VisibleState \| null` | Filter state for viewer |
| `canSeeInfo` | `(ctx, infoType, targetPlayerId?) → boolean \| undefined` | Check visibility permissions |

##### Turn Order (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onDetermineTurnOrder` | `(ctx) → TurnOrderResult \| null` | Provide custom turn order |
| `onPassPriority` | `(ctx) → PassPriorityResult \| null` | Handle pass/claim priority |

##### Agnosticism (6 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initSharedState` | `(ctx) → SharedStateChanges \| null` | Initialize shared state |
| `getPlayerView` | `(ctx) → Record<string, unknown> \| null` | Contribute to player view |
| `applyEffect` | `(ctx, effect) → EffectResult \| null` | Handle effect application |
| `isPlayerBlocked` | `(ctx) → boolean \| null` | Determine if player is blocked |
| `canPlayerActNow` | `(ctx) → boolean \| null` | Allow out-of-turn actions (freeplay) |
| `getActionSchema` | `(action) → ActionSchema \| null` | Define action validation schema |

#### Mechanic-Defined Hooks (fired by core services, only dependents receive)

See [Mechanic-Defined Hooks](#mechanic-defined-hooks) section for details. Summary:

| Domain | Hooks | Fired by |
|--------|-------|----------|
| `cards` | `onBeforeCardDraw`, `onCardDrawn`, `onCardPlayed`, `onCardDiscarded`, `onBeforeCardPlay`, `onBeforeAddToHand`, `onAfterAddToHand`, `onAfterRemoveFromHand` | `card-piles.ts`, `hand.ts` |
| `resources` | `onBeforeResourceGain`, `onBeforeResourceSpend`, `onResourceGained`, `onResourceSpent` | `resources.ts` |
| `dice` | `onBeforeDiceRoll`, `onDiceRolled` | `dice.ts` |
| `board` | `onBeforePlayerMove`, `onPlayerMoved` | `board.ts` |
| `effects` | `onBeforeEffectAdd`, `onBeforeEffectRemove`, `onEffectAdded`, `onEffectRemoved` | `effects.ts` |
| `visibility` | `onBeforeReveal`, `onInfoRevealed` | `visibility.ts` |
| `social` | `onBeforeVote`, `onPlayerVoted`, `onVoteTally`, `onVoteCompleted` | `social.ts` |

### Mechanic Composition

```typescript
interface MechanicHooks {
  slug: string;
  name: string;

  /** Mechanics this one requires */
  requires?: string[];

  /** Mechanics this one conflicts with */
  conflicts?: string[];

  /** Hook methods this mechanic defines for its dependents to implement */
  defines?: Record<string, HookDefinition>;

  /** Config schema for YAML validation */
  configSchema?: MechanicConfigSchema;

  // ... global hooks, plus any methods from required mechanics' defines
}
```

Registry validates at game init:
- Missing requirements → error
- Conflicting mechanics both enabled → error
- Invalid config → error

---

## Mechanic-Defined Hooks

### Problem: Monolithic Hook Interface

The original design puts every possible hook on a single `MechanicHooks` interface.
Card hooks, dice hooks, combat hooks, voting hooks - all 38+ methods on one flat type.
Every mechanic receives every hook, even when irrelevant. The interface grows
with each domain and the registry needs hardcoded routing methods for each hook.

Core services (`card-piles.ts`, `hand.ts`) are utility modules that fire hooks,
but are not themselves mechanics. They can't be required as dependencies. Card-related
leaf mechanics implicitly depend on card infrastructure without declaring it.

### Solution: Mechanic-Defined Abstract Hooks

Any mechanic can **define** hook methods that its dependents implement. The defining
mechanic fires these hooks through the registry, which routes only to dependents.

From the implementer's perspective, there is no syntactic difference between
implementing a global hook (`onTurnStart`) and a mechanic-defined hook
(`onCardDrawn`). Both are just methods that return `StateChanges | null`.

```
┌─────────────────────────────────────────────────────────────┐
│  Global Hooks (engine-fired, all enabled mechanics)          │
│  preValidateAction, onExecuteAction, onTurnStart, ...        │
└─────────────────────────────────────────────────────────────┘
         │
         │  mechanics can also define hooks for their dependents
         ▼
┌─────────────────────────────────────────────────────────────┐
│  cards mechanic (defines: onCardDrawn, onCardPlayed, ...)    │
│    → routes ONLY to mechanics with requires: ['cards']       │
│                                                              │
│  trick-taking mechanic (defines: onTrickWon, onTrickPlayed)  │
│    → routes ONLY to mechanics with requires: ['trick-taking']│
└─────────────────────────────────────────────────────────────┘
```

### How It Works

#### 1. A mechanic defines hooks

```typescript
export const cardsMechanic: MechanicHooks = {
  slug: 'cards',
  name: 'Cards Core',

  defines: {
    onCardDrawn: {
      description: 'After cards are drawn from deck',
      resolution: 'merge'
    },
    onCardPlayed: {
      description: 'After a card is played from hand',
      resolution: 'merge'
    },
    onBeforeCardDraw: {
      description: 'Before drawing. Return blocked:true to prevent.',
      resolution: 'blocking'
    },
  },

  onExecuteAction(ctx) {
    if (ctx.action.type === 'draw') {
      // Fire our defined hook → only our dependents receive it
      mechanicRegistry.fire('cards', 'onBeforeCardDraw', state, playerId, payload);

      // ... perform draw ...

      mechanicRegistry.fire('cards', 'onCardDrawn', state, playerId, payload);
      return { handled: true };
    }
  }
};
```

#### 2. Dependent mechanics implement them as methods

```typescript
import type { CardsHooks } from './core/cards.js';

export const cardMatchingMechanic: MechanicHooks & CardsHooks = {
  slug: 'card-matching',
  name: 'Card Matching (UNO-style)',
  requires: ['cards'],

  // Global hook - still works for cross-cutting validation
  preValidateAction(ctx, action) {
    if (action.type !== 'play_card') return null;
    // Validate color/value matching...
  },

  // Implements hook DEFINED by 'cards' mechanic.
  // Just a method. Identical feel to implementing onTurnStart.
  onCardPlayed(ctx, { card }) {
    if (card.type === 'wild') return null;
    const color = card.effect?.color;
    return color ? { sharedStateChanges: { currentColor: color } } : null;
  },

  onCardDrawn(ctx, { cards }) {
    // Track draws for forced-draw rule
    return { sharedStateChanges: { drewThisTurn: true } };
  }
};
```

#### 3. Leaf mechanics can also define hooks

This isn't limited to core mechanics. Any mechanic can define hooks:

```typescript
export const trickTakingMechanic: MechanicHooks & CardsHooks = {
  slug: 'trick-taking',
  requires: ['cards'],

  defines: {
    onTrickWon:    { description: 'After a trick is won', resolution: 'merge' },
    onTrickPlayed: { description: 'After a card played to trick', resolution: 'merge' },
  },

  onCardPlayed(ctx, { card }) {
    // Add card to current trick...
    if (trickComplete) {
      mechanicRegistry.fire('trick-taking', 'onTrickWon', ...);
    }
  },
};

// A mechanic building on trick-taking
export const mustFollowSuitMechanic: MechanicHooks = {
  slug: 'must-follow-suit',
  requires: ['trick-taking'],

  // Implements trick-taking's defined hook
  onTrickPlayed(ctx, { card, leadSuit }) {
    // Validate suit following...
  },
};
```

### Composition Tree

This creates a natural hierarchy through `requires`:

```
engine (global hooks: onTurnStart, preValidateAction, onCheckWin, ...)
  │
  ├── cards (defines: onCardDrawn, onCardPlayed, onCardDiscarded, ...)
  │     ├── card-matching (requires: cards)
  │     ├── hand-management (requires: cards)
  │     ├── deck-building (requires: cards)
  │     └── trick-taking (requires: cards; defines: onTrickWon, onTrickPlayed)
  │           ├── must-follow-suit (requires: trick-taking)
  │           └── trump-cards (requires: trick-taking)
  │
  ├── resources (defines: onResourceGained, onResourceSpent, onBeforeResourceGain, onBeforeResourceSpend)
  │     ├── catch-the-leader (requires: resources)
  │     ├── income (requires: resources)
  │     ├── automatic-resource-growth (requires: resources)
  │     ├── chaining (requires: resources)
  │     └── once-per-game-abilities (requires: resources)
  │
  ├── board (defines: onPlayerMoved, onBeforePlayerMove)
  │     ├── area-movement (requires: board)
  │     ├── board-state (requires: board)
  │     ├── grid-movement (requires: board)
  │     ├── movement-points (requires: board)
  │     ├── roll-spin-and-move (requires: dice, board)
  │     └── hidden-movement (requires: board, visibility)
  │
  ├── dice (defines: onDiceRolled, onBeforeDiceRoll)
  │     ├── dice-rolling (requires: dice)
  │     ├── different-dice-movement (requires: dice)
  │     ├── re-rolling-and-locking (requires: dice)
  │     ├── roll-spin-and-move (requires: dice, board)
  │     └── die-icon-resolution (requires: dice, resources)
  │
  ├── effects (defines: onEffectAdded, onEffectRemoved, onBeforeEffectAdd, onBeforeEffectRemove)
  │     ├── lose-a-turn (requires: effects)
  │     └── take-that (requires: cards, effects)
  │
  ├── visibility (defines: onInfoRevealed, onBeforeReveal)
  │     ├── hidden-roles (requires: visibility)
  │     ├── hidden-objectives (requires: visibility)
  │     ├── hidden-victory-points (requires: visibility)
  │     ├── hidden-movement (requires: board, visibility)
  │     ├── deduction (requires: visibility)
  │     ├── roles-asymmetric-info (requires: hidden-roles, visibility)
  │     └── traitor-game (requires: hidden-roles, visibility)
  │
  └── social (defines: onVoteCompleted, onPlayerVoted, onBeforeVote, onVoteTally)
        ├── voting (requires: social)
        ├── negotiation (requires: social)
        ├── communication-limits (requires: social)
        ├── player-judge (requires: social)
        └── bribery (requires: social)
```

### HookDefinition

```typescript
interface HookDefinition {
  /** Human-readable description */
  description: string;
  /** How results from multiple implementers are combined */
  resolution?: 'merge' | 'first' | 'blocking';
}
```

Resolution strategies:
- **`merge`** (default) - Collect and merge StateChanges from all implementers
- **`first`** - First non-null response wins (like onExecuteAction)
- **`blocking`** - Short-circuit if any implementer returns `{ blocked: true }`

### Registry fire() Method

```typescript
class MechanicRegistry {
  fire(
    definerSlug: string,
    hookName: string,
    state: GameState,
    playerId: string,
    payload?: unknown
  ): StateChanges | null {
    const definer = this.mechanics.get(definerSlug);
    const resolution = definer?.defines?.[hookName]?.resolution ?? 'merge';

    // Route ONLY to enabled mechanics that require the definer
    const dependents = this.getEnabledMechanics(state.config)
      .filter(m => m.requires?.includes(definerSlug));

    // ... invoke hookName method on each dependent, merge per resolution
  }
}
```

### Type Safety

Defining mechanics export typed interfaces for their hooks:

```typescript
// Exported by cards mechanic
export interface CardsHooks {
  onCardDrawn?(ctx: HookContext, payload: CardDrawnPayload): StateChanges | null;
  onCardPlayed?(ctx: HookContext, payload: CardPlayedPayload): StateChanges | null;
  onCardDiscarded?(ctx: HookContext, payload: CardDiscardedPayload): StateChanges | null;
  onBeforeCardDraw?(ctx: HookContext, payload: BeforeDrawPayload): DrawHookResult | null;
  onBeforeCardPlay?(ctx: HookContext, payload: BeforeCardPlayPayload): { blocked?: boolean; blockReason?: string } | null;
  onBeforeAddToHand?(ctx: HookContext, payload: BeforeAddToHandPayload): { blocked?: boolean; cards?: Card[] } | null;
  onAfterAddToHand?(ctx: HookContext, payload: CardsAddedToHandPayload): StateChanges | null;
  onAfterRemoveFromHand?(ctx: HookContext, payload: CardsRemovedFromHandPayload): StateChanges | null;
}
```

Dependents opt into type checking via intersection:

```typescript
const myMechanic: MechanicHooks & CardsHooks = { ... };
// TypeScript verifies onCardDrawn signature matches CardsHooks
```

### Strangler Fig Migration

The migration followed a phased approach to incrementally move from monolithic global hooks to mechanic-defined hooks:

1. **Phase 1** ✅: Add `defines`, `requires`, `fire()` infrastructure
2. **Phase 2** ✅: Core services fire BOTH global hooks AND mechanic-defined hooks (dual-fire)
3. **Phase 3** ✅: Leaf mechanics migrate from global to mechanic-defined hooks (one at a time)
4. **Phase 4** ✅: Remove deprecated global domain hooks — `MechanicHooks` slimmed to global-only hooks, ~400 lines of routing methods removed from registry, core services fire only mechanic-defined hooks

### Current State

`MechanicHooks` now contains only engine-level global hooks:

```typescript
interface MechanicHooks {
  slug: string;
  name: string;
  requires?: string[];
  defines?: Record<string, HookDefinition>;

  // ~20 global hooks (engine-fired, all enabled mechanics)
  preValidateAction?(...): ValidationResult | null;
  onExecuteAction?(...): ActionExecutionResult | null;
  postExecuteAction?(...): StateChanges | null;
  onTurnStart?(...): StateChanges | null;
  onTurnEnd?(...): StateChanges | null;
  shouldAutoEndTurn?(...): boolean;
  onCheckWin?(...): WinCheckResult | null;
  initSharedState?(...): SharedStateInitResult | null;
  initPlayerState?(...): PlayerInitResult | null;
  getAvailableActions?(...): AvailableAction[];
  describeAction?(...): ActionDescription | null;
  getPlayerView?(...): Record<string, unknown> | null;
  isPlayerBlocked?(...): boolean | null;
  canPlayerActNow?(...): boolean | null;
  applyEffect?(...): EffectResult | null;
  getActionSchema?(...): ActionSchema | null;
  getVisibleState?(...): VisibleState | null;
  canSeeInfo?(...): boolean | undefined;
  onDetermineTurnOrder?(...): TurnOrderResult | null;
  onPassPriority?(...): PassPriorityResult | null;

  // Domain hooks live on defining mechanics, implemented via [key: string]
}
```

Each domain's routing is a `fire()` call in the core service,
replacing the hardcoded routing methods that were removed from the registry.

### Progress

- [x] Infrastructure: `defines` property on `MechanicHooks`, `fire()` on registry
- [x] Infrastructure: `requires` replaces `dependencies` (legacy compat retained)
- [x] Infrastructure: `HookDefinition` type with resolution strategies
- [x] `cards` core mechanic: defines `onCardDrawn`, `onCardPlayed`, `onCardDiscarded`, `onBeforeCardDraw`, `onBeforeCardPlay`
- [x] `cards` core mechanic: owns `play_card` action via `onExecuteAction` (removed from game.ts fallback)
- [x] `card-piles.ts` fires cards-defined hooks (`onBeforeCardDraw`, `onCardDrawn`, `onCardDiscarded`)
- [x] `card-piles.ts` `playCard()` function: removes from hand, discards, fires `onCardPlayed`
- [x] `card-matching`: migrated to `requires: ['cards']`, implements `onCardDrawn` and `onCardPlayed` (currentColor); legacy `postExecuteAction` removed
- [x] `hand-management`: migrated to `requires: ['cards']`, implements `onBeforeCardDraw`; legacy `onBeforeDraw` removed
- [x] `take-that`: migrated to `requires: ['cards']`, implements `onCardPlayed` (applies `block_turn`/`skip` effects to target)
- [x] `currentColor` tracking removed from core services (`addToDiscard`, `playCard`); now owned by `card-matching.onCardPlayed`
- [x] All card leaf mechanics declare `requires: ['cards']`:
  - `deck-building`, `trick-taking`, `card-type-rules`, `multi-use-cards`, `place-card`, `set-collection`, `open-drafting`, `closed-drafting`, `ladder-climbing`, `placed-card-effects`, `take-that`
- [x] `resources` core mechanic: defines `onBeforeResourceGain`, `onBeforeResourceSpend`, `onResourceGained`, `onResourceSpent`
- [x] `resources.ts` fires resources-defined hooks (`onBeforeResourceGain`, `onBeforeResourceSpend`, `onResourceGained`, `onResourceSpent`)
- [x] `catch-the-leader`: migrated to `requires: ['resources']`, implements `onBeforeResourceGain` (leader income reduction); legacy `onBeforeResourceChange` removed

- [x] `trick-taking` and `ladder-climbing` fire `onCardPlayed` after removing cards from hand (target: 'trick' / 'ladder')
- [x] Resource leaf mechanics declare `requires: ['resources']`:
  - `catch-the-leader`, `income`, `automatic-resource-growth`, `chaining`, `once-per-game-abilities`, `multi-use-cards`, `deck-building`, `die-icon-resolution`, `point-to-point-movement`, `auction-english`, `auction-sealed-bid`, `auction-once-around`, `turn-order-auction`, `kill-steal`
- [x] All resource-mutating mechanics refactored to use resource service (`addResource`/`spendResource`/`setResource`) for proper hook support:
  - `income` → `addResource()` (enables catch-the-leader income reduction)
  - `automatic-resource-growth` → `setResource()` (enables hooks on growth/decay)
  - `auction-once-around` → `spendResource()` (deducts winning bid)
  - `auction-sealed-bid` → `spendResource()` (deducts winning bid)
  - `turn-order-auction` → `spendResource()` (deducts all bids; added `requires: ['resources']`)
  - `die-icon-resolution` → `addResource()` (gains from icon effects)
  - `point-to-point-movement` → `spendResource()` (route resource costs)
  - `multi-use-cards` → `addResource()`/`spendResource()` (card use effects + currency)
  - `kill-steal` → `addResource()` (bounty distribution; added `requires: ['resources']`)
  - `events` → `addResource()`/`spendResource()` (event resource effects)
- [x] `dice` core mechanic: defines `onBeforeDiceRoll`, `onDiceRolled`
- [x] `dice.ts` fires dice-defined hooks (`onBeforeDiceRoll`, `onDiceRolled`)
- [x] Dice leaf mechanics declare `requires: ['dice']`:
  - `dice-rolling`, `different-dice-movement`, `re-rolling-and-locking`, `roll-spin-and-move`, `die-icon-resolution`
- [x] `board` core mechanic: defines `onPlayerMoved`, `onBeforePlayerMove`
- [x] `board.ts` fires board-defined hooks (`onBeforePlayerMove`, `onPlayerMoved`)
- [x] Board leaf mechanics declare `requires: ['board']`:
  - `area-movement`, `board-state`, `grid-movement`, `movement-points`, `roll-spin-and-move`, `hidden-movement`
- [x] `effects` core mechanic: defines `onEffectAdded`, `onEffectRemoved`, `onBeforeEffectAdd`, `onBeforeEffectRemove`
- [x] `effects.ts` fires effects-defined hooks (`onBeforeEffectAdd`, `onBeforeEffectRemove`, `onEffectAdded`, `onEffectRemoved`)
- [x] Effects leaf mechanics declare `requires: ['effects']`:
  - `lose-a-turn`, `take-that`
- [x] `visibility` core mechanic: defines `onInfoRevealed`, `onBeforeReveal`
- [x] `visibility.ts` fires visibility-defined hooks (`onBeforeReveal`, `onInfoRevealed`) in `revealInfo()`
- [x] Visibility leaf mechanics declare `requires: ['visibility']`:
  - `hidden-roles`, `hidden-objectives`, `hidden-victory-points`, `hidden-movement`, `deduction`, `roles-asymmetric-info`, `traitor-game`
- [x] `social` core mechanic: defines `onVoteCompleted`, `onPlayerVoted`, `onBeforeVote`, `onVoteTally`
- [x] `social.ts` fires social-defined hooks (`onBeforeVote`, `onPlayerVoted`, `onVoteTally`, `onVoteCompleted`) in `castVote()`
- [x] Social leaf mechanics declare `requires: ['social']`:
  - `voting`, `negotiation`, `communication-limits`, `player-judge`, `bribery`
- [x] Generic `applyEffect` removed from cards `onExecuteAction`; card effects now handled by `onCardPlayed` responders:
  - `placed-card-effects`: `probability_boost`, `probability_penalty`, `force_discard`
  - `take-that`: `block_turn`, `skip`
  - `card-matching`: `currentColor`

**Phase 3: Leaf mechanics migrated from global to mechanic-defined hooks:**

- [x] Missing `requires` added: `push-your-luck` → `['cards']`, `zone-of-control` → `['board']`, `memory` → `['visibility']`, `race` → `['board']`
- [x] **Dice domain** (`onBeforeRoll`/`onAfterRoll` → `onBeforeDiceRoll`/`onDiceRolled`):
  - `dice-rolling`: `onBeforeRoll` → `onBeforeDiceRoll`, `onAfterRoll` → `onDiceRolled`
  - `die-icon-resolution`: `onAfterRoll` → `onDiceRolled`
  - `roll-spin-and-move`: `onAfterRoll` → `onDiceRolled`
  - `different-dice-movement`: `onAfterRoll` → `onDiceRolled`
- [x] **Board domain** (`onBeforeMove`/`onAfterMove` → `onBeforePlayerMove`/`onPlayerMoved`):
  - `zone-of-control`: `onBeforeMove` → `onBeforePlayerMove`, `onAfterMove` → `onPlayerMoved`
  - `hidden-movement`: `onAfterMove` → `onPlayerMoved`
  - `race` (win condition): `onAfterMove` → `onPlayerMoved`
- [x] **Visibility domain** (`onReveal` → `onInfoRevealed`):
  - `hidden-roles`: `onReveal` → `onInfoRevealed`
  - `memory`: `onReveal` → `onInfoRevealed`
  - `hidden-movement`: `onReveal` → `onInfoRevealed`
- [x] **Social domain** (`onVoteCast` → `onBeforeVote`/`onPlayerVoted`):
  - `bribery`: `onVoteCast` split into `onBeforeVote` (blocking check) + `onPlayerVoted` (obligation fulfillment)
  - `bribery`: resource mutation refactored to use `spendResource()`/`addResource()`
  - `voting`: no-op `onVoteCast` removed (was always returning null)

**Phase 4: Global domain hooks deprecated and removed:**

- [x] Added cards-defined hand hooks: `onBeforeAddToHand`, `onAfterAddToHand`, `onAfterRemoveFromHand`
- [x] Migrated `hand-management` to cards-defined `onBeforeAddToHand` (hand limit enforcement)
- [x] Migrated `push-your-luck` to cards-defined `onAfterAddToHand` (bust detection)
- [x] `hand.ts` fires cards-defined hooks only (no global hook calls)
- [x] Removed 18 deprecated domain hooks from `MechanicHooks` interface
- [x] Removed ~400 lines of deprecated routing methods from registry (onBeforeDraw, onAfterDraw, onDiscard, onBeforeAddToHand, onAfterAddToHand, onAfterRemoveFromHand, onBeforeResourceChange, onAfterResourceChange, onBeforeAddEffect, onAfterAddEffect, onBeforeRemoveEffect, onEffectExpired, onBeforeMove, onAfterMove, onReveal, onBeforeRoll, onAfterRoll, onVoteCast)
- [x] Removed global hook calls from all core services (card-piles, hand, resources, effects, board, dice, visibility, social)
- [x] Cleaned up unused type imports in registry

**Post-Phase 4 cleanup:**

- [x] Added `onBeforeEffectRemove` to effects-defined hooks; `removeEffect()` now fires blocking pre-removal hook and `onEffectRemoved` after removal
- [x] Migrated `onVoteTally` from dead global hook to social-defined hook (`first` resolution); `voting.ts` implements custom tally logic; `social.ts` fires it before falling back to internal tally
- [x] Removed `VoteTallyContext`, `VoteTallyResult` from types.ts and `onVoteTally` routing method from registry

**Hooks that remain global (by design):**
- `canSeeInfo` — query hook, not event; polled by visibility service across all mechanics
- `getVisibleState` — state filter hook; each mechanic redacts its own fields
- `onDetermineTurnOrder`, `onPassPriority` — turn order hooks, engine-level concerns

---

## Core Mechanics

Each domain has a **mechanic** (registered, defines hooks) and an **API** (exported functions that fire those hooks). Together they form the core mechanic for that domain.

```
core/
├── cards.ts              # Cards mechanic (defines hooks, handles play_card)
├── card-piles.ts         # Cards API: drawFromDeck, addToDiscard, playCard
├── hand.ts               # Cards API: addToHand, removeFromHand, findInHand
├── resources-mechanic.ts # Resources mechanic (defines hooks)
├── resources.ts          # Resources API: addResource, spendResource, setResource
├── dice-mechanic.ts      # Dice mechanic (defines hooks)
├── dice.ts               # Dice API: rollDice, rollD6, rollWithAdvantage
├── board-mechanic.ts     # Board mechanic (defines hooks)
├── board.ts              # Board API: setBoardState, getValidMoveTargets
├── effects-mechanic.ts   # Effects mechanic (defines hooks)
├── effects.ts            # Effects API: addEffect, removeEffect, isBlocked
├── visibility-mechanic.ts# Visibility mechanic (defines hooks)
├── visibility.ts         # Visibility API: revealInfo, canPlayerSeeInfo
├── social-mechanic.ts    # Social mechanic (defines hooks)
├── social.ts             # Social API: startVoting, castVote, completeVoting
├── turns.ts              # Turns API: setTurnOrder, shuffleTurnOrder (no mechanic)
├── pass.ts               # Pass mechanic (handles pass action via onExecuteAction)
└── index.ts              # Re-exports
```

### Cards (`cards.ts` + `card-piles.ts` + `hand.ts`)

**Mechanic** (`cards.ts`): Defines 8 hooks, handles `play_card` action via `onExecuteAction`

**API** (`card-piles.ts`):
- `drawFromDeck(state, count, playerId?)` — Fires `onBeforeCardDraw`/`onCardDrawn`
- `addToDiscard(state, cards, playerId?)` — Fires `onCardDiscarded`
- `playCard(state, playerId, cardName, playContext?)` — Removes from hand, discards, fires `onCardPlayed`
- `peekDiscard`, `hasCardsAvailable`, `getDeckSize`, `getDiscardSize`

**API** (`hand.ts`):
- `addToHand(state, playerId, cards)` — Fires `onBeforeAddToHand`/`onAfterAddToHand`
- `removeFromHandByIndex/ByName` — Fires `onAfterRemoveFromHand`
- `removeCardsFromHand` — Batched operations
- `findInHand`, `getHandSize`, `getHand`

### Resources (`resources-mechanic.ts` + `resources.ts`)

**Mechanic**: Defines 4 hooks (`onBeforeResourceGain`, `onBeforeResourceSpend`, `onResourceGained`, `onResourceSpent`)

**API**:
- `addResource(state, playerId, resource, amount)` — Fires `onBeforeResourceGain`/`onResourceGained`
- `spendResource(state, playerId, resource, amount)` — Fires `onBeforeResourceSpend`/`onResourceSpent`
- `setResource(state, playerId, resource, amount)` — Fires appropriate hooks based on delta direction
- `getResource`, `hasResource`, `getAllResources`, `getResourceNames`

### Effects (`effects-mechanic.ts` + `effects.ts`)

**Mechanic**: Defines 4 hooks (`onBeforeEffectAdd`, `onBeforeEffectRemove`, `onEffectAdded`, `onEffectRemoved`)

**API**:
- `addEffect(state, playerId, effect)` — Fires `onBeforeEffectAdd`/`onEffectAdded`
- `removeEffect(state, playerId, effectType)` — Fires `onBeforeEffectRemove`/`onEffectRemoved`
- `decrementEffectDurations(state, playerId)` — Fires `onEffectRemoved` for expired effects
- `hasEffect`, `getEffect`, `getEffects`, `getEffectsByType`, `getEffectValue`, `isBlocked`, `clearEffects`

### Board (`board-mechanic.ts` + `board.ts`)

**Mechanic**: Defines 2 hooks (`onBeforePlayerMove`, `onPlayerMoved`)

**API**:
- `setBoardState(state, playerId, newState)` — Fires `onBeforePlayerMove`/`onPlayerMoved`
- `getBoardState`, `getValidMoveTargets`, `getValidMoveTargetsForPlayer`, `isValidMove`
- `getEdge`, `getMoveProbability`, `getPlayersAtState`, `hasBoard`

### Dice (`dice-mechanic.ts` + `dice.ts`)

**Mechanic**: Defines 2 hooks (`onBeforeDiceRoll`, `onDiceRolled`)

**API**:
- `rollDice(state, playerId, options)` — Fires `onBeforeDiceRoll`/`onDiceRolled`
- `rollSingleDie`, `rollD6`, `rollForMovement`, `rollCheck`
- `rollWithAdvantage`, `rollWithDisadvantage`, `rollExploding`, `countSuccesses`
- `parseDiceNotation`, `rollFromNotation`

### Visibility (`visibility-mechanic.ts` + `visibility.ts`)

**Mechanic**: Defines 2 hooks (`onBeforeReveal`, `onInfoRevealed`)

**API**:
- `getVisibleStateForPlayer(state, viewerId)` — Applies `getVisibleState` filters from all mechanics
- `revealInfo(state, revealingPlayerId, targetInfo, toPlayerIds)` — Fires `onBeforeReveal`/`onInfoRevealed`
- `canPlayerSeeInfo(state, viewerId, infoType, targetId)` — Polls `canSeeInfo` from all mechanics

### Social (`social-mechanic.ts` + `social.ts`)

**Mechanic**: Defines 4 hooks (`onBeforeVote`, `onPlayerVoted`, `onVoteTally`, `onVoteCompleted`)

**API**:
- `startVoting(state, topic, voters, config)` — Initialize voting session
- `castVote(state, voteId, playerId, choice)` — Fires `onBeforeVote`/`onPlayerVoted`/`onVoteTally`/`onVoteCompleted`
- `getVotingResult`, `isVotingComplete`, `completeVoting`

### Turns (`turns.ts`)

Pure utility — no mechanic registration, no hooks fired.

- `setTurnOrder`, `shuffleTurnOrder`, `reverseTurnOrder`
- `movePlayerInOrder`, `removeFromTurnOrder`, `addToTurnOrder`
- `applyDynamicTurnOrder`, `sortTurnOrderByProperty`
- `createSnakeDraftOrder`

### Pass (`pass.ts`)

Mechanic only — handles the pass action via `onExecuteAction`:
- Calls `onPassPriority` for turn order mechanics
- Handles victory declarations via `pendingVictoryClaim`
- Returns `advanceTurn: true` by default

---

## Game.ts Agnosticism

### Problem: Hardcoded Mechanic Knowledge

game.ts currently contains direct references to specific mechanics, violating the agnostic core principle:

#### Direct Config Checks (~25 locations)
```typescript
// CURRENT (game.ts knows about mechanics)
if (config.engine_mechanics?.open_drafting && deck.length > 0) {
  shared.draftDisplay = deck.splice(0, config.engine_mechanics.open_drafting.display_size);
}
```

#### Hardcoded Player Properties
| Property | Mechanic |
|----------|----------|
| `player.score` | push-your-luck, set-collection |
| `player.actionPoints` | action-points |
| `player.resources` | resources |
| `player.rollAccumulator` | push-your-luck |
| `player.powerId` | variable-player-powers |

#### Hardcoded Shared Properties
| Property | Mechanic |
|----------|----------|
| `shared.topCard`, `shared.currentColor` | card-matching (UNO) |
| `shared.draftDisplay` | open-drafting |
| `shared.pendingTrades` | trading |
| `shared.currentBid`, `shared.highBidder` | auction |
| `shared.placedCards`, `shared.placedLocations` | board placement |

#### Hardcoded Effect Types
```typescript
// CURRENT (game.ts knows effect types)
const isBlocked = player.effects.some(e =>
  e.type === 'block_turn' || e.type === 'block' || e.type === 'skip'
);
```

#### Hardcoded Card Types
```typescript
// CURRENT (game.ts knows card types)
if (card.type === 'wild' && declaredColor) {
  state.shared.currentColor = declaredColor;
}
```

### Solution: New Agnosticism Hooks

#### 1. `initSharedState` - Mechanic-Owned Initialization

```typescript
// BEFORE (game.ts)
if (config.engine_mechanics?.open_drafting) {
  shared.draftDisplay = deck.splice(0, displaySize);
}

// AFTER (open-drafting.ts)
initSharedState(ctx: SharedInitContext): SharedStateChanges | null {
  if (!isMechanicEnabled(ctx.config, 'open-drafting')) return null;
  const displaySize = ctx.config.engine_mechanics?.open_drafting?.display_size ?? 5;
  return { draftDisplay: ctx.deck.splice(0, displaySize) };
}

// game.ts - agnostic
const sharedInit = mechanicRegistry.initSharedState(state);
Object.assign(state.shared, sharedInit);
```

#### 2. `getPlayerView` - Mechanic-Contributed Views

```typescript
// BEFORE (game.ts)
if (state.config.engine_mechanics?.push_your_luck) {
  result.rollAccumulator = player.rollAccumulator ?? 0;
}

// AFTER (push-your-luck.ts)
getPlayerView(ctx: HookContext): Record<string, unknown> | null {
  if (!isMechanicEnabled(ctx.config, 'push-your-luck')) return null;
  return {
    rollAccumulator: ctx.player.rollAccumulator ?? 0,
    rollCount: ctx.player.rollCount ?? 0
  };
}

// game.ts - agnostic
const baseView = { hand, state, effects };
const mechanicView = mechanicRegistry.getPlayerView(state, playerId);
return { ...baseView, ...mechanicView };
```

#### 3. `applyEffect` - Mechanic-Owned Effect Handling

```typescript
// BEFORE (game.ts)
switch (effect.type) {
  case 'draw_on_enter': { /* hardcoded */ }
  case 'probability_boost': { /* hardcoded */ }
}

// AFTER (location-effects.ts)
applyEffect(ctx: EffectContext): EffectResult | null {
  if (ctx.effect.type !== 'draw_on_enter') return null;
  const cards = drawFromDeck(ctx.state, ctx.effect.count, ctx.playerId);
  return { handled: true, stateChanges: { drewCards: cards } };
}

// game.ts - agnostic
const result = mechanicRegistry.applyEffect(state, playerId, effect);
if (!result?.handled) {
  log.warn(`Unknown effect type: ${effect.type}`);
}
```

#### 4. `isPlayerBlocked` - Mechanic-Defined Blocking

```typescript
// BEFORE (game.ts)
const isBlocked = player.effects.some(e =>
  ['block_turn', 'block', 'skip'].includes(e.type)
);

// AFTER (lose-a-turn.ts)
isPlayerBlocked(ctx: HookContext): boolean | null {
  const blockingTypes = ['block_turn', 'block', 'skip', 'lose_turn'];
  return ctx.player.effects.some(e => blockingTypes.includes(e.type)) || null;
}

// game.ts - agnostic
const isBlocked = mechanicRegistry.isPlayerBlocked(state, playerId);
```

#### 5. `getActionSchema` - Mechanic-Defined Validation

```typescript
// BEFORE (game.ts)
case 'play_card':
  if (!action.card) errors.push('Missing card');
  if (isWild && !action.declaredColor) errors.push('Missing color');

// AFTER (card-matching.ts)
getActionSchema(action: GameAction): ActionSchema | null {
  if (action.type !== 'play_card') return null;
  return {
    required: ['card'],
    conditional: [
      { if: { cardType: 'wild' }, require: ['declaredColor'] }
    ]
  };
}

// game.ts - agnostic
const schemas = mechanicRegistry.getActionSchemas(action);
const errors = validateAgainstSchemas(action, schemas);
```

### Migration Priority

| Priority | Refactoring | Lines Removed | Complexity |
|----------|-------------|---------------|------------|
| **1** | Pass mechanic extraction | ~50 | Low |
| **2** | Effect type handling | ~100 | Medium |
| **3** | Player view building | ~50 | Low |
| **4** | Shared state initialization | ~40 | Low |
| **5** | Card type handling | ~80 | Medium |
| **6** | Block check | ~10 | Low |
| **7** | Action schema validation | ~150 | High |

### Target: game.ts Responsibilities

After full extraction, game.ts should **only** contain:

1. **State Persistence** - Read/write game.json
2. **Hook Orchestration** - Call registry methods, apply results
3. **Turn Management** - Advance turn, check round boundaries
4. **Event Logging** - Append to log file
5. **Player Registration** - Agent ID mapping
6. **Contest Resolution** - Dispute handling (could also be extracted)

**No direct references to**:
- Specific mechanic config keys
- Specific effect types
- Specific card types
- Mechanic-specific player/shared properties

---

## Mechanic Implementation Guide

### Standard Mechanic Structure

```typescript
import { MechanicHooks, HookContext, ActionExecutionContext, ... } from './types.js';
import { isMechanicEnabled } from './types.js';

interface MyMechanicConfig {
  some_option: number;
  another_option?: boolean;
}

export const myMechanic: MechanicHooks = {
  slug: 'my-mechanic',
  name: 'My Mechanic',

  // Optional: declare relationships
  requires: ['action-points'],    // Requires action-points
  conflicts: ['other-mechanic'],  // Cannot use with other-mechanic

  // Optional: config schema for validation
  configSchema: {
    type: 'object',
    description: 'Description for docs',
    properties: {
      some_option: { type: 'number', required: true },
      another_option: { type: 'boolean', default: false }
    }
  },

  // 1. Validation Hook - block invalid actions
  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    if (!isMechanicEnabled(ctx.config, 'my-mechanic')) return null;
    if (action.type !== 'my_action') return null;

    // Validate
    if (!someCondition) {
      return { valid: false, error: 'Reason' };
    }
    return null;  // Valid, continue to other mechanics
  },

  // 2. Execution Hook - own the action
  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    if (!isMechanicEnabled(ctx.config, 'my-mechanic')) return null;
    if (ctx.action.type !== 'my_action') return null;

    // Execute action, compute state changes
    return {
      handled: true,
      stateChanges: { /* ... */ },
      advanceTurn: true,
      logMessage: 'Action executed'
    };
  },

  // 3. Action Exposure - tell players what's available
  getAvailableActions(ctx: HookContext): AvailableAction[] {
    if (!isMechanicEnabled(ctx.config, 'my-mechanic')) return [];

    return [{
      action: { type: 'my_action', /* params */ },
      priority: 50,
      category: 'my-mechanic'
    }];
  },

  // 4. Description - for UI/agents
  describeAction(action: GameAction): ActionDescription | null {
    if (action.type !== 'my_action') return null;
    return {
      type: 'my_action',
      label: 'Do My Action',
      description: 'Explanation of what this does',
      examples: ['my_action param:value']
    };
  }
};
```

### Registration

```typescript
// src/mechanics/index.ts
import { myMechanic } from './my-mechanic.js';

mechanicRegistry.register(myMechanic);
```

### YAML Configuration

```yaml
# games/my-game/RULES.md
---
engine_mechanics:
  my_mechanic:
    some_option: 5
    another_option: true
---
```

---

## Testing Infrastructure

### Overview

The mechanics system is validated through a multi-layer test strategy using [Vitest](https://vitest.dev/).
Tests run against the **real engine** (no mocks) with optional seeded randomness for deterministic replay.

```
tests/
├── harness.ts                  # GameTestHarness — integration test utilities
├── markovs-chains.test.ts      # Game integration tests (lifecycle, movement, win)
├── core-services.test.ts       # Layer 1: Core service unit tests
├── registry.test.ts            # Layer 2: Registry hook routing tests
└── cross-game.test.ts          # Layer 3: Cross-game integration tests
```

### Test Harness (`tests/harness.ts`)

The `GameTestHarness` wraps the real engine with a validate-then-execute pipeline:

```typescript
const h = GameTestHarness.create('markovs-chains', 2, { seed: 42 });
h.start();
h.step('player-1', { type: 'draw', count: 1 });
h.step('player-1', { type: 'pass' });
expect(h.state.round).toBe(1);
h.cleanup();  // restores Math.random, removes state files
```

Key features:
- **Seedable PRNG**: Mulberry32 replaces `Math.random` before `initGame()` for deterministic deck shuffles, dice rolls, etc.
- **Validate-then-execute**: `step()` calls `validateActionSchema()` → `validateAction()` → `executeAction()`, matching the CLI pipeline
- **Log replay**: `fromLog()` parses JSONL game logs into replayable test steps
- **State snapshots**: Each step records `{ round, turnNumber, currentPlayer, status }` for assertions
- **File cleanup**: Removes state directories and log files created during tests

### Test Strategy: 3 Layers

#### Layer 1: Core Service Unit Tests

Game-agnostic tests that exercise core service functions directly with hand-crafted state objects.
No game config needed — just minimal `GameState` with the fields each service requires.

| Service | Key Functions Under Test |
|---------|------------------------|
| Resources | `addResource`, `spendResource`, `setResource`, `hasResource` |
| Effects | `addEffect`, `removeEffect`, `decrementEffectDurations`, `isBlocked` |
| Hand | `addToHand`, `removeFromHandByName`, `findInHand`, `getHandSize` |
| Dice | `rollDice`, `rollD6`, `rollWithAdvantage`, `rollFromNotation` |
| Social | `startVoting`, `castVote`, `getVotingResult`, `completeVoting` |
| Card Piles | `drawFromDeck`, `addToDiscard`, `playCard` |

These tests verify:
- Basic CRUD operations on player/shared state
- Blocking hooks (`onBeforeResourceGain` returning `blocked: true`)
- Edge cases (spend more than available, empty deck, expired effects)
- Hook firing (mechanic-defined hooks are called during operations)

#### Layer 2: Registry Hook Routing Tests

Tests that verify `fire()` resolution strategies and dependency-based routing:

- **`merge`**: Multiple dependents' StateChanges are accumulated
- **`first`**: First non-null response wins, others skipped
- **`blocking`**: Short-circuit when any dependent returns `{ blocked: true }`
- **Dependency filtering**: Only mechanics with `requires: [definer]` receive hooks
- **Disabled mechanic filtering**: Mechanics not in game config are skipped

#### Layer 3: Cross-Game Integration Tests

Uses real game configs to exercise different mechanic combinations:

| Game | Mechanics Exercised |
|------|-------------------|
| markovs-chains | board-state, cards, probability-movement, victory-declaration |
| treasure-hunters | resources, action-points, income, set-collection |
| engine-masters | auto-resource-growth, chaining, deck-building |
| fortune-seekers | dice, push-your-luck, re-rolling-and-locking |

### Bug Fixes Uncovered by Tests

The testing infrastructure uncovered several engine bugs that were fixed:

1. **`executeAction` missing pre-validation** (`src/core/game.ts`):
   The engine's `executeAction` accepted any action without running mechanic validation hooks.
   Fixed by calling `mechanicRegistry.preValidateAction()` before execution.

2. **Board-state edge connectivity** (`src/mechanics/board-state.ts`):
   The board-state mechanic validated that move targets were valid state names but didn't check
   edge connectivity — players could teleport to any named state. Fixed by adding
   `getValidMoveTargets()` check in `preValidateAction`.

3. **Board-state `advanceTurn` conflict** (`src/mechanics/board-state.ts`):
   The mechanic returned `advanceTurn: true`, conflicting with games using the "action + pass"
   model where the pass mechanic handles turn advancement. Fixed to `advanceTurn: false`.

4. **Board-state mechanic not enabled** (`games/markovs-chains/RULES.md`):
   The mechanic existed but wasn't in the game's `engine_mechanics` config. Added
   `board_state: true`. Mechanics are enabled via game config, not globally.

---

## Current Status

### Implemented Mechanics: 59 of 192 (31%)

| Category | Implemented | Total | Coverage |
|----------|-------------|-------|----------|
| Action | 1 | 7 | 14% |
| Auction | 1 | 12 | 8% |
| Building | 1 | 11 | 9% |
| Cards | 10 | 15 | 67% |
| Conflict | 8 | 8 | 100% |
| Cooperative | 0 | 10 | 0% |
| Dice | 5 | 6 | 83% |
| Economic | 2 | 9 | 22% |
| Ending | 1 | 4 | 25% |
| Information | 5 | 8 | 63% |
| Movement | 4 | 22 | 18% |
| Other | 10 | 40 | 25% |
| Physical | 0 | 8 | 0% |
| Social | 3 | 11 | 27% |
| Turn Order | 4 | 8 | 50% |
| Victory | 7 | 5 | 140% |
| Worker Placement | 1 | 7 | 14% |

### Hook Infrastructure Status

| Phase | Hooks | Status |
|-------|-------|--------|
| Phase 1-5 | 33 core hooks | Complete |
| Agnosticism | 6 new hooks | **Complete** |
| Phase 6 | Combat (6 hooks) | **Complete** |
| Phase 7 | Workers (5 hooks) | **Complete** |
| Phase 8 | Auctions (5 hooks) | Planned |

**Agnosticism Hooks (Complete):**
- `initSharedState` - Used by open-drafting, card-matching, freeplay, deck-building, trading, auction-english, trick-taking, worker-placement
- `getPlayerView` - Used by push-your-luck, action-points, variable-player-powers, worker-placement
- `isPlayerBlocked` - Used by lose-a-turn
- `canPlayerActNow` - Used by freeplay (enables parallel play)
- `applyEffect` - Used by location-effects, placed-card-effects
- `getActionSchema` - Defined, ready for mechanic implementations

### Outstanding Hook Implementations

Mechanics that should implement each agnosticism hook to fully decouple game.ts:

#### `initSharedState` - Mechanics with shared state
| Mechanic | Shared Property | Status |
|----------|-----------------|--------|
| open-drafting | `draftDisplay` | **Done** |
| deck-building | `supply` | **Done** |
| trading | `pendingTrades` | **Done** |
| auction-english | `currentBid`, `highBidder`, `auctionActive` | **Done** |
| trick-taking | `currentTrick`, `leadSuit`, `trickLeader` | **Done** |
| worker-placement | `workerSpaces` | **Done** |

#### `getPlayerView` - Mechanics with player-specific view data
| Mechanic | Properties | Status |
|----------|------------|--------|
| push-your-luck | `rollAccumulator`, `rollCount` | **Done** |
| action-points | `actionPoints`, `actionPointsUsed`, `actionPointsPerTurn` | **Done** |
| variable-player-powers | `powerId`, `powerName` | **Done** |
| worker-placement | `workersAvailable`, `workersPlaced`, `workerPlacements` | **Done** |
| resources (if mechanic) | resource amounts | Pending |

#### `applyEffect` - Effect type handlers
| Mechanic | Effect Types | Status |
|----------|--------------|--------|
| location-effects | `draw_on_enter`, `heal_on_enter`, `damage_on_enter` | **Done** |
| placed-card-effects | `probability_boost`, `probability_penalty`, `force_discard` | **Done** |
| lose-a-turn | `block_turn`, `block`, `skip` | Uses `isPlayerBlocked` |
| take-that | `block_turn`, `skip` | **Done** (via `onCardPlayed` + `addEffect`) |

#### `getActionSchema` - Action validation schemas
| Mechanic | Actions | Status |
|----------|---------|--------|
| All action-owning | Their respective actions | Pending |

### game.ts Agnosticism Status

| Area | Current State | Target | Status |
|------|---------------|--------|--------|
| Pass action | ~~Hardcoded~~ | `core/pass.ts` mechanic | **Done** |
| Block check | ~~Hardcoded types~~ | `isPlayerBlocked` hook | **Done** |
| Shared init | ~~Mechanic-aware~~ | `initSharedState` hook | **Done** (8 mechanics) |
| Player view | ~~Mechanic-aware~~ | `getPlayerView` hook | **Done** (4 mechanics) |
| Effect types | ~~Hardcoded switch~~ | `applyEffect` hook | **Done** (location-effects, placed-card-effects) |
| Action schema | Hardcoded cases | `getActionSchema` hook | Pending |
| Card types | Hardcoded (wild, etc) | Mechanic-owned | **Done** (cards core) |
| Play card action | ~~Fallback switch~~ | Cards mechanic `onExecuteAction` | **Done** |

#### Completed Migrations:
- **Pass mechanic**: `src/mechanics/core/pass.ts` handles pass via `onExecuteAction`
- **Play card action**: `src/mechanics/core/cards.ts` handles play_card via `onExecuteAction`
- **Block check**: `lose-a-turn` implements `isPlayerBlocked` hook
- **Shared state init**: 8 mechanics implement `initSharedState` (open-drafting, deck-building, trading, auction-english, trick-taking, card-matching, freeplay, worker-placement)
- **Player view**: 4 mechanics implement `getPlayerView` (push-your-luck, action-points, variable-player-powers, worker-placement)
- **Effect types**: `location-effects` and `placed-card-effects` implement `applyEffect` hook
- **Combat hooks**: `src/mechanics/core/combat-mechanic.ts` defines 6 combat hooks (onBeforeCombat, onCombatStarted, onAttackModifier, onDefenseModifier, onCombatResolved, onCasualtiesApplied)
- **Worker hooks**: `src/mechanics/core/workers-mechanic.ts` defines 5 worker hooks (onBeforeWorkerPlace, onWorkerPlaced, onBeforeWorkerRetrieve, onWorkersRetrieved, onSpaceActivated)

---

## Roadmap

### Completed: Pass Mechanic & Core Agnosticism

1. **Created `src/mechanics/core/pass.ts`** ✅
   - Handles pass action via `onExecuteAction`
   - Calls `onPassPriority` for turn order mechanics
   - Handles victory declarations via `pendingVictoryClaim`
   - Exposes pass via `getAvailableActions`

2. **Added Agnosticism Hooks to types.ts** ✅
   - `initSharedState` - Mechanics initialize own shared state
   - `getPlayerView` - Mechanics contribute to player view
   - `applyEffect` - Mechanics handle own effect types
   - `isPlayerBlocked` - Mechanics define blocking
   - `getActionSchema` - Mechanics define action validation

3. **Added Registry Methods** ✅
   - All new hooks routed through `MechanicRegistry`

4. **Migrated game.ts** ✅
   - Removed hardcoded pass handling (uses mechanic)
   - Uses `isPlayerBlocked` hook (lose-a-turn implements)
   - Uses `initSharedState` hook (open-drafting implements)
   - Uses `getPlayerView` hook (push-your-luck implements)

### Next: Remaining Agnosticism Migrations

| Migration | Mechanic(s) to Update | game.ts Lines to Remove | Status |
|-----------|----------------------|------------------------|--------|
| Effect type handling | location-effects, placed-card-effects | ~100 | **Done** |
| Card type handling (wild) | card-matching (new) | ~80 | **Done** |
| Action schema validation | All action-owning mechanics | ~150 | Pending |
| Deck-building supply init | deck-building | ~5 | **Done** |
| Trading shared state | trading | ~10 | **Done** |
| Auction shared state | auction-english | ~10 | **Done** |

#### Card Matching Mechanic Design

**Purpose**: Extract UNO-style card matching logic from game.ts to a dedicated mechanic.

**Why new mechanic (not extending card-type-rules)**:
- `card-type-rules` handles "can this type be played at all" (items can't be played)
- `card-matching` handles "does this card match current play state" (color/value matching)
- Different games need different matching rules (UNO vs Hearts vs Bridge)

**Hooks**:
| Hook | Purpose |
|------|---------|
| `initSharedState` | Initialize `currentColor` from top card |
| `preValidateAction` | Validate card matches color/value OR is wild with declaredColor |
| `onCardPlayed` | Update `currentColor` after play (cards-defined hook) |
| `onCardDrawn` | Track draws for forced-draw rule (cards-defined hook) |

**Configuration**:
```yaml
engine_mechanics:
  card_matching:
    colors: [Red, Blue, Green, Yellow]
    value_matching: true
    action_matching: true
```

### Short-Term: Remaining Phase 1-5 Mechanics

All Phase 1-5 mechanics have been implemented. Remaining work is hook completeness:

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | **Complete** | `closed-drafting`, `auction-sealed-bid`, `auction-once-around` all registered |
| Phase 2 | **Complete** | `different-dice-movement`, `die-icon-resolution` registered |
| Phase 3 | **Complete** | `turn-order-auction`, `turn-order-claim`, `turn-order-time-track`, `turn-order-role` registered |
| Phase 4 | **Complete** | `deduction`, `memory`, `targeted-clues`, `roles-asymmetric-info` registered |
| Phase 5 | **Complete** | `player-judge`, `i-cut-you-choose`, `bribery` registered |

### Medium-Term: Phase 6-8

| Phase | Focus | New Hooks | Status |
|-------|-------|-----------|--------|
| Phase 6 | Combat System | 6 combat hooks | **Done** - Core mechanic + 8 leaf mechanics |
| Phase 7 | Worker Placement | 5 worker hooks | **Done** - Core mechanic + worker-placement leaf |
| Phase 8 | Advanced Auctions | 5 auction hooks | Planned |

### Long-Term: Refactoring

| Refactoring | Impact |
|-------------|--------|
| Movement System Unification | 4 mechanics share patterns |
| Point Economy Extraction | action-points + movement-points |
| Win Condition Consolidation | 7 mechanics doing similar checks |
| Drafting Base Class | open + closed drafting |
| State Property Standardization | Position in 3+ properties |

---

## Experimental Mechanics

### Freeplay (`src/mechanics/freeplay.ts`)

**Status**: Experimental - Use with caution

The freeplay mechanic fundamentally changes the engine's turn model to enable **parallel/continuous play** where players can act simultaneously without waiting for turn-based alternation.

#### Motivation

Traditional turn-based games create artificial bottlenecks where players must wait. For certain game types (races, real-time strategy adaptations, speed games), parallel play is more natural and engaging.

#### Key Behaviors

| Aspect | Traditional Model | Freeplay Model |
|--------|------------------|----------------|
| Turn ownership | One player at a time | Any player can act |
| Action gating | `currentPlayer` check | Player state check |
| Round advancement | After all turns complete | After N total actions |
| Interactions | Immediate resolution | Create pending state |

#### Configuration

```yaml
engine_mechanics:
  freeplay:
    # Total actions across all players before round advances
    actions_per_round: 8
    # Seconds to wait for interaction responses
    interaction_timeout: 30
    # Actions requiring synchronization
    interaction_actions:
      - trade_offer
      - trade_respond
      - attack
```

#### Hooks Used

- `initSharedState`: Initialize action tracking and pending interactions
- `preValidateAction`: Override turn validation to allow any player
- `canPlayerActNow`: **NEW** - Allows `waitForTurn` to return immediately for any player
- `onTurnEnd`: Track action counts, manage round advancement
- `getAvailableActions`: Always allow actions regardless of turn

#### Shared State

```typescript
interface FreeplaySharedState {
  actionsThisRound: Record<string, number>;  // Per-player action counts
  totalActionsThisRound: number;              // Total across all players
  pendingInteractions: PendingInteraction[];  // Awaiting response
  playersAwaitingResponse: string[];          // Blocked by pending
}
```

#### Test Game

See `games/parallel-race/RULES.md` - A race game designed for freeplay testing.

#### Challenges & Future Work

1. **Race conditions**: Multiple players accessing shared resources (deck) simultaneously
2. **Action queuing**: Need atomic operations or locking for critical sections
3. **GM synchronization**: Gamemaster needs to handle multiple pending actions
4. **State consistency**: Ensuring state remains consistent with parallel mutations

#### Engine Integration Status

| Change | Status | Implementation |
|--------|--------|----------------|
| Turn bypass in `waitForTurn` | **Done** | `canPlayerActNow` hook in `turns.ts` |
| Action validation bypass | **Done** | `preValidateAction` returns valid for any player |
| Action queue for overlaps | Pending | Need atomic operations |
| Lock mechanism for shared resources | Pending | Race condition handling |
| Parallel GM handling | Pending | Multiple pending actions |

**Completed**: The `canPlayerActNow` hook allows `waitForTurn()` to return `your_turn` for any player when freeplay is enabled, enabling parallel play without blocking.

---

## Related Documents

- [MECHANIC_EXTRACTION_ROADMAP.md](./MECHANIC_EXTRACTION_ROADMAP.md) - Historical extraction progress (superseded)
- [MECHANIC_EXPANSION_ROADMAP.md](./MECHANIC_EXPANSION_ROADMAP.md) - Coverage targets (superseded)
- [ENGINE_ARCHITECTURE.md](./ENGINE_ARCHITECTURE.md) - Overall engine architecture
- [EXTENSION-GUIDE.md](./EXTENSION-GUIDE.md) - How to add new mechanics
