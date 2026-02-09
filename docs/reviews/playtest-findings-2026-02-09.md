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
