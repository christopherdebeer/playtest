#!/bin/bash
# Gamemaster start hook - injects game rules and initial state into agent context
# Environment: CLAUDE_SUBAGENT_PROMPT contains the prompt

# Extract GAME name from prompt (looks for "GAME: <name>")
GAME=$(echo "$CLAUDE_SUBAGENT_PROMPT" | grep -oP 'GAME:\s*\K\S+' | head -1)

if [ -z "$GAME" ]; then
  echo "Warning: Could not extract game name from prompt" >&2
  exit 0
fi

# Fetch rules (using node directly)
RULES=$(node /home/user/playtest/engine/dist/index.js rules "$GAME" 2>/dev/null)
if [ -n "$RULES" ]; then
  echo "## Game Rules for $GAME"
  echo ""
  echo "$RULES"
  echo ""
fi

# Fetch initial state
STATUS=$(node /home/user/playtest/engine/dist/index.js status "$GAME" 2>/dev/null)
if [ -n "$STATUS" ]; then
  echo "## Current Game Status"
  echo '```json'
  echo "$STATUS"
  echo '```'
fi
