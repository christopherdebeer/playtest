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
│  - turns        │ │ - 135+ more     │ │ - race          │
│  - dice         │ │                 │ │ - sudden-death  │
│  - visibility   │ │                 │ │ - end-game-bon  │
│  - social       │ │                 │ │ - king-of-hill  │
│  - combat       │ │                 │ │ - finale-ending │
│  - workers      │ │                 │ │ - + 3 more      │
│  - auction      │ │                 │ │                 │
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
│   ├── auction-mechanic.ts # Auction core (defines hooks)
│   └── pass.ts           # Pass action handling
├── win-conditions/       # Pluggable win conditions (13)
│   ├── reach-state.ts
│   ├── score-threshold.ts
│   ├── empty-hand.ts
│   ├── elimination.ts
│   ├── timeout-winner.ts
│   ├── race.ts
│   ├── sudden-death.ts
│   ├── end-game-bonuses.ts
│   ├── king-of-the-hill.ts
│   ├── victory-points-as-resource.ts
│   ├── highest-lowest-scoring.ts
│   ├── finale-ending.ts
│   └── single-loser-game.ts
└── [138 leaf mechanics]  # Individual mechanic implementations
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

##### Agnosticism (7 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initSharedState` | `(ctx) → SharedStateChanges \| null` | Initialize shared state |
| `getPlayerView` | `(ctx) → Record<string, unknown> \| null` | Contribute to player view |
| `applyEffect` | `(ctx, effect) → EffectResult \| null` | Handle effect application |
| `isPlayerBlocked` | `(ctx) → boolean \| null` | Determine if player is blocked |
| `canPlayerActNow` | `(ctx) → boolean \| null` | Allow out-of-turn actions (freeplay) |
| `getActionSchema` | `(action) → ActionSchema \| null` | Define action validation schema |
| `reverseAction` | `(ctx, action) → boolean \| null` | Reverse a previously executed action (contest rollback) |

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
| `auction` | `onAuctionStart`, `onAuctionEnd`, `onBid`, `canBid`, `getMinimumBid` | `auction-mechanic.ts` |

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

  /** Return highlight stats for game cards/pages (build-time only, display-only) */
  getHighlight?(config: unknown): { label: string; value: string }[] | null;

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
  ├── social (defines: onVoteCompleted, onPlayerVoted, onBeforeVote, onVoteTally)
  │     ├── voting (requires: social)
  │     ├── negotiation (requires: social)
  │     ├── communication-limits (requires: social)
  │     ├── player-judge (requires: social)
  │     └── bribery (requires: social)
  │
  └── auction (defines: onAuctionStart, onAuctionEnd, onBid, canBid, getMinimumBid)
        ├── auction-english (requires: auction, resources)
        ├── auction-sealed-bid (requires: auction, resources)
        ├── auction-dutch (requires: auction, resources)
        ├── auction-once-around (requires: auction, resources)
        ├── auction-bidding (requires: auction)
        ├── auction-compensation (requires: auction)
        ├── auction-dutch-priority (requires: auction)
        ├── auction-fixed-placement (requires: auction)
        ├── auction-multiple-lot (requires: auction)
        ├── auction-turn-order-until-pass (requires: auction)
        └── turn-order-auction (requires: auction, resources)
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

### Current State

`MechanicHooks` now contains only engine-level global hooks:

```typescript
interface MechanicHooks {
  slug: string;
  name: string;
  requires?: string[];
  defines?: Record<string, HookDefinition>;

  // ~21 global hooks (engine-fired, all enabled mechanics)
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
  reverseAction?(...): boolean | null;
  getVisibleState?(...): VisibleState | null;
  canSeeInfo?(...): boolean | undefined;
  onDetermineTurnOrder?(...): TurnOrderResult | null;
  onPassPriority?(...): PassPriorityResult | null;

  // Build-time display (not a runtime hook)
  getHighlight?(config: unknown): { label: string; value: string }[] | null;

  // Domain hooks live on defining mechanics, implemented via [key: string]
}
```

Each domain's routing is a `fire()` call in the core service,
replacing the hardcoded routing methods that were removed from the registry.

### Migration Status: Complete

All 7 domain hook migrations finished (Phases 1-4):

