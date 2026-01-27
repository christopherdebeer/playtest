import json
import os
import time
import random
from typing import Dict, Any

GAME_STATE_PATH = "games/markovs-chains/state/game-state.json"
TURN_SIGNAL_PATH = "games/markovs-chains/state/turn-signal.json"
PLAYER_ACTION_PATH = "games/markovs-chains/state/player-actions/player-1.json"

def read_json(path: str) -> Dict[str, Any]:
    """Safely read JSON file."""
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        print(f"Error decoding JSON from {path}")
        return {}

def write_json(path: str, data: Dict[str, Any]):
    """Safely write JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def analyze_game_state(state: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze the current game state for player-1."""
    my_data = state.get('players', {}).get('player-1', {})

    # Extract player's information
    my_hand = my_data.get('hand', [])
    my_position = my_data.get('state', 'Start')
    my_effects = my_data.get('activeEffects', [])

    # Extract opponent information
    opponents = {}
    for player_id, player_data in state.get('players', {}).items():
        if player_id != 'player-1':
            opponents[player_id] = {
                'handSize': len(player_data.get('hand', [])),
                'position': player_data.get('state', 'Start'),
                'effects': player_data.get('activeEffects', [])
            }

    return {
        'myHand': my_hand,
        'myPosition': my_position,
        'myEffects': my_effects,
        'opponents': opponents,
        'deckSize': state.get('deckSize', 0)
    }

def decide_action(game_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Decide the best action based on game state."""
    my_hand = game_analysis['myHand']
    my_position = game_analysis['myPosition']
    opponents = game_analysis['opponents']

    # Winning conditions check
    if my_position == 'Start':
        # Try to advance
        if 'Catalyst' in my_hand or 'Momentum' in my_hand:
            return {
                'type': 'play_card',
                'parameters': {
                    'card': 'Catalyst' if 'Catalyst' in my_hand else 'Momentum',
                    'target': 'self',
                    'intent': 'advance'
                },
                'reasoning': f"Advancing from {my_position} with catalyst card",
                'alternativesConsidered': ['draw if no advancement card']
            }

    elif my_position in ['A', 'B', 'C']:
        # Check for winning moves
        if 'Certainty' in my_hand:
            return {
                'type': 'play_card',
                'parameters': {
                    'card': 'Certainty',
                    'target': 'self',
                    'intent': 'win'
                },
                'reasoning': f"Using Certainty to win from {my_position}",
                'alternativesConsidered': ['Momentum if available']
            }

        if 'Momentum' in my_hand:
            return {
                'type': 'play_card',
                'parameters': {
                    'card': 'Momentum',
                    'target': 'self',
                    'intent': 'high_probability_win'
                },
                'reasoning': "Attempting to move to Victory with Momentum",
                'alternativesConsidered': ['Check for blocking opponents']
            }

        # Check for interfering with opponents
        for opp_id, opp_data in opponents.items():
            if opp_data['position'] in ['A', 'B', 'C']:
                if 'Block' in my_hand or 'Friction' in my_hand:
                    return {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Block' if 'Block' in my_hand else 'Friction',
                            'target': opp_id,
                            'intent': 'interfere'
                        },
                        'reasoning': f"Blocking opponent {opp_id} from potentially winning",
                        'alternativesConsidered': ['Move own strategy']
                    }

    # Default actions
    if my_hand:
        return {
            'type': 'play_card',
            'parameters': {
                'card': my_hand[0],
                'target': 'self',
                'intent': 'general_strategy'
            },
            'reasoning': "No clear optimal move, playing first available card",
            'alternativesConsidered': ['Draw if no playable card']
        }

    return {
        'type': 'draw',
        'parameters': {},
        'reasoning': "No cards to play, drawing a card",
        'alternativesConsidered': ['Pass turn']
    }

def main():
    """Main game loop for player-1."""
    while True:
        try:
            # Step 1: Poll for Turn Signal
            turn_signal = read_json(TURN_SIGNAL_PATH)

            # Check if it's my turn
            if turn_signal.get('currentPlayer') != 'player-1':
                time.sleep(1)
                continue

            # Step 2: Read Game State
            game_state = read_json(GAME_STATE_PATH)

            # Check if game is complete
            if game_state.get('gameStatus') == 'completed':
                print("Game completed. Exiting.")
                break

            # Step 3 & 4: Analyze Options & Choose Best Action
            game_analysis = analyze_game_state(game_state)
            action = decide_action(game_analysis)

            # Step 5: Write Action File
            full_action = {
                'playerId': 'player-1',
                'turnNumber': turn_signal.get('turnNumber', 0),
                'gameId': turn_signal.get('gameId', 'unknown'),
                'action': action,
                'timestamp': time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }

            write_json(PLAYER_ACTION_PATH, full_action)

            # Step 6: Wait for Processing
            time.sleep(2)

        except Exception as e:
            print(f"Error in player-1 agent: {e}")
            time.sleep(1)

if __name__ == '__main__':
    main()