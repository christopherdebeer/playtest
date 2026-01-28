#!/bin/bash
# Stop hook for player agents - ensures they wait for next turn after acting

# This hook runs when a player agent completes an action
# It checks if the game is still in progress and prompts the agent to wait

# Context guards
AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"
TASK_ID="${CLAUDE_TASK_ID:-}"

# Debug logging to file (observable by coordinator)
HOOK_LOG="hooks/debug/agent-stop-hook.log"
mkdir -p "$(dirname "$HOOK_LOG")"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] HOOK FIRED: agent-stop-hook.sh | Agent: $AGENT_ID | Task: $TASK_ID" >> "$HOOK_LOG"

# Only run in subagent context (not main session)
if [ -z "$TASK_ID" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SKIP: Main session context" >> "$HOOK_LOG"
  exit 0  # Main session, skip
fi

# Only run for player agents
if [[ ! "$AGENT_ID" =~ player- ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SKIP: Not a player agent ($AGENT_ID)" >> "$HOOK_LOG"
  exit 0  # Not a player agent, skip
fi

# Game state detection
GAME_NAME="${GAME_NAME:-markovs-chains}"
GAME_STATE_FILE="games/$GAME_NAME/state/game-state.json"

# Check if game state exists
if [ ! -f "$GAME_STATE_FILE" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ALLOW EXIT: Game state not found" >> "$HOOK_LOG"
  echo "[agent-stop-hook] Game state not found, allowing exit"
  exit 0
fi

# Read game status
GAME_STATUS=$(jq -r '.gameStatus // "in_progress"' "$GAME_STATE_FILE" 2>/dev/null)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Game status: $GAME_STATUS" >> "$HOOK_LOG"

if [ "$GAME_STATUS" = "completed" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ALLOW EXIT: Game completed" >> "$HOOK_LOG"
  echo "[agent-stop-hook] Game completed, allowing agent to exit"
  exit 0
fi

# Game still in progress - agent should wait for next turn
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] BLOCKING EXIT: Game in progress, instructing to continue" >> "$HOOK_LOG"
echo "========================================" >&2
echo "🚫 STOP HOOK TRIGGERED: Game still active!" >&2
echo "========================================" >&2
echo "[agent-stop-hook] Game in progress - agent should wait for next turn"
echo ""
echo "IMPORTANT: Game is still active. You should continue the game loop:"
echo "1. Call ./scripts/actions/player/wait-for-turn.sh to BLOCK until it's your turn"
echo "2. When it returns with status 'your_turn', analyze the game state"
echo "3. Make your decision and submit action via ./scripts/actions/player/submit-action.sh"
echo "4. Loop back to step 1"
echo ""
echo "Example:"
echo "  result=\$(./scripts/actions/player/wait-for-turn.sh $AGENT_ID $GAME_NAME)"
echo "  status=\$(echo \"\$result\" | jq -r '.status')"
echo ""

# Return non-zero to indicate agent should continue
exit 1
