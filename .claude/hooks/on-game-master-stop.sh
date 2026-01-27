#!/bin/bash
# Hook triggered when game-master subagent finishes
set -e

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"
BOARD_FILE="$STATE_DIR/board.json"

# Log game master stop
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"game_master_stop\"}" >> "$STATE_DIR/events.jsonl"

# Check for game end
if [ -f "$BOARD_FILE" ]; then
  STATUS=$(jq -r '.status // "unknown"' "$BOARD_FILE" 2>/dev/null)
  if [ "$STATUS" = "finished" ]; then
    WINNER=$(jq -r '.winner // "unknown"' "$BOARD_FILE" 2>/dev/null)
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"game_end\",\"winner\":\"$WINNER\"}" >> "$STATE_DIR/events.jsonl"
  fi
fi

exit 0
