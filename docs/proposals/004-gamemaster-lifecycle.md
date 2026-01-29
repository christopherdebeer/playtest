# Gamemaster Lifecycle Improvements

| Field | Value |
|-------|-------|
| **Date** | 2026-01-29 |
| **Status** | Draft |
| **Author** | Claude |
| **Priority** | High |

## Summary

Improve the gamemaster agent lifecycle to prevent indefinite blocking when no contests are filed and ensure graceful termination when games end.

## Problem Statement

### Current Behavior

In contest-based adjudication mode (proposal 001), the gamemaster runs a blocking loop:

```bash
while game not over:
    npx playtest pending markovs-chains  # BLOCKS until contest/resignation
```

The `pending` command polls for:
- Pending contests
- Pending resignations
- Game completion/cancellation

### Observed Failure

During the markovs-chains playtest:

1. Game started at 17:22:03
2. Player-2 reached Victory at 17:25:12
3. **Gamemaster was stuck** in `pending` polling for 150+ seconds
4. Game only ended after manual `npx playtest end` at 17:26:50
5. Gamemaster never received notification

From agent output (a1faf5a):
```
bash_progress","elapsedTimeSeconds":150
bash_progress","elapsedTimeSeconds":151
bash_progress","elapsedTimeSeconds":152
...
```

### Root Cause

The `pending` command does check for game completion:

```typescript
// engine/src/index.ts:510-517
if (state.status === 'completed') {
  console.log(JSON.stringify({
    status: 'game_over',
    winner: state.shared.winner
  }));
  return;
}
```

But the game was **never marked completed** because:
1. Win condition wasn't auto-detected (see proposal 003)
2. No contests were filed
3. `pending` kept polling with no events to return

### Impact

1. **Wasted resources**: Gamemaster agent runs indefinitely consuming API tokens
2. **No graceful shutdown**: Agents don't terminate cleanly
3. **Stuck processes**: Background processes accumulate
4. **Poor observability**: No indication of why gamemaster is idle

## Proposed Solutions

### Solution 1: Heartbeat with Status Check (Recommended)

Add periodic game status checking to the gamemaster loop, independent of contest events.

#### Gamemaster Agent Changes

```markdown
## Game Loop (Updated)

while game not over:
    # Wait for event OR timeout (30s heartbeat)
    result = npx playtest pending {GAME} --timeout 30000

    if result.status == "timeout":
        # Heartbeat - check if game should end
        status = npx playtest status {GAME}
        if status.status in ["completed", "cancelled"]:
            exit

        # Check for win conditions that weren't auto-detected
        state = npx playtest state {GAME}
        winner = check_win_conditions(state)
        if winner:
            npx playtest end {GAME} -w {winner} -r "Win condition met"
            exit

    elif result.status == "game_over":
        exit

    elif result.status == "contest_pending":
        # Handle contest...

    elif result.status == "resignation_pending":
        # Handle resignation...
```

#### Benefits

- Gamemaster actively monitors game state
- Can detect wins even if auto-detection fails
- Graceful shutdown on game end
- Configurable heartbeat interval

### Solution 2: Event-Driven Notification

Use file system events or signals to notify gamemaster of game state changes.

#### Engine Changes

When game ends, write to a notification file:
```typescript
function endGame(game: string, winner: string, reason: string) {
  // ... existing logic ...

  // Notify waiting agents
  const notifyPath = path.join(getStatePath(game), 'notify.json');
  writeFileSync(notifyPath, JSON.stringify({
    event: 'game_end',
    winner,
    reason,
    timestamp: new Date().toISOString()
  }));
}
```

#### Gamemaster watches for notifications

```bash
# Use inotifywait or similar
inotifywait -e modify games/{GAME}/state/notify.json
```

#### Drawbacks

- Platform-specific (inotifywait not available everywhere)
- More complex implementation
- File system watching can be unreliable

### Solution 3: Shorter Poll Interval with Backoff

Reduce the poll interval in `pending` and add exponential backoff when idle.

