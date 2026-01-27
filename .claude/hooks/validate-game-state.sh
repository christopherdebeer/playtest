#!/bin/bash
# Hook triggered after Write/Edit operations to validate game state files
set -e

PROJECT_DIR=${CLAUDE_PROJECT_DIR:-.}
STATE_DIR="$PROJECT_DIR/game-state"
BOARD_FILE="$STATE_DIR/board.json"

# Only validate if board.json exists and was modified
if [ -f "$BOARD_FILE" ]; then
  # Check valid JSON
  if ! jq empty "$BOARD_FILE" 2>/dev/null; then
    echo "Error: board.json is not valid JSON" >&2
    exit 2
  fi

  # Check required fields exist
  REQUIRED_FIELDS=".turn,.phase,.activePlayer,.status,.players,.zones"
  if ! jq -e "$REQUIRED_FIELDS" "$BOARD_FILE" > /dev/null 2>&1; then
    echo "Warning: board.json may be missing required fields" >&2
    # Don't fail, just warn
  fi

  # Check for negative life totals (game should be finished)
  PLAYER1_LIFE=$(jq -r '.players.player1.life // 20' "$BOARD_FILE" 2>/dev/null)
  PLAYER2_LIFE=$(jq -r '.players.player2.life // 20' "$BOARD_FILE" 2>/dev/null)
  STATUS=$(jq -r '.status // "playing"' "$BOARD_FILE" 2>/dev/null)

  if [ "$STATUS" = "playing" ]; then
    if [ "$PLAYER1_LIFE" -le 0 ] || [ "$PLAYER2_LIFE" -le 0 ]; then
      echo "Warning: A player has <= 0 life but game status is still 'playing'" >&2
    fi
  fi
fi

# Validate pending move files
for MOVE_FILE in "$STATE_DIR/pending-moves"/*.json; do
  if [ -f "$MOVE_FILE" ]; then
    if ! jq empty "$MOVE_FILE" 2>/dev/null; then
      echo "Error: Invalid JSON in $MOVE_FILE" >&2
      exit 2
    fi
  fi
done

# Validate validation result if exists
VALIDATION_FILE="$STATE_DIR/validation-result.json"
if [ -f "$VALIDATION_FILE" ]; then
  if ! jq empty "$VALIDATION_FILE" 2>/dev/null; then
    echo "Error: Invalid JSON in validation-result.json" >&2
    exit 2
  fi
fi

exit 0
