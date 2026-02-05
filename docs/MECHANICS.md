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
│  - pass (NEW)   │ │                 │ │                 │
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

The system provides **38 hooks** across 10 categories:

#### Action & Validation (5 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `preValidateAction` | `(ctx, action) → ValidationResult \| null` | Block invalid actions before execution |
| `postExecuteAction` | `(ctx, action) → StateChanges \| null` | Apply post-action modifications |
| `onExecuteAction` | `(ctx) → ActionExecutionResult \| null` | **Full action ownership** |
| `getAvailableActions` | `(ctx) → AvailableAction[]` | Expose available actions dynamically |
| `describeAction` | `(action) → ActionDescription \| null` | Describe action for UI/agents |

#### Turn Lifecycle (3 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onTurnStart` | `(ctx, isNewRound) → StateChanges \| null` | Turn initialization |
| `onTurnEnd` | `(ctx, nextPlayerId, isRoundEnd) → StateChanges \| null` | Turn cleanup |
| `shouldAutoEndTurn` | `(ctx) → boolean` | Force turn advancement |

#### Player & Win (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initPlayerState` | `(ctx) → PlayerInitResult \| null` | Initialize player state |
| `onCheckWin` | `(ctx, trigger) → WinCheckResult \| null` | Check win conditions |

#### Card Operations (6 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onBeforeDraw` | `(ctx, count) → DrawHookResult \| null` | Modify/block draw |
| `onAfterDraw` | `(ctx, cards, reshuffled) → StateChanges \| null` | React to draw |
| `onBeforeAddToHand` | `(ctx, cards) → HandAddHookResult \| null` | Filter/block hand add |
| `onAfterAddToHand` | `(ctx, cards) → StateChanges \| null` | React to hand add |
| `onAfterRemoveFromHand` | `(ctx, cards) → StateChanges \| null` | React to hand remove |
| `onDiscard` | `(ctx, cards) → StateChanges \| null` | React to discard |

#### Resource Operations (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onBeforeResourceChange` | `(ctx, resource, amount) → ResourceHookResult \| null` | Modify/block resource change |
| `onAfterResourceChange` | `(ctx, resource, amount, newAmount) → StateChanges \| null` | React to resource change |

#### Effect Operations (4 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onBeforeAddEffect` | `(ctx, effect) → EffectHookResult \| null` | Modify/block effect add |
| `onAfterAddEffect` | `(ctx, effect) → StateChanges \| null` | React to effect add |
| `onBeforeRemoveEffect` | `(ctx, effect) → { blocked?: boolean } \| null` | Block effect removal |
| `onEffectExpired` | `(ctx, effect) → StateChanges \| null` | React to effect expiration |

#### Movement Operations (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onBeforeMove` | `(ctx, target) → MoveHookResult \| null` | Modify/block move |
| `onAfterMove` | `(ctx, previousState, newState) → StateChanges \| null` | React to move |

#### Visibility System (3 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `getVisibleState` | `(ctx) → VisibleState \| null` | Filter state for viewer |
| `onReveal` | `(ctx) → StateChanges \| null` | Handle info reveals |
| `canSeeInfo` | `(ctx, infoType, targetPlayerId?) → boolean \| undefined` | Check visibility permissions |

#### Dice System (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onBeforeRoll` | `(ctx) → DiceRollHookResult \| null` | Modify dice or block |
| `onAfterRoll` | `(ctx) → StateChanges \| null` | React to roll results |

#### Turn Order (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onDetermineTurnOrder` | `(ctx) → TurnOrderResult \| null` | Provide custom turn order |
| `onPassPriority` | `(ctx) → PassPriorityResult \| null` | Handle pass/claim priority |

#### Voting & Social (2 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `onVoteCast` | `(ctx) → VoteCastResult \| null` | Intercept/modify vote |
| `onVoteTally` | `(ctx) → VoteTallyResult \| null` | Custom tally logic |

