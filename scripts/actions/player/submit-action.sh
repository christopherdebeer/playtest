#!/bin/bash
# submit-action.sh - Submit a player action
# Usage: submit-action.sh <player-id> <action-json> [game-name]
#
# Action JSON format:
# {
#   "type": "move|draw|play_card|pass",
#   "parameters": { ... },
#   "reasoning": "Why I chose this"
# }
#
# Returns confirmation JSON

set -e

PLAYER_ID="${1:?Usage: submit-action.sh <player-id> '<action-json>' [game-name]}"
ACTION_JSON="${2:?Action JSON required}"
GAME_NAME="${3:-markovs-chains}"

GAME_DIR="games/$GAME_NAME"
STATE_FILE="$GAME_DIR/state/game-state.json"
TURN_SIGNAL="$GAME_DIR/state/turn-signal.json"
ACTION_DIR="$GAME_DIR/state/player-actions"
ACTION_FILE="$ACTION_DIR/$PLAYER_ID.json"

# Validate game state exists
if [ ! -f "$STATE_FILE" ]; then
  jq -n '{status: "error", error: "Game state not found"}'
  exit 1
fi

# Get current game info
GAME_ID=$(jq -r '.gameId // "unknown"' "$STATE_FILE")
TURN_NUMBER=$(jq -r '.turnNumber // 0' "$STATE_FILE")
CURRENT_PLAYER=$(jq -r '.currentPlayer // ""' "$STATE_FILE")
GAME_STATUS=$(jq -r '.gameStatus // "unknown"' "$STATE_FILE")

# Validate it's this player's turn
if [ "$CURRENT_PLAYER" != "$PLAYER_ID" ]; then
  jq -n --arg current "$CURRENT_PLAYER" --arg player "$PLAYER_ID" '{
    status: "error",
    error: "Not your turn",
    currentPlayer: $current,
    yourId: $player
  }'
  exit 1
fi

# Validate game is in progress
if [ "$GAME_STATUS" != "in_progress" ]; then
  jq -n --arg status "$GAME_STATUS" '{
    status: "error",
    error: "Game not in progress",
    gameStatus: $status
  }'
  exit 1
fi

# Parse and validate action JSON
if ! echo "$ACTION_JSON" | jq empty 2>/dev/null; then
  jq -n '{status: "error", error: "Invalid JSON in action"}'
  exit 1
fi

ACTION_TYPE=$(echo "$ACTION_JSON" | jq -r '.type // ""')
if [ -z "$ACTION_TYPE" ] || [ "$ACTION_TYPE" = "null" ]; then
  jq -n '{status: "error", error: "Action type required (move|draw|play_card|pass)"}'
  exit 1
fi

# Validate action type
case "$ACTION_TYPE" in
  move|draw|play_card|pass)
    ;;
  *)
    jq -n --arg type "$ACTION_TYPE" '{
      status: "error",
      error: "Invalid action type",
      provided: $type,
      valid: ["move", "draw", "play_card", "pass"]
    }'
    exit 1
    ;;
esac

# Ensure action directory exists
mkdir -p "$ACTION_DIR"

# Construct full action document
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg pid "$PLAYER_ID" \
  --argjson turn "$TURN_NUMBER" \
  --arg gid "$GAME_ID" \
  --arg ts "$TIMESTAMP" \
  --argjson action "$ACTION_JSON" \
  '{
    playerId: $pid,
    turnNumber: $turn,
    gameId: $gid,
    timestamp: $ts,
    action: $action
  }' > "$ACTION_FILE"

# Return confirmation
jq -n \
  --arg pid "$PLAYER_ID" \
  --argjson turn "$TURN_NUMBER" \
  --arg type "$ACTION_TYPE" \
  --arg file "$ACTION_FILE" \
  '{
    status: "submitted",
    playerId: $pid,
    turnNumber: $turn,
    actionType: $type,
    actionFile: $file,
    instruction: "Action submitted. Call wait-for-turn.sh to wait for next turn."
  }'
