#!/bin/bash

# Player-3 Agent for Markov's Chains
# Implements advanced strategic decision-making based on game rules

# Absolute paths for scripts
WAIT_TURN_SCRIPT="/Users/cdbeer/dev/claude-subagent-comms-test/scripts/actions/player/wait-for-turn.sh"
SUBMIT_ACTION_SCRIPT="/Users/cdbeer/dev/claude-subagent-comms-test/scripts/actions/player/submit-action.sh"

# Game parameters
GAME_NAME="markovs-chains"
PLAYER_ID="player-3"

# Debug logging
debug_log() {
    echo "[player-3] $1" >&2
}

# Strategy function to decide action
decide_action() {
    local game_state="$1"

    # Parse game state
    local turn_number=$(echo "$game_state" | jq -r '.turnNumber')
    local current_state=$(echo "$game_state" | jq -r '.myState.state')
    local hand=$(echo "$game_state" | jq -r '.myState.hand[]')
    local hand_size=$(echo "$game_state" | jq -r '.myState.hand | length')
    local opponents=$(echo "$game_state" | jq '.opponents')

    # Possible moves based on current state
    local possible_moves=""
    case "$current_state" in
        "Start")
            possible_moves='"A" "B" "C"'
            ;;
        "A")
            possible_moves='"B" "C" "Victory"'
            ;;
        "B")
            possible_moves='"A" "C" "Victory"'
            ;;
        "C")
            possible_moves='"A" "B" "Victory"'
            ;;
        "Victory")
            debug_log "Already at Victory state!"
            echo '{"type":"pass", "reasoning":"Already at Victory"}'
            return
            ;;
        *)
            debug_log "Invalid state: $current_state"
            echo '{"type":"pass", "reasoning":"Invalid state"}'
            return
            ;;
    esac

    # Strategy framework
    local action_type=""
    local action_params="{}"
    local reasoning=""
    local card_to_use=""

    # 1. Win Check: Can I win this turn?
    if [[ "$current_state" == "A" || "$current_state" == "B" || "$current_state" == "C" ]] &&
       echo "$possible_moves" | grep -q '"Victory"'; then
        # Check for Certainty card first
        card_to_use=$(echo "$hand" | grep "Certainty")
        if [[ -n "$card_to_use" ]]; then
            action_type="move"
            action_params=$(jq -n --arg target "Victory" --arg card "$card_to_use" '$ARGS.named')
            reasoning="Use Certainty card to guarantee Victory"
        else
            # Standard Victory move attempt
            action_type="move"
            action_params=$(jq -n --arg target "Victory" '$ARGS.named')
            reasoning="Attempt direct path to Victory"
        fi

    # 2. Block Check: Is any opponent close to winning?
    elif $(echo "$opponents" | jq -e '.[] | select(.state == "A" or .state == "B" or .state == "C")' > /dev/null); then
        # Look for interference cards
        local block_card=$(echo "$hand" | grep "Block")
        local friction_card=$(echo "$hand" | grep "Friction")
        local sabotage_card=$(echo "$hand" | grep "Sabotage")

        # Priority: Block > Friction > Sabotage
        if [[ -n "$block_card" ]]; then
            local target_opponent=$(echo "$opponents" | jq -r '.[] | select(.state == "A" or .state == "B" or .state == "C") | .playerId' | head -n 1)
            action_type="play_card"
            action_params=$(jq -n --arg card "Block" --arg target "$target_opponent" '$ARGS.named')
            reasoning="Block opponent close to winning"
        elif [[ -n "$friction_card" ]]; then
            local target_opponent=$(echo "$opponents" | jq -r '.[] | select(.state == "A" or .state == "B" or .state == "C") | .playerId' | head -n 1)
            action_type="play_card"
            action_params=$(jq -n --arg card "Friction" --arg target "$target_opponent" '$ARGS.named')
            reasoning="Apply Friction to slow down an opponent"
        elif [[ -n "$sabotage_card" ]]; then
            local target_opponent=$(echo "$opponents" | jq -r '.[] | select(.state == "A" or .state == "B" or .state == "C") | .playerId' | head -n 1)
            action_type="play_card"
            action_params=$(jq -n --arg card "Sabotage" --arg target "$target_opponent" '$ARGS.named')
            reasoning="Sabotage opponent to reduce their options"
        fi

    # 3. Advance: Move toward victory
    else
        # Look for boost cards to use with move
        local catalyst_card=$(echo "$hand" | grep "Catalyst")
        local momentum_card=$(echo "$hand" | grep "Momentum")

        # Choose target state (prefer closer to Victory)
        local target_state=$(echo "$possible_moves" | jq -r 'select(. == "Victory" or . == "B" or . == "C" or . == "A")')

        # Prefer boost cards to improve probability
        if [[ -n "$catalyst_card" ]]; then
            action_type="move"
            action_params=$(jq -n --arg target "$target_state" --arg card "$catalyst_card" '$ARGS.named')
            reasoning="Move toward victory using Catalyst to boost probability"
        elif [[ -n "$momentum_card" ]]; then
            action_type="move"
            action_params=$(jq -n --arg target "$target_state" --arg card "$momentum_card" '$ARGS.named')
            reasoning="Move toward victory using Momentum to boost probability"
        else
            action_type="move"
            action_params=$(jq -n --arg target "$target_state" '$ARGS.named')
            reasoning="Strategic move to an intermediate state"
        fi
    fi

    # 4. Resource Management: Draw or pass
    if [[ -z "$action_type" ]]; then
        if [[ "$hand_size" -lt 4 ]]; then
            action_type="draw"
            reasoning="Hand is low, drawing a card to increase options"
        else
            action_type="pass"
            reasoning="No strategic move available, passing turn"
        fi
        action_params="{}"
    fi

    # Construct full action JSON
    jq -n \
        --arg type "$action_type" \
        --argjson parameters "$action_params" \
        --arg reasoning "$reasoning" \
        '$ARGS.named'
}

# Main game loop
main() {
    debug_log "Starting player-3 agent for Markov's Chains"

    while true; do
        # Wait for turn
        debug_log "Waiting for turn..."
        result=$("$WAIT_TURN_SCRIPT" "$PLAYER_ID" "$GAME_NAME")

        # Parse result status
        status=$(echo "$result" | jq -r '.status')

        case "$status" in
            "your_turn")
                debug_log "It's my turn!"
                game_state=$(echo "$result" | jq '.gameState')

                # Decide action
                action=$(decide_action "$game_state")
                debug_log "Decided action: $action"

                # Submit action
                submit_result=$("$SUBMIT_ACTION_SCRIPT" "$PLAYER_ID" "$action" "$GAME_NAME")
                debug_log "Action submission result: $submit_result"
                ;;

            "messages")
                debug_log "Received messages. Processing..."
                # Potential future enhancement: Process game messages
                ;;

            "game_over")
                debug_log "Game over. Exiting."
                exit 0
                ;;

            "timeout")
                debug_log "Game timed out. Exiting."
                exit 1
                ;;

            *)
                debug_log "Unexpected status: $status"
                exit 1
                ;;
        esac
    done
}

# Make script executable
chmod +x "$0"

# Execute main function
main