#!/bin/bash
# Stop hook for player agents - ensures they wait for next turn after acting

# This hook runs when a player agent completes an action
# It checks if the game is still in progress and prompts the agent to wait

AGENT_ID="${CLAUDE_AGENT_ID}"
GAME_NAME="${GAME_NAME:-markovs-chains}"
GAME_STATE_FILE="games/$GAME_NAME/state/game-state.json"

# Only run for player agents
if [[ ! "$AGENT_ID" =~ player- ]]; then
  exit 0
fi

# Check if game state exists
if [ ! -f "$GAME_STATE_FILE" ]; then
  echo "[agent-stop-hook] Game state not found, allowing exit"
  exit 0
fi

# Read game status
GAME_STATUS=$(jq -r '.gameStatus // "in_progress"' "$GAME_STATE_FILE" 2>/dev/null)

if [ "$GAME_STATUS" = "completed" ]; then
  echo "[agent-stop-hook] Game completed, allowing agent to exit"
  exit 0
fi

# Game still in progress - agent should wait for next turn
echo "[agent-stop-hook] Game in progress - agent should wait for next turn"
echo ""
echo "IMPORTANT: Game is still active. You should now:"
echo "1. Use Bash with 'inotifywait' to BLOCK until turn-signal.json changes"
echo "2. Check if it's your turn when you wake up"
echo "3. If it's your turn, read state, make decision, submit action"
echo "4. Loop back to step 1"
echo ""
echo "Example blocking wait:"
echo "  inotifywait -e modify,close_write -q games/$GAME_NAME/state/turn-signal.json"
echo ""

# Return non-zero to indicate agent should continue
exit 1
