# Mechanic Expansion Roadmap

> **Follow-up to**: [MECHANIC_EXTRACTION_ROADMAP.md](./MECHANIC_EXTRACTION_ROADMAP.md)
>
> This document outlines the path from 21 implemented mechanics to comprehensive coverage of the 192 BoardGameGeek reference mechanics.

## Current State

**Implemented: 39 of 192 mechanics (20%)**

| Category | Implemented | Total | Coverage |
|----------|-------------|-------|----------|
| Action | 1 | 7 | 14% |
| Auction | 1 | 12 | 8% |
| Building | 1 | 11 | 9% |
| Cards | 10 | 15 | 67% |
| Conflict | 0 | 8 | 0% |
| Cooperative | 0 | 10 | 0% |
| Dice | 2 | 6 | 33% |
| Economic | 2 | 9 | 22% |
| Ending | 1 | 4 | 25% |
| Information | 2 | 8 | 25% |
| Movement | 4 | 22 | 18% |
| Other | 10 | 40 | 25% |
| Physical | 0 | 8 | 0% |
| Social | 0 | 11 | 0% |
| Turn Order | 0 | 8 | 0% |
| Victory | 6 | 5 | 120% |
| Worker Placement | 0 | 7 | 0% |

### Recently Implemented (Phase 1)

| Mechanic | Category | Description |
|----------|----------|-------------|
| `closed-drafting` | Cards | Simultaneous selection with passing (7 Wonders) |
| `trick-taking` | Cards | Classic trick-taking with trump/follow suit |
| `ladder-climbing` | Cards | Beat previous play or pass (President, Big Two) |
| `deck-building` | Building/Cards | Personal deck acquisition (Dominion, Star Realms) |
| `multi-use-cards` | Cards | Cards with multiple use options (Race for the Galaxy) |
| `movement-points` | Movement | Movement budget with terrain costs |
| `area-movement` | Movement | Movement between named areas with adjacency |
| `point-to-point-movement` | Movement | Graph-based node movement (Ticket to Ride, Pandemic) |
| `automatic-resource-growth` | Economic | Resources that grow over time |
| `events` | Other | Random/scheduled game events |
| `once-per-game-abilities` | Other | Special one-time abilities |
| `chaining` | Other | Actions that trigger follow-up effects |
| `catch-the-leader` | Other | Balancing mechanic that penalizes the leader |
| `win-race` | Victory | First to reach goal wins |
| `sudden-death-ending` | Ending | Instant win conditions |

### Recently Implemented (Phase 4)

| Mechanic | Category | Description |
|----------|----------|-------------|
| `hidden-roles` | Information | Secret role assignment (Werewolf, Mafia) |
| `traitor-game` | Information | Traitor vs loyalist asymmetric gameplay |

## Existing Hook Infrastructure

29 hooks are currently available:

### Action & Validation
- `preValidateAction(ctx, action)` - Block invalid actions
- `postExecuteAction(ctx, action)` - Post-execution modifications
- `onExecuteAction(ctx)` - Full action handler
- `getAvailableActions(ctx)` - Expose available actions
- `describeAction(action)` - Action descriptions

### Turn Lifecycle
- `onTurnStart(ctx, isNewRound)` - Turn initialization
- `onTurnEnd(ctx, nextPlayerId, isRoundEnd)` - Turn cleanup
- `shouldAutoEndTurn(ctx)` - Force turn end

### Player & Win
- `initPlayerState(ctx)` - Initialize player state
- `onCheckWin(ctx, trigger)` - Check win conditions

### Card Operations
- `onBeforeDraw(ctx, count)` - Modify/block draw
- `onAfterDraw(ctx, cards, reshuffled)` - React to draw
- `onBeforeAddToHand(ctx, cards)` - Filter/block hand add
- `onAfterAddToHand(ctx, cards)` - React to hand add
- `onAfterRemoveFromHand(ctx, cards)` - React to hand remove
- `onDiscard(ctx, cards)` - React to discard

### Resources
- `onBeforeResourceChange(ctx, resource, amount)` - Modify/block resource change
- `onAfterResourceChange(ctx, resource, amount, newAmount)` - React to resource change

