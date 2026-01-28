#!/bin/bash
# send-message.sh - Send a message to another agent
# Usage: send-message.sh <from-agent> <to-agent> <message-type> <message-content> [game-name]
#
# Message types: reminder, warning, info, system
# Messages are delivered when recipient calls wait-for-turn.sh or read-messages.sh

set -e

FROM_AGENT="${1:?Usage: send-message.sh <from> <to> <type> <content> [game]}"
TO_AGENT="${2:?Recipient agent required}"
MSG_TYPE="${3:?Message type required (reminder|warning|info|system)}"
MSG_CONTENT="${4:?Message content required}"
GAME_NAME="${5:-markovs-chains}"

GAME_DIR="games/$GAME_NAME"
MESSAGE_DIR="$GAME_DIR/state/messages/$TO_AGENT"

# Validate message type
case "$MSG_TYPE" in
  reminder|warning|info|system)
    ;;
  *)
    jq -n --arg type "$MSG_TYPE" '{
      status: "error",
      error: "Invalid message type",
      provided: $type,
      valid: ["reminder", "warning", "info", "system"]
    }'
    exit 1
    ;;
esac

# Ensure message directory exists
mkdir -p "$MESSAGE_DIR"

# Generate unique message ID
MSG_ID="msg-$(date +%s%N)"
MSG_FILE="$MESSAGE_DIR/$MSG_ID.json"

# Write message
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg id "$MSG_ID" \
  --arg from "$FROM_AGENT" \
  --arg to "$TO_AGENT" \
  --arg type "$MSG_TYPE" \
  --arg content "$MSG_CONTENT" \
  --arg ts "$TIMESTAMP" \
  '{
    messageId: $id,
    from: $from,
    to: $to,
    type: $type,
    content: $content,
    timestamp: $ts
  }' > "$MSG_FILE"

# Return confirmation
jq -n \
  --arg id "$MSG_ID" \
  --arg to "$TO_AGENT" \
  --arg type "$MSG_TYPE" \
  '{
    status: "sent",
    messageId: $id,
    recipient: $to,
    messageType: $type
  }'
