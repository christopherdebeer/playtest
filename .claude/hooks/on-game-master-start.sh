#!/bin/bash
# Hook triggered when game-master subagent starts
set -e

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"

# Ensure state directory exists
mkdir -p "$STATE_DIR/pending-moves"

# Log game master start
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"game_master_start\"}" >> "$STATE_DIR/events.jsonl"

exit 0
