#!/bin/bash
# Player-3 Agent for Markovs Chains

GAME_DIR="/Users/cdbeer/dev/claude-subagent-comms-test/games/markovs-chains/state"
LOG_FILE="${GAME_DIR}/player-actions/player-3-log.txt"

log() {
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" >> "$LOG_FILE"
}

# Main game loop
while true; do
    # Step 1: Poll for turn
    if [ ! -f "${GAME_DIR}/turn-signal.json" ]; then
        log "Waiting: No turn signal found"
        sleep 1
        continue
    fi

    # Read turn signal
    TURN_DATA=$(cat "${GAME_DIR}/turn-signal.json")
    CURRENT_PLAYER=$(echo "$TURN_DATA" | jq -r '.currentPlayer')

    if [ "$CURRENT_PLAYER" != "player-3" ]; then
        log "Not my turn. Current player: ${CURRENT_PLAYER}"
        sleep 1
        continue
    fi

    # Step 2: Read game state
    if [ ! -f "${GAME_DIR}/game-state.json" ]; then
        log "Error: No game state found"
        sleep 1
        continue
    fi

    # Claude Agent will replace this section with strategic reasoning
    log "Processing turn for player-3"

    # Placeholder for Claude agent's action selection
    ACTION_JSON='{
        "playerId": "player-3",
        "action": {"type": "pass"},
        "reasoning": "Default pass action",
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }'

    # Write action
    echo "$ACTION_JSON" > "${GAME_DIR}/player-actions/player-3.json"
    log "Wrote default pass action"

    # Step 5: Wait for processing
    sleep 2

    # Step 6: Check game completion
    GAME_STATUS=$(jq -r '.gameStatus' "${GAME_DIR}/game-state.json")
    if [ "$GAME_STATUS" == "completed" ]; then
        log "Game completed. Exiting agent."
        break
    fi
done