#!/bin/bash
# Gamemaster start hook - injects game rules and initial state into agent context
# SubagentStart hooks receive JSON metadata via stdin

# Logging setup
LOGS_DIR="${LOGS_DIR:-./logs}"
mkdir -p "$LOGS_DIR/hooks"
LOG_FILE="$LOGS_DIR/hooks/gamemaster-start-hook.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

# Log start
{
  echo "=== HOOK START ==="
  echo "Timestamp: $TIMESTAMP"
  echo "Hook: gamemaster-start-hook"
  echo "Working Dir: $(pwd)"
  echo ""
} >> "$LOG_FILE" 2>&1

# Read JSON input from stdin
INPUT_JSON=$(cat)
echo "Received input JSON:" >> "$LOG_FILE" 2>&1
echo "$INPUT_JSON" >> "$LOG_FILE" 2>&1

# Extract transcript path
TRANSCRIPT_PATH=$(echo "$INPUT_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('transcript_path', ''))" 2>/dev/null)
echo "Transcript path: $TRANSCRIPT_PATH" >> "$LOG_FILE" 2>&1

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "Warning: Could not access transcript file" >> "$LOG_FILE" 2>&1
  exit 0
fi

# Extract the agent prompt from the last user message in the transcript
AGENT_PROMPT=$(tail -20 "$TRANSCRIPT_PATH" | python3 -c '
import sys, json
for line in sys.stdin:
    try:
        entry = json.loads(line.strip())
        if entry.get("role") == "user" and entry.get("type") == "message":
            content = entry.get("content", "")
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        print(item.get("text", ""))
                        break
            elif isinstance(content, str):
                print(content)
    except: pass
' 2>/dev/null | tail -1)

echo "Extracted agent prompt:" >> "$LOG_FILE" 2>&1
echo "$AGENT_PROMPT" >> "$LOG_FILE" 2>&1
echo "" >> "$LOG_FILE" 2>&1

# Extract GAME name from prompt
GAME=$(echo "$AGENT_PROMPT" | sed -n 's/^GAME:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)
echo "Extracted GAME: '$GAME'" >> "$LOG_FILE" 2>&1

if [ -z "$GAME" ]; then
  echo "Warning: Could not extract game name from prompt" >> "$LOG_FILE" 2>&1
  exit 0
fi

# Fetch rules via engine CLI
echo "Fetching rules for game: $GAME" >> "$LOG_FILE" 2>&1
RULES=$(npx playtest rules "$GAME" 2>&1)
RULES_EXIT=$?

echo "Rules fetch exit code: $RULES_EXIT" >> "$LOG_FILE" 2>&1
echo "Rules output length: ${#RULES}" >> "$LOG_FILE" 2>&1

if [ -n "$RULES" ]; then
  echo "## Game Rules for $GAME"
  echo ""
  echo "$RULES"
  echo ""
  echo "Rules injected successfully" >> "$LOG_FILE" 2>&1
else
  echo "No rules fetched" >> "$LOG_FILE" 2>&1
fi

# Fetch initial state
echo "Fetching initial state for game: $GAME" >> "$LOG_FILE" 2>&1
STATUS=$(npx playtest status "$GAME" 2>&1)
STATUS_EXIT=$?

echo "Status fetch exit code: $STATUS_EXIT" >> "$LOG_FILE" 2>&1
echo "Status output length: ${#STATUS}" >> "$LOG_FILE" 2>&1

if [ -n "$STATUS" ]; then
  echo "## Current Game Status"
  echo '```json'
  echo "$STATUS"
  echo '```'
  echo "Status injected successfully" >> "$LOG_FILE" 2>&1
else
  echo "No status fetched" >> "$LOG_FILE" 2>&1
fi

# Log end
{
  echo ""
  echo "=== HOOK END ==="
  echo "Exit Code: 0"
  echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo ""
} >> "$LOG_FILE" 2>&1