#### NEW: Agnosticism Hooks (6 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initSharedState` | `(ctx) → SharedStateChanges \| null` | Initialize shared state |
| `getPlayerView` | `(ctx) → Record<string, unknown> \| null` | Contribute to player view |
| `applyEffect` | `(ctx, effect) → EffectResult \| null` | Handle effect application |
| `isPlayerBlocked` | `(ctx) → boolean \| null` | Determine if player is blocked |
| `canPlayerActNow` | `(ctx) → boolean \| null` | Allow out-of-turn actions (freeplay) |
| `getActionSchema` | `(action) → ActionSchema \| null` | Define action validation schema |

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
  │     ├── catch-the-leader (requires: resources) ← MIGRATED
  │     ├── action-points (requires: resources) ← planned
  │     └── income (requires: resources) ← planned
  │
  ├── board (defines: onMoved, onLocationEntered, ...)
  │     ├── grid-movement (requires: board)
  │     └── area-movement (requires: board)
  │
  └── dice (defines: onDiceRolled, onBeforeDiceRoll)
        ├── dice-rolling (requires: dice) ← MIGRATED
        ├── different-dice-movement (requires: dice) ← MIGRATED
        ├── re-rolling-and-locking (requires: dice) ← MIGRATED
        ├── roll-spin-and-move (requires: dice) ← MIGRATED
        └── die-icon-resolution (requires: dice, resources) ← MIGRATED
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
}
```

Dependents opt into type checking via intersection:

```typescript
const myMechanic: MechanicHooks & CardsHooks = { ... };
// TypeScript verifies onCardDrawn signature matches CardsHooks
```

### Strangler Fig Migration

Global hooks and mechanic-defined hooks coexist during migration:

1. **Phase 1**: Add `defines`, `requires`, `fire()` infrastructure
2. **Phase 2**: Core services fire BOTH global hooks AND mechanic-defined hooks
3. **Phase 3**: Leaf mechanics migrate from global to mechanic-defined hooks (one at a time)
4. **Phase 4**: Deprecate global domain hooks (onBeforeDraw, onAfterDraw, etc.)
5. **Phase 5**: Global hooks shrink to ~15 truly engine-level hooks

During transition, `card-piles.ts` fires both:
```typescript
// Existing: fire global hook (all mechanics)
mechanicRegistry.onAfterDraw(state, playerId, ...);
// New: fire cards-defined hook (only cards dependents)
mechanicRegistry.fire('cards', 'onCardDrawn', state, playerId, { cards });
```

Both paths work. Mechanics can implement either. No breaking changes.

### End State

`MechanicHooks` shrinks to engine-level global hooks only:

```typescript
interface MechanicHooks {
  slug: string;
  name: string;
  requires?: string[];
  defines?: Record<string, HookDefinition>;

  // ~15 global hooks (engine-fired)
  preValidateAction?(...): ValidationResult | null;
  onExecuteAction?(...): ActionExecutionResult | null;
  postExecuteAction?(...): StateChanges | null;
  onTurnStart?(...): StateChanges | null;
  onTurnEnd?(...): StateChanges | null;
  onCheckWin?(...): WinCheckResult | null;
  initSharedState?(...): SharedStateInitResult | null;
  initPlayerState?(...): PlayerInitResult | null;
  getAvailableActions?(...): AvailableAction[];
  getPlayerView?(...): Record<string, unknown> | null;
  isPlayerBlocked?(...): boolean | null;
  canPlayerActNow?(...): boolean | null;

  // Domain hooks live on defining mechanics, implemented via [key: string]
}
```

Each domain's routing becomes a `fire()` call in the defining mechanic,
replacing hardcoded routing methods in the registry.

### Progress

- [x] Infrastructure: `defines` property on `MechanicHooks`, `fire()` on registry
- [x] Infrastructure: `requires` replaces `dependencies` (legacy compat retained)
- [x] Infrastructure: `HookDefinition` type with resolution strategies
- [x] `cards` core mechanic: defines `onCardDrawn`, `onCardPlayed`, `onCardDiscarded`, `onBeforeCardDraw`, `onBeforeCardPlay`
- [x] `cards` core mechanic: owns `play_card` action via `onExecuteAction` (removed from game.ts fallback)
- [x] `card-piles.ts` dual-fires global hooks AND cards-defined hooks (strangler fig)
- [x] `card-piles.ts` `playCard()` function: removes from hand, discards, fires `onCardPlayed`
- [x] `card-matching`: migrated to `requires: ['cards']`, implements `onCardDrawn` and `onCardPlayed` (currentColor); legacy `postExecuteAction` removed
- [x] `hand-management`: migrated to `requires: ['cards']`, implements `onBeforeCardDraw`; legacy `onBeforeDraw` removed
- [x] `take-that`: migrated to `requires: ['cards']`, implements `onCardPlayed` (applies `block_turn`/`skip` effects to target)
- [x] `currentColor` tracking removed from core services (`addToDiscard`, `playCard`); now owned by `card-matching.onCardPlayed`
- [x] All card leaf mechanics declare `requires: ['cards']`:
  - `deck-building`, `trick-taking`, `card-type-rules`, `multi-use-cards`, `place-card`, `set-collection`, `open-drafting`, `closed-drafting`, `ladder-climbing`, `placed-card-effects`, `take-that`
- [x] `resources` core mechanic: defines `onBeforeResourceGain`, `onBeforeResourceSpend`, `onResourceGained`, `onResourceSpent`
- [x] `resources.ts` dual-fires global hooks AND resources-defined hooks (strangler fig)
- [x] `catch-the-leader`: migrated to `requires: ['resources']`, implements `onBeforeResourceGain` (leader income reduction); legacy `onBeforeResourceChange` removed

### Outstanding

- [ ] Move generic `applyEffect` call from cards `onExecuteAction` to per-mechanic `onCardPlayed` handlers (once all effect types have handlers)
- [x] `trick-taking` and `ladder-climbing` now fire `onCardPlayed` after removing cards from hand (target: 'trick' / 'ladder')
- [ ] Migrate card leaf mechanics to implement cards-defined hooks (e.g., `onCardPlayed`, `onCardDrawn`) where relevant
- [x] Resource leaf mechanics declare `requires: ['resources']`:
  - `catch-the-leader`, `income`, `automatic-resource-growth`, `chaining`, `once-per-game-abilities`, `multi-use-cards`, `deck-building`, `die-icon-resolution`, `point-to-point-movement`
  - Note: `income`, `automatic-resource-growth`, and others bypass `addResource()` service (direct `playerStateChanges` mutation). Future refactoring should route through service for hook support.
- [ ] Migrate remaining resource-adjacent mechanics to `requires: ['resources']`:
  - `auction-english`, `auction-sealed-bid`, `auction-once-around` (use resources for bidding)
- [x] `dice` core mechanic: defines `onBeforeDiceRoll`, `onDiceRolled`
- [x] `dice.ts` dual-fires global hooks AND dice-defined hooks (strangler fig)
- [x] Dice leaf mechanics declare `requires: ['dice']`:
  - `dice-rolling`, `different-dice-movement`, `re-rolling-and-locking`, `roll-spin-and-move`, `die-icon-resolution`
- [ ] `board` core mechanic: define hooks from current board service
- [ ] `combat` core mechanic: define hooks from current combat service
- [ ] `effects` core mechanic: define hooks from current effects service
- [ ] `visibility` core mechanic: define hooks from current visibility service
- [ ] `social` core mechanic: define hooks from current social service
- [ ] Deprecate global domain hooks once all leaf mechanics migrated
- [ ] Slim `MechanicHooks` interface to global-only hooks

---

## Core Services

### Card Piles (`core/card-piles.ts`)
- `drawFromDeck(state, count, playerId?)` - Fires `onBeforeDraw`/`onAfterDraw` + `onBeforeCardDraw`/`onCardDrawn`
- `addToDiscard(state, cards, playerId?)` - Fires `onDiscard` + `onCardDiscarded`
- `playCard(state, playerId, cardName, playContext?)` - Removes from hand, discards, fires `onCardPlayed`
- `peekDiscard`, `hasCardsAvailable`, `getDeckSize`, `getDiscardSize`

### Hand (`core/hand.ts`)
- `addToHand(state, playerId, cards)` - Fires `onBeforeAddToHand`/`onAfterAddToHand`
- `removeFromHandByIndex/ByName` - Fires `onAfterRemoveFromHand`
- `removeCardsFromHand` - Batched operations
- `findInHand`, `getHandSize`, `getHand`

### Resources (`core/resources.ts`)
- `addResource(state, playerId, resource, amount)` - Fires `onBeforeResourceChange`/`onAfterResourceChange` + `onBeforeResourceGain`/`onResourceGained`
- `spendResource(state, playerId, resource, amount)` - Fires `onBeforeResourceChange`/`onAfterResourceChange` + `onBeforeResourceSpend`/`onResourceSpent`
- `setResource(state, playerId, resource, amount)` - Fires appropriate gain/spend hooks based on delta direction
- `getResource`, `hasResource`, `getAllResources`, `getResourceNames`

### Effects (`core/effects.ts`)
- `addEffect(state, playerId, effect)` - Fires effect hooks
- `removeEffect(state, playerId, effectId)` - With removal hooks
- `tickEffects(state, playerId)` - Decrement durations, fire expiration
- `hasEffect`, `getEffects`, `clearEffects`

### Board (`core/board.ts`)
- `movePlayer(state, playerId, target)` - Fires movement hooks
- `getPlayerPosition`, `getAdjacentStates`
- `validateMovement` - Path/adjacency validation

### Turns (`core/turns.ts`)
- `setTurnOrder`, `shuffleTurnOrder`, `reverseTurnOrder`
- `movePlayerInOrder`, `removeFromTurnOrder`, `addToTurnOrder`
- `applyDynamicTurnOrder`, `sortTurnOrderByProperty`
- `createSnakeDraftOrder`

### Dice (`core/dice.ts`)
- `rollDice(state, playerId, options)` - Fires `onBeforeRoll`/`onAfterRoll` + `onBeforeDiceRoll`/`onDiceRolled`
- `getLastRoll`, `modifyRoll`

### Visibility (`core/visibility.ts`)
- `getVisibleStateForPlayer(state, viewerId)` - Applies visibility filters
- `revealInfo(state, info, toPlayers)` - Fires reveal hooks
- `canPlayerSee(state, viewerId, infoType, targetId)`

### Social (`core/social.ts`)
- `startVoting(state, topic, voters, config)` - Initialize voting session
- `castVote(state, voteId, playerId, choice)` - With vote hooks
- `getVotingResult`, `isVotingComplete`, `completeVoting`

### Pass (`core/pass.ts`) - NEW
- `handlePass(state, playerId, action)` - Executes pass with hooks
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

## Current Status

### Implemented Mechanics: 56 of 192 (29%)

| Category | Implemented | Total | Coverage |
|----------|-------------|-------|----------|
| Action | 1 | 7 | 14% |
| Auction | 1 | 12 | 8% |
| Building | 1 | 11 | 9% |
| Cards | 10 | 15 | 67% |
| Conflict | 0 | 8 | 0% |
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
| Worker Placement | 0 | 7 | 0% |

### Hook Infrastructure Status

| Phase | Hooks | Status |
|-------|-------|--------|
| Phase 1-5 | 33 core hooks | Complete |
| Agnosticism | 6 new hooks | **Complete** |
| Phase 6 | Combat (6 hooks) | Planned |
| Phase 7 | Workers (5 hooks) | Planned |
| Phase 8 | Auctions (5 hooks) | Planned |

**Agnosticism Hooks (Complete):**
- `initSharedState` - Used by open-drafting, card-matching, freeplay, deck-building, trading
- `getPlayerView` - Used by push-your-luck
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
| deck-building | `supply` | Pending |
| trading | `pendingTrades` | Pending |
| auction-english | `currentBid`, `highBidder` | Pending |
| trick-taking | `currentTrick`, `leadSuit` | Pending |

#### `getPlayerView` - Mechanics with player-specific view data
| Mechanic | Properties | Status |
|----------|------------|--------|
| push-your-luck | `rollAccumulator`, `rollCount` | **Done** |
| action-points | `actionPoints` | Pending |
| variable-player-powers | `power` | Pending |
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
| Shared init | ~~Mechanic-aware~~ | `initSharedState` hook | **Done** (open-drafting) |
| Player view | ~~Mechanic-aware~~ | `getPlayerView` hook | **Done** (push-your-luck) |
| Effect types | ~~Hardcoded switch~~ | `applyEffect` hook | **Done** (location-effects, placed-card-effects) |
| Action schema | Hardcoded cases | `getActionSchema` hook | Pending |
| Card types | Hardcoded (wild, etc) | Mechanic-owned | **Done** (cards core) |
| Play card action | ~~Fallback switch~~ | Cards mechanic `onExecuteAction` | **Done** |

#### Completed Migrations:
- **Pass mechanic**: `src/mechanics/core/pass.ts` handles pass via `onExecuteAction`
- **Play card action**: `src/mechanics/core/cards.ts` handles play_card via `onExecuteAction`
- **Block check**: `lose-a-turn` implements `isPlayerBlocked` hook
- **Shared state init**: `open-drafting` implements `initSharedState` for draftDisplay
- **Player view**: `push-your-luck` implements `getPlayerView` for rollAccumulator/rollCount
- **Effect types**: `location-effects` and `placed-card-effects` implement `applyEffect` hook

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
| Auction shared state | auction-english | ~10 | Pending |

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

| Phase | Remaining | Priority |
|-------|-----------|----------|
| Phase 1 | `closed-drafting` (fix), `auction-sealed-bid`, `auction-once-around` | High |
| Phase 2 | `different-dice-movement`, `die-icon-resolution` | Medium |
| Phase 3 | `turn-order-auction`, `turn-order-claim-action`, `turn-order-time-track` | Medium |
| Phase 4 | `deduction`, `memory`, `targeted-clues` | Low |
| Phase 5 | `player-judge`, `i-cut-you-choose`, `bribery` | Low |

### Medium-Term: Phase 6-8

| Phase | Focus | New Hooks |
|-------|-------|-----------|
| Phase 6 | Combat System | 6 combat hooks |
| Phase 7 | Worker Placement | 5 worker hooks |
| Phase 8 | Advanced Auctions | 5 auction hooks |

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