```typescript
// engine/src/index.ts - pending command

let pollInterval = 500;  // Start at 500ms
const maxInterval = 10000;  // Cap at 10s
const backoffFactor = 1.5;

while (timeout === 0 || Date.now() - startTime < timeout) {
  const state = loadState(game);

  // Check for events...
  if (hasEvent) {
    pollInterval = 500;  // Reset on activity
    // Handle event...
    return;
  }

  // Backoff when idle
  pollInterval = Math.min(pollInterval * backoffFactor, maxInterval);
  await new Promise(resolve => setTimeout(resolve, pollInterval));
}
```

### Solution 4: Remove Gamemaster in Contest Mode

If contests are rare, consider making the gamemaster fully reactive:

1. No background gamemaster process
2. Spawn gamemaster on-demand when contest filed
3. Gamemaster adjudicates and exits immediately

#### Flow

```
Player files contest → Engine queues contest → Coordinator spawns gamemaster →
Gamemaster adjudicates → Gamemaster exits → Game continues
```

#### Benefits

- No idle gamemaster
- Lower resource usage
- Simpler lifecycle

#### Drawbacks

- Latency when contest filed (agent spawn time)
- Coordinator must monitor for contests

## Recommendation

Implement **Solution 1 (Heartbeat with Status Check)** with elements of **Solution 3 (Backoff)**:

1. Add 30s timeout to `pending` command
2. Gamemaster checks game status on timeout
3. Gamemaster can end game if win condition detected
4. Add exponential backoff to reduce polling overhead

## Implementation

### Engine Changes

#### 1. Add Timeout Default to Pending

```typescript
// engine/src/index.ts - pending command
.option('-t, --timeout <ms>', 'Timeout in milliseconds (default: 30000)', '30000')
```

#### 2. Return Timeout Status

Already implemented - `pending` returns `status: 'timeout'` when timeout reached.

### Gamemaster Agent Changes

Update `.claude/agents/gamemaster.md`:

```markdown
## Game Loop (Contest-Based with Heartbeat)

```bash
while true:
    # Wait for event with 30s heartbeat timeout
    result = npx playtest pending {GAME} --timeout 30000

    case result.status:
        "game_over" | "game_cancelled":
            # Game ended - exit gracefully
            exit 0

        "timeout":
            # Heartbeat - verify game is still active
            status = npx playtest status {GAME}

            if status.status == "completed":
                exit 0

            if status.status == "cancelled":
                exit 0

            # Check if any player has won (fallback detection)
            state = npx playtest state {GAME}
            for player in state.players:
                if player.state == config.win_state:
                    npx playtest end {GAME} -w {player} -r "Reached {win_state}"
                    exit 0

            # No events, no winner - continue waiting

        "contest_pending":
            # Adjudicate the contest
            ...

        "resignation_pending":
            # Handle resignation
            ...
```

### Coordinator Changes

Update `skills/start-game/SKILL.md` to document expected gamemaster behavior:

```markdown
## Agent Lifecycle

The gamemaster agent:
1. Starts and begins monitoring for contests
2. Uses 30s heartbeat timeouts to check game status
3. Can detect and end games if auto-detection fails
4. Exits gracefully when game completes
```

## Testing

### Test 1: Normal Game End

1. Start game with gamemaster and players
2. Play until win condition met
3. Verify gamemaster exits within 30s of game end

### Test 2: Stuck Game Recovery

1. Start game with gamemaster
2. Manually update player state to Victory
3. Wait for gamemaster heartbeat
4. Verify gamemaster ends game and exits

### Test 3: Cancelled Game

1. Start game with gamemaster
2. Run `npx playtest cancel <game> -r "test"`
3. Verify gamemaster exits within 30s

## Success Metrics

- [ ] Gamemaster exits within 30s of game end
- [ ] No indefinitely blocking gamemaster processes
- [ ] Gamemaster can detect and end stuck games
- [ ] Resource usage bounded (no runaway token consumption)

## Open Questions

1. Should heartbeat interval be configurable per-game?
2. Should gamemaster have authority to end games, or only detect and alert?
3. How to handle multi-game gamemasters (one GM for multiple concurrent games)?

## References

- Contest-based adjudication: `docs/proposals/001-contest-based-adjudication.md`
- Gamemaster agent: `.claude/agents/gamemaster.md`
- Pending command: `engine/src/index.ts:477-583`
- Playtest session showing stuck gamemaster: agent output a1faf5a