### Effects
- `onBeforeAddEffect(ctx, effect)` - Modify/block effect add
- `onAfterAddEffect(ctx, effect)` - React to effect add
- `onBeforeRemoveEffect(ctx, effect)` - Block effect removal
- `onEffectExpired(ctx, effect)` - React to effect expiration

### Movement
- `onBeforeMove(ctx, target)` - Modify/block move
- `onAfterMove(ctx, previousState, newState)` - React to move

### Visibility (Phase 4)
- `getVisibleState(ctx)` - Filter state for viewer
- `onReveal(ctx)` - Handle info reveals
- `canSeeInfo(ctx, infoType, targetPlayerId)` - Check visibility permissions

### Dice (Phase 2)
- `onBeforeRoll(ctx)` - Modify dice count/sides or block
- `onAfterRoll(ctx)` - React to roll results

---

## Phase 1: Mechanics with Existing Hooks (No New Infrastructure)

These 18 mechanics can be implemented immediately using existing hooks:

### Card Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| ~~`closed-drafting`~~ | ~~`onExecuteAction`, `getAvailableActions`, turn hooks~~ | ⚠️ **Needs Work** - Marked implemented but playtesting revealed core functionality missing (no simultaneous selection phase, no pool passing, no draft pools created). Requires significant implementation work to support proper closed drafting as designed. |
| ~~`deck-bag-and-pool-building`~~ | ~~`onAfterDraw`, `postExecuteAction`, hand hooks~~ | ✅ Implemented as `deck-building` |
| ~~`trick-taking`~~ | ~~`preValidateAction`, `onExecuteAction`, `onTurnEnd`~~ | ✅ Implemented |
| ~~`ladder-climbing`~~ | ~~`preValidateAction`, `onExecuteAction`~~ | ✅ Implemented |
| ~~`multi-use-cards`~~ | ~~`preValidateAction`, `getAvailableActions`~~ | ✅ Implemented |

### Movement Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| ~~`area-movement`~~ | ~~`onBeforeMove`, `onAfterMove`~~ | ✅ Implemented |
| ~~`point-to-point-movement`~~ | ~~`onBeforeMove`, `onAfterMove`~~ | ✅ Implemented |
| ~~`movement-points`~~ | ~~`preValidateAction`, `onTurnStart`, `initPlayerState`~~ | ✅ Implemented |

### Auction Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| `auction-sealed-bid` | `preValidateAction`, `onTurnEnd` | Reveal bids at round end |
| `auction-once-around` | `preValidateAction`, turn hooks | One bid per player per auction |

### Dice Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| `re-rolling-and-locking` | `postExecuteAction`, player state | Extend push-your-luck pattern |

### Economic Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| ~~`automatic-resource-growth`~~ | ~~`onTurnStart`, `onAfterResourceChange`~~ | ✅ Implemented |

### Victory/Ending Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| ~~`sudden-death-ending`~~ | ~~`onCheckWin`~~ | ✅ Implemented |
| ~~`race`~~ | ~~`onCheckWin`, `onAfterMove`~~ | ✅ Implemented as `win-race` |
| ~~`catch-the-leader`~~ | ~~`onAfterResourceChange`~~ | ✅ Implemented |

### Other Mechanics

| Mechanic | Hooks to Use | Implementation Notes |
|----------|--------------|---------------------|
| ~~`events`~~ | ~~`onTurnStart`~~ | ✅ Implemented |
| ~~`once-per-game-abilities`~~ | ~~`preValidateAction`, player state~~ | ✅ Implemented |
| ~~`chaining`~~ | ~~`postExecuteAction`~~ | ✅ Implemented |

---

## Phase 2: Dice System (2 New Hooks) ✅ IMPLEMENTED

**Core Service**: `src/mechanics/core/dice.ts`

### Hooks (Implemented)

```typescript
interface DiceRollContext {
  state: GameState;
  playerId: string;
  diceCount: number;
  diceSides: number;
  purpose?: string;  // 'movement', 'combat', 'resource', etc.
  config: GameConfig;
}

interface DiceRollHookResult {
  diceCount?: number;
  diceSides?: number;
  modifier?: number;
  blocked?: boolean;
  blockReason?: string;
}

interface AfterRollContext extends DiceRollContext {
  results: number[];
  total: number;
  keptDice?: number[];
}

// Added to MechanicHooks:
onBeforeRoll?(ctx: DiceRollContext): DiceRollHookResult | null;
onAfterRoll?(ctx: AfterRollContext): StateChanges | null;
```

