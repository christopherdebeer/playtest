# Automatic Win Condition Detection

| Field | Value |
|-------|-------|
| **Date** | 2026-01-29 |
| **Status** | Draft |
| **Author** | Claude |
| **Priority** | Critical |

## Summary

Add automatic win condition detection to the engine so games end immediately when a player achieves victory, without requiring external intervention.

## Problem Statement

### Current Behavior

When player-2 moved to the Victory state in Markov's Chains:

```json
{"event":"action_executed","turn":3,"player":"player-2","data":{"type":"move","target":"Victory"}}
```

The game status remained `"in_progress"`:

```json
{
  "status": "in_progress",
  "players": {
    "player-2": {"state": "Victory", ...}
  }
}
```

The game only ended after manual intervention:
```bash
npx playtest end markovs-chains -w player-2 -r "Player 2 reached Victory state"
```

### Impact

1. **Blocking agents**: Player and gamemaster agents continue running/waiting after game should end
2. **Wasted resources**: API tokens consumed by stuck agents
3. **Manual intervention required**: Coordinator must detect and end games externally
4. **Poor user experience**: Games don't terminate cleanly

### Root Cause

The engine's `executeAction` function only checks one hardcoded win condition:

```typescript
// engine/src/index.ts:315-319
// Check for win condition (hand empty for card games)
if (player.hand.length === 0 && action.type === 'play_card') {
  endGame(game, options.player, `${options.player} emptied their hand`);
}
```

