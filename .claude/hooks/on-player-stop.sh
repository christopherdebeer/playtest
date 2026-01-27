#!/bin/bash
# Hook triggered when a player subagent finishes
set -e

PLAYER=$1
PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"
LOCK_FILE="$STATE_DIR/.${PLAYER}-lock"
MOVE_FILE="$STATE_DIR/pending-moves/${PLAYER}.json"

# Validate move file exists and is valid JSON
if [ ! -f "$MOVE_FILE" ]; then
  echo "Warning: No move file found for $PLAYER" >&2
  rm -f "$LOCK_FILE"
  exit 0
fi

# Basic JSON validation
if ! jq empty "$MOVE_FILE" 2>/dev/null; then
  echo "Error: Invalid JSON in $MOVE_FILE" >&2
  rm -f "$LOCK_FILE"
  exit 2
fi

# Check if a move was actually made
ACTION=$(jq -r '.action // "null"' "$MOVE_FILE" 2>/dev/null)
if [ "$ACTION" = "null" ]; then
  echo "Warning: No action submitted by $PLAYER" >&2
fi

# Log move submission
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"player_stop\",\"player\":\"$PLAYER\",\"action\":\"$ACTION\"}" >> "$STATE_DIR/events.jsonl"

# Remove lock
rm -f "$LOCK_FILE"

exit 0
