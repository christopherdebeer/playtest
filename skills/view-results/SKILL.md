---
name: view-results
description: Analyze completed game logs and display results. Use when user wants to see game results, check playtest outcomes, or analyze game logs.
argument-hint: [game-name]
allowed-tools: Read, Glob, Bash
---

# View Results - Game Analysis

Analyze and display results from completed game playtesting sessions.

## Arguments

- `$0` (optional): Game name to analyze. If omitted, uses most recent.

## Implementation Steps

### 1. Find Game and Log Files

```bash
GAME_NAME="$0"

if [ -z "$GAME_NAME" ]; then
  # Find most recently modified game with logs
  GAME_NAME=$(ls -t games/*/logs/*.jsonl 2>/dev/null | head -1 | cut -d'/' -f2)
fi

if [ -z "$GAME_NAME" ]; then
  echo "No completed games found"
  exit 0
fi

# Find latest log
LOG_FILE=$(ls -t games/$GAME_NAME/logs/*.jsonl 2>/dev/null | head -1)
```

### 2. Read Game Log

```bash
# Get game events from JSONL
cat "$LOG_FILE"

# Or parse specific events
GAME_END=$(grep '"event":"game_end"' "$LOG_FILE" | tail -1)
WINNER=$(echo "$GAME_END" | jq -r '.data.winner // "none"')
REASON=$(echo "$GAME_END" | jq -r '.data.reason // "unknown"')
```

### 3. Display Results

```markdown
# {GAME_NAME} - Game Results

**Log file**: {LOG_FILE}

## Winner

**{WINNER}** wins!

Reason: {REASON}

## Event Log

[Show parsed events from JSONL]
```

### 4. Check Game State (if still exists)

```bash
npx playtest status "$GAME_NAME" 2>/dev/null || echo "No active state"
```

## Log Format

Engine logs events as JSONL:

```json
{"timestamp":"...","event":"game_init","data":{...}}
{"timestamp":"...","event":"game_start","turn":1,"data":{...}}
{"timestamp":"...","event":"action_submitted","turn":1,"player":"player-1","data":{...}}
{"timestamp":"...","event":"roll","turn":1,"data":{"probability":0.65,"roll":0.42,"success":true}}
{"timestamp":"...","event":"game_end","turn":5,"data":{"winner":"player-1","reason":"..."}}
```
