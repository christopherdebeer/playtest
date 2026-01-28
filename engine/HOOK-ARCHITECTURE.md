# Hook-Based Game Orchestration Architecture

## Problem Statement

The current polling-based architecture causes:
- Race conditions and deadlocks
- Wasted resources (constant API calls)
- Poor error handling
- Fragile coordination

## Solution: Event-Driven Hooks

Use Claude Code lifecycle hooks to trigger agents based on file system events.

## Architecture

```
File Event → Hook Trigger → Agent Wakes → Processes → Writes File → Next Hook
```

### Hook Types

1. **turn-start hook** - Triggered when turn-signal.json is written
   - Wakes the current player agent
   - Player reads state, makes decision, submits action

2. **action-submitted hook** - Triggered when player-action file is created
   - Wakes the gamemaster agent
   - Gamemaster validates, processes, updates state

3. **game-end hook** - Triggered when gameStatus becomes "completed"
   - Generates final report
   - Cleans up temporary files

### Process Flow

```
┌─────────────┐
│ Gamemaster  │
│ Initialize  │
│  Game       │
└──────┬──────┘
       │ writes turn-signal.json
       ▼
┌─────────────┐
│ turn-start  │◄─── inotify watch on turn-signal.json
│    hook     │
└──────┬──────┘
       │ spawns player agent (one-shot)
       ▼
┌─────────────┐
│   Player    │
│  Makes      │
│  Decision   │
└──────┬──────┘
       │ writes player-action.json
       ▼
┌─────────────┐
│action-submit│◄─── inotify watch on player-actions/*.json
│    hook     │
└──────┬──────┘
       │ wakes gamemaster (one-shot)
       ▼
┌─────────────┐
│ Gamemaster  │
│  Process    │
│   Action    │
└──────┬──────┘
       │
       ├─► writes turn-signal.json (next turn) ──┐
       │                                         │
       └─► sets gameStatus=completed ────────────┼─► game-end hook
                                                 │
                                                 └─► LOOP back to turn-start
```

## Implementation Plan

### 1. Hook Scripts

Create scripts that watch for file changes:

**scripts/hooks/watch-turn-signal.sh**
- Uses inotifywait to watch turn-signal.json
- When modified, spawns player agent for current player
- Player agent is ONE-SHOT (makes one decision and exits)

**scripts/hooks/watch-player-actions.sh**
- Uses inotifywait to watch player-actions/ directory
- When action file created, triggers gamemaster processing
- Gamemaster processes ONE action and exits (or continues loop internally)

**scripts/hooks/watch-game-end.sh**
- Polls game-state.json for gameStatus
- When "completed", triggers cleanup and reporting

### 2. Modified Agent Templates

**Gamemaster (Pull-Based)**
- Runs in long-lived mode
- Initializes game
- Enters internal loop:
  - Wait for action file (blocking read with inotify)
  - Process action
  - Write next turn signal
  - Check win condition
  - Repeat until game ends

**Player (One-Shot)**
- Receives turn signal as input
- Makes ONE decision
- Writes action file
- EXITS immediately
- Next turn spawns NEW player agent instance

### 3. Benefits

✅ **No polling** - Event-driven, wakes only when needed
✅ **Clear state machine** - Each transition explicit
✅ **Better debugging** - One agent per turn, clear logs
✅ **Error handling** - Each turn is isolated transaction
✅ **Resource efficient** - Agents spawn/exit as needed
✅ **Testable** - Can replay turns by re-running with same state

## Alternative: Hybrid Approach

Keep gamemaster long-lived but make players one-shot:

1. Gamemaster does blocking inotify wait for action files
2. Players are spawned one-shot per turn
3. Coordinator script manages the spawning

## File Structure

```
scripts/
├── hooks/
│   ├── watch-turn-signal.sh     # Spawns player on turn signal
│   ├── watch-player-actions.sh  # Triggers gamemaster processing
│   └── watch-game-end.sh        # Cleanup on completion
├── orchestrator.sh               # Main coordinator (starts all hooks)
├── submit-action.js             # (existing) Player action helper
└── wait-for-turn.js             # (replace with one-shot)

engine/
├── templates/
│   ├── gamemaster-blocking.md   # Uses inotify blocking reads
│   └── player-oneshot.md        # Makes one decision and exits
```

## Migration Path

1. Create hook scripts with inotifywait
2. Update gamemaster template to use blocking file waits
3. Update player template to be one-shot
4. Create orchestrator that starts hooks
5. Update start-game skill to use new orchestrator
