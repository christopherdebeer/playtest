# Playtest Findings Deep-Dive: 2026-02-09

Comprehensive analysis of issues discovered during full-catalog manual playtesting.

## Executive Summary

**18 games playtested** via `/playtest-manual`. **16 completed with findings**, 2 rate-limited (429).

**Total issues found: 118** across 16 games.

### Critical Systemic Issues (Affect Multiple Games)

| Issue | Severity | Games Affected | Root Cause Location |
|-------|----------|----------------|---------------------|
| `highest_score` win condition triggers immediately | CRITICAL | 3+ games | `src/core/game.ts:1314-1329` |
| Action points don't allow multiple actions per turn | CRITICAL | 5+ games | `src/core/game.ts:1083-1085` |
| Card effects not dispatched/applied | CRITICAL | 8+ games | Missing central effect dispatcher |
| `player.state` vs `player.currentNode` desync | CRITICAL | All race games | `src/mechanics/win-conditions/race.ts:67` |
| Simultaneous selection visibility leak | CRITICAL | 2+ games | `src/mechanics/simultaneous-action-selection.ts` |

---

## Systemic Issues (Cross-Game)

### 1. `highest_score` Win Condition Triggers Immediately

**Severity**: CRITICAL
**Affected Games**: Spellbook Showdown, Rondel Express, Arcane Assembly (confirmed), likely more
**Root Cause**: `src/core/game.ts` lines 1314-1329

**Analysis**:
```typescript
if (condition.includes('highest_score') || condition.includes('highest score')) {
  let highestScore = -Infinity;
  let winner = 'none';
  for (const [pid, player] of Object.entries(state.players)) {
    const score = player.score ?? 0;
    if (score > highestScore) {
      highestScore = score;
      winner = pid;
    }
  }
  if (winner !== 'none') {
    return { winner, reason: `${winner} wins with highest score (${highestScore})` };
  }
}
```

The `highest_score` condition is checked after every action. Any player with score > 0 immediately wins, even on turn 1 round 1.

**Fix**: Only evaluate `highest_score` when `state.round >= config.max_rounds`:
```typescript
if (condition.includes('highest_score')) {
  const maxRounds = config.max_rounds || Infinity;
  if (state.round < maxRounds) return null; // Not time yet
  // ... existing logic
}
```

---

### 2. Action Points Don't Allow Multiple Actions Per Turn

**Severity**: CRITICAL
**Affected Games**: Shadow Operations, Dice Dynasties, Battle Forge, AAOTE, Fortune Seekers
**Root Cause**: `src/core/game.ts` lines 1083-1085

**Analysis**:
The `isMultiActionAllowed()` function only returns true if `action_points` mechanic is enabled AND the action explicitly sets `advanceTurn: false`. Many mechanics (worker placement, place_location, dice rolling) set `advanceTurn: true` unconditionally.

**Fix**: Actions should only advance turn when AP is exhausted:
```typescript
// In executeAction, after applying action:
const apRemaining = player.actionPoints - player.actionPointsUsed;
const shouldAdvance = result.advanceTurn && (apRemaining <= 0 || !hasActionPointsMechanic);
```

---

### 3. Card Effects Not Dispatched/Applied

**Severity**: CRITICAL
**Affected Games**: UNO, Markov's Chains, Parallel Race, Engine Masters, Battle Forge, Spellbook Showdown, Alliance, Shadow Operations
**Root Cause**: No central effect dispatcher

**Analysis**:
Card effects are defined in RULES.md but never executed:
- `move_forward`, `move_backward` - Not handled
- `block_turn`, `skip`, `lose_turn` - Not handled
- `draw` - Not handled (UNO Draw Two)
- `probability_boost`, `probability_penalty` - Not persisting
- `bonus_worker`, `score` - Not handled

Each mechanic handles only its own effect types. New effect types have no handler.

**Fix**: Create `src/mechanics/core/effect-dispatcher.ts`:
```typescript
export function dispatchCardEffect(ctx: HookContext, effect: CardEffect, target: string): StateChanges {
  const handlers: Record<string, EffectHandler> = {
    'draw': handleDrawEffect,
    'skip': handleSkipEffect,
    'move_forward': handleMoveForward,
    'move_backward': handleMoveBackward,
    'block_turn': handleBlockTurn,
    'probability_boost': handleProbabilityBoost,
    'score': handleScoreEffect,
    // ... etc
  };

  const handler = handlers[effect.type];
  if (!handler) {
    console.warn(`Unhandled effect type: ${effect.type}`);
    return {};
  }
  return handler(ctx, effect, target);
}
```

---

### 4. `player.state` vs `player.currentNode` Desync

**Severity**: CRITICAL
**Affected Games**: Parallel Race, Road Rally, all point-to-point + race games
**Root Cause**: Field name mismatch

**Analysis**:
- Race win condition checks: `ctx.player.state`
- Point-to-point movement updates: `player.currentNode`
- These are never synchronized

**Fix** (Option A - in race.ts):
```typescript
const currentState = ctx.player.currentNode || ctx.player.state;
```

---

### 5. Simultaneous Selection Visibility Leak

**Severity**: CRITICAL
**Affected Games**: Council of Whispers, Spellbook Showdown
**Root Cause**: Raw shared state not filtered

**Analysis**:
The `getPlayerView` hook returns filtered view, but raw `shared.simultaneousSelection.selections` is still visible to all players during selecting phase.

**Fix**: Add `getVisibleState` hook to redact selections:
```typescript
getVisibleState(ctx: VisibilityContext): VisibleState | null {
  const selState = ctx.state.shared.simultaneousSelection;
  if (!selState || selState.phase !== 'selecting') return null;

  return {
    sharedState: {
      simultaneousSelection: {
        ...selState,
        selections: { [ctx.viewerId]: selState.selections[ctx.viewerId] }
      }
    }
  };
}
```

---

### 6. Hidden Role Distribution Bug

**Severity**: CRITICAL
**Affected Games**: Council of Whispers, AAOTE
**Root Cause**: Roles trimmed from wrong end / not shuffled

**Analysis**:
`buildRoleAssignments()` pops excess roles from end of list without shuffling first. Later-defined roles (Conspirator, Opportunist, Enemy) never get assigned.

**Fix**:
```typescript
function buildRoleAssignments(config, playerCount) {
  const roles = [];
  for (const roleDef of config.roles) {
    for (let i = 0; i < (roleDef.count ?? 1); i++) {
      roles.push(roleDef.id);
    }
  }
  // SHUFFLE FIRST, then trim
  return shuffleArray(roles).slice(0, playerCount);
}
```

---

## Per-Game Issue Summary

| Game | Issues | Critical | Key Problems |
|------|--------|----------|--------------|
| Road Rally | 9 | 3 | Ladder climbing = trick-taking logic |
| Parallel Race | 9 | 4 | Card effects not implemented, win detection broken |
| Council of Whispers | 8 | 3 | Role distribution, visibility leak, phases skipped |
| Engine Masters | 7 | 3 | Deck-building mechanics broken, state corruption |
| Draft Duel | 9 | 2 | Closed drafting not implemented |
| Spellbook Showdown | 7 | 1 | Premature game end, command cards broken |
| Shadow Operations | 10 | 1 | AP bug, missing actions, events not active |
| Markov's Chains | 8 | 6 | Card effects don't persist/apply, probability broken |
| UNO | 4 | 2 | Draw Two/Skip effects not applied |
| Rondel Express | 3 | 1 | Premature game end, resource costs not deducted |
| Alliance | 7 | 3 | Cooperative/tableau mechanics not implemented |
| Fortune Seekers | 4 | 2 | Open-drafting broken, push-your-luck broken |
| Arcane Assembly | 5 | 1 | Premature game end, action programming broken |
| Battle Forge | 6 | 3 | Worker placement broken, score system broken, resource corruption |
| Dice Dynasties | 10 | 4 | AP bug, dice effects not applied, investment broken |
| AAOTE | 9 | 3 | AP inconsistency, duplicate objectives, no enemy assigned |
| **TOTAL** | **115** | **42** | |

