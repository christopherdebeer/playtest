# Proposal 006: Action Point Cost Per Card

**Status**: Draft
**Category**: Engine Mechanics
**Priority**: Critical
**Discovered**: AAOTE Playtest v0.1 (2026-01-31)

## Problem Statement

The current action point system charges a flat cost per action TYPE, not per card or unit of effect. This allows players to perform actions that far exceed their AP budget by batching multiple effects into a single action.

### Evidence from Playtest

```
Turn 12, player-1: {"type":"draw","count":10}
Turn 22, player-2: {"type":"draw","count":7}
Turn 19, player-2: {"type":"draw","count":5}
```

With `points_per_turn: 3` and `action_costs: { draw: 1 }`, players should only be able to draw 3 cards per turn maximum. Instead, players drew 5, 7, and even 10 cards in single actions.

### Root Cause

In `engine/src/game.ts`:

```typescript
// Line 1941
const actionCost = apConfig.action_costs[action.type] ?? 1;

// Line 2206
const cost = apConfig.action_costs[action.type] ?? 1;
player.actionPoints -= cost;
```

The cost lookup is by action TYPE only. The `count` parameter on draw actions is ignored for AP calculation.

## Proposed Solution

### Option A: Multiply Cost by Count (Recommended)

Modify the AP calculation to multiply base cost by action quantity:

```typescript
// Proposed change
function getActionCost(action: Action, apConfig: ActionPointsConfig): number {
  const baseCost = apConfig.action_costs[action.type] ?? 1;

  // Multiply by count for quantified actions
  if (action.type === 'draw' && 'count' in action) {
    return baseCost * (action.count || 1);
  }

  return baseCost;
}
```

### Option B: Enforce Maximum Per Action

Add a `max_per_action` constraint in config:

```yaml
engine_mechanics:
  action_points:
    points_per_turn: 3
    action_costs:
      draw: 1
    max_per_action:
      draw: 1  # Cannot draw more than 1 card per draw action
```

### Option C: Automatic AP Splitting

Automatically split high-count actions into multiple AP-costed actions:

```typescript
// draw 5 cards with 3 AP available
// Result: draw 3 cards, warning "Insufficient AP for full draw"
```

## Recommendation

**Option A** is recommended because:
- Most intuitive behavior (drawing 5 cards = 5 AP)
- Backwards compatible with existing games
- No config changes required
- Aligns with player expectations

## Implementation Details

### Files to Modify

1. `engine/src/game.ts`
   - `validateAction()` function (~line 1941)
   - `executeAction()` function (~line 2206)

2. `engine/src/types.ts`
   - Add `getActionCost()` helper type

### Validation Changes

```typescript
// In validateAction, before executing
const totalCost = getActionCost(action, apConfig);
if (totalCost > player.actionPoints) {
  return {
    valid: false,
    errors: [`Not enough AP. Action costs ${totalCost} AP (${action.count || 1} × ${baseCost}), you have ${player.actionPoints} AP.`]
  };
}
```

### Affected Action Types

| Action | Current | Proposed |
|--------|---------|----------|
| draw | 1 AP flat | 1 AP × count |
| play_card | 1 AP flat | 1 AP (unchanged) |
| move | 1 AP flat | 1 AP (unchanged) |
| trade_offer | 1 AP flat | 1 AP (unchanged) |

## Migration

- Existing games using `action_points` will see stricter enforcement
- No RULES.md changes required
- Add release note about behavior change

## Testing

1. Unit test: Draw with exact AP available
2. Unit test: Draw exceeding AP (should fail validation)
3. Unit test: Mixed actions within AP budget
4. Integration test: Full game with AP tracking

## Open Questions

1. Should partial draws be allowed? (draw as many as AP permits)
2. Should there be a "draw all" action that auto-calculates?
3. How to handle effects that grant bonus draws?

---

*Proposal created based on AAOTE playtest findings*
