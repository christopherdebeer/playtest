#!/bin/bash
# wait-for-action.sh - Blocks until the current player submits an action
# Usage: wait-for-action.sh [game-name] [timeout-seconds]
#
# Returns JSON with the player's action when submitted
# Built-in circuit breaker: exits with timeout after specified duration

set -e

GAME_NAME="${1:-markovs-chains}"
TIMEOUT="${2:-180}"  # 3 minute default timeout

GAME_DIR="games/$GAME_NAME"
STATE_FILE="$GAME_DIR/state/game-state.json"
TURN_SIGNAL="$GAME_DIR/state/turn-signal.json"
ACTION_DIR="$GAME_DIR/state/player-actions"

# Circuit breaker tracking
START_TIME=$(date +%s)
INOTIFY_TIMEOUT=15  # Short cycles to check circuit breaker

# Get current player
if [ ! -f "$STATE_FILE" ]; then
  jq -n '{status: "error", error: "Game state not found"}'
  exit 1
fi

CURRENT_PLAYER=$(jq -r '.currentPlayer // ""' "$STATE_FILE")
GAME_STATUS=$(jq -r '.gameStatus // "unknown"' "$STATE_FILE")

if [ "$GAME_STATUS" != "in_progress" ]; then
  jq -n --arg status "$GAME_STATUS" '{
    status: "game_not_active",
    gameStatus: $status,
    instruction: "Game is not in progress"
  }'
  exit 0
fi

if [ -z "$CURRENT_PLAYER" ]; then
  jq -n '{status: "error", error: "No current player set"}'
  exit 1
fi

ACTION_FILE="$ACTION_DIR/$CURRENT_PLAYER.json"

# Helper: Check if action file exists and is valid
check_action() {
  if [ -f "$ACTION_FILE" ]; then
    # Validate it's valid JSON
    if jq empty "$ACTION_FILE" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

# Main wait loop with circuit breaker
while true; do
  # Circuit breaker check
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    jq -n \
      --arg player "$CURRENT_PLAYER" \
      --argjson elapsed "$ELAPSED" \
      --argjson timeout "$TIMEOUT" \
      '{
        status: "timeout",
        reason: "Circuit breaker triggered - player did not respond",
        player: $player,
        elapsedSeconds: $elapsed,
        timeoutSeconds: $timeout,
        suggestion: "Consider sending a reminder message or forcing a pass"
      }'
    exit 124  # Standard timeout exit code
  fi

  # Check if action exists
  if check_action; then
    # Read and return action
    action_content=$(cat "$ACTION_FILE")

    jq -n \
      --arg player "$CURRENT_PLAYER" \
      --argjson action "$action_content" \
      --arg file "$ACTION_FILE" \
      '{
        status: "action_received",
        player: $player,
        action: $action,
        actionFile: $file,
        instruction: "Process action, update state, then call signal-turn.sh"
      }'
    exit 0
  fi

  # Ensure action directory exists
  mkdir -p "$ACTION_DIR"

  # Wait for action file to appear
  inotifywait -e create,close_write,modify -t $INOTIFY_TIMEOUT -q "$ACTION_DIR" 2>/dev/null || true
done