- **Infrastructure**: `defines`/`requires`/`fire()` on registry, `HookDefinition` with resolution strategies
- **All 8 core domains** define and fire mechanic-defined hooks: cards (8 hooks), resources (4), dice (2), board (2), effects (4), visibility (2), social (4), auction (5)
- **All leaf mechanics** migrated from deprecated global domain hooks to mechanic-defined hooks via `requires`
- **18 deprecated domain hooks** removed from `MechanicHooks` interface
- **~400 lines** of deprecated routing methods removed from registry
- **All resource-mutating mechanics** use resource service (`addResource`/`spendResource`/`setResource`) for proper hook firing
- Card effects handled by `onCardPlayed` responders (placed-card-effects, take-that, card-matching), not generic `applyEffect`

**Hooks that remain global (by design):**
- `canSeeInfo` — query hook, polled by visibility service across all mechanics
- `getVisibleState` — state filter hook; each mechanic redacts its own fields
- `onDetermineTurnOrder`, `onPassPriority` — turn order hooks, engine-level concerns

---

## Core Mechanics

Each domain has a **mechanic** (registered, defines hooks) and an **API** (exported functions that fire those hooks). Together they form the core mechanic for that domain. Some core mechanics (like auction) define hooks only, with no API module.

```
core/
├── auction-mechanic.ts   # Auction mechanic (defines hooks only, no API)
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

**Mechanic** (`cards.ts`): Defines 8 hooks, fully owns `draw` action (schema, discovery, validation, execution) and `play_card` action (schema, discovery, validation, execution, reversal). Exports `drawCards()` utility for CLI.

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

### Auction (`auction-mechanic.ts`)

**Mechanic**: Defines 5 hooks (`onAuctionStart`, `onAuctionEnd`, `onBid`, `canBid`, `getMinimumBid`). Pure hook-defining mechanic — no API module, no game.ts changes. Auction leaf mechanics (11 total) declare `requires: ['auction']` and can implement these hooks for cross-mechanic coordination.

**No API**: Unlike cards/resources/dice, auction mechanics manage their own state independently. The core mechanic exists solely to define domain hooks that auction leaf mechanics can use for inter-mechanic communication (e.g., `canBid` for bid validation, `getMinimumBid` for minimum bid queries).

### Pass (`pass.ts`)

Mechanic only — handles the pass action via `onExecuteAction`:
- Calls `onPassPriority` for turn order mechanics
- Handles victory declarations via `pendingVictoryClaim`
- Returns `advanceTurn: true` by default

### Core Services as Mechanics

The vision is that core services (`cards`, `board`, `resources`, etc.) are not a separate
tier — they're just more powerful mechanics that happen to define hooks. The architecture
diagram labels them "Trunk" but the long-term goal is that they are first-class mechanics
participating in the same systems as leaf mechanics.

#### Where we are

Core services already participate as registered mechanics in most respects:

| Capability | Status | Notes |
|-----------|--------|-------|
| Registered with slugs | **Done** | `cards`, `resources`, `board`, `dice`, `effects`, `visibility`, `social`, etc. |
| Define hooks via `defines` | **Done** | All 7 domains fire mechanic-defined hooks |
| Leaf mechanics depend via `requires` | **Done** | e.g. `deck-building` requires `cards` |
| Own their actions via `onExecuteAction` | **Partial** | Cards fully owns `draw` and `play_card` (all phases). Resources owns `spend` + player init. Deck init, board init all delegated. |
| Own their config namespace | **Partial** | Config stored in `engine_mechanics` AND decomposed to top-level for runtime backwards compat |
| Participate in `getHighlight` | **Done** | Cards/board flow through the registry like any other mechanic |

#### The Pseudo-Key Problem

In the unified RULES.md format, `cards` and `board` are treated specially:

```yaml
mechanics:
  action_points: { per_turn: 3 }   # ← Normal mechanic, config stays in engine_mechanics
  cards:                             # ← Pseudo-key, decomposed to config.deck + config.starting_cards
    starting_hand: 5
    deck: [...]
  board:                             # ← Pseudo-key, decomposed to config.board
    states: [...]
```

`normalizeUnifiedConfig()` extracts `cards` and `board` to top-level config
properties that game.ts reads directly. This means:

1. game.ts has hardcoded knowledge of deck building, hand dealing, board setup
2. The generate script needs special pseudo-key handling for cards/board highlights
3. Cards and board can't fully participate as normal mechanics (their config
   doesn't live in `engine_mechanics` like every other mechanic's does)

#### What's Left

To complete the core-services-as-mechanics vision:

| Step | What Changes | Impact |
|------|-------------|--------|
| **Cards owns init** | `initSharedState` builds deck, `initPlayerState` deals hands | Remove deck/hand init from game.ts (~40 lines) |
| **Board owns init** | `initSharedState` sets up states, edges, starting positions | Remove board init from game.ts (~20 lines) |
| **Eliminate pseudo-key decomposition** | Config stays in `engine_mechanics.cards` / `engine_mechanics.board` | Simplify `normalizeUnifiedConfig`, remove special cases |
| **Cards/board getHighlight** | These mechanics define `getHighlight` like any other | Remove pseudo-key handling from generate-games.ts |
| **Resources owns init** | Resources mechanic already partially does this, complete the migration | Remove resources init from game.ts |

Once complete, `normalizeUnifiedConfig` would treat every key in `mechanics:` uniformly —
no pseudo-keys, no special extraction. game.ts would delegate all domain init to
`mechanicRegistry.initSharedState()` / `initPlayerState()`. And highlights would flow
through the registry for all mechanics including cards and board.

This is the natural next step after the game.ts agnosticism work (Phases 10-13) and
aligns with the strangler fig approach — the pseudo-key decomposition is the last
piece of the old model being wrapped.

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
const schema = mechanicRegistry.getActionSchema(state, action);
if (schema) errors.push(...validateAgainstSchema(action, schema));
```

### Migration Status

Completed: pass extraction, draw extraction (full), play_card extraction (full: discovery+validation+reversal), effect type handling, player view building, shared state initialization, card type handling, block check, action schema validation (~400 lines removed from game.ts).

**Action schema validation** fully delegated to mechanics via `getActionSchema` hook. 11 mechanics implement it: cards (`play_card`, `draw`), pass (`pass`), place-card (`place_card`, `place_location`), trading (`trade_offer`, `trade_respond`), auction-english (`bid`, `auction_pass`), set-collection (`collect_set`), push-your-luck (`roll`, `bank`), open-drafting (`draft`), board-state (`move`), grid-movement (`move`), resources (`spend`). The only engine-owned action is `resign` (uses built-in schema in game.ts). The hardcoded `validateActionSchema` switch was replaced with a generic `validateAgainstSchema` helper that validates against mechanic-provided `ActionSchema` objects.

**Turn advancement** uses three-value semantics: `advanceTurn: true` always advances (pass, bank, bust), `advanceTurn: false` never advances (play_card, roll), and `advanceTurn: undefined` auto-detects (non-AP games advance, AP games let `shouldAutoEndTurn` handle it).

**Draw action** fully owned by cards mechanic: `getActionSchema` (schema), `getAvailableActions` (discovery), `preValidateAction` (empty deck check), `onExecuteAction` (execution). The `drawCards` helper, hardcoded draw entry in `getAvailableActions`, draw validation, and draw reverseAction case were all removed from game.ts. CLI imports `drawCards` from `src/mechanics/core/cards.ts`.

**Reverse action** delegates to mechanics via `reverseAction` hook for action-specific undo (e.g., cards reverses play_card: moves card from discard back to hand, restores topCard/currentColor). Engine handles `reverseTurn`/`saveState` generically for all actions.

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

### Highlights (Optional, Build-Time Only)

Mechanics that define a game's *identity* can implement `getHighlight` to surface
stats on game cards and pages. This is not a runtime hook — it's called during site
generation (`generate-games.ts`) to produce `{ label, value }` pairs from the
mechanic's config. Returns an array, so a single mechanic can contribute multiple
highlights when appropriate (e.g. cards could surface both deck size and starting hand).

```typescript
  // Only implement if this mechanic is identity-defining.
  // Receives the raw config value from RULES.md (may be `true` for boolean mechanics).
  getHighlight(config: unknown): { label: string; value: string }[] | null {
    if (!config || typeof config !== 'object') return null;
    const cfg = config as Record<string, unknown>;
    const ppt = cfg.points_per_turn;
    if (typeof ppt !== 'number') return null;
    return [{ label: 'AP/turn', value: String(ppt) }];
  }
```

Design intent:
- **Sparse**: Only ~11 of 162 mechanics implement it. Most mechanics are not identity-defining.
- **Plural**: A mechanic can return multiple highlights if it has several display-worthy attributes.
- **Freeform**: Each mechanic speaks in its own idiom — "3d6", "Co-op", "4 Locations".
- **Opt-in**: New mechanics can add highlights without changing any central mapping.
- **Max 4** highlights per game (capped in `generate-games.ts`).

Currently implemented by: `cards`, `board`, `dice-rolling`, `action-points`,
`hidden-roles`, `variable-player-powers`, `push-your-luck`, `team-based-game`,
`cooperative-game`, `resources`, `worker-placement`.

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

### Overview

