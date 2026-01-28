---
name: stop-game
description: Emergency halt of active game session. Use when user wants to stop a running game, halt playtest, cancel game simulation, or clean up game state.
argument-hint: [game-name]
allowed-tools: Read, Bash, Glob
---

# Stop Game - Emergency Halt

Emergency halt an active game session using the TypeScript engine.

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

### 2. Check Current Status

```bash
npx playtest status "$GAME_NAME"
```

### 3. End Game via Engine

```bash
# End the game with no winner
npx playtest end "$GAME_NAME" -w "none" -r "Manual stop by user"
```

### 4. Clean Up State Files

```bash
rm -rf "games/$GAME_NAME/state/"
```

### 5. Report to User

```markdown
## Game Stopped: {GAME_NAME}

**Status**: stopped

State files cleaned up. Check logs:
- `games/{GAME_NAME}/logs/{gameId}.jsonl`

Use `/view-results {GAME_NAME}` to analyze the partial game.
```
