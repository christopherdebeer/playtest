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
│  - turns        │ │ - 95+ more      │ │ - race          │
│  - dice         │ │                 │ │ - sudden-death  │
│  - visibility   │ │                 │ │ - end-game-bon  │
│  - social       │ │                 │ │ - king-of-hill  │
│  - combat       │ │                 │ │ - finale-ending │
│  - workers      │ │                 │ │ - + 3 more      │
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
└── [98 leaf mechanics]   # Individual mechanic implementations
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

### Migration Status: Complete

All 7 domain hook migrations finished (Phases 1-4):

- **Infrastructure**: `defines`/`requires`/`fire()` on registry, `HookDefinition` with resolution strategies
- **All 7 core domains** define and fire mechanic-defined hooks: cards (8 hooks), resources (4), dice (2), board (2), effects (4), visibility (2), social (4)
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

### Migration Status

Completed: pass extraction, effect type handling, player view building, shared state initialization, card type handling, block check (~330 lines removed from game.ts).

**Remaining**: Action schema validation (`getActionSchema` hook) — ~150 lines removable, high complexity. See [Outstanding Engine Work](#outstanding-engine-work).

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

### Overview

- **209** reference mechanics (BGG-sourced), **7** physical/not-plannable → **202** plannable
- **122** registered mechanics: **11** core domains + **13** win conditions + **98** leaf
- **110 of 202** plannable reference mechanics have implementations (**54%**)
- **12** additional registered mechanics beyond the BGG reference (core domains, extras)
- **11 games**, all using unified config format
- **198 tests** passing, build clean
- **game.ts: 2287 lines** (down from ~3600+), ~1300+ lines removed across phases 10-13
- All agnosticism hooks implemented: `initSharedState` (14), `getPlayerView` (13), `initPlayerState` (6), `isPlayerBlocked`, `canPlayerActNow`, `applyEffect`
- All 11 core mechanic domains have mechanic-defined hooks: cards, resources, dice, board, effects, visibility, social, combat, workers, pass, building

### Coverage by Category

| Category | Implemented | Total | Coverage | Key Gaps |
|----------|-------------|-------|----------|----------|
| **Action** | 4 | 6 | 67% | action-queue, action-timer |
| **Auction** | 4 | 11 | 36% | compensation, fixed-placement, multiple-lot |
| **Building** | 4 | 9 | 44% | pattern-building, connections, enclosure |
| **Cards** | 12 | 18 | 67% | melding-and-splaying, command-cards, deck-construction |
| **Conflict** | 7 | 7 | **100%** | — |
| **Cooperative** | 4 | 5 | 80% | semi-cooperative-game |
| **Dice** | 3 | 3 | **100%** | — |
| **Economic** | 6 | 10 | 60% | stock-holding, investment, commodity-speculation |
| **Ending** | 4 | 6 | 67% | race (overlaps win-race), elapsed-real-time |
| **Information** | 5 | 8 | 63% | induction, pattern-recognition, Q&A |
| **Movement** | 8 | 23 | 35% | hexagon-grid, rondel, programmed-movement |
| **Other** | 20 | 63 | 32% | pick-up-and-deliver, modular-board, variable-phase-order |
| **Physical** | 0 | 7 | N/A | *Not plannable (require physical components)* |
| **Social** | 7 | 10 | 70% | role-playing, acting, prisoner's-dilemma |
| **Turn Order** | 8 | 8 | **100%** | — |
| **Victory** | 12 | 12 | **100%** | — |
| **Worker Placement** | 2 | 3 | 67% | worker-placement-with-dice-workers |
| **Totals** | **110** | **202** | **54%** | **92 remaining** |

#### Fully Complete Categories

- **Conflict** (7/7): area-impulse, chit-pull-system, critical-hits, force-commitment, kill-steal, ratio-CRT, secret-unit-deployment
- **Dice** (3/3): dice-rolling, push-your-luck, re-rolling-and-locking
- **Turn Order** (8/8): random, stat-based, progressive, auction, claim-action, pass-order, time-track, role-order
- **Victory** (12/12): end-game-bonuses, highest-lowest-scoring, king-of-the-hill, victory-points-as-resource, reach-state, score-threshold, empty-hand, elimination, timeout, race, sudden-death, finale-ending

#### Additional Registered (Beyond BGG Reference)

These mechanics are engine additions not in the BGG 209:
- **Core domains** (11): `cards`, `resources`, `dice`, `board`, `effects`, `visibility`, `social`, `combat`, `workers`, `pass`, `building`
- **Extras** (2): `action-programming`, `cooperative-actions`

### game.ts Agnosticism Progress

**Completed migrations (Phases 10-13):** All action types migrated to mechanics (place_card, place_location, collect_set, roll, bank, draft, trade/bid/spend, move). Player init generalized, hand limit enforcement, deck-building init, placed card effects, move execution/targets, timeout winner determination, and AP consolidation all extracted from game.ts.

**game.ts executeAction fallback switch now handles only:** `draw`, `pass`, `resign` — all other actions delegated to mechanics via `onExecuteAction`.

### Remaining game.ts Leaks

| Area | Location | Severity | Description |
|------|----------|----------|-------------|
| Resources legacy init | Lines 572-576 | MEDIUM | `engine_mechanics?.resources` legacy format fallback for resource init. Modern format uses `starting_state.resources`. |
| Card type filters | Line 1399 | MEDIUM | `basePlayable = hand.filter(c => !c.placeable && c.type !== 'location')` — card property checks for play_card filtering. Data-driven but could use mechanic hook. |
| Interference detection | Lines 1448-1450 | MEDIUM | `c.type === 'interference' \|\| c.effect?.type === 'block_turn'` — identifies cards needing targets. Could be extracted to take-that `getAvailableActions`. |
| topCard init | Line 623 | LOW | `shared.topCard = topCard` — engine sets top card during init. Core card concept, acceptable. |
| currentColor restore | Lines 2230-2232 | LOW | In `reverseAction`: restores `currentColor` only if previously set. Guarded, contest-only path. |
| placedCards read | Line 1402 | LOW | `state.shared.placedCards` cast in getAvailableActions for player view. Read-only, could move to `getPlayerView`. |
| Action schema | validateAction switch | LOW | Hardcoded action type validation. `getActionSchema` hook defined but not yet implemented by mechanics. |
| checkWinCondition | Lines 1164-1218 | LOW | Legacy hardcoded win checks (reach state, empty hand, score threshold, elimination). Win-condition mechanics exist but aren't wired through this function yet. |

### Outstanding Engine Work

#### `getActionSchema` Hook (Pending)
The `getActionSchema` hook is defined in `types.ts` but no mechanic implements it yet. Currently, `validateActionSchema` in game.ts uses hardcoded switch cases for action type validation. Each action-owning mechanic should implement `getActionSchema` to provide its own validation rules.

**Impact**: ~150 lines removable from game.ts `validateAction`
**Mechanics to update**: cards, place-card, trading, auction-english, resources, set-collection, push-your-luck, open-drafting, board-state, grid-movement

#### Win Condition Consolidation (Planned)
`checkWinCondition()` in game.ts hardcodes 4 win conditions (reach state, empty hand, score threshold, elimination). These should be handled by the existing win-condition mechanics via `onCheckWin` hooks, with game.ts delegating entirely to `mechanicRegistry.checkAllWinConditions()`.

**Impact**: ~55 lines removable from game.ts
**Mechanics**: reach-state, empty-hand, score-threshold, elimination already registered but not wired to the legacy `checkWinCondition` call path

#### Phase 8: Advanced Auction Hooks (Planned)
5 new auction-domain hooks for advanced auction mechanics. Currently only `auction-english` has full hook support.

---

## Outstanding Mechanic Work (92 Remaining)

The remaining 92 unimplemented reference mechanics organized by category with key exemplars and implementation feasibility. See `mechanics/` directory for detailed design specs for each mechanic.

### Building (5 remaining)

4 of 9 implemented (place-location, tile-placement, network-and-route-building, tech-trees-tech-tracks).

| Mechanic | Exemplar Games | Hooks Needed | Complexity |
|----------|---------------|--------------|------------|
| **`pattern-building`** | Azul, Sagrada | building hooks | Medium |
| **`connections`** | Roads & Boats | building hooks | Medium |
| `enclosure` | Go, Cathedral | building hooks | Medium |
| `map-addition` | Carcassonne expansions | building hooks | Low |
| `crayon-rail-system` | Empire Builder | building, resources | High |

### Economic (4 remaining)

6 of 10 implemented (income, market, trading, automatic-resource-growth, contracts, loans).

| Mechanic | Exemplar Games | Hooks Needed | Complexity |
|----------|---------------|--------------|------------|
| **`stock-holding`** | Acquire, 18XX | resources, trading | High |
| **`investment`** | Stockpile | resources | Medium |
| `commodity-speculation` | Container, Panic on Wall Street | market hooks | High |
| `ownership` | Monopoly, Acquire | board, resources | Medium |

### Cooperative (1 remaining)

4 of 5 implemented (cooperative-actions, cooperative-game, alliances, team-based-game).

| Mechanic | Exemplar Games | Notes |
|----------|---------------|-------|
| `semi-cooperative-game` | Dead of Winter, Archipelago | Cooperative with traitor potential |

### Auction (7 remaining)

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| **`auction-compensation`** | Keyflower | Medium |
| **`auction-fixed-placement`** | Amun-Re | Medium |
| **`auction-multiple-lot`** | For Sale | Medium |
| `auction-bidding` | Generic bidding variant | Low |
| `auction-dutch-priority` | Dutch with priority | Low |
| `auction-turn-order-until-pass` | Turn-order bidding | Low |
| `auction-dexterity` | Physical (not plannable) | N/A |

### Cards (6 remaining)

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| **`melding-and-splaying`** | Rummy, Innovation | Medium |
| **`command-cards`** | Memoir '44, BattleLore | Medium |
| `campaign-battle-card-driven` | Twilight Struggle | High |
| `card-play-conflict-resolution` | War variants | Low |
| `deck-construction` | Pre-built decks (subset of deck-building) | Low |
| `deck-bag-and-pool-building` | Orleans, Altiplano (bags) | Medium |

### Movement (15 remaining)

8 of 23 implemented. Many remaining are niche variants.

| Mechanic | Exemplar Games | Feasibility | Notes |
|----------|---------------|-------------|-------|
| **`hexagon-grid`** | Settlers of Catan, Twilight Imperium | Medium | Extends grid-movement with hex adjacency |
| **`rondel`** | Navegador, Antike | Medium | Circular track movement, action selection |
| **`programmed-movement`** | RoboRally, Colt Express | Medium | Pre-program movement sequence |
| **`track-movement`** | Power Grid, Clank! | Low | Linear track advancement |
| `square-grid` | Chess, Checkers | Low | Subset of grid-movement |
| `grid-coverage` | Blokus, Patchwork | Medium | Cover grid cells with pieces |
| `resource-to-move` | Concordia | Low | Spend resources for movement |
| `impulse-movement` | Impulse | Medium | Card-driven movement |
| `line-of-sight` | Warhammer, X-Wing | High | Geometric visibility checks |
| `move-through-deck` | Mage Knight | Medium | Deck determines movement |
| `pattern-movement` | Chess pieces | Medium | Fixed movement patterns |
| `relative-movement` | Survive: Escape | Low | Move relative to other pieces |
| `movement-template` | X-Wing, Armada | High | Physical template (adapt to digital) |
| `measurement-movement` | Warhammer | High | Distance-based (adapt to grid) |
| `three-dimensional-movement` | Space games | High | 3D coordinate system |

### Action (2 remaining)

4 of 6 implemented (action-points, action-drafting, action-event, action-retrieval).

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `action-queue` | Shogun, Wallenstein | Medium |
| `action-timer` | Hourglass/time-pressure | Low |

### Social (3 remaining)

7 of 10 implemented (voting, negotiation, communication-limits, bribery, betting-and-bluffing, storytelling, player-judge).

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `role-playing` | D&D-style | High |
| `acting` | Charades-style | Medium |
| `prisoner's-dilemma` | Game theory mechanic | Low |

### Information (3 remaining)

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `induction` | Zendo, Eleusis | Medium |
| `pattern-recognition` | Set, Dobble | Low |
| `questions-and-answers` | 20 Questions, Guess Who | Low |

### Ending (2 remaining)

4 of 6 implemented (finale-ending, single-loser-game, player-elimination, sudden-death).

| Mechanic | Notes |
|----------|-------|
| `race` | First to finish (overlaps win-race, may be partial) |
| `elapsed-real-time-ending` | Not plannable (real clock) |

### Worker Placement (1 remaining)

| Mechanic | Exemplar Games | Complexity |
|----------|---------------|------------|
| `worker-placement-with-dice-workers` | Alien Frontiers, Troyes | Medium |

### Other (43 remaining) — Mixed Impact

20 of 63 implemented. Many are cross-cutting concerns or niche mechanics.

**High-Value Targets:**

| Mechanic | Exemplar Games | Hooks Needed | Complexity |
|----------|---------------|--------------|------------|
| **`pick-up-and-deliver`** | Merchants & Marauders | board, resources | Medium |
| **`modular-board`** | Settlers of Catan, Eclipse | board init hooks | Medium |
| **`variable-phase-order`** | Puerto Rico, Race for the Galaxy | turn hooks | Medium |

**Medium-Value Targets:**

| Mechanic | Exemplar Games | Notes |
|----------|---------------|-------|
| `tug-of-war` | Twilight Struggle | Bidirectional track mechanic |
| `hot-potato` | Various party games | Forced card/item passing |
| `matching` | Memory, Sequence | Pattern matching mechanic |
| `interrupts` | MtG stack, Cosmic Encounter | Interrupt action flow |
| `constrained-bidding` | Modern Art | Limited bid options |
| `closed-economy-auction` | Modern Art | Money circulation |
| `bids-as-wagers` | Skull, Perudo | Bids become commitments |
| `score-and-reset-game` | Rummy variants | Multi-round scoring |
| `passed-action-token` | Scythe | First-passer benefits |

**Lower-Value/Niche (32):**
`bias`, `bingo`, `delayed-purchase`, `drawing`, `increase-value-of-unchosen-resources`, `layering`, `legacy-game`, `line-drawing`, `mancala`, `map-deformation`, `map-reduction`, `minimap-resolution`, `moving-multiple-units`, `multiple-maps`, `narrative-choice-paragraph`, `neighbor-scope`, `order-counters`, `ordering`, `paper-and-pencil`, `pieces-as-map`, `predictive-bid`, `resource-queue`, `rock-paper-scissors`, `scenario-mission-campaign-game`, `selection-order-bid`, `simulation`, `slide-push`, `solo-solitaire-game`, `spelling`, `stat-check-resolution`, `static-capture`, `tags`

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

### Next Steps: Engine

| Priority | Task | Impact | Complexity |
|----------|------|--------|------------|
| **1** | `getActionSchema` hook implementations | ~150 lines from game.ts | Medium |
| **2** | Win condition consolidation (wire mechanic `onCheckWin` to main check path) | ~55 lines from game.ts | Medium |
| **3** | Phase 8: Advanced auction hooks | 5 new hooks | Medium |
| **4** | Card type filtering to mechanic hooks (placeable/location/interference) | ~15 lines from game.ts | Low |
| **5** | `reverseAction` mechanic hooks | ~100 lines from game.ts | High |

### Next Steps: New Mechanics (Priority Order)

| Priority | Category | Target Mechanics | Unlocks |
|----------|----------|-----------------|---------|
| **1** | Cards | melding-and-splaying, command-cards | Rummy, wargame card genre |
| **2** | Movement | hexagon-grid, rondel, programmed-movement | Hex wargames, rondel euros |
| **3** | Building | pattern-building, connections | Azul, pattern-matching genre |
| **4** | Economic | stock-holding, investment | 18XX, financial genre |
| **5** | Auction | auction-compensation, auction-fixed-placement | Advanced auction games |
| **6** | Other | pick-up-and-deliver, modular-board | Logistics, variable setup |
| **7** | Information | pattern-recognition, induction | Logic/deduction genre |

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