- **209** reference mechanics (BGG-sourced), **7** physical/not-plannable → **202** plannable
- **163** registered mechanics: **12** core domains + **13** win conditions + **138** leaf
- **150 of 202** plannable reference mechanics have implementations (**74%**)
- **13** additional registered mechanics beyond the BGG reference (core domains, extras)
- **18 games**, all using unified config format
- **228 tests** passing, build clean
- **game.ts: ~2287 lines** (down from ~3600+), ~1400+ lines removed across phases 10-14
- All agnosticism hooks implemented: `initSharedState` (14), `getPlayerView` (14, incl. cards hand), `initPlayerState` (6), `isPlayerBlocked`, `canPlayerActNow`, `applyEffect`, `getActionSchema` (11 mechanics), `getAvailableActions` (cards draw+play_card, board-state move, grid-movement move), `preValidateAction` (cards draw+play_card), `reverseAction` (cards play_card), `onCheckWin` (all 16 games with explicit win mechanics)
- Infrastructure mechanics auto-enable via transitive dependency resolution (no `alwaysEnabled` needed)
- All 12 core mechanic domains have mechanic-defined hooks: cards, resources, dice, board, effects, visibility, social, combat, workers, pass, building, auction

### Coverage by Category

| Category | Implemented | Total | Coverage | Key Gaps |
|----------|-------------|-------|----------|----------|
| **Action** | 6 | 6 | **100%** | — |
| **Auction** | 10 | 11 | 91% | auction-dexterity (physical) |
| **Building** | 8 | 9 | 89% | crayon-rail-system |
| **Cards** | 15 | 18 | 83% | campaign-battle-card-driven, deck-bag-and-pool-building |
| **Conflict** | 7 | 7 | **100%** | — |
| **Cooperative** | 5 | 5 | **100%** | — |
| **Dice** | 3 | 3 | **100%** | — |
| **Economic** | 10 | 10 | **100%** | — |
| **Ending** | 5 | 6 | 83% | race (overlaps win-race) |
| **Information** | 8 | 8 | **100%** | — |
| **Movement** | 13 | 23 | 57% | programmed-movement, line-of-sight, pattern-movement |
| **Other** | 27 | 63 | 43% | hot-potato, constrained-bidding, closed-economy-auction |
| **Physical** | 0 | 7 | N/A | *Not plannable (require physical components)* |
| **Social** | 10 | 10 | **100%** | — |
| **Turn Order** | 8 | 8 | **100%** | — |
| **Victory** | 12 | 12 | **100%** | — |
| **Worker Placement** | 3 | 3 | **100%** | — |
| **Totals** | **150** | **202** | **74%** | **52 remaining** |

#### Fully Complete Categories (11)

- **Action** (6/6): action-points, action-drafting, action-event, action-retrieval, action-queue, action-timer
- **Conflict** (7/7): area-impulse, chit-pull-system, critical-hits, force-commitment, kill-steal, ratio-CRT, secret-unit-deployment
- **Cooperative** (5/5): cooperative-actions, cooperative-game, alliances, team-based-game, semi-cooperative-game
- **Dice** (3/3): dice-rolling, push-your-luck, re-rolling-and-locking
- **Economic** (10/10): income, market, trading, automatic-resource-growth, contracts, loans, stock-holding, investment, commodity-speculation, ownership
- **Information** (8/8): deduction, hidden-objectives, hidden-roles, hidden-victory-points, roles-asymmetric-info, induction, pattern-recognition, questions-and-answers
- **Social** (10/10): voting, negotiation, communication-limits, bribery, betting-and-bluffing, storytelling, player-judge, role-playing, acting, prisoner's-dilemma
- **Turn Order** (8/8): random, stat-based, progressive, auction, claim-action, pass-order, time-track, role-order
- **Victory** (12/12): end-game-bonuses, highest-lowest-scoring, king-of-the-hill, victory-points-as-resource, reach-state, score-threshold, empty-hand, elimination, timeout, race, sudden-death, finale-ending
- **Worker Placement** (3/3): worker-placement, worker-placement-different-worker-types, worker-placement-with-dice-workers

#### Additional Registered (Beyond BGG Reference)

These mechanics are engine additions not in the BGG 209:
- **Core domains** (12): `cards`, `resources`, `dice`, `board`, `effects`, `visibility`, `social`, `combat`, `workers`, `pass`, `building`, `auction`
- **Extras** (2): `action-programming`, `cooperative-actions`

### game.ts Agnosticism Progress