### Implemented Mechanics

| Mechanic | Description | Status |
|----------|-------------|--------|
| `dice-rolling` | Core dice rolling with modifiers | ✅ Implemented |

### Unlocked Mechanics (Ready to Implement)

| Mechanic | Description |
|----------|-------------|
| `different-dice-movement` | Dice determine movement options |
| `die-icon-resolution` | Symbol-based dice effects |
| `roll-spin-and-move` | Classic board game movement |
| `re-rolling-and-locking` | Yahtzee-style dice selection |

---

## Phase 3: Dynamic Turn Order (2 New Hooks)

**Modify**: `src/mechanics/core/turns.ts`

### New Hooks

```typescript
interface TurnOrderContext {
  state: GameState;
  config: GameConfig;
  currentOrder: string[];
  reason: 'round_start' | 'mid_round' | 'claim';
}

// Add to MechanicHooks:
onDetermineTurnOrder?(ctx: TurnOrderContext): string[] | null;
onPassPriority?(ctx: HookContext): { nextPlayer?: string; removeFromRound?: boolean } | null;
```

### Unlocked Mechanics

| Mechanic | Description |
|----------|-------------|
| `turn-order-auction` | Bid for turn position |
| `turn-order-claim-action` | Take action to claim position |
| `turn-order-pass-order` | Pass order from previous round |
| `turn-order-progressive` | Snake draft order |
| `turn-order-random` | Randomize each round |
| `turn-order-stat-based` | Order by player stat |
| `turn-order-time-track` | Time-based order |
| `turn-order-role-order` | Role determines order |

---

## Phase 4: Visibility System (3 New Hooks) ✅ IMPLEMENTED

**Core Service**: `src/mechanics/core/visibility.ts`

### Hooks (Implemented)

```typescript
interface VisibilityContext {
  state: GameState;
  viewerPlayerId: string;
  config: GameConfig;
}

interface RevealContext {
  state: GameState;
  revealingPlayerId: string;
  targetInfo: string;
  toPlayerIds: string[] | 'all';
  config: GameConfig;
}

// Added to MechanicHooks:
getVisibleState?(ctx: VisibilityContext): VisibleState | null;
onReveal?(ctx: RevealContext): StateChanges | null;
canSeeInfo?(ctx: VisibilityContext, infoType: string, targetPlayerId?: string): boolean | undefined;
```

### Implemented Mechanics

| Mechanic | Description | Status |
|----------|-------------|--------|
| `hidden-roles` | Secret role assignment | ✅ Implemented |
| `traitor-game` | Hidden traitor role | ✅ Implemented |

### Unlocked Mechanics (Ready to Implement)

| Mechanic | Description |
|----------|-------------|
| `hidden-movement` | Hidden player positions |
| `hidden-victory-points` | Secret scoring |
| `deduction` | Deduce hidden information |
| `memory` | Remember revealed info |
| `targeted-clues` | Give clues about hidden info |
| `roles-with-asymmetric-information` | Different info per role |

---

## Phase 5: Voting & Social (2 New Hooks)

**New Core Service**: `src/mechanics/core/social.ts`

### New Hooks

```typescript
interface VoteContext {
  state: GameState;
  playerId: string;
  topic: string;
  choice: string | number;
  config: GameConfig;
}

interface VoteTallyContext {
  state: GameState;
  topic: string;
  votes: Record<string, string | number>;
  config: GameConfig;
}

// Add to MechanicHooks:
onVoteCast?(ctx: VoteContext): StateChanges | null;
onVoteTally?(ctx: VoteTallyContext): { winner: string; tiebreaker?: string } | null;
```

### Unlocked Mechanics

| Mechanic | Description |
|----------|-------------|
| `voting` | Majority voting system |
| `negotiation` | Binding/non-binding agreements |
| `player-judge` | Player judges submissions |
| `i-cut-you-choose` | Division mechanic |
| `bribery` | Pay for votes/actions |
| `communication-limits` | Restricted communication |

---

## Phase 6: Combat System (6 New Hooks)

**New Core Service**: `src/mechanics/core/combat.ts`

### New Hooks

```typescript
interface CombatContext {
  state: GameState;
  attackerId: string;
  defenderId: string;
  attackerUnits?: string[];
  defenderUnits?: string[];
  config: GameConfig;
}

interface CombatResult {
  winner: 'attacker' | 'defender' | 'draw';
  attackerLosses?: number;
  defenderLosses?: number;
  territoryChange?: boolean;
}

// Add to MechanicHooks:
onCombatStart?(ctx: CombatContext): StateChanges | null;
getAttackModifiers?(ctx: CombatContext): { modifier: number; reason: string }[];
getDefenseModifiers?(ctx: CombatContext): { modifier: number; reason: string }[];
onResolveCombat?(ctx: CombatContext, attackValue: number, defenseValue: number): CombatResult | null;
onCombatEnd?(ctx: CombatContext, result: CombatResult): StateChanges | null;
onApplyCasualties?(ctx: CombatContext, casualties: { attacker: number; defender: number }): StateChanges | null;
```

### Unlocked Mechanics

| Mechanic | Description |
|----------|-------------|
| `area-impulse` | Area-based combat resolution |
| `chit-pull-system` | Random unit activation |
| `critical-hits-and-failures` | Combat criticals |
| `force-commitment` | Commit forces before resolution |
| `ratio-combat-results-table` | CRT-based resolution |
| `secret-unit-deployment` | Hidden unit placement |
| `kill-steal` | Steal kills from others |
| `zone-of-control` | Movement blocking |

---

## Phase 7: Worker Placement (5 New Hooks)

**New Core Service**: `src/mechanics/core/workers.ts`

### New Hooks

```typescript
interface WorkerContext {
  state: GameState;
  playerId: string;
  workerId: string;
  slotId: string;
  config: GameConfig;
}

interface WorkerSlot {
  id: string;
  action: string;
  occupied: boolean;
  occupiedBy?: string;
  requirements?: Record<string, unknown>;
}

// Add to MechanicHooks:
onBeforePlaceWorker?(ctx: WorkerContext): { blocked?: boolean; blockReason?: string } | null;
onAfterPlaceWorker?(ctx: WorkerContext): StateChanges | null;
onRecallWorkers?(ctx: HookContext): StateChanges | null;
getAvailableSlots?(ctx: HookContext): WorkerSlot[];
canPlaceWorker?(ctx: WorkerContext): boolean;
```

### Unlocked Mechanics

| Mechanic | Description |
|----------|-------------|
| `worker-placement` | Core worker placement |
| `worker-placement-with-dice-workers` | Dice as workers |
| `worker-placement-different-worker-types` | Multiple worker types |

---

## Phase 8: Advanced Auctions (5 New Hooks)

**New Core Service**: `src/mechanics/core/auction.ts`

### New Hooks

```typescript
interface AuctionContext {
  state: GameState;
  auctionId: string;
  item: unknown;
  currentBid?: number;
  currentBidder?: string;
  config: GameConfig;
}

interface BidResult {
  accepted: boolean;
  newCurrentBid?: number;
  reason?: string;
}

// Add to MechanicHooks:
onAuctionStart?(ctx: AuctionContext): StateChanges | null;
onBid?(ctx: AuctionContext, bidderId: string, amount: number): BidResult | null;
getMinimumBid?(ctx: AuctionContext): number;
canBid?(ctx: AuctionContext, playerId: string): boolean;
onAuctionEnd?(ctx: AuctionContext, winnerId: string | null, amount: number): StateChanges | null;
```

### Unlocked Mechanics

| Mechanic | Description |
|----------|-------------|
| `auction-dutch` | Descending price auction |
| `auction-dutch-priority` | Dutch with priority |
| `auction-fixed-placement` | Fixed bid positions |
| `auction-multiple-lot` | Multiple items at once |
| `auction-compensation` | Loser compensation |
| `auction-dexterity` | Physical auction |
| `closed-economy-auction` | Auction with money circulation |
| `constrained-bidding` | Limited bid options |
| `bids-as-wagers` | Bids become wagers |
| `selection-order-bid` | Bid for selection order |

