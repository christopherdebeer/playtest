#!/bin/bash
# read-messages.sh - Read pending messages for an agent
# Usage: read-messages.sh <agent-id> [game-name] [--keep]
#
# By default, messages are marked as read (moved to .read)
# Use --keep to leave messages in place

set -e

AGENT_ID="${1:?Usage: read-messages.sh <agent-id> [game-name] [--keep]}"
GAME_NAME="${2:-markovs-chains}"
KEEP_MESSAGES=false

# Check for --keep flag
for arg in "$@"; do
  if [ "$arg" = "--keep" ]; then
    KEEP_MESSAGES=true
  fi
done

GAME_DIR="games/$GAME_NAME"
MESSAGE_DIR="$GAME_DIR/state/messages/$AGENT_ID"

# Check if message directory exists
if [ ! -d "$MESSAGE_DIR" ]; then
  jq -n '{status: "ok", messages: [], count: 0}'
  exit 0
fi

# Collect messages
MESSAGES="[]"
COUNT=0

for msg_file in "$MESSAGE_DIR"/*.json 2>/dev/null; do
  if [ -f "$msg_file" ]; then
    msg_content=$(cat "$msg_file")
    MESSAGES=$(echo "$MESSAGES" | jq --argjson msg "$msg_content" '. + [$msg]')
    COUNT=$((COUNT + 1))

    # Mark as read unless --keep
    if [ "$KEEP_MESSAGES" = false ]; then
      mv "$msg_file" "$msg_file.read" 2>/dev/null || true
    fi
  fi
done

# Return messages
jq -n \
  --argjson msgs "$MESSAGES" \
  --argjson count "$COUNT" \
  '{
    status: "ok",
    messages: $msgs,
    count: $count
  }'
