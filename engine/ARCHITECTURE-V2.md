# Playtest Architecture V2: Blocking Waits

## Problem with V1 (Polling-Based)

The original architecture had agents constantly polling files:

```python
while not my_turn:
    sleep(1)  # Each sleep = API roundtrip = wasted tokens
    check_file()
```

**Issues**:
- 🔴 Waste tokens on polling loops
- 🔴 Race conditions from timing mismatches
- 🔴 Deadlocks when agents miss file changes
- 🔴 Poor error handling and recovery

## Solution: V2 (Blocking Waits with inotifywait)

Use `inotifywait` to make agents sleep until files change:

```bash
# Agent goes to sleep (no API calls)
inotifywait -e modify turn-signal.json

# Wakes immediately when file changes
# Process change, make decision, continue
```

**Benefits**:
- ✅ Zero API calls while waiting
- ✅ Instant wake-up when event occurs
- ✅ No race conditions - direct event notification
- ✅ Timeouts prevent infinite hangs

## Architecture Comparison

### V1: Polling-Based
```
┌──────────┐     ┌─────────┐     ┌─────────┐
│Gamemaster│     │Player-1 │     │Player-2 │
└────┬─────┘     └────┬────┘     └────┬────┘
     │ write turn      │               │
     │─────────────────>               │
     │                 │ sleep(1) ❌   │
     │                 │ check file    │
     │                 │ sleep(1) ❌   │
     │                 │ check file    │
     │                 │ sleep(1) ❌   │
     │                 │ check file ✓  │
     │                 │ read & decide │
     │                 │ write action  │
     │  sleep(1) ❌    │               │
     │  check file     │               │
     │  sleep(1) ❌    │               │
     │  check file     │               │
     │  sleep(1) ❌    │               │
     │  check file ✓   │               │
     │  process        │               │
```
**Cost**: 6 API roundtrips for sleeping

### V2: Blocking Waits
```
┌──────────┐     ┌─────────┐     ┌─────────┐
│Gamemaster│     │Player-1 │     │Player-2 │
└────┬─────┘     └────┬────┘     └────┬────┘
     │ write turn      │               │
     │─────────────────>               │
     │                 │ inotify ⏸️    │
     │                 │ WAKES ✓       │
     │                 │ read & decide │
     │                 │ write action  │
     │  inotify ⏸️     │               │
     │  WAKES ✓        │               │
     │  process        │               │
```
**Cost**: 0 API roundtrips for waiting

## Implementation

### Gamemaster Template: `gamemaster-blocking.md`

**Key Changes**:
- Replace polling loops with `inotifywait -e create,close_write action-file.json`
- Use timeout to prevent infinite hangs: `timeout 120 inotifywait ...`
- Delete action file after processing to prevent re-processing

**Example**:
```bash
# Old (polling)
while [ ! -f action.json ]; do
  sleep 1
done

# New (blocking)
inotifywait -e close_write -t 120 action.json -q
```

### Player Template: `player-blocking.md`

**Key Changes**:
- Block until turn-signal.json changes: `inotifywait -e modify turn-signal.json`
- Check if it's your turn after wake-up
- Write action file and loop back

**Example**:
```bash
# Wait for turn signal to change
inotifywait -e modify games/$GAME/state/turn-signal.json -q

# Check if it's my turn
CURRENT=$(jq -r '.currentPlayer' turn-signal.json)
if [ "$CURRENT" = "player-1" ]; then
  # My turn! Make decision
  # ...
fi
```

## File Structure

```
engine/
├── ARCHITECTURE-V2.md           # This document
├── HOOK-ARCHITECTURE.md         # Hook-based alternative (future)
└── templates/
    ├── gamemaster-coordinated.md   # V1 (polling) - deprecated
    ├── gamemaster-blocking.md      # V2 (blocking) - use this
    ├── player-npm-interface.md     # V1 (polling) - deprecated
    └── player-blocking.md          # V2 (blocking) - use this

scripts/
├── hooks/                       # Future: external hooks
└── orchestrator.sh              # Future: hook coordinator
```

## Migration Guide

To update start-game skill:

1. Use `gamemaster-blocking.md` template instead of `gamemaster-coordinated.md`
2. Use `player-blocking.md` template instead of `player-npm-interface.md`
3. Spawn all agents upfront (same as before)
4. Agents now use blocking waits internally

## Performance Comparison

### V1 Polling
- Average game (10 turns, 3 players)
- ~40 polling attempts per agent
- 4 agents × 40 polls = 160 wasted API calls
- Cost: ~$0.50 in wasted polling

### V2 Blocking
- Same game
- 0 polling attempts
- Agents sleep in bash (free)
- Cost: $0 for waiting

**Savings**: 100% reduction in polling overhead

## Future: Hook-Based Orchestration

V3 could use external hooks (see HOOK-ARCHITECTURE.md):
- Hooks spawn one-shot player agents per turn
- Even more efficient (spawn only when needed)
- Better isolation (each turn = fresh agent)
- Requires Claude Code hook integration

## Testing

Test blocking waits with:

```bash
# Terminal 1: Watch for file change
inotifywait -m -e modify test.json

# Terminal 2: Modify file
echo '{"test": true}' > test.json

# Terminal 1 wakes immediately
```

## Rollback

If V2 has issues, revert to V1 templates:
- `gamemaster-coordinated.md` (polling version)
- `player-npm-interface.md` (polling version)
