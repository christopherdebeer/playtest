# Turn Semantics Clarification

| Field | Value |
|-------|-------|
| **Date** | 2026-01-29 |
| **Status** | Implemented |
| **Author** | Claude |
| **Priority** | Medium |

## Summary

Clarify the semantics of "turn" in the engine to distinguish between rounds (full cycles through all players) and individual player turns.

## Problem Statement

### Observed Behavior

In the markovs-chains playtest log:

```json
{"event":"action_executed","turn":1,"player":"player-1","data":{"type":"draw"}}
{"event":"action_executed","turn":2,"player":"player-2","data":{"type":"move","target":"A"}}
{"event":"action_executed","turn":2,"player":"player-1","data":{"type":"move","target":"A"}}
{"event":"action_executed","turn":3,"player":"player-2","data":{"type":"move","target":"Victory"}}
```

**Turn 2** shows both player-2 AND player-1 acting, which is confusing:
- Did both players act on the same turn?
- Is "turn" actually a round counter?
- Why did player-1 act after player-2 on turn 2?

### Current Implementation

From `engine/src/game.ts`:

```typescript
export function advanceTurn(state: GameState): void {
  const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  state.currentPlayer = state.turnOrder[nextIndex];

  // Increment turn when we wrap around to first player
  if (nextIndex === 0) {
    state.turn++;
  }

  saveState(state);
}
```

So `turn` increments when the turn order wraps around to the first player. This makes `turn` a **round counter**, not a player turn counter.

### Ambiguity Issues

1. **Log interpretation**: "Turn 2" doesn't tell you which player's turn it is
2. **Strategy analysis**: Hard to analyze "on turn X, player Y did Z" when X means different things
3. **Max turns enforcement**: `max_turns: 15` means 15 rounds, not 15 individual player turns
4. **Display**: UI showing "Turn 2" is misleading

## Proposed Solutions

### Option A: Rename to "Round" (Recommended)

Change the field name from `turn` to `round` and add a separate `turnNumber` for the total action count.

#### State Changes

```typescript
interface GameState {
  // Renamed: round = full cycle through all players
  round: number;

  // NEW: absolute turn counter (increments every player action)
  turnNumber: number;

  // Existing
  currentPlayer: string | null;
  turnOrder: string[];
}
```

#### Log Output

```json
{"event":"action_executed","round":1,"turnNumber":1,"player":"player-1","data":{...}}
{"event":"action_executed","round":1,"turnNumber":2,"player":"player-2","data":{...}}
{"event":"action_executed","round":2,"turnNumber":3,"player":"player-1","data":{...}}
{"event":"action_executed","round":2,"turnNumber":4,"player":"player-2","data":{...}}
```

#### Benefits

- Clear distinction: `round` = full cycle, `turnNumber` = individual action
- Backwards compatible (can keep `turn` as alias for `round`)
- Matches common board game terminology

### Option B: Individual Turn Counter Only

Make `turn` increment on every player action, add `round` separately.

```typescript
interface GameState {
  turn: number;    // Increments every action
  round: number;   // Increments when turn order wraps
}
```

#### Log Output

```json
{"event":"action_executed","turn":1,"round":1,"player":"player-1",...}
{"event":"action_executed","turn":2,"round":1,"player":"player-2",...}
{"event":"action_executed","turn":3,"round":2,"player":"player-1",...}
```

### Option C: Composite Turn Identifier

Use a composite format like `round.player_turn`:

```json
{"event":"action_executed","turn":"1.1","player":"player-1",...}
{"event":"action_executed","turn":"1.2","player":"player-2",...}
{"event":"action_executed","turn":"2.1","player":"player-1",...}
```

#### Drawbacks

- String parsing required
- Less intuitive than separate fields
- Harder to query/filter

### Option D: Player-Centric Turn Count

Track turns per player:

```json
{
  "round": 2,
  "playerTurns": {
    "player-1": 2,
    "player-2": 1
  }
}
```

## Recommendation

Implement **Option A (Rename to Round)** with both `round` and `turnNumber`:

- `round`: Full cycles through turn order (current behavior of `turn`)
- `turnNumber`: Absolute action counter (new)
- Keep `turn` as deprecated alias for `round` for backwards compatibility

## Implementation

### Phase 1: Add turnNumber

```typescript
// engine/src/game.ts

export function advanceTurn(state: GameState): void {
  // Increment absolute turn counter
  state.turnNumber = (state.turnNumber || 0) + 1;

  const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  state.currentPlayer = state.turnOrder[nextIndex];

  // Increment round when we wrap around
  if (nextIndex === 0) {
    state.round = (state.round || state.turn || 0) + 1;
  }

  // Deprecated: keep turn in sync with round for backwards compat
  state.turn = state.round;

  saveState(state);
}
```

### Phase 2: Update Logging

```typescript
// engine/src/game.ts

export function logEvent(state: GameState, event: GameEvent): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...event,
    round: state.round,
    turnNumber: state.turnNumber,
    // Deprecated but included for compat
    turn: state.round
  };

  appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
}
```

### Phase 3: Update Status Output

```typescript
// engine/src/index.ts - status command

console.log(JSON.stringify({
  success: true,
  gameId: state.gameId,
  status: state.status,
  round: state.round,
  turnNumber: state.turnNumber,
  turn: state.round,  // Deprecated
  currentPlayer: state.currentPlayer,
  ...
}));
```

### Phase 4: Update Rules Config

Rename `max_turns` to `max_rounds` in YAML:

```yaml
# Old (deprecated)
max_turns: 15

# New
max_rounds: 15
```

Support both during transition period.

### Phase 5: Update Documentation

Update ARCHITECTURE.md, agent prompts, and skill docs to use correct terminology.

## Migration

### Backwards Compatibility

- Keep `turn` field in output (set equal to `round`)
- Accept both `max_turns` and `max_rounds` in config
- Log deprecation warnings when old fields used

### Timeline

1. **v3.1**: Add `round` and `turnNumber`, keep `turn` as alias
2. **v3.2**: Deprecation warnings for `turn` usage
3. **v4.0**: Remove `turn` field

## Testing

```typescript
describe('turn semantics', () => {
  it('increments turnNumber on every action', () => {
    const state = initGame('test', 2);
    expect(state.turnNumber).toBe(0);

    advanceTurn(state);
    expect(state.turnNumber).toBe(1);

    advanceTurn(state);
    expect(state.turnNumber).toBe(2);
  });

  it('increments round when turn order wraps', () => {
    const state = initGame('test', 2);  // 2 players
    state.round = 1;

    // First player's turn
    advanceTurn(state);
    expect(state.round).toBe(1);

    // Second player's turn - wraps to player 1
    advanceTurn(state);
    expect(state.round).toBe(2);
  });
});
```

## Success Metrics

- [ ] Logs clearly show round vs turnNumber
- [ ] `max_rounds: 15` correctly limits to 15 full rounds
- [ ] Status output includes both round and turnNumber
- [ ] Existing games continue to work (backwards compat)

## Open Questions

1. Should `turnNumber` start at 0 or 1?
2. Should we track `playerTurnNumber` (turns per player)?
3. How to handle games where turn order changes mid-game?

## References

- Current advanceTurn: `engine/src/game.ts`
- Markov's Chains log: `games/markovs-chains/logs/markovs-chains-1769707311476.jsonl`
- Max turns config: `games/markovs-chains/RULES.md:7`
