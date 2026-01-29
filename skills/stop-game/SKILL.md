---
name: stop-game
description: This skill should be used when the user asks to "stop a running game", "halt playtest", "cancel game simulation", "clean up game state", or wants to emergency halt an active game session.
argument-hint: [game-name]
allowed-tools: Read, Bash, Glob
---

# Stop Game - Emergency Halt

Emergency halt an active game session and clean up resources.

## Arguments

- `$0` (optional): Game name to stop. If omitted, finds the active game.

## Implementation Steps

### 1. Find Active Game

```bash
GAME_NAME="$0"

if [ -z "$GAME_NAME" ]; then
  # Find active game by checking status
  for game_dir in games/*/; do
    game=$(basename "$game_dir")
    status=$(npx playtest status "$game" 2>/dev/null | jq -r '.status // "none"')
    if [ "$status" = "in_progress" ] || [ "$status" = "waiting_for_players" ]; then
      GAME_NAME="$game"
      break
    fi
  done
fi

if [ -z "$GAME_NAME" ]; then
  echo "No active games found"
  exit 0
fi
```

### 2. End Game via Engine

```bash
npx playtest end "$GAME_NAME" -w "none" -r "Manual stop by user"
```

### 3. Reset Game State

```bash
# Clean up state files
npx playtest reset "$GAME_NAME"
```

### 4. Note About Running Agents

**Important**: Background agents spawned via Task tool will continue running until they:
- Timeout waiting for turns
- Encounter game_over status
- Complete their max turns

The engine's `reset` command clears state, causing agents to fail gracefully on their next engine call.

For immediate agent termination, agents check game status periodically and exit when:
- `npx playtest status` returns error (no state)
- `npx playtest wait` returns game_over

### 5. Report to User

```markdown
## Game Stopped: {GAME_NAME}

**Status**: stopped

State files cleaned up. Running agents will terminate on next engine call.

Check logs: `games/{GAME_NAME}/logs/{gameId}.jsonl`

Use `/view-results {GAME_NAME}` to analyze the partial game.
```

## CLI Reference

```bash
# End game with reason
npx playtest end <game> -w "none" -r "Manual stop"

# Reset and clean state
npx playtest reset <game>

# Reset and reinitialize with new players
npx playtest reset <game> -p <n>
```
