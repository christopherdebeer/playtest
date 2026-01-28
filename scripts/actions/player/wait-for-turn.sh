#!/bin/bash
# wait-for-turn.sh - Blocks until it's the player's turn
# Usage: wait-for-turn.sh <player-id> [game-name] [timeout-seconds]
#
# Returns JSON with game state when it's the player's turn
# Built-in circuit breaker: exits with timeout after specified duration
# Checks for messages during wait

set -e

PLAYER_ID="${1:?Usage: wait-for-turn.sh <player-id> [game-name] [timeout]}"
GAME_NAME="${2:-markovs-chains}"
TIMEOUT="${3:-300}"  # 5 minute default timeout

GAME_DIR="games/$GAME_NAME"
STATE_FILE="$GAME_DIR/state/game-state.json"
TURN_SIGNAL="$GAME_DIR/state/turn-signal.json"
MESSAGE_DIR="$GAME_DIR/state/messages/$PLAYER_ID"

# Circuit breaker tracking
START_TIME=$(date +%s)
POLL_INTERVAL=2
INOTIFY_TIMEOUT=30  # Short inotify cycles to check messages

# Ensure message directory exists
mkdir -p "$MESSAGE_DIR"

# Helper: Check for pending messages
check_messages() {
  local has_messages=false
  local messages="[]"

  if [ -d "$MESSAGE_DIR" ]; then
    for msg_file in "$MESSAGE_DIR"/*.json 2>/dev/null; do
      if [ -f "$msg_file" ]; then
        has_messages=true
        msg_content=$(cat "$msg_file")
        messages=$(echo "$messages" | jq --argjson msg "$msg_content" '. + [$msg]')
        # Optionally archive after reading
        mv "$msg_file" "$msg_file.read" 2>/dev/null || true
      fi
    done
  fi

  if [ "$has_messages" = true ]; then
    echo "$messages"
    return 0
  fi
  return 1
}

# Helper: Check if game is completed
check_game_over() {
  if [ -f "$STATE_FILE" ]; then
    local status=$(jq -r '.gameStatus // "unknown"' "$STATE_FILE" 2>/dev/null)
    if [ "$status" = "completed" ]; then
      return 0
    fi
  fi
  return 1
}

# Helper: Check if it's my turn
check_my_turn() {
  if [ -f "$TURN_SIGNAL" ]; then
    local current=$(jq -r '.currentPlayer // ""' "$TURN_SIGNAL" 2>/dev/null)
    if [ "$current" = "$PLAYER_ID" ]; then
      return 0
    fi
  fi
  return 1
}

# Helper: Get current game state for player (filtered view)
get_player_view() {
  if [ ! -f "$STATE_FILE" ]; then
    echo '{"error": "Game state not found"}'
    return 1
  fi

  # Return filtered view - player sees their hand, others' positions/hand sizes
  jq --arg pid "$PLAYER_ID" '{
    gameId: .gameId,
    gameStatus: .gameStatus,
    turnNumber: .turnNumber,
    currentPlayer: .currentPlayer,
    myState: .players[$pid],
    opponents: (
      .players | to_entries | map(
        select(.key != $pid) | {
          playerId: .key,
          state: .value.state,
          handSize: (.value.hand | length),
          activeEffects: .value.activeEffects
        }
      )
    ),
    turnOrder: .turnOrder
  }' "$STATE_FILE"
}

# Main wait loop with circuit breaker
while true; do
  # Circuit breaker check
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    jq -n --arg reason "timeout" --argjson elapsed "$ELAPSED" '{
      status: "timeout",
      reason: "Circuit breaker triggered",
      elapsedSeconds: $elapsed,
      message: "Waited too long for turn. Consider retrying or checking game status."
    }'
    exit 124  # Standard timeout exit code
  fi

  # Check for messages first
  if messages=$(check_messages); then
    jq -n --argjson msgs "$messages" '{
      status: "messages",
      messages: $msgs,
      instruction: "Process messages, then call wait-for-turn.sh again"
    }'
    exit 0
  fi

  # Check if game is over
  if check_game_over; then
    winner=$(jq -r '.winner // "unknown"' "$STATE_FILE" 2>/dev/null)
    jq -n --arg winner "$winner" '{
      status: "game_over",
      winner: $winner,
      instruction: "Game has ended. Exit gracefully."
    }'
    exit 0
  fi

  # Check if it's my turn
  if check_my_turn; then
    game_view=$(get_player_view)
    jq -n --argjson state "$game_view" '{
      status: "your_turn",
      gameState: $state,
      instruction: "Make your move using submit-action.sh"
    }'
    exit 0
  fi

  # Not my turn - wait for turn signal change
  # Use short inotify timeout to periodically check messages and circuit breaker
  inotifywait -e modify,close_write,create -t $INOTIFY_TIMEOUT -q "$TURN_SIGNAL" 2>/dev/null || true
done
