#!/bin/bash
# Watch turn-signal.json and spawn appropriate player agent when it changes

GAME_NAME="${1:-markovs-chains}"
GAME_DIR="games/$GAME_NAME"
TURN_SIGNAL="$GAME_DIR/state/turn-signal.json"
TEMPLATES_DIR="engine/templates"

echo "[turn-signal-hook] Starting watch on $TURN_SIGNAL"

# Wait for turn signal file to exist
while [ ! -f "$TURN_SIGNAL" ]; do
  sleep 1
done

# Watch for modifications using inotifywait
inotifywait -m -e modify,create "$TURN_SIGNAL" --format '%e %w%f' | while read EVENT FILE; do
  echo "[turn-signal-hook] Turn signal changed: $EVENT"

  # Read current player from turn signal
  CURRENT_PLAYER=$(jq -r '.currentPlayer' "$TURN_SIGNAL" 2>/dev/null)
  TURN_NUMBER=$(jq -r '.turnNumber' "$TURN_SIGNAL" 2>/dev/null)
  GAME_STATUS=$(jq -r '.gameStatus // "in_progress"' "$GAME_DIR/state/game-state.json" 2>/dev/null)

  if [ "$GAME_STATUS" = "completed" ]; then
    echo "[turn-signal-hook] Game completed, exiting watch"
    exit 0
  fi

  if [ -z "$CURRENT_PLAYER" ] || [ "$CURRENT_PLAYER" = "null" ]; then
    echo "[turn-signal-hook] No current player found, skipping"
    continue
  fi

  echo "[turn-signal-hook] Turn $TURN_NUMBER: Spawning $CURRENT_PLAYER agent"

  # Load player template
  PLAYER_TEMPLATE=$(cat "$TEMPLATES_DIR/player-oneshot.md" 2>/dev/null || cat "$TEMPLATES_DIR/player-npm-interface.md")

  # Fill template variables
  PLAYER_PROMPT=$(echo "$PLAYER_TEMPLATE" | \
    sed "s/{{PLAYER_ID}}/$CURRENT_PLAYER/g" | \
    sed "s/{{GAME_NAME}}/$GAME_NAME/g" | \
    sed "s/{{WIN_CONDITION}}/First player to reach the Victory state/g")

  # Spawn player agent (one-shot mode - exits after one action)
  # Use Task tool via Claude SDK would go here
  # For now, log that we would spawn
  echo "[turn-signal-hook] Would spawn: claude agent --prompt \"$PLAYER_PROMPT\""

  # TODO: Actually spawn the agent using SDK or Task tool
  # This requires integration with the coordinator that has access to Task tool
done
