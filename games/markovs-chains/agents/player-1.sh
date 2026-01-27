#!/bin/bash

# Player-1 Agent for Markov's Chains Game
# This script runs the game loop for player-1

# Function to log messages
log_message() {
    echo "[player-1 $(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1"
}

# Main game loop
while true; do
    # Step 1: Poll for turn
    log_message "Polling for turn..."

    # Try to read turn signal
    turn_signal=$(cat games/markovs-chains/state/turn-signal.json 2>/dev/null)

    if [ $? -eq 0 ]; then
        # Parse turn signal to check if it's player-1's turn
        current_player=$(echo "$turn_signal" | jq -r '.currentPlayer')

        if [ "$current_player" != "player-1" ]; then
            # Not our turn, sleep and continue polling
            sleep 1
            continue
        fi

        # Step 2: Read game state
        log_message "Reading game state..."
        game_state=$(cat games/markovs-chains/state/game-state.json)

        # Step 3 & 4: Decision making and action writing
        # Note: This is where Claude AI agent reasoning would happen
        # For now, we'll just create a placeholder action file

        log_message "Preparing turn action..."
        jq -n \
            --arg playerId "player-1" \
            --arg turnNumber "$(echo "$turn_signal" | jq -r '.turnNumber')" \
            --arg gameId "$(echo "$turn_signal" | jq -r '.gameId')" \
            '{
                playerId: $playerId,
                turnNumber: $turnNumber,
                gameId: $gameId,
                action: {
                    type: "pass",
                    parameters: {}
                },
                reasoning: "Placeholder action - requires AI decision making",
                timestamp: "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
            }' > games/markovs-chains/state/player-actions/player-1.json

        # Step 5: Wait for gamemaster processing
        sleep 2

        # Step 6: Check if game is complete
        game_status=$(jq -r '.gameStatus' games/markovs-chains/state/game-state.json)
        if [ "$game_status" == "completed" ]; then
            log_message "Game completed. Exiting loop."
            break
        fi
    else
        # Check if game is complete if turn signal can't be read
        if [ -f games/markovs-chains/state/game-state.json ]; then
            game_status=$(jq -r '.gameStatus' games/markovs-chains/state/game-state.json)
            if [ "$game_status" == "completed" ]; then
                log_message "Game completed. Exiting loop."
                break
            fi
        fi

        # Sleep and retry
        log_message "Waiting for turn signal..."
        sleep 1
    fi
done

log_message "Player-1 agent has finished."