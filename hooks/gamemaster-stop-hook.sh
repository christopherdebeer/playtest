#!/bin/bash
# Gamemaster stop hook - blocks stop if game is still in progress
# SubagentStop hooks receive JSON metadata via stdin

# Logging setup
LOGS_DIR="${LOGS_DIR:-./logs}"
mkdir -p "$LOGS_DIR/hooks"
LOG_FILE="$LOGS_DIR/hooks/gamemaster-stop-hook.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

# Log start
{
  echo "=== HOOK START ==="
  echo "Timestamp: $TIMESTAMP"
  echo "Hook: gamemaster-stop-hook"
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
  echo "Warning: Could not access transcript file, allowing stop" >> "$LOG_FILE" 2>&1
  exit 0
fi

# Extract the agent prompt from the transcript to get game name
AGENT_PROMPT=$(head -50 "$TRANSCRIPT_PATH" | python3 -c '
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
' 2>/dev/null | head -1)

echo "Extracted agent prompt:" >> "$LOG_FILE" 2>&1
echo "$AGENT_PROMPT" >> "$LOG_FILE" 2>&1

# Extract GAME name from prompt
GAME=$(echo "$AGENT_PROMPT" | sed -n 's/^GAME:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)
echo "Extracted GAME: '$GAME'" >> "$LOG_FILE" 2>&1

if [ -z "$GAME" ]; then
  echo "Warning: Could not extract game name, allowing stop" >> "$LOG_FILE" 2>&1
  exit 0
fi

# Get game status
echo "Checking game status for: $GAME" >> "$LOG_FILE" 2>&1
STATUS_JSON=$(npx playtest status "$GAME" 2>&1)
echo "Status output: $STATUS_JSON" >> "$LOG_FILE" 2>&1

# Parse status field
GAME_STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null)
echo "Parsed game status: '$GAME_STATUS'" >> "$LOG_FILE" 2>&1

# Allow stop if game is completed or cancelled
if [ "$GAME_STATUS" = "completed" ] || [ "$GAME_STATUS" = "cancelled" ]; then
  echo "Game ended (status: $GAME_STATUS), allowing stop" >> "$LOG_FILE" 2>&1
  {
    echo "=== HOOK END ==="
    echo "Exit Code: 0 (allowed)"
    echo ""
  } >> "$LOG_FILE" 2>&1
  exit 0
fi

# Block stop if game is still in progress
echo "Game still in progress (status: $GAME_STATUS), blocking stop" >> "$LOG_FILE" 2>&1
{
  echo "=== HOOK END ==="
  echo "Exit Code: 2 (blocked)"
  echo ""
} >> "$LOG_FILE" 2>&1

echo "Game not finished. Continue managing the game until completion." >&2
exit 2
