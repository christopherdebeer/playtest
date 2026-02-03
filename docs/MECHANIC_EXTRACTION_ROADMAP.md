# Mechanic Extraction Roadmap

This document outlines the incremental migration from a monolithic game engine to a plugin-based, mechanic-agnostic core using the **strangler fig pattern**.

## Vision

A game engine where:
- **Core is mechanic-agnostic**: Only handles primitives (cards, hands, piles, turns, players)
- **Mechanics are composable**: Enable/disable via config, combine freely
- **Self-registering**: Mechanics declare their hooks, actions, and requirements
- **Action exposure**: Available actions dynamically generated from enabled mechanics

## Current Progress

### Phase 1: Hook Infrastructure (Complete)

Established the foundation for mechanic extraction:

```
src/mechanics/
├── types.ts          # Hook interfaces and contexts
├── registry.ts       # MechanicRegistry singleton, hook routing
├── index.ts          # Registration and exports
└── core/             # Trunk mechanics (foundational services)
    ├── card-piles.ts # Deck/discard operations with hooks
    ├── hand.ts       # Hand operations with hooks
    └── index.ts      # Core service exports
```

### Phase 2: Leaf Mechanics Extraction (Complete)

Extracted 16 validation mechanics using `preValidateAction` and other hooks:

| Mechanic | Hooks Used | Purpose |
|----------|------------|---------|
| `action-points` | `initPlayerState`, `preValidateAction`, `postExecuteAction`, `shouldAutoEndTurn` | AP allocation and tracking |
| `income` | `onTurnStart` | Round-based income |
| `hand-management` | `onBeforeDraw` | Hand limits (cannot_draw policy) |
| `card-type-rules` | `preValidateAction` | Card type playability |
| `take-that` | `preValidateAction` | Interference card targeting |
| `lose-a-turn` | `preValidateAction` | Blocking effects |
| `grid-movement` | `preValidateAction` | Grid adjacency validation |
| `place-location` | `preValidateAction` | Location placement rules |
| `board-state` | `preValidateAction` | Board state transitions |
| `place-card` | `preValidateAction` | Card placement on states |
| `trading` | `preValidateAction` | Trade offer/response validation |
| `open-drafting` | `preValidateAction` | Draft card validation |
| `set-collection` | `preValidateAction` | Set claim validation |
| `push-your-luck` | `preValidateAction` | Roll/bank validation |
| `auction-english` | `preValidateAction` | Bid validation |
| `variable-player-powers` | `initPlayerState` | Power assignment |

### Phase 3: Core Services with Hooks (Complete)

Created "trunk" mechanics that expose hooks for leaf mechanics:

**Card Piles Service** (`core/card-piles.ts`):
- `drawFromDeck(state, count, playerId?)` - Fires `onBeforeDraw`/`onAfterDraw`
- `addToDiscard(state, cards, playerId?)` - Fires `onDiscard`
- `peekDiscard`, `hasCardsAvailable`, `getDeckSize`, `getDiscardSize`

**Hand Service** (`core/hand.ts`):
- `addToHand(state, playerId, cards)` - Fires `onBeforeAddToHand`/`onAfterAddToHand`
- `removeFromHandByIndex/ByName` - Fires `onAfterRemoveFromHand`
- `removeCardsFromHand` - Batched hook firing
- `findInHand`, `getHandSize`, `getHand`

### Phase 4: Lifecycle and Win Hooks (Complete)

Added turn lifecycle and win condition hooks:

| Hook | Context | Purpose |
|------|---------|---------|
| `onTurnStart` | `TurnStartContext` | Turn begin processing |
| `onTurnEnd` | `TurnEndContext` | Turn end processing |
| `onCheckWin` | `WinCheckContext` | Custom win conditions |

Registry methods:
- `onTurnEnd(state, playerId, nextPlayerId, isRoundEnd)`
- `onCheckWin(state, playerId, trigger)`
- `checkAllWinConditions(state, trigger)`

### Phase 5: Action Execution & Registration (Complete)

Added hooks for mechanics to own their action execution and registration:

| Hook | Context/Return | Purpose |
|------|----------------|---------|
| `onExecuteAction` | `ActionExecutionContext` → `ActionExecutionResult` | Handle action execution |
| `getAvailableActions` | `HookContext` → `AvailableAction[]` | Expose available actions |
| `describeAction` | `GameAction` → `ActionDescription` | Describe action for UI |