This only handles UNO-style "empty hand" wins, not:
- State-based wins (reaching Victory in Markov's Chains)
- Score-based wins (first to X points)
- Elimination wins (last player standing)
- Custom win conditions per game

## Proposed Solution

### Win Condition Configuration

Add win condition definitions to RULES.md YAML frontmatter:

```yaml
---
name: "Markov's Chains"
win_condition: "First player to reach the Victory state"

# NEW: Structured win conditions for engine
win_conditions:
  - type: "state_reached"
    state: "Victory"

  # Alternative: max turns reached (draw)
  - type: "max_turns"
    turns: 15
    result: "draw"
---
```

For UNO:
```yaml
win_conditions:
  - type: "hand_empty"
    trigger: "play_card"
```

For score-based games:
```yaml
win_conditions:
  - type: "score_threshold"
    threshold: 100
    comparison: ">="
```

### Engine Changes

#### 1. Win Condition Types

```typescript
// engine/src/types.ts

type WinConditionType =
  | 'state_reached'    // Player reaches specific state
  | 'hand_empty'       // Player empties hand
  | 'score_threshold'  // Player reaches score
  | 'max_turns'        // Turn limit reached
  | 'last_standing'    // Only one player remains
  | 'custom';          // Custom expression

interface WinCondition {
  type: WinConditionType;
  state?: string;           // For state_reached
  trigger?: string;         // Action type that can trigger (e.g., "play_card")
  threshold?: number;       // For score_threshold
  comparison?: '>=' | '>' | '=' | '<' | '<=';
  turns?: number;           // For max_turns
  result?: 'winner' | 'draw';  // What happens when triggered
  expression?: string;      // For custom (future)
}

interface GameConfig {
  // ... existing fields ...
  win_conditions?: WinCondition[];
}
```

#### 2. Win Condition Evaluator

```typescript
// engine/src/win-conditions.ts

export function checkWinConditions(
  state: GameState,
  player: string,
  action: GameAction
): WinResult | null {
  const conditions = state.config.win_conditions || [];

  for (const condition of conditions) {
    const result = evaluateCondition(state, player, action, condition);
    if (result) {
      return result;
    }
  }

  // Legacy fallback: hand empty for card games
  if (action.type === 'play_card') {
    const p = state.players[player];
    if (p && p.hand.length === 0) {
      return { winner: player, reason: `${player} emptied their hand` };
    }
  }

  return null;
}

function evaluateCondition(
  state: GameState,
  player: string,
  action: GameAction,
  condition: WinCondition
): WinResult | null {
  switch (condition.type) {
    case 'state_reached':
      return evaluateStateReached(state, player, condition);

    case 'hand_empty':
      return evaluateHandEmpty(state, player, action, condition);

    case 'score_threshold':
      return evaluateScoreThreshold(state, player, condition);

    case 'max_turns':
      return evaluateMaxTurns(state, condition);

    case 'last_standing':
      return evaluateLastStanding(state);

    default:
      return null;
  }
}

function evaluateStateReached(
  state: GameState,
  player: string,
  condition: WinCondition
): WinResult | null {
  const p = state.players[player];
  if (p && p.state === condition.state) {
    return {
      winner: player,
      reason: `${player} reached ${condition.state}`
    };
  }
  return null;
}

function evaluateMaxTurns(
  state: GameState,
  condition: WinCondition
): WinResult | null {
  if (state.turn >= (condition.turns || Infinity)) {
    if (condition.result === 'draw') {
      return { winner: null, reason: `Turn limit (${condition.turns}) reached` };
    }
    // Could determine winner by score, position, etc.
  }
  return null;
}
```

#### 3. Integration with executeAction

```typescript
// engine/src/index.ts - act command

// Step 3: Execute the action
const execResult = executeAction(state, options.player, action);

if (!execResult.success) {
  // ... error handling ...
}

// NEW: Check win conditions after every action
const winResult = checkWinConditions(state, options.player, action);
if (winResult) {
  if (winResult.winner) {
    endGame(game, winResult.winner, winResult.reason);
  } else {
    // Draw - end without winner
    endGame(game, 'draw', winResult.reason);
  }
}
```

### Rules Parser Changes

```typescript
// engine/src/rules.ts

export function parseRules(rulesPath: string): ParsedRules {
  // ... existing parsing ...

  // Parse win conditions
  const winConditions = config.win_conditions || [];

  // Validate win conditions
  for (const wc of winConditions) {
    validateWinCondition(wc);
  }

  return {
    // ... existing fields ...
    win_conditions: winConditions
  };
}
```

## Migration Path

### Phase 1: Add Framework (Non-Breaking)

1. Add `WinCondition` types
2. Add `checkWinConditions` function
3. Keep existing hardcoded hand-empty check as fallback
4. No game config changes required

### Phase 2: Update Markov's Chains

Add to `games/markovs-chains/RULES.md`:
```yaml
win_conditions:
  - type: "state_reached"
    state: "Victory"
  - type: "max_turns"
    turns: 15
    result: "draw"
```

### Phase 3: Update UNO

Add to `games/uno/RULES.md`:
```yaml
win_conditions:
  - type: "hand_empty"
    trigger: "play_card"
```

### Phase 4: Remove Legacy Hardcoding

Remove the hardcoded hand-empty check from `index.ts` once all games have explicit win conditions.

## Testing

### Unit Tests

```typescript
describe('checkWinConditions', () => {
  it('detects state_reached win', () => {
    const state = createTestState({
      players: { 'player-1': { state: 'Victory' } },
      config: { win_conditions: [{ type: 'state_reached', state: 'Victory' }] }
    });

    const result = checkWinConditions(state, 'player-1', { type: 'move' });
    expect(result).toEqual({ winner: 'player-1', reason: 'player-1 reached Victory' });
  });

  it('detects max_turns draw', () => {
    const state = createTestState({
      turn: 15,
      config: { win_conditions: [{ type: 'max_turns', turns: 15, result: 'draw' }] }
    });

    const result = checkWinConditions(state, 'player-1', { type: 'pass' });
    expect(result).toEqual({ winner: null, reason: 'Turn limit (15) reached' });
  });
});
```

### Integration Test

```bash
# Start Markov's Chains game
npx playtest init markovs-chains -p 2

# Manually move player to Victory
npx playtest update markovs-chains -p player-1 -s '{"state": "Victory"}'

# Execute any action - should trigger win detection
npx playtest act markovs-chains -p player-1 -a '{"type": "pass"}'

# Verify game ended
npx playtest status markovs-chains
# Expected: {"status": "completed", "winner": "player-1", ...}
```

## Success Metrics

- [ ] Markov's Chains game ends automatically when player reaches Victory
- [ ] UNO game ends automatically when player empties hand
- [ ] Max turn limit triggers game end
- [ ] All waiting agents unblock on game completion
- [ ] No manual `npx playtest end` required for normal game flow

## Future Enhancements

1. **Custom expressions**: `expression: "player.score > 100 && player.state == 'EndZone'"`
2. **Multiple winners**: Support for team games or ties
3. **Partial wins**: Score-based rankings, not just win/lose
4. **Win condition events**: Emit events when win conditions are checked (for debugging)

## References

- Current win check: `engine/src/index.ts:315-319`
- Game state: `engine/src/types.ts`
- Markov's Chains rules: `games/markovs-chains/RULES.md`
- Playtest session log: `games/markovs-chains/logs/markovs-chains-1769707311476.jsonl`
