#!/bin/bash
# Hook triggered when arbiter subagent starts
set -e

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# Log arbiter start
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"arbiter_start\"}" >> "$STATE_DIR/events.jsonl"

# Clear previous validation result
VALIDATION_FILE="$STATE_DIR/validation-result.json"
echo "{\"status\":\"pending\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$VALIDATION_FILE"

exit 0
