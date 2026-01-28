#!/bin/bash
# Stop hook for player agents - ensures they wait for next turn after acting

# This hook runs when a player agent completes an action
# It checks if the game is still in progress and prompts the agent to wait

# ============================================================
# PARSE JSON INPUT FROM STDIN
# ============================================================
# SubagentStop hooks receive JSON via stdin, not environment variables
# Expected format: {"agent_id": "...", "session_id": "...", "hook_event_name": "SubagentStop", ...}

HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat)
fi

# Parse context from JSON input
if [ -n "$HOOK_INPUT" ] && command -v jq &> /dev/null; then
  AGENT_ID=$(echo "$HOOK_INPUT" | jq -r '.agent_id // "unknown"')
  SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // "unknown"')
  AGENT_TYPE=$(echo "$HOOK_INPUT" | jq -r '.agent_type // "unknown"')
else
  # Fallback to environment variables (will be "unknown" if not set)
  AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"
  SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
  AGENT_TYPE="${CLAUDE_AGENT_TYPE:-unknown}"
fi

# For backwards compatibility, keep TASK_ID as agent_id
TASK_ID="$AGENT_ID"

# Debug logging to file (observable by coordinator)
HOOK_LOG="hooks/debug/agent-stop-hook.log"
mkdir -p "$(dirname "$HOOK_LOG")"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] HOOK FIRED: agent-stop-hook.sh | Agent: $AGENT_ID | Task: $TASK_ID" >> "$HOOK_LOG"

# Only run in subagent context (not main session)
if [ "$AGENT_ID" = "unknown" ] || [ -z "$AGENT_ID" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SKIP: Main session context or no agent ID" >> "$HOOK_LOG"
  exit 0  # Main session, skip
fi

# This hook is only triggered by player agents (defined in .claude/agents/player.md)
# No need to check agent type since it's scoped to player agents
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Processing player agent $AGENT_ID" >> "$HOOK_LOG"

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
