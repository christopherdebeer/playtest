#!/bin/bash
# Hook triggered when arbiter subagent finishes
set -e

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"
VALIDATION_FILE="$STATE_DIR/validation-result.json"

# Validate result file exists
if [ ! -f "$VALIDATION_FILE" ]; then
  echo "Warning: No validation result found" >&2
  exit 0
fi

# Basic JSON validation
if ! jq empty "$VALIDATION_FILE" 2>/dev/null; then
  echo "Error: Invalid JSON in validation result" >&2
  exit 2
fi

# Log arbiter completion
VALID=$(jq -r '.valid // "unknown"' "$VALIDATION_FILE" 2>/dev/null)
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"arbiter_stop\",\"valid\":$VALID}" >> "$STATE_DIR/events.jsonl"

exit 0
