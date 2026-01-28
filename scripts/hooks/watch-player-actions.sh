#!/bin/bash
# Watch player-actions/ directory and notify gamemaster when action submitted

GAME_NAME="${1:-markovs-chains}"
GAME_DIR="games/$GAME_NAME"
ACTIONS_DIR="$GAME_DIR/state/player-actions"

echo "[action-watch-hook] Starting watch on $ACTIONS_DIR"

# Ensure directory exists
mkdir -p "$ACTIONS_DIR"

# Watch for new action files
inotifywait -m -e create,close_write "$ACTIONS_DIR" --format '%e %f' | while read EVENT FILENAME; do
  # Skip log files
  if [[ "$FILENAME" == *-log.txt ]]; then
    continue
  fi

  # Skip if not a JSON file
  if [[ ! "$FILENAME" =~ \.json$ ]]; then
    continue
  fi

  echo "[action-watch-hook] Player action detected: $FILENAME ($EVENT)"

  # Extract player ID
  PLAYER_ID=$(echo "$FILENAME" | sed 's/\.json$//')

  # Check if file is valid JSON
  if ! jq empty "$ACTIONS_DIR/$FILENAME" 2>/dev/null; then
    echo "[action-watch-hook] Invalid JSON, skipping"
    continue
  fi

  echo "[action-watch-hook] Valid action from $PLAYER_ID - gamemaster should process"

  # Create a trigger file for gamemaster
  touch "$GAME_DIR/state/.action-ready"

done