---

## Mechanics Needing Implementation/Fixes

### Fully Broken (Core mechanic non-functional)

| Mechanic | Games Using | Status |
|----------|-------------|--------|
| closed-drafting | Draft Duel | Draft pools never populated |
| deck-building | Engine Masters | Personal decks/discards broken |
| ladder-climbing | Road Rally | Uses trick-taking logic instead |
| action-programming | Arcane Assembly | Programmed actions never execute |
| push-your-luck | Fortune Seekers | Turn advances after single roll |

### Partially Broken (Some features work)

| Mechanic | Games Using | Issues |
|----------|-------------|--------|
| worker-placement | Battle Forge | Ends turn, no rewards, no round-start retrieval |
| simultaneous-action-selection | Council, Spellbook | Visibility leak, selections not executed |
| hidden-roles | Council, AAOTE | Distribution bug, duplicates |
| cooperative | Alliance | Threat never increments |
| tableau-building | Alliance | No scoring, no synergies |
| investment | Dice Dynasties | Never matures, wrong cost handling |

### Card Effect Types Needing Handlers

| Effect Type | Used In | Status |
|-------------|---------|--------|
| `draw` | UNO, Engine Masters | Not applied |
| `skip` | UNO | Not applied |
| `move_forward` | Parallel Race | Not implemented |
| `move_backward` | Parallel Race | Not implemented |
| `block_turn` | Parallel Race, Markov's | Not applied |
| `probability_boost` | Markov's Chains | Not persisting |
| `probability_penalty` | Markov's Chains | Not applied to target |
| `bonus_worker` | Battle Forge | Not applied |
| `score` | Multiple | Not applied |
| `wild` | UNO | Works |
| `reverse` | UNO | Untested |

---

## Recommended Fix Priority

### Immediate (Blocking Multiple Games)

1. **`highest_score` win condition** - 3+ games unplayable
2. **Action points multi-action** - 5+ games affected
3. **Central effect dispatcher** - 8+ games affected
4. **State/currentNode sync** - All race games

### High Priority

5. **Simultaneous selection visibility** - Security issue
6. **Hidden role distribution** - Social deduction games broken
7. **Deck-building personal discard** - Engine Masters unplayable
8. **Closed drafting initialization** - Draft Duel unplayable

### Medium Priority

