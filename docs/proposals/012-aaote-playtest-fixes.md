# Proposal 012: AAOTE Playtest Fixes

**Status**: Implemented
**Date**: 2025-02-04
**Game**: AAOTE (An Agent of the Enemy)

## Summary

A 5-player AAOTE playtest revealed 4 critical engine issues that prevented proper game resolution. This proposal documents the root causes and implemented fixes.

## Issues Discovered

### P0: Victory Declarations Not Routed to GM

**Symptom**: Players declared victory (e.g., "I've completed The Explorer objective!") but the GM never adjudicated these claims. The game continued past valid victory conditions.

**Root Cause**: The `executeAction()` function in `game.ts` handled `declareVictory: true` flag only in the `pass` action case via `shouldProcessVictoryDeclaration()`, but this only worked in contest-based adjudication flow. Direct action execution ignored victory declarations entirely.

**Fix**: Modified the `pass` action handler to create `pendingVictoryClaim` in game state when `declareVictory: true` is present. The GM agent receives notification and must adjudicate before the next turn.

```typescript
// In game.ts pass case
if (action.declareVictory) {
  const victoryClaim = {
    playerId: currentPlayer,
    claimType: 'objective',
    description: action.victoryDescription || 'Player claims objective completion',
    timestamp: Date.now()
  };
  state.pendingVictoryClaim = victoryClaim;
}
```

### P0: Turn Limit Not Auto-Enforced

**Symptom**: AAOTE configured `max_rounds: 40` expecting 40 individual turns, but the engine interpreted this as 40 full player cycles (rounds). A 5-player game would run 200 turns instead of 40.

**Root Cause**: `max_rounds` checks complete player cycles, not individual turns. AAOTE's rules specify "turn 40" as the timeout, meaning the 40th individual turn.

**Fix**: Added new `max_turns` config option that counts individual turns:

```typescript
// In GameConfig type
max_turns?: number;  // Individual turn limit (takes precedence over max_rounds)

// In advanceTurn()
const maxTurns = state.config.max_turns as number | undefined;
if (maxTurns && state.turnNumber > maxTurns) {
  const result = determineTimeoutWinner(state);
  state.status = 'pending_analysis';
  // ... trigger timeout winner logic
}
```

### P1: Objectives Not Distributed to Players

**Symptom**: No player received their secret objective at game start. The `objectives` config in RULES.md was parsed but never assigned to players.

**Root Cause**: The `hidden-roles` mechanic reads from `engine_mechanics.hidden_roles.roles`, not from the top-level `objectives` array. AAOTE defines objectives differently than standard hidden roles.

**Fix**: Created new `hidden-objectives` mechanic that:
1. Reads from top-level `objectives` array in game config
2. Shuffles and assigns one objective per player at init
3. Hides objectives from other players via `getVisibleState` hook
4. Sets `team` based on objective type (enemy vs regular)

```typescript
// In hidden-objectives.ts initPlayerState()
const objectives = ctx.config.objectives;  // Top-level objectives array
const shuffled = shuffleArray(objectivePool);
const assigned = shuffled[ctx.playerIndex];
return {
  objective: assigned,
  hiddenRole: assigned.name,
  team: assigned.type === 'enemy' ? 'enemy' : 'regular'
};
```

### P2: Hand Limit Exceeded via Non-Draw Acquisition

**Symptom**: Players accumulated more than 7 cards (the configured hand limit) through trades and location effects like "Ancient Ruins: Draw 1 card when entering".

**Root Cause**: `onBeforeDraw` hook only enforced hand limit on explicit draw actions. Cards acquired through trades, effects, or location abilities bypassed the check.

**Fix**: Added `onBeforeAddToHand` hook to `hand-management` mechanic that enforces hand limit on ALL card acquisition:

```typescript
// In hand-management.ts
onBeforeAddToHand(ctx: HandAddContext): HandAddHookResult | null {
  const handLimit = ctx.config.engine_mechanics?.hand_limit;
  const currentHandSize = player.hand.length;
  const maxAddable = Math.max(0, handLimit - currentHandSize);

  if (policy === 'cannot_draw' && maxAddable === 0) {
    return { blocked: true, blockReason: 'Hand limit reached' };
  }
  return { cards: ctx.cards.slice(0, maxAddable) };
}
```

## Files Changed

| File | Changes |
|------|---------|
| `src/core/game.ts` | Victory declaration routing, max_turns check |
| `src/types/game.ts` | Added `max_turns` to GameConfig, `HiddenObjectivesConfig` to EngineMechanics |
| `src/mechanics/hidden-objectives.ts` | New mechanic for secret objective distribution |
| `src/mechanics/hand-management.ts` | Added `onBeforeAddToHand` hook |
| `src/mechanics/index.ts` | Registered hidden-objectives mechanic |
| `games/aaote/RULES.md` | Changed `max_rounds: 40` to `max_turns: 40`, added `hidden-objectives` to mechanics |

## Testing

Verified with `npm run build` - all TypeScript compilation passes. Full playtest validation pending.

## Future Considerations

1. **Victory adjudication timeout**: Consider auto-resolving victory claims after N seconds if GM doesn't respond
2. **Hand limit policies**: `discard_choice` and `discard_oldest` policies need execution-time handling in game.ts
3. **Objective completion tracking**: Engine could auto-detect some objective completions (e.g., "Hold 4 items") rather than relying solely on player declaration
