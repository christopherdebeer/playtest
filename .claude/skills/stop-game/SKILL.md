---
name: stop-game
description: Emergency halt of active game session. Use when user wants to stop a running game, halt playtest, cancel game simulation, or clean up game state.
argument-hint: [game-name]
allowed-tools: Read, Write, Bash, Glob
disable-model-invocation: true
---

# Stop Game - Emergency Halt

Emergency halt an active game session, trigger debug capture, and clean up state files.

## Arguments

- `$0` (optional): Game name to stop. If omitted, finds the active game.

## Implementation Steps

### 1. Find Active Game

```bash
GAME_NAME="$0"

if [ -z "$GAME_NAME" ]; then
  # Find active game by checking for in-progress game-state files
  for state_file in games/*/state/game-state.json; do
    if [ -f "$state_file" ]; then
      STATUS=$(jq -r '.gameStatus // "unknown"' "$state_file" 2>/dev/null)
      if [ "$STATUS" = "in_progress" ]; then
        GAME_NAME=$(echo "$state_file" | cut -d'/' -f2)
        break
      fi
    fi
  done

  if [ -z "$GAME_NAME" ]; then
    echo "No active games found"
    exit 0
  fi
fi

STATE_FILE="games/$GAME_NAME/state/game-state.json"
```

### 2. Read Current State

```bash
if [ ! -f "$STATE_FILE" ]; then
  echo "Game state not found: $STATE_FILE"
  exit 1
fi

GAME_ID=$(jq -r '.gameId // "unknown"' "$STATE_FILE")
TURN_NUMBER=$(jq -r '.turnNumber // 0' "$STATE_FILE")
GAME_STATUS=$(jq -r '.gameStatus // "unknown"' "$STATE_FILE")

if [ "$GAME_STATUS" != "in_progress" ]; then
  echo "Game $GAME_NAME is not active (status: $GAME_STATUS)"
  exit 0
fi
```

### 3. Use end-game Script to Stop Gracefully

```bash
# Use the action script to end the game properly
./scripts/actions/gamemaster/end-game.sh "none" "Manual stop by user" "$GAME_NAME"
```

This will:
- Update game state to "completed"
- Log the game_end event
- Notify all players via message bus
- Trigger debug capture via gamemaster stop hook

### 4. Force Cleanup (if end-game fails)

If the action script isn't available or fails:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update game state directly
jq --arg status "stopped" --arg ts "$TIMESTAMP" \
  '.gameStatus = $status | .stoppedAt = $ts | .stoppedReason = "Manual stop"' \
  "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

# Write stop event to log
LIVE_LOG="games/$GAME_NAME/logs/game-$GAME_ID-live.jsonl"
if [ -f "$LIVE_LOG" ]; then
  echo "{\"event\":\"game_stopped\",\"timestamp\":\"$TIMESTAMP\",\"reason\":\"Manual stop\",\"turnNumber\":$TURN_NUMBER}" >> "$LIVE_LOG"
fi

# Clean up state files
rm -f "games/$GAME_NAME/state/turn-signal.json"
rm -f "games/$GAME_NAME/state/player-actions"/*.json
rm -rf "games/$GAME_NAME/state/messages"
```

### 5. Save Partial Log

```bash
LOG_TIMESTAMP=$(date +%s)
PARTIAL_LOG="games/$GAME_NAME/logs/game-stopped-$LOG_TIMESTAMP.json"

jq -n \
  --arg status "stopped" \
  --arg game "$GAME_NAME" \
  --arg gameId "$GAME_ID" \
  --arg stoppedAt "$TIMESTAMP" \
  --argjson turns "$TURN_NUMBER" \
  --slurpfile state "$STATE_FILE" \
  '{
    fileType: "game-log",
    status: $status,
    game: $game,
    gameId: $gameId,
    stoppedAt: $stoppedAt,
    completedTurns: $turns,
    finalState: $state[0]
  }' > "$PARTIAL_LOG"
```

### 6. Report to User

```markdown
## Game Stopped: {GAME_NAME}

**Game ID**: {GAME_ID}
**Stopped at turn**: {TURN_NUMBER}
**Status**: stopped

**Final player positions**:
- player-1: {state}
- player-2: {state}
- player-3: {state}

**Files**:
- Partial log: `{PARTIAL_LOG}`
- Debug capture: `games/{GAME_NAME}/logs/debug/`
- Live events: `games/{GAME_NAME}/logs/game-{GAME_ID}-live.jsonl`

Use `/view-results {GAME_NAME}` to analyze the partial game.
```

## Reference Files

- `scripts/actions/gamemaster/end-game.sh` - Graceful game termination
- `games/{game}/state/game-state.json` - Current game state
- `games/{game}/logs/debug/` - Debug captures
