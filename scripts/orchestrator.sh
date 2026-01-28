#!/bin/bash
# Main orchestrator for hook-based game coordination
# Starts all watch hooks and manages the game lifecycle

set -e

GAME_NAME="${1:-markovs-chains}"
NUM_PLAYERS="${2:-3}"
GAME_DIR="games/$GAME_NAME"

echo "=== Game Orchestrator Started ==="
echo "Game: $GAME_NAME"
echo "Players: $NUM_PLAYERS"
echo ""

# Cleanup function
cleanup() {
  echo "[orchestrator] Shutting down hooks..."
  kill $(jobs -p) 2>/dev/null || true
  wait
  echo "[orchestrator] Cleanup complete"
}
trap cleanup EXIT

# Ensure hooks directory exists
mkdir -p scripts/hooks

# Start watch hooks in background
echo "[orchestrator] Starting file watch hooks..."

# Watch turn signals to spawn players
if [ -f scripts/hooks/watch-turn-signal.sh ]; then
  bash scripts/hooks/watch-turn-signal.sh "$GAME_NAME" &
  TURN_WATCH_PID=$!
  echo "[orchestrator] Turn signal hook started (PID: $TURN_WATCH_PID)"
fi

# Watch player actions to notify gamemaster
if [ -f scripts/hooks/watch-player-actions.sh ]; then
  bash scripts/hooks/watch-player-actions.sh "$GAME_NAME" &
  ACTION_WATCH_PID=$!
  echo "[orchestrator] Player action hook started (PID: $ACTION_WATCH_PID)"
fi

echo "[orchestrator] Hooks running. Waiting for game to complete..."
echo "[orchestrator] Game state: $GAME_DIR/state/game-state.json"
echo ""

# Monitor game completion
while true; do
  if [ ! -f "$GAME_DIR/state/game-state.json" ]; then
    sleep 2
    continue
  fi

  GAME_STATUS=$(jq -r '.gameStatus' "$GAME_DIR/state/game-state.json" 2>/dev/null || echo "in_progress")

  if [ "$GAME_STATUS" = "completed" ]; then
    WINNER=$(jq -r '.winner' "$GAME_DIR/state/game-state.json")
    TURNS=$(jq -r '.turnNumber' "$GAME_DIR/state/game-state.json")

    echo ""
    echo "=== Game Completed ==="
    echo "Winner: $WINNER"
    echo "Total Turns: $TURNS"
    echo "Logs: $GAME_DIR/logs/"

    break
  fi

  sleep 3
done

# Cleanup hooks
cleanup
