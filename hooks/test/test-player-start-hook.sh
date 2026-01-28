#!/bin/bash
# SubagentStart hook test - logs all environment variables and JSON input at agent startup

HOOK_LOG="hooks/test/test-player-start-hook.log"
mkdir -p "$(dirname "$HOOK_LOG")"

echo "========================================" >> "$HOOK_LOG"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SUBAGENT START HOOK FIRED" >> "$HOOK_LOG"
echo "========================================" >> "$HOOK_LOG"

# Try to capture stdin (JSON input)
STDIN_DATA=""
if [ -t 0 ]; then
    echo "STDIN: Not a pipe (no data)" >> "$HOOK_LOG"
else
    STDIN_DATA=$(cat)
    echo "STDIN DATA:" >> "$HOOK_LOG"
    echo "$STDIN_DATA" >> "$HOOK_LOG"
fi

echo "" >> "$HOOK_LOG"

# Log ALL environment variables
echo "ENVIRONMENT VARIABLES:" >> "$HOOK_LOG"
env | sort >> "$HOOK_LOG"

echo "" >> "$HOOK_LOG"
echo "HOOK_INPUT VARIABLE:" >> "$HOOK_LOG"
echo "${HOOK_INPUT:-NOT_SET}" >> "$HOOK_LOG"

echo "" >> "$HOOK_LOG"
echo "SPECIFIC CLAUDE VARIABLES:" >> "$HOOK_LOG"
echo "  CLAUDE_AGENT_ID: ${CLAUDE_AGENT_ID:-NOT_SET}" >> "$HOOK_LOG"
echo "  CLAUDE_TASK_ID: ${CLAUDE_TASK_ID:-NOT_SET}" >> "$HOOK_LOG"
echo "  CLAUDE_SESSION_ID: ${CLAUDE_SESSION_ID:-NOT_SET}" >> "$HOOK_LOG"
echo "  CLAUDE_AGENT_TYPE: ${CLAUDE_AGENT_TYPE:-NOT_SET}" >> "$HOOK_LOG"

# Try to parse JSON from HOOK_INPUT or stdin
echo "" >> "$HOOK_LOG"
echo "PARSED JSON DATA:" >> "$HOOK_LOG"
JSON_DATA="${HOOK_INPUT:-$STDIN_DATA}"
if [ -n "$JSON_DATA" ]; then
    if command -v jq &> /dev/null; then
        echo "  agent_id: $(echo "$JSON_DATA" | jq -r '.agent_id // "NOT_FOUND"')" >> "$HOOK_LOG"
        echo "  agent_type: $(echo "$JSON_DATA" | jq -r '.agent_type // "NOT_FOUND"')" >> "$HOOK_LOG"
        echo "  session_id: $(echo "$JSON_DATA" | jq -r '.session_id // "NOT_FOUND"')" >> "$HOOK_LOG"
        echo "  hook_event_name: $(echo "$JSON_DATA" | jq -r '.hook_event_name // "NOT_FOUND"')" >> "$HOOK_LOG"
    else
        echo "  jq not available for parsing" >> "$HOOK_LOG"
    fi
else
    echo "  No JSON data found" >> "$HOOK_LOG"
fi

echo "========================================" >> "$HOOK_LOG"

# Display to user
echo "✅ SubagentStart hook executed!"
if [ -n "$JSON_DATA" ] && command -v jq &> /dev/null; then
    AGENT_ID=$(echo "$JSON_DATA" | jq -r '.agent_id // "NOT_FOUND"')
    AGENT_TYPE=$(echo "$JSON_DATA" | jq -r '.agent_type // "NOT_FOUND"')
    echo "Agent ID: $AGENT_ID"
    echo "Agent Type: $AGENT_TYPE"
else
    echo "Agent ID: ${CLAUDE_AGENT_ID:-NOT_SET}"
    echo "Agent Type: ${CLAUDE_AGENT_TYPE:-NOT_SET}"
fi

# Continue (SubagentStart hooks should always allow execution to continue)
exit 0
