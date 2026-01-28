#!/bin/bash
# Stop hook for gamemaster agent - ensures it waits for next player action

AGENT_ID="${CLAUDE_AGENT_ID}"
GAME_NAME="${GAME_NAME:-markovs-chains}"
GAME_STATE_FILE="games/$GAME_NAME/state/game-state.json"

# Only run for gamemaster agent
if [[ ! "$AGENT_ID" =~ gamemaster ]]; then
  exit 0
fi

# Check if game state exists
if [ ! -f "$GAME_STATE_FILE" ]; then
  echo "[gamemaster-stop-hook] Game state not found, allowing exit"
  exit 0
fi

# Read game status
GAME_STATUS=$(jq -r '.gameStatus // "in_progress"' "$GAME_STATE_FILE" 2>/dev/null)
CURRENT_PLAYER=$(jq -r '.currentPlayer' "$GAME_STATE_FILE" 2>/dev/null)

if [ "$GAME_STATUS" = "completed" ]; then
  echo "[gamemaster-stop-hook] Game completed, allowing gamemaster to exit"
  exit 0
fi

# Game still in progress - gamemaster should wait for player action
echo "[gamemaster-stop-hook] Game in progress - waiting for $CURRENT_PLAYER action"
echo ""
echo "IMPORTANT: Turn signal written, now waiting for player action."
echo "You should now:"
echo "1. Use 'inotifywait' to BLOCK until player action file appears"
echo "2. Process the action when you wake up"
echo "3. Update game state and write next turn signal"
echo "4. Loop back to step 1"
echo ""
echo "Example blocking wait:"
echo "  inotifywait -e create,close_write -t 120 -q games/$GAME_NAME/state/player-actions/$CURRENT_PLAYER.json"
echo ""

# Return non-zero to indicate gamemaster should continue
exit 1