**ActionExecutionResult** enables mechanics to:
- Return `handled: true` to prevent default execution
- Specify `stateChanges` to apply
- Control `advanceTurn` and `checkWin` behavior
- Provide `logMessage` and `logData` for event logging

**Proof of Concept**: `push-your-luck` mechanic now fully owns:
- Validation via `preValidateAction`
- Execution via `onExecuteAction` (roll dice, handle bust, bank points)
- Action exposure via `getAvailableActions` (roll/bank when available)
- Action description via `describeAction`

Registry methods:
- `executeAction(state, playerId, action)` - Routes to mechanic handlers
- `getAvailableActions(state, playerId)` - Collects actions from all mechanics
- `describeAction(state, action)` - Gets description from owning mechanic

## Current Hook Infrastructure

```typescript
interface MechanicHooks {
  slug: string;
  name: string;

  // Lifecycle hooks
  initPlayerState?(ctx: PlayerInitContext): PlayerInitResult | null;
  onTurnStart?(ctx: TurnStartContext): StateChanges | null;
  onTurnEnd?(ctx: TurnEndContext): StateChanges | null;

  // Action validation hooks
  preValidateAction?(ctx: HookContext, action: GameAction): ValidationResult | null;
  postExecuteAction?(ctx: HookContext, action: GameAction): StateChanges | null;
  shouldAutoEndTurn?(ctx: HookContext): boolean;

  // Win condition
  onCheckWin?(ctx: WinCheckContext): WinCheckResult | null;

  // Action execution & registration hooks
  onExecuteAction?(ctx: ActionExecutionContext): ActionExecutionResult | null;
  getAvailableActions?(ctx: HookContext): AvailableAction[];
  describeAction?(action: GameAction): ActionDescription | null;

  // Core operation hooks
  onBeforeDraw?(ctx: DrawContext): DrawHookResult | null;
  onAfterDraw?(ctx: AfterDrawContext): StateChanges | null;
  onDiscard?(ctx: DiscardContext): StateChanges | null;
  onBeforeAddToHand?(ctx: HandAddContext): HandAddHookResult | null;
  onAfterAddToHand?(ctx: HandAddContext): StateChanges | null;
  onAfterRemoveFromHand?(ctx: HandRemoveContext): StateChanges | null;
}
```

## What Remains in game.ts

### High Priority (Core Game Rules)

| Concept | Lines | Description | Status |
|---------|-------|-------------|--------|
| **Win Conditions** | 1091-1260 | Pattern matching ("reach state", "score >= N", "empty hand") | ✅ Migrated |
| **Push Your Luck** | 3154-3236 | Dice rolling, bust detection, banking | ✅ Migrated |
| **Set Collection** | 3058-3149 | Set validation, points award | ✅ Migrated |
| **Trading** | 2795-2927 | Trade creation, card transfer | ✅ Migrated |
| **Open Drafting** | 3283-3334 | Card draft from display | ✅ Migrated |
| **Take-That Effects** | 2323-2360 | Effect application to targets | Pending - use `postExecuteAction` |
| **Board Movement** | 2540-2670 | State transitions, placed card effects | ✅ Migrated |
| **Place Card/Location** | 2675-2790 | Card/location placement | ✅ Migrated |

### Medium Priority (Partially Extracted)

| Concept | Description | Extraction Approach |
|---------|-------------|---------------------|
| Turn Management | Turn cycling, effect decrement | Use `onTurnEnd` hook |
| Hand Limit Policies | discard_oldest, discard_choice | Extend `onBeforeDraw`/`onAfterAddToHand` |
| Resource/Currency | Resource spending | New `resource` core service |
| Color Matching | UNO-style card matching | New `card-matching` mechanic |

## Path Forward

### Phase 6: Migrate Remaining Mechanics to onExecuteAction (Complete)

Mechanics migrated to full `onExecuteAction` pattern:

| Mechanic | Actions | Status |
|----------|---------|--------|
| `push-your-luck` | `roll`, `bank` | ✅ Complete |
| `set-collection` | `collect_set` | ✅ Complete |
| `trading` | `trade_offer`, `trade_respond` | ✅ Complete |
| `open-drafting` | `draft` | ✅ Complete |
| `board-state` | `move` | ✅ Complete |
| `place-card` | `place_card` | ✅ Complete |
| `place-location` | `place_location` | ✅ Complete |

