#!/bin/bash
# force-pass.sh - Force a player to pass their turn (used when player times out)
# Usage: force-pass.sh <player-id> [game-name]
#
# Creates a pass action on behalf of the player

set -e

PLAYER_ID="${1:?Usage: force-pass.sh <player-id> [game-name]}"
GAME_NAME="${2:-markovs-chains}"

GAME_DIR="games/$GAME_NAME"
STATE_FILE="$GAME_DIR/state/game-state.json"
ACTION_DIR="$GAME_DIR/state/player-actions"
ACTION_FILE="$ACTION_DIR/$PLAYER_ID.json"
LOG_DIR="$GAME_DIR/logs"

# Validate game state
if [ ! -f "$STATE_FILE" ]; then
  jq -n '{status: "error", error: "Game state not found"}'
  exit 1
fi

GAME_ID=$(jq -r '.gameId // "unknown"' "$STATE_FILE")
TURN_NUMBER=$(jq -r '.turnNumber // 0' "$STATE_FILE")
LIVE_LOG="$LOG_DIR/game-$GAME_ID-live.jsonl"

# Ensure action directory exists
mkdir -p "$ACTION_DIR"

# Create forced pass action
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg pid "$PLAYER_ID" \
  --argjson turn "$TURN_NUMBER" \
  --arg gid "$GAME_ID" \
  --arg ts "$TIMESTAMP" \
  '{
    playerId: $pid,
    turnNumber: $turn,
    gameId: $gid,
    timestamp: $ts,
    action: {
      type: "pass",
      parameters: {},
      reasoning: "Forced pass due to timeout"
    },
    forced: true
  }' > "$ACTION_FILE"

# Log the forced pass
jq -n -c \
  --arg ts "$TIMESTAMP" \
  --arg pid "$PLAYER_ID" \
  --argjson turn "$TURN_NUMBER" \
  '{
    timestamp: $ts,
    event: "forced_pass",
    playerId: $pid,
    turnNumber: $turn,
    reason: "Player timeout"
  }' >> "$LIVE_LOG"

# Send warning message to player
MESSAGE_DIR="$GAME_DIR/state/messages/$PLAYER_ID"
mkdir -p "$MESSAGE_DIR"
jq -n \
  --arg ts "$TIMESTAMP" \
  '{
    messageId: "timeout-warning",
    from: "gamemaster",
    to: "'"$PLAYER_ID"'",
    type: "warning",
    content: "Your turn was skipped due to timeout. Please respond faster next turn.",
    timestamp: $ts
  }' > "$MESSAGE_DIR/timeout-$(date +%s).json"

# Return confirmation
jq -n \
  --arg pid "$PLAYER_ID" \
  --argjson turn "$TURN_NUMBER" \
  '{
    status: "forced_pass",
    playerId: $pid,
    turnNumber: $turn,
    instruction: "Forced pass created. Process as normal action."
  }'