**Completed migrations (Phases 10-13+):** All action types migrated to mechanics (place_card, place_location, collect_set, roll, bank, draft, trade/bid/spend, move, draw, play_card, pass). Player init generalized, hand limit enforcement, deck-building init, placed card effects, move execution/targets, timeout winner determination, AP consolidation, draw full extraction, play_card full extraction, `reverseAction` hook, **win condition consolidation**, **board state extraction** (move scaffold → rich actions), **hand references extraction** (cards provides hand via `getPlayerView`), and **effect duration extraction** (`onTurnEnd` → effects mechanic) all extracted from game.ts.

**game.ts executeAction fallback switch now handles only:** `resign` — all other actions delegated to mechanics via `onExecuteAction`.

**game.ts reverseAction:** Fully delegated — calls `mechanicRegistry.reverseAction()` for mechanic-specific undo (cards handles play_card), then `reverseTurn()`/`saveState()` generically. No action-specific switch cases remain.

### Remaining game.ts Leaks (Comprehensive Audit)

Organized by severity. Line numbers approximate — may shift as code changes.

#### CRITICAL — Blocks game-agnosticism

| Area | Lines | Description |
|------|-------|-------------|
| ~~**Win condition pattern matching**~~ | ~~removed~~ | ~~DONE: `checkWinCondition()` removed. All games now have explicit win condition mechanics in RULES.md. `checkAllWinConditions` delegates to registry's `onCheckWin`.~~ |
| **Hand references throughout** | ~913, 924 | ~~Partially extracted~~. Cards mechanic contributes `hand: cardNames[]` via `getPlayerView` for `getAvailableActions` result. Only `getPlayerView` function's nested `myState.hand: Card[]` and `opponent.handSize` remain (structural — can't be contributed via flat mechanic hook). |
| ~~**Card type/effect filtering**~~ | ~~removed~~ | ~~DONE: Card type checks (`placeable`, `location`, `interference`, `block_turn`, `wild`) moved to cards mechanic `getAvailableActions`.~~ |

#### HIGH — Moderate coupling

| Area | Lines | Description |
|------|-------|-------------|
| ~~**play_card in getAvailableActions**~~ | ~~removed~~ | ~~DONE: play_card scaffold moved to cards mechanic `getAvailableActions` with rich metadata (description, required, optional, examples, cards).~~ |
| ~~**play_card reversal**~~ | ~~removed~~ | ~~DONE: Cards mechanic implements `reverseAction` hook. Engine delegates to mechanics then calls `reverseTurn`/`saveState` generically.~~ |
| **Board state references** | ~2043 | ~~Most removed~~. Only `setBoardState()` in victory rejection rollback remains (legitimate board API use). `getBoardState()` replaced with direct `player.state` access. Move scaffold removed — board-state/grid-movement mechanics provide rich move actions. |
| ~~**Effect duration management**~~ | ~~removed~~ | ~~DONE: Effects mechanic implements `onTurnEnd` calling `decrementEffectDurations` API. Engine calls `mechanicRegistry.onTurnEnd()` — no hardcoded duration logic.~~ |
| ~~**play_card validation**~~ | ~~removed~~ | ~~DONE: Cards mechanic `preValidateAction` handles card-in-hand check for play_card (and empty-deck check for draw).~~ |

#### MEDIUM — Should fix when refactoring nearby code

| Area | Lines | Description |
|------|-------|-------------|
| ~~**Move action scaffold**~~ | ~~removed~~ | ~~DONE: Move scaffold removed from game.ts. Board-state and grid-movement mechanics now return single rich move actions with targets, description, examples.~~ |
| **Action points config** | ~1082, 1109, 1763, 1892 | Engine checks `config.engine_mechanics?.action_points` to decide turn advancement mode. |
| ~~**Board/grid config detection**~~ | ~~removed~~ | ~~DONE: `state.config.board \|\| state.config.engine_mechanics?.grid` check removed — mechanic-provided move actions replace config detection.~~ |
| ~~**Resources init**~~ | ~~removed~~ | ~~DONE: Resources mechanic implements `initPlayerState` for resource initialization from both `starting_state.resources` and `engine_mechanics.resources` config.~~ |
| **starting_cards config** | ~1398 | `config.starting_cards` check to determine if game has cards. |
| **placedCards access** | ~1404, 1552 | `state.shared.placedCards` read for player view. |
| ~~**Elimination effect**~~ | ~~removed~~ | ~~DONE: Win condition check moved to elimination mechanic.~~ |
| ~~**currentColor restore**~~ | ~~removed~~ | ~~DONE: Cards mechanic `reverseAction` restores `currentColor` from topCard.~~ |
| **Blocking check passthrough** | ~1407, 1432, 1527 | Engine calls `isPlayerBlocked()` and injects into action reasons. Delegated but engine still references. |