Each migration follows the push-your-luck pattern:
1. Add `onExecuteAction` to handle the action
2. Add `getAvailableActions` to expose the action
3. Add `describeAction` for UI descriptions
4. Keep `preValidateAction` for validation

### Phase 7: Core Service Extraction (Complete)

All core services extracted:

```
src/mechanics/core/
├── card-piles.ts     # ✅ Deck/discard operations with hooks
├── hand.ts           # ✅ Hand operations with hooks
├── resources.ts      # ✅ Resource/currency operations with hooks
├── effects.ts        # ✅ Effect management with hooks
├── board.ts          # ✅ Board state and movement with hooks
├── turns.ts          # ✅ Turn/round management
└── index.ts
```

New hooks added:
- `onBeforeResourceChange` / `onAfterResourceChange` - Resource operations
- `onBeforeAddEffect` / `onAfterAddEffect` / `onBeforeRemoveEffect` / `onEffectExpired` - Effect lifecycle
- `onBeforeMove` / `onAfterMove` - Board movement

### Phase 8: Win Condition Mechanics (Complete)

Created win condition mechanics that use `onCheckWin` with YAML config:

```
src/mechanics/win-conditions/
├── reach-state.ts      # ✅ Win by reaching a board state
├── score-threshold.ts  # ✅ Win by score >= N
├── empty-hand.ts       # ✅ Win by emptying hand (UNO)
├── elimination.ts      # ✅ Win by being last standing
├── timeout-winner.ts   # ✅ Determine winner on max_rounds timeout
└── index.ts
```

| Mechanic | Config Key | Example Config |
|----------|------------|----------------|
| `win-reach-state` | `win_reach_state` | `{ target_state: "Victory" }` |
| `win-score-threshold` | `win_score_threshold` | `{ threshold: 100, operator: ">=" }` |
| `win-empty-hand` | `win_empty_hand` | `true` |
| `win-elimination` | `win_elimination` | `true` |
| `win-timeout` | `win_timeout` | `{ type: "highest_score" }` |

**Composable**: Multiple win conditions can be enabled simultaneously:

```yaml
engine_mechanics:
  # First to score 100 OR reach Victory wins
  win_score_threshold:
    threshold: 100
  win_reach_state:
    target_state: "Victory"
  # On timeout, highest score wins
  win_timeout:
    type: highest_score
```

Each mechanic:
1. Checks if its config key is present in `engine_mechanics`
2. Evaluates the win condition for the player
3. Returns `{ won: true, reason }` or `null`

### Phase 9: Mechanic Composition (Complete)

Added mechanic composition through dependencies, conflicts, and config schemas:

**MechanicHooks interface extended:**
```typescript
interface MechanicHooks {
  slug: string;
  name: string;

  /** Mechanics this one depends on */
  dependencies?: string[];

  /** Mechanics this one conflicts with */
  conflicts?: string[];

  /** Config schema for this mechanic */
  configSchema?: MechanicConfigSchema;
}
```

**MechanicConfigSchema for validation:**
```typescript
interface MechanicConfigSchema {
  type: 'object' | 'boolean';
  properties?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: (string | number | boolean)[];
    default?: unknown;
    required?: boolean;
  }>;
  required?: string[];
  description?: string;
}
```

**Registry validation:**
```typescript
// Returns array of validation errors
validateDependencies(config: GameConfig): MechanicValidationError[]

interface MechanicValidationError {
  mechanic: string;
  type: 'missing_dependency' | 'conflict';
  message: string;
}
```

**Example usage:**
```typescript
export const scoreThresholdWinMechanic: MechanicHooks = {
  slug: 'win-score-threshold',
  name: 'Score Threshold Win Condition',

  configSchema: {
    type: 'object',
    description: 'Win by reaching a score threshold',
    properties: {
      threshold: { type: 'number', required: true },
      operator: { type: 'string', enum: ['>=', '>', '==', '='], default: '>=' }
    },
    required: ['threshold']
  },

  onCheckWin(ctx) { /* ... */ }
};
```