9. Ladder climbing logic (Road Rally)
10. Push-your-luck turn handling (Fortune Seekers)
11. Worker placement integration (Battle Forge)
12. Investment maturity tracking (Dice Dynasties)
13. Cooperative threat progression (Alliance)

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/core/game.ts` | Fix `highest_score` timing, multi-action turn logic | IMMEDIATE |
| `src/mechanics/core/effect-dispatcher.ts` | NEW - Central effect routing | IMMEDIATE |
| `src/mechanics/win-conditions/race.ts` | Check `currentNode` fallback | IMMEDIATE |
| `src/mechanics/simultaneous-action-selection.ts` | Add `getVisibleState` hook | HIGH |
| `src/mechanics/hidden-roles.ts` | Fix role distribution algorithm | HIGH |
| `src/mechanics/deck-building.ts` | Fix personal deck/discard separation | HIGH |
| `src/mechanics/closed-drafting.ts` | Fix deck initialization order | HIGH |
| `src/mechanics/ladder-climbing.ts` | Fix comparison and resolution logic | MEDIUM |
| `src/mechanics/push-your-luck.ts` | Allow multi-roll before banking | MEDIUM |
| `src/mechanics/worker-placement.ts` | Fix turn advancement, rewards, retrieval | MEDIUM |
| `src/mechanics/investment.ts` | Fix cost deduction, maturity tracking | MEDIUM |
| `src/mechanics/cooperative.ts` | Fix threat increment at round end | MEDIUM |

---

## Rate-Limited Games (Need Retry)

- Treasure Hunters
- Grand Bazaar

---

## Fix Progress Log

### 2026-02-09: Critical Systemic Fixes (6 of 6 completed)

All 6 critical systemic issues have been fixed, built, and validated via `/playtest-manual`.

#### Fix #1: `highest_score` Win Condition — FIXED ✓
**File**: `src/core/game.ts:1315-1335`
**Change**: `highest_score` aggregate win condition now only evaluates when `state.round >= max_rounds` or `state.turnNumber >= max_turns`. Previously triggered immediately after any action.
**Validated**: Spellbook Showdown game ran through multiple rounds without premature end.

#### Fix #2: Action Points Multi-Action — FIXED ✓
**File**: `src/core/game.ts:1890-1903`
**Change**: When `action_points` mechanic is enabled, the `advanceTurn: true` flag from mechanics is overridden — only AP depletion (`shouldAutoEndTurn`) controls turn advancement. This allows players to take multiple actions per turn as designed.
**Validated**: Spellbook Showdown player used 3 AP across 3 actions (play_card, draw, draw) before turn advanced.

#### Fix #3: Card Effect Dispatcher — FIXED ✓
**File**: `src/mechanics/core/effect-dispatcher.ts` (NEW)
**Change**: Created central effect dispatcher that responds to `onCardPlayed` hook. Handles `draw` (force draw), `score`, `reverse`, `bonus_worker` directly. Routes other effect types through `mechanicRegistry.applyEffect()` (so `move_forward`/`move_backward` go through point-to-point-movement). Falls back to adding status effects for unhandled types.
**Validated**: UNO Draw Two card now forces next player to draw 2 cards (P2 went from 7 → 9 cards).

#### Fix #4: `player.state` / `player.currentNode` Desync — FIXED ✓
**Files**: `src/mechanics/win-conditions/race.ts:67`, `src/mechanics/point-to-point-movement.ts:325,497`
**Change**: Two-pronged fix:
1. Race win condition now checks `player.currentNode || player.state` (fallback)
2. Point-to-point movement now syncs `state: targetNode` alongside `currentNode` in stateChanges

#### Fix #5: Simultaneous Selection Visibility Leak — FIXED ✓
**File**: `src/mechanics/simultaneous-action-selection.ts`
**Change**: Added `getVisibleState` hook that redacts `shared.simultaneousSelection.selections` during the `selecting` phase. Each player only sees their own selection in the filtered state.

#### Fix #6: Hidden Role Distribution — FIXED ✓
**File**: `src/mechanics/hidden-roles.ts:89-111`
**Change**: `buildRoleAssignments()` now shuffles the full role list BEFORE trimming to player count. Previously used `roles.pop()` which always removed later-defined roles (Conspirator, Opportunist, Enemy), making them unassignable.

### 2026-02-09: High & Medium Priority Fixes (6 of 6 completed)

#### Fix #7: Deck-Building Personal Discard — FIXED ✓
**File**: `src/mechanics/deck-building.ts:229-261`
**Change**: `onTurnStart` now discards remaining hand cards to `personalDiscard` before drawing a new hand. Previously, the hand was overwritten entirely, losing any unplayed cards (breaking the Dominion-style deck cycle).

#### Fix #8: Closed Drafting Initialization — FIXED ✓
**Files**: `src/mechanics/closed-drafting.ts:102-128, 145-203`
**Change**: Deferred pool creation from `initSharedState` to `onTurnStart`. The cards mechanic (which builds the deck) registers after closed-drafting, so `ctx.deck` was always empty during init. Now pools are created from `state.shared.deck` on first turn when the deck actually exists. Also removed dead `cardsForPlayer` variable with nonsensical formula.

#### Fix #9: Push-Your-Luck Turn Handling — FIXED ✓
**File**: `src/mechanics/push-your-luck.ts:114-132, 155-175`
**Change**: Bust and bank actions now set `advanceTurn: true` (previously `false`). This ensures the turn ends after busting (losing accumulated points) or banking (securing points). The AP fix (#2) ensures that in AP games, turn advancement still respects AP depletion.

#### Fix #10: Worker Placement Round-Start Retrieval + Registry Fix — FIXED ✓
**Files**: `src/mechanics/worker-placement.ts:440-469`, `src/mechanics/registry.ts:400-424`
**Change**: Two fixes:
1. Worker placement `onTurnStart` now retrieves ALL players' workers at round start (previously only the current player's workers)
2. **Registry bug**: `onTurnStart` hook merger was dropping `sharedStateChanges` — only `playerStateChanges` were merged. This caused worker space updates and cooperative state changes to be silently lost. Fixed to merge both.

#### Fix #11: Investment Cost Deduction — FIXED ✓
**File**: `src/mechanics/investment.ts:148-189`
**Change**: Investment cost now deducts from player `resources` (not `score`). Also synced `currentRound` tracking with `state.round` to prevent round desync between investment state and game state.

#### Fix #12: Cooperative Threat Progression — FIXED ✓ (by Fix #10)
**Root Cause**: The cooperative-actions mechanic correctly incremented threat in `onTurnStart` via `sharedStateChanges`, but the registry's `onTurnStart` merger was dropping `sharedStateChanges` (see Fix #10). The registry fix resolves threat progression for Alliance and all other mechanics relying on shared state changes at turn start.

### 2026-02-09: Validation & Additional Fixes

#### Fix #13: First-Turn onTurnStart — FIXED ✓
**File**: `src/core/game.ts:874-878`
**Change**: `startGameUnsafe()` now runs `mechanicRegistry.onTurnStart()` for the first player after game starts. Previously, `onTurnStart` only fired via `advanceTurn()`, which is never called for the very first turn. This caused mechanics that need first-turn initialization (e.g., closed-drafting pool distribution) to be skipped for the first player.
**Validated**: Draft Duel players now have draft pools on turn 1 (7 draft_select actions available immediately).

#### Fix #14: Alliance Config Key Mismatch — FIXED ✓
**File**: `games/alliance/RULES.md:9`
**Change**: Changed config key from `cooperative:` to `cooperative_actions:` to match the mechanic slug `cooperative-actions` → config key `cooperative_actions` (dash→underscore conversion in enablement check).

#### Fix #15: Cooperative getConfig() Lookup — FIXED ✓
**File**: `src/mechanics/cooperative-actions.ts:36`
**Change**: `getConfig()` was reading `config.engine_mechanics?.cooperative` but the config key is `cooperative_actions`. Changed to `config.engine_mechanics?.cooperative_actions`. This was a second mismatch beyond the RULES.md key — even with the correct config key in RULES.md, the mechanic's own config reader was looking at the wrong key.

#### Fix #16: Push-Your-Luck Turn Advancement Refinement — FIXED ✓
**File**: `src/core/game.ts:1889-1911`
**Change**: Two refinements to the turn advancement logic:
1. `lastActionRound` only set when `advanceTurn !== false` — prevents blocking follow-up PYL rolls in the same round
2. Added explicit `advanceTurn === false` case that saves state without advancing turn — allows mechanics like push-your-luck to keep a player on their turn even without action_points enabled

### Validation Results

#### Alliance (Cooperative Mechanics) — ✅ WORKING
- **Threat increments**: 0→1→2 over rounds (correct)
- **Contribute action**: Available and functional
- **Contributing 2 gold**: Reduced threat from 2 to 1.5, added gold to shared pool
- **Cooperative state**: Properly initialized (supplies: 10, morale: 5, threatLevel: 0)

#### Draft Duel (Closed Drafting) — ✅ WORKING
- **First-turn pools**: Player-1 has 7 draft_select actions on turn 1 (was empty before fix #13)
- **Card selection**: draft_select works correctly
- **Simultaneous mechanics**: Properly waits for all players before revealing
- **Pool distribution**: `closedDraftPoolsDistributed: true` from game start

#### Fortune Seekers (Push-Your-Luck) — ✅ WORKING
- **Roll action**: Available and functional
- **Multi-roll**: Successful rolls keep player on turn (accumulated points tracked)
- **Bank**: Correctly adds accumulated points to score and ends turn
- **Bust**: Correctly loses accumulated points and ends turn
- **Turn progression**: Player-1 → Player-2 after bank/bust

### Remaining Work

**Medium Priority** (not yet addressed):
- Ladder climbing logic (Road Rally)