#### LOW — Appropriately engine-owned or acceptable

| Area | Lines | Description |
|------|-------|-------------|
| **Resign action** | ~1503-1510, 1915-1940 | Engine owns resign (game lifecycle). Appropriate. |
| **Pass action scaffold** | ~1486-1498 | Base pass entry in getAvailableActions. Serves as dedup anchor. |
| **Turn/round limits** | ~994-1008, 966 | max_turns/max_rounds enforcement. Engine lifecycle. |
| ~~**Win condition config**~~ | ~~removed~~ | ~~DONE: `config.win_condition` now purely informational. Win logic via mechanics.~~ |

### Completed Engine Work

#### `getActionSchema` Hook
All 11 action-owning mechanics implement `getActionSchema`. Hardcoded `validateActionSchema` switch replaced with generic `validateAgainstSchema` helper. Only engine-owned action schema is `resign`.

#### Draw Action Extraction (Full)
Cards mechanic fully owns `draw`: schema (`getActionSchema`), discovery (`getAvailableActions`), validation (`preValidateAction`), execution (`onExecuteAction`). Helper, hardcoded entries, validation, and reverseAction case all removed from game.ts. CLI imports `drawCards` from cards mechanic.

#### Play Card Action Extraction (Full)
Cards mechanic fully owns `play_card`: schema (`getActionSchema`), discovery (`getAvailableActions` with rich metadata — description, required, optional, examples, cards), validation (`preValidateAction` card-in-hand check), execution (`onExecuteAction`), reversal (`reverseAction` — moves card from discard back to hand, restores topCard/currentColor). ~60 lines removed from game.ts. `filterPlayableCards` post-processing in registry's `getAvailableActions` avoids circular dependency between cards.ts and registry.ts.

#### Pass Action Extraction
Pass mechanic owns execution via `onExecuteAction`. game.ts fallback switch only has `resign`.

#### Win Condition Consolidation (Full)
`checkWinCondition()` (5 hardcoded patterns, ~85 lines) removed from game.ts. `checkAllWinConditions` now delegates to registry's `onCheckWin` hooks with `'action'` trigger. All 16 games updated with explicit win condition mechanics in RULES.md:
- **5 games**: `win_score_threshold` (alliance, battle-forge, dice-dynasties, fortune-seekers, treasure-hunters)
- **6 games**: `win_highest_lowest_scoring` (arcane-assembly, draft-duel, grand-bazaar, rondel-express, spellbook-showdown, council-of-whispers)
- **1 game**: `win_reach_state` (markovs-chains)
- **2 games**: `win_race` (parallel-race, road-rally — already had it)
- **1 game**: `win_elimination` + `win_highest_lowest_scoring` (shadow-operations)
- **1 game**: `win_empty_hand` (uno — already had it)
- **1 game**: `win_score_threshold` (engine-masters — already had it)
- **1 game**: `win_timeout` (aaote — already had it; objective_completed is GM-declared)

Root YAML `win_condition` field is now purely informational (not mechanic config).

#### Board State Extraction
Move scaffold removed from game.ts (~25 lines). Board-state and grid-movement mechanics now return single rich move actions with description, required, optional, examples, and targets. `getBoardState()` calls replaced with direct `player.state` access (4 call sites). Board/grid config detection removed — engine no longer checks `state.config.board || state.config.engine_mechanics?.grid`. Only `setBoardState()` remains for victory rejection rollback (legitimate use of board API).