## Target Architecture

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
│  - Collects available actions                                │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Core Services  │ │ Leaf Mechanics  │ │ Win Conditions  │
│  (Trunk)        │ │                 │ │                 │
│  - card-piles   │ │ - action-points │ │ - reach-state   │
│  - hand         │ │ - hand-mgmt     │ │ - score-thresh  │
│  - resources    │ │ - trading       │ │ - empty-hand    │
│  - effects      │ │ - push-luck     │ │ - collect-sets  │
│  - board        │ │ - set-collect   │ │                 │
│  - turns        │ │ - grid-movement │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     game.ts (Minimal)                        │
│  - State persistence                                         │
│  - Hook orchestration                                        │
│  - Event logging                                             │
│  - Player management                                         │
└─────────────────────────────────────────────────────────────┘
```

## Migration Strategy

1. **No big-bang rewrites** - Strangler fig pattern throughout
2. **Backwards compatible** - Existing games continue to work
3. **Incremental extraction** - One mechanic/concept at a time
4. **Test as we go** - Verify behavior preserved after each extraction
5. **Config-driven** - Mechanics enabled via `engine_mechanics` config

## Success Metrics

- [ ] game.ts reduced from ~3700 lines to <1000 lines
- [ ] All action types handled by mechanics (not hardcoded)
- [ ] Win conditions fully pluggable
- [ ] New mechanics can be added without modifying game.ts
- [ ] Mechanics can be composed (enable multiple, they work together)
- [ ] Available actions dynamically generated from enabled mechanics

## Files Modified This Session

| File | Changes |
|------|---------|
| `src/mechanics/types.ts` | Added TurnEndContext, WinCheckContext, ActionExecutionContext, AvailableAction, ActionDescription |
| `src/mechanics/registry.ts` | Added onTurnEnd, onCheckWin, executeAction, getAvailableActions, describeAction routing |
| `src/mechanics/hand-management.ts` | Migrated to use onBeforeDraw |
| `src/mechanics/push-your-luck.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/set-collection.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/trading.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/open-drafting.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/board-state.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/place-card.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/place-location.ts` | Full migration: onExecuteAction, getAvailableActions, describeAction |
| `src/mechanics/core/card-piles.ts` | Added hooks (onBeforeDraw, onAfterDraw, onDiscard) |
| `src/mechanics/core/hand.ts` | Added hooks (onBeforeAddToHand, onAfterAddToHand, onAfterRemoveFromHand) |
| `src/mechanics/core/resources.ts` | NEW: Resource operations with hooks |
| `src/mechanics/core/effects.ts` | NEW: Effect lifecycle operations with hooks |
| `src/mechanics/core/board.ts` | NEW: Board state operations with hooks |
| `src/mechanics/core/turns.ts` | NEW: Turn/round management operations |
| `src/core/game.ts` | Updated to use core services with playerId for hooks |
| `src/mechanics/win-conditions/reach-state.ts` | NEW: Win by reaching board state |
| `src/mechanics/win-conditions/score-threshold.ts` | NEW: Win by score threshold |
| `src/mechanics/win-conditions/empty-hand.ts` | NEW: Win by emptying hand |
| `src/mechanics/win-conditions/elimination.ts` | NEW: Win by being last standing |
| `src/mechanics/win-conditions/timeout-winner.ts` | NEW: Timeout winner determination |
| `src/mechanics/win-conditions/index.ts` | NEW: Win condition exports |
| `src/mechanics/index.ts` | Register win condition mechanics, export MechanicValidationError |
| `src/mechanics/types.ts` | Added dependencies, conflicts, configSchema to MechanicHooks |
| `src/mechanics/registry.ts` | Added validateDependencies, getMechanic methods |
| `src/mechanics/income.ts` | Added example configSchema |
| `src/mechanics/win-conditions/score-threshold.ts` | Added example configSchema |

## Commits This Session

1. `b6f4dc5` - Core card services (trunk mechanics)
2. `6793899` - Core operation hooks
3. `240afb7` - Turn lifecycle and win condition hooks
4. `41cac14` - Action execution and registration hooks
5. `b387a35` - Migrate set-collection, trading, open-drafting
6. `c24bddd` - Migrate board-state, place-card, place-location
7. `9d3c5f1` - Complete Phase 7 core service extraction
8. `6fdc2f4` - Phase 8: Win condition mechanics with YAML config
9. (pending) - Phase 9: Mechanic composition (dependencies, conflicts, configSchema)
