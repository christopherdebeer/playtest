#!/bin/bash
# signal-turn.sh - Signal the next player's turn
# Usage: signal-turn.sh <next-player-id> [game-name]
#
# Updates turn signal and optionally cleans up previous action file
# Returns confirmation JSON

set -e

NEXT_PLAYER="${1:?Usage: signal-turn.sh <next-player-id> [game-name]}"
GAME_NAME="${2:-markovs-chains}"

GAME_DIR="games/$GAME_NAME"
STATE_FILE="$GAME_DIR/state/game-state.json"
TURN_SIGNAL="$GAME_DIR/state/turn-signal.json"
ACTION_DIR="$GAME_DIR/state/player-actions"

# Validate game state
if [ ! -f "$STATE_FILE" ]; then
  jq -n '{status: "error", error: "Game state not found"}'
  exit 1
fi

GAME_ID=$(jq -r '.gameId // "unknown"' "$STATE_FILE")
TURN_NUMBER=$(jq -r '.turnNumber // 0' "$STATE_FILE")
CURRENT_PLAYER=$(jq -r '.currentPlayer // ""' "$STATE_FILE")

# Clean up previous player's action file
PREV_ACTION_FILE="$ACTION_DIR/$CURRENT_PLAYER.json"
if [ -f "$PREV_ACTION_FILE" ]; then
  rm -f "$PREV_ACTION_FILE"
fi

# Write turn signal
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg player "$NEXT_PLAYER" \
  --argjson turn "$TURN_NUMBER" \
  --arg gid "$GAME_ID" \
  --arg ts "$TIMESTAMP" \
  '{
    currentPlayer: $player,
    turnNumber: $turn,
    gameId: $gid,
    timestamp: $ts
  }' > "$TURN_SIGNAL"

# Return confirmation
jq -n \
  --arg prev "$CURRENT_PLAYER" \
  --arg next "$NEXT_PLAYER" \
  --argjson turn "$TURN_NUMBER" \
  '{
    status: "signaled",
    previousPlayer: $prev,
    nextPlayer: $next,
    turnNumber: $turn,
    instruction: "Turn signaled. Call wait-for-action.sh to wait for player response."
  }'