#### Hand References Extraction (Partial)
Cards mechanic now contributes `hand: cardNames[]` via `getPlayerView` hook, which gets merged into `getAvailableActions` result. Engine no longer computes hand card names. Two structural references remain in `getPlayerView` function: `myState.hand: Card[]` and `opponent.handSize` (nested object structure can't be contributed via flat mechanic hook).

#### Effect Duration Extraction
Effects mechanic implements `onTurnEnd` calling `decrementEffectDurations` API (which properly fires `onEffectRemoved` hooks). Engine now calls `mechanicRegistry.onTurnEnd()` in `advanceTurn` — hardcoded duration decrement removed (~8 lines). This also fixes a latent bug where the hardcoded version didn't fire `onEffectRemoved` hooks for expired effects.

#### Resources Init Extraction
Resources mechanic implements `initPlayerState` for resource initialization. Supports both `starting_state.resources` (frontmatter) and `engine_mechanics.resources` (array format). ~15 lines removed from game.ts `initGame`.

#### Dependency Resolution
Infrastructure mechanics auto-enable via transitive dependency resolution. No `alwaysEnabled`.

#### Three-Value advanceTurn Semantics
`true` (always advance), `false` (never), `undefined` (auto-detect based on AP).

### Outstanding Engine Work

#### ~~1. Win Condition Consolidation~~ ✅ DONE
See "Completed Engine Work" above.

#### ~~2. Cards Mechanic Owns play_card Discovery + Validation~~ ✅ DONE
See "Completed Engine Work" → "Play Card Action Extraction (Full)".

#### ~~3. Cards Mechanic Owns play_card Reversal~~ ✅ DONE
See "Completed Engine Work" → "Play Card Action Extraction (Full)".

#### ~~4. Board State References Extraction~~ ✅ MOSTLY DONE
Move scaffold removed from game.ts (~25 lines). Board-state and grid-movement mechanics now return single rich move actions with all metadata. `getBoardState()` calls replaced with direct `player.state` access. Only `setBoardState()` in victory rejection rollback remains (legitimate board API use).

#### ~~5. Hand References Extraction~~ ✅ MOSTLY DONE
Cards mechanic now contributes `hand: cardNames[]` via `getPlayerView` for `getAvailableActions` result. Engine no longer computes hand card names — cards mechanic provides them. Only 2 references remain in `getPlayerView` function for nested `myState.hand: Card[]` and `opponent.handSize` (structural concern — can't be contributed via flat mechanic hook).

#### ~~6. Effect Duration to Effects Mechanic~~ ✅ DONE
Effects mechanic implements `onTurnEnd` calling `decrementEffectDurations`. See "Completed Engine Work" → "Effect Duration Extraction".

#### ~~7. Core Services Own Init~~ ✅ MOSTLY DONE
Cards mechanic fully owns deck/hand init via `initSharedState`/`initPlayerState`. Board-state mechanic owns starting position via `initPlayerState`. Resources mechanic now owns resource init via `initPlayerState`. `normalizeUnifiedConfig` already treats all mechanics uniformly — no pseudo-key decomposition. Only remaining: score init in game.ts (engine-level concern, no scoring mechanic).

#### ~~8. Phase 8: Advanced Auction Hooks~~ ✅ DONE
Auction core mechanic created at `src/mechanics/core/auction-mechanic.ts` with 5 defined hooks (`onAuctionStart`, `onAuctionEnd`, `onBid`, `canBid`, `getMinimumBid`). All 11 auction leaf mechanics declare `requires: ['auction']`. Pure mechanic-layer — no game.ts changes, no API module. Hooks are available for auction leaf mechanics to implement for cross-mechanic coordination. Metadata generation updated to include `requires` and `defines` fields.

---

## Outstanding Mechanic Work (52 Remaining)

The remaining 52 unimplemented reference mechanics organized by category with key exemplars and implementation feasibility. See `mechanics/` directory for detailed design specs for each mechanic.

### Building (1 remaining)

8 of 9 implemented. Only one high-complexity mechanic remains.

| Mechanic | Exemplar Games | Hooks Needed | Complexity |
|----------|---------------|--------------|------------|
| `crayon-rail-system` | Empire Builder | building, resources | High |

### Auction (1 remaining)

10 of 11 implemented. Only the physical auction mechanic remains (not plannable).

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `auction-dexterity` | Physical (not plannable) | N/A |

### Cards (3 remaining)

15 of 18 implemented.

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `campaign-battle-card-driven` | Twilight Struggle | High |
| `card-play-conflict-resolution` | War variants | Low |
| `deck-bag-and-pool-building` | Orleans, Altiplano (bags) | Medium |

### Movement (10 remaining)

13 of 23 implemented. Many remaining are niche or high-complexity variants.

| Mechanic | Exemplar Games | Feasibility | Notes |
|----------|---------------|-------------|-------|
| **`programmed-movement`** | RoboRally, Colt Express | Medium | Pre-program movement sequence |
| `resource-to-move` | Concordia | Low | Spend resources for movement |
| `impulse-movement` | Impulse | Medium | Card-driven movement |
| `line-of-sight` | Warhammer, X-Wing | High | Geometric visibility checks |
| `move-through-deck` | Mage Knight | Medium | Deck determines movement |
| `pattern-movement` | Chess pieces | Medium | Fixed movement patterns |
| `relative-movement` | Survive: Escape | Low | Move relative to other pieces |
| `movement-template` | X-Wing, Armada | High | Physical template (adapt to digital) |
| `measurement-movement` | Warhammer | High | Distance-based (adapt to grid) |
| `three-dimensional-movement` | Space games | High | 3D coordinate system |

### Ending (1 remaining)

5 of 6 implemented.

| Mechanic | Notes |
|----------|-------|
| `race` | First to finish (overlaps win-race, may be partial) |

### Other (36 remaining) — Mixed Impact

27 of 63 implemented. Many are cross-cutting concerns or niche mechanics.

**Medium-Value Targets:**

| Mechanic | Exemplar Games | Notes |
|----------|---------------|-------|
| `hot-potato` | Various party games | Forced card/item passing |
| `constrained-bidding` | Modern Art | Limited bid options |
| `closed-economy-auction` | Modern Art | Money circulation |
| `bids-as-wagers` | Skull, Perudo | Bids become commitments |
| `passed-action-token` | Scythe | First-passer benefits |

**Lower-Value/Niche (31):**
`bias`, `bingo`, `delayed-purchase`, `drawing`, `increase-value-of-unchosen-resources`, `layering`, `legacy-game`, `line-drawing`, `mancala`, `map-deformation`, `map-reduction`, `minimap-resolution`, `moving-multiple-units`, `multiple-maps`, `narrative-choice-paragraph`, `neighbor-scope`, `order-counters`, `ordering`, `paper-and-pencil`, `pieces-as-map`, `predictive-bid`, `resource-queue`, `rock-paper-scissors`, `scenario-mission-campaign-game`, `selection-order-bid`, `simulation`, `slide-push`, `solo-solitaire-game`, `spelling`, `stat-check-resolution`, `static-capture`

---

## Roadmap

### Completed Phases (1-14)

| Phase | Focus | Key Results |
|-------|-------|-------------|
| 1-5 | Core hooks + registration | 33 hooks, 66 mechanics implemented, 96 registered |
| 6-7 | Combat + Workers | 11 domain hooks, 10 leaf mechanics |
| 9 | Multi-category expansion | 7 new mechanics across 6 categories |
| 10 | Action migration | 8 action types → mechanics, ALWAYS_ENABLED removed, ~900 lines |
| 11 | Deep cleanup | Hand limit, deck-building, player init generalized, ~140 lines |
| 12 | Movement + effects | applyPlacedCardEffects, case 'move', move targets, ~224 lines |
| 13 | Timeout + AP | determineTimeoutWinner removed, AP checks consolidated, board start, ~82 lines |
| 14 | Mass expansion | Building core domain, 26 new mechanics across 10 categories, 122 registered (54%) |
| 15 | Category completers | 40 new mechanics, 11 categories completed, 162 registered (74%) |

### Next Steps: Engine

| Priority | Task | Impact | Complexity |
|----------|------|--------|------------|
| ~~**1**~~ | ~~Win condition consolidation~~ | ~~✅ DONE~~ | |
| ~~**2**~~ | ~~Cards mechanic owns play_card discovery + validation~~ | ~~✅ DONE~~ | |
| ~~**3**~~ | ~~`reverseAction` mechanic hook — cards owns play_card reversal~~ | ~~✅ DONE~~ | |
| ~~**4**~~ | ~~Board state extraction — move scaffold, getBoardState~~ | ~~✅ MOSTLY DONE~~ | |
| ~~**5**~~ | ~~Hand references extraction — cards contributes hand to player view~~ | ~~✅ MOSTLY DONE~~ | |
| ~~**6**~~ | ~~Effect duration to effects mechanic `onTurnEnd`~~ | ~~✅ DONE~~ | |
| ~~**7**~~ | ~~Core services own init (pseudo-key elimination)~~ | ~~✅ MOSTLY DONE~~ | |
| ~~**8→1**~~ | ~~Advanced auction hooks (Phase 8) — mechanic-layer only, no game.ts changes~~ | ~~✅ DONE~~ | |

### Next Steps: New Mechanics (Priority Order)

| Priority | Category | Target Mechanics | Unlocks |
|----------|----------|-----------------|---------|
| **1** | Movement | programmed-movement | RoboRally, Colt Express genre |
| **2** | Cards | campaign-battle-card-driven, deck-bag-and-pool-building | Twilight Struggle, Orleans |
| **3** | Other | hot-potato, constrained-bidding, passed-action-token | Party games, auction variants |
| **4** | Building | crayon-rail-system | Empire Builder genre |
| **5** | Ending | race | First-to-finish genre |

### Long-Term Refactoring

| Refactoring | Impact |
|-------------|--------|
| Movement System Unification | 4 mechanics share patterns |
| Point Economy Extraction | action-points + movement-points |
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
- `canPlayerActNow`: Allows `waitForTurn` to return immediately for any player
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
