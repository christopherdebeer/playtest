import json
import os
import time
import random
from datetime import datetime

def read_json(file_path):
    """Safely read a JSON file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def write_json(file_path, data):
    """Safely write a JSON file."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)

def player_agent():
    """Main player-3 agent for Markov's Chains."""
    player_id = "player-3"
    base_path = "/Users/cdbeer/dev/claude-subagent-comms-test/games/markovs-chains/state"
    turn_signal_path = f"{base_path}/turn-signal.json"
    game_state_path = f"{base_path}/game-state.json"
    action_path = f"{base_path}/player-actions/{player_id}.json"

    while True:
        try:
            # Step 1: Poll for Turn Signal
            turn_signal = read_json(turn_signal_path)

            # Check if it's not my turn
            if not turn_signal or turn_signal.get('currentPlayer') != player_id:
                time.sleep(1)
                continue

            # Step 2: Read Game State
            game_state = read_json(game_state_path)
            if not game_state:
                time.sleep(1)
                continue

            # Extract game information
            my_data = game_state['players'][player_id]
            my_hand = my_data.get('hand', [])
            my_position = my_data.get('state', 'Start')
            my_effects = my_data.get('activeEffects', [])

            # Extract opponent information
            opponents = {
                pid: {
                    'handSize': pdata.get('handSize', 0),
                    'position': pdata.get('state', 'Start'),
                    'effects': pdata.get('activeEffects', [])
                }
                for pid, pdata in game_state['players'].items()
                if pid != player_id
            }

            # Step 3 & 4: Strategy and Action Selection
            action = {
                'playerId': player_id,
                'turnNumber': turn_signal['turnNumber'],
                'gameId': turn_signal['gameId'],
                'action': {},
                'reasoning': '',
                'alternativesConsidered': [],
                'timestamp': datetime.now().isoformat()
            }

            # Winning conditions
            if my_position in ['A', 'B', 'C']:
                # Check for Certainty card to win
                if 'Certainty' in my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Certainty',
                            'destination': 'Victory'
                        }
                    }
                    action['reasoning'] = "Play Certainty card to guarantee move to Victory"

                # Check for Momentum to improve win probability
                elif 'Momentum' in my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Momentum',
                            'destination': 'Victory'
                        }
                    }
                    action['reasoning'] = "Play Momentum card to boost probability of moving to Victory (55%→85%)"

            # Starting state strategy
            elif my_position == 'Start':
                # Try to advance with strong cards
                if 'Catalyst' in my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Catalyst',
                            'destination': 'A'
                        }
                    }
                    action['reasoning'] = "Play Catalyst to move from Start to intermediate state A"
                elif 'Momentum' in my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Momentum',
                            'destination': 'A'
                        }
                    }
                    action['reasoning'] = "Play Momentum to boost move from Start to A (0.65 probability)"

            # Interfere with opponents
            for opp_id, opp in opponents.items():
                if opp['position'] in ['A', 'B', 'C'] and 'Block' in my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': 'Block',
                            'target': opp_id
                        }
                    }
                    action['reasoning'] = f"Block opponent {opp_id} who is close to winning"
                    break

            # Fallback actions
            if not action['action']:
                if my_hand:
                    action['action'] = {
                        'type': 'play_card',
                        'parameters': {
                            'card': my_hand[0],
                            'destination': 'A' if my_position == 'Start' else my_position
                        }
                    }
                    action['reasoning'] = f"No strategic move, playing {my_hand[0]}"
                else:
                    action['action'] = {'type': 'draw'}
                    action['reasoning'] = "No cards to play, drawing a card"

            # Step 5: Write Action File
            write_json(action_path, action)

            # Step 6: Wait for Processing
            time.sleep(2)

        except Exception as e:
            # Log error and continue
            print(f"Error in player-3 agent: {e}")
            time.sleep(1)

if __name__ == "__main__":
    player_agent()