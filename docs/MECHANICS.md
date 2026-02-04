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
4. [Core Services](#core-services)
5. [Game.ts Agnosticism](#gamets-agnosticism)
6. [Mechanic Implementation Guide](#mechanic-implementation-guide)
7. [Current Status](#current-status)
8. [Roadmap](#roadmap)

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

#### NEW: Agnosticism Hooks (5 hooks)
| Hook | Signature | Purpose |
|------|-----------|---------|
| `initSharedState` | `(ctx) → SharedStateChanges \| null` | Initialize shared state |
| `getPlayerView` | `(ctx) → Record<string, unknown> \| null` | Contribute to player view |
| `applyEffect` | `(ctx, effect) → EffectResult \| null` | Handle effect application |
| `isPlayerBlocked` | `(ctx) → boolean \| null` | Determine if player is blocked |
| `getActionSchema` | `(action) → ActionSchema \| null` | Define action validation schema |

### Mechanic Composition

```typescript
interface MechanicHooks {
  slug: string;
  name: string;

  /** Mechanics this one depends on */
  dependencies?: string[];

  /** Mechanics this one conflicts with */
  conflicts?: string[];

  /** Config schema for YAML validation */
  configSchema?: MechanicConfigSchema;

  // ... hooks
}
```

Registry validates at game init:
- Missing dependencies → error
- Conflicting mechanics both enabled → error
- Invalid config → error

---

## Core Services

### Card Piles (`core/card-piles.ts`)
- `drawFromDeck(state, count, playerId?)` - Fires `onBeforeDraw`/`onAfterDraw`
- `addToDiscard(state, cards, playerId?)` - Fires `onDiscard`
- `peekDiscard`, `hasCardsAvailable`, `getDeckSize`, `getDiscardSize`

### Hand (`core/hand.ts`)
- `addToHand(state, playerId, cards)` - Fires `onBeforeAddToHand`/`onAfterAddToHand`
- `removeFromHandByIndex/ByName` - Fires `onAfterRemoveFromHand`
- `removeCardsFromHand` - Batched operations
- `findInHand`, `getHandSize`, `getHand`

### Resources (`core/resources.ts`)
- `addResource(state, playerId, resource, amount)` - Fires resource hooks
- `spendResource(state, playerId, resource, amount)` - With validation
- `getResource`, `hasResource`, `setResource`

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
- `rollDice(state, playerId, count, sides, purpose)` - Fires dice hooks
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
  dependencies: ['action-points'],  // Requires action-points
  conflicts: ['other-mechanic'],    // Cannot use with other-mechanic

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

### Implemented Mechanics: 53 of 192 (28%)

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
| Agnosticism | 5 new hooks | **Complete** |
| Phase 6 | Combat (6 hooks) | Planned |
| Phase 7 | Workers (5 hooks) | Planned |
| Phase 8 | Auctions (5 hooks) | Planned |

**Agnosticism Hooks (Complete):**
- `initSharedState` - Used by open-drafting
- `getPlayerView` - Used by push-your-luck
- `isPlayerBlocked` - Used by lose-a-turn
- `applyEffect` - Defined, ready for mechanic implementations
- `getActionSchema` - Defined, ready for mechanic implementations

### game.ts Agnosticism Status

| Area | Current State | Target | Status |
|------|---------------|--------|--------|
| Pass action | ~~Hardcoded~~ | `core/pass.ts` mechanic | **Done** |
| Block check | ~~Hardcoded types~~ | `isPlayerBlocked` hook | **Done** |
| Shared init | ~~Mechanic-aware~~ | `initSharedState` hook | **Done** (open-drafting) |
| Player view | ~~Mechanic-aware~~ | `getPlayerView` hook | **Done** (push-your-luck) |
| Effect types | Hardcoded switch | `applyEffect` hook | Pending |
| Action schema | Hardcoded cases | `getActionSchema` hook | Pending |
| Card types | Hardcoded (wild, etc) | Mechanic-owned | Pending |

#### Completed Migrations:
- **Pass mechanic**: `src/mechanics/core/pass.ts` handles pass via `onExecuteAction`
- **Block check**: `lose-a-turn` implements `isPlayerBlocked` hook
- **Shared state init**: `open-drafting` implements `initSharedState` for draftDisplay
- **Player view**: `push-your-luck` implements `getPlayerView` for rollAccumulator/rollCount

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

| Migration | Mechanic(s) to Update | game.ts Lines to Remove |
|-----------|----------------------|------------------------|
| Effect type handling | Create effect handlers | ~100 |
| Card type handling (wild) | card-matching (new) | ~80 |
| Action schema validation | All action-owning mechanics | ~150 |

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

## Related Documents

- [MECHANIC_EXTRACTION_ROADMAP.md](./MECHANIC_EXTRACTION_ROADMAP.md) - Historical extraction progress (superseded)
- [MECHANIC_EXPANSION_ROADMAP.md](./MECHANIC_EXPANSION_ROADMAP.md) - Coverage targets (superseded)
- [ENGINE_ARCHITECTURE.md](./ENGINE_ARCHITECTURE.md) - Overall engine architecture
- [EXTENSION-GUIDE.md](./EXTENSION-GUIDE.md) - How to add new mechanics