---

## Implementation Priority Matrix

| Phase | Complexity | New Hooks | Mechanics Unlocked | Cumulative Total | Status |
|-------|------------|-----------|-------------------|------------------|--------|
| 1 | Low | 0 | 18 | 36 (19%) | 83% |
| 2 | Low | 2 | 1 (+4 unlocked) | 39 (20%) | ✅ **Done** |
| 3 | Medium | 2 | 8 | 47 (24%) | Next |
| 4 | Medium | 3 | 2 (+6 unlocked) | 39 (20%) | ✅ **Done** |
| 5 | Medium | 2 | 6 | 45 (23%) | Pending |
| 6 | High | 6 | 8 | 53 (28%) | Pending |
| 7 | High | 5 | 3 | 56 (29%) | Pending |
| 8 | High | 5 | 10 | 66 (34%) | Pending |

**Phase 1 Progress**: 15 of 18 mechanics implemented (83%)
**Phase 2 Progress**: 1 of 5 mechanics implemented (20%) - Dice infrastructure complete
**Phase 4 Progress**: 2 of 8 mechanics implemented (25%) - Visibility infrastructure complete

---

## Not Planned (Physical/Real-World Mechanics)

These mechanics require physical components or real-time elements unsuitable for turn-based agent simulation:

- `flicking` - Physical dexterity
- `stacking-and-balancing` - Physical dexterity
- `singing` - Audio component
- `real-time` - Not turn-based
- `speed-matching` - Real-time reaction
- `cube-tower` - Physical randomizer
- `physical-removal` - Physical component removal
- `elapsed-real-time-ending` - Real clock

---

## Next Steps

1. ~~**Create `core/visibility.ts`** - Enable hidden information games~~ ✅ Done
2. ~~**Create `core/dice.ts`** - Unlock dice mechanics (Phase 2)~~ ✅ Done
3. **Implement remaining Phase 2 mechanics** - different-dice-movement, die-icon-resolution, etc.
4. **Implement remaining Phase 4 mechanics** - hidden-movement, deduction, memory, etc.
5. **Implement Phase 1 mechanics** - No infrastructure changes needed (3 remaining)
6. **Extend `core/turns.ts`** - Support dynamic turn order (Phase 3)
7. **Create `core/social.ts`** - Enable voting & negotiation (Phase 5)

---

---

## Refactoring Opportunities

Based on mechanic library review, the following abstractions would reduce duplication and improve safety:

### High Priority

#### Movement System Unification
4 movement mechanics share similar patterns but don't share code:
- `area-movement`
- `point-to-point-movement`
- `movement-points`
- `grid-movement`

**Recommendation**: Extract base movement class with shared validation and state tracking.

#### Conflict Declaration
No mechanics currently declare `dependencies` or `conflicts` despite several potential issues:
- Movement mechanics should conflict with each other
- `trick-taking` and `ladder-climbing` both claim card plays

**Recommendation**: Add explicit conflict declarations to movement and card-play mechanics.

### Medium Priority

#### Point Economy Extraction
`action-points` and `movement-points` are nearly identical patterns.

**Recommendation**: Extract shared "point budget" base mechanic (~200 line reduction).

#### Win Condition Consolidation
7 win condition mechanics doing similar conditional checks.

**Recommendation**: Create single configurable win condition mechanic with multiple condition types.

### Lower Priority

#### Drafting Base Class
`open-drafting` and `closed-drafting` share significant logic.

**Recommendation**: Extract common drafting operations.

#### State Property Standardization
Position tracked in 3+ different properties (`state`, `currentArea`, `currentNode`).

**Recommendation**: Standardize position tracking across movement mechanics.

---

## Related Documents

- [MECHANIC_EXTRACTION_ROADMAP.md](./MECHANIC_EXTRACTION_ROADMAP.md) - Original extraction plan
- [ENGINE_ARCHITECTURE.md](./ENGINE_ARCHITECTURE.md) - Engine architecture overview
- [EXTENSION-GUIDE.md](./EXTENSION-GUIDE.md) - How to add new mechanics
