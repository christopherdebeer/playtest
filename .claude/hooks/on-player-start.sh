#!/bin/bash
# Hook triggered when a player subagent starts
set -e

PLAYER=$1
PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"

# Ensure state directory exists
mkdir -p "$STATE_DIR/pending-moves"

# Log player turn start
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"player_start\",\"player\":\"$PLAYER\"}" >> "$STATE_DIR/events.jsonl"

# Create/clear move file for this player
MOVE_FILE="$STATE_DIR/pending-moves/${PLAYER}.json"
echo "{\"player\":\"$PLAYER\",\"action\":null,\"params\":{},\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"status\":\"pending\"}" > "$MOVE_FILE"

# Create lock file to prevent concurrent moves
LOCK_FILE="$STATE_DIR/.${PLAYER}-lock"
touch "$LOCK_FILE"

exit 0
