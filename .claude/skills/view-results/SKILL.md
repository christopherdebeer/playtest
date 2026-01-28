---
name: view-results
description: Analyze completed game logs and display results. Use when user wants to see game results, check playtest outcomes, analyze game logs, review timing analysis, or check debug captures.
argument-hint: [game-name] [--timing] [--debug]
allowed-tools: Read, Glob, Bash
disable-model-invocation: true
---

# View Results - Game Analysis

Analyze and display results from completed game playtesting sessions, including timing analysis and debug captures.

## Arguments

- `$0` (optional): Game name to analyze. If omitted, uses most recent.
- `--timing`: Show detailed timing analysis
- `--debug`: Show debug capture data

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

# Find latest live log
LIVE_LOG=$(ls -t games/$GAME_NAME/logs/game-*-live.jsonl 2>/dev/null | head -1)
GAME_ID=$(basename "$LIVE_LOG" | sed 's/game-\(.*\)-live.jsonl/\1/')

# Find debug capture if exists
DEBUG_CAPTURE="games/$GAME_NAME/logs/debug/capture-$GAME_ID.json"
```

### 2. Read Game Log

```bash
# Get game events from JSONL
GAME_START=$(grep '"event":"game_start"' "$LIVE_LOG" | head -1)
GAME_END=$(grep '"event":"game_end"' "$LIVE_LOG" | head -1)

# Extract key info
WINNER=$(echo "$GAME_END" | jq -r '.winner // "none"')
TOTAL_TURNS=$(echo "$GAME_END" | jq -r '.totalTurns // 0')
REASON=$(echo "$GAME_END" | jq -r '.reason // "unknown"')
```

### 3. Display Basic Results

```markdown
# {GAME_NAME} - Game Results

**Game ID**: {GAME_ID}
**Status**: {completed/stopped}
**Total Turns**: {TOTAL_TURNS}

## Winner

🏆 **{WINNER}** wins!

Reason: {REASON}

## Turn-by-Turn Summary

| Turn | Player | Action | Result |
|------|--------|--------|--------|
| 1 | player-1 | move Start→A | ✓ Success |
| 2 | player-2 | play_card Momentum | Applied |
| ... | ... | ... | ... |

## Final Positions

- player-1: {state}
- player-2: {state}
- player-3: {state}
```

### 4. Show Timing Analysis (if --timing or debug capture exists)

```bash
if [ -f "$DEBUG_CAPTURE" ]; then
  TIMING=$(jq '.timingAnalysis' "$DEBUG_CAPTURE")

  # Extract stats
  TOTAL_TIME=$(echo "$TIMING" | jq -r '.statistics.totalGameTime // 0')
  AVG_TURN=$(echo "$TIMING" | jq -r '.statistics.avgTurnTime // 0')
  MAX_TURN=$(echo "$TIMING" | jq -r '.statistics.maxTurnTime // 0')
  SLOWEST=$(echo "$TIMING" | jq -r '.statistics.slowestTurn // {}')
fi
```

Display:

```markdown
## Timing Analysis

**Total game time**: {TOTAL_TIME}s ({minutes}m {seconds}s)
**Average turn time**: {AVG_TURN}s
**Max turn time**: {MAX_TURN}s

### Turn Timing Breakdown

| Turn | Player | Duration | Status |
|------|--------|----------|--------|
| 1 | player-1 | 73s | 🟢 Fast |
| 2 | player-2 | 432s | 🔴 Slow |
| 3 | player-3 | 94s | 🟡 Normal |

### Bottleneck Analysis

⚠️ **Slowest turn**: Turn {N} ({PLAYER}) - {DURATION}s

Possible causes:
- Agent not using blocking wait correctly
- Extended thinking/reasoning time
- API latency

### Per-Player Statistics

| Player | Turns | Total Time | Avg Time |
|--------|-------|------------|----------|
| player-1 | 2 | 144s | 72s |
| player-2 | 2 | 529s | 265s |
| player-3 | 1 | 94s | 94s |
```

### 5. Show Debug Capture (if --debug)

```bash
if [ -f "$DEBUG_CAPTURE" ]; then
  # Show task outputs if captured
  TASK_COUNT=$(jq '.taskOutputs | length' "$DEBUG_CAPTURE")

  echo "## Debug Capture"
  echo ""
  echo "**Capture time**: $(jq -r '.captureTime' "$DEBUG_CAPTURE")"
  echo "**Task outputs captured**: $TASK_COUNT"
  echo ""

  if [ "$TASK_COUNT" -gt 0 ]; then
    echo "### Agent Outputs"
    jq -r '.taskOutputs[] | "- Agent \(.agentId): \(.output | length) chars"' "$DEBUG_CAPTURE"
  fi
fi
```

### 6. Show Analysis Summary (if exists in log)

```bash
ANALYSIS=$(grep '"event":"analysis_complete"' "$LIVE_LOG" | tail -1)
if [ -n "$ANALYSIS" ]; then
  echo ""
  echo "## Auto-Generated Analysis"
  echo ""
  echo "$ANALYSIS" | jq -r '.summary | to_entries | .[] | "- \(.key): \(.value)"'
fi
```

### 7. File Locations

```markdown
---

## Files

- **Live log**: `{LIVE_LOG}`
- **Debug capture**: `{DEBUG_CAPTURE}`
- **Game state**: `games/{GAME_NAME}/state/game-state.json`
```

## Example Output

```
# markovs-chains - Game Results

**Game ID**: markovs-chains-1769562135
**Total Turns**: 5

## Winner

🏆 **player-2** wins!

Reason: Reached Victory state

## Timing Analysis

**Total game time**: 767s (12m 47s)
**Average turn time**: 153s
**Max turn time**: 432s

⚠️ **Bottleneck**: Turn 2 (player-2) - 432s
   - 6.4 minute idle gap detected
   - Recommendation: Ensure agents use wait scripts correctly

## Files

- Live log: `games/markovs-chains/logs/game-markovs-chains-1769562135-live.jsonl`
- Debug capture: `games/markovs-chains/logs/debug/capture-markovs-chains-1769562135.json`
```

## Reference Files

- `games/{game}/logs/game-*-live.jsonl` - Live event logs
- `games/{game}/logs/debug/capture-*.json` - Debug captures with timing
- `games/{game}/state/game-state.json` - Final game state
