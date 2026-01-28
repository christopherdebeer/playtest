# Player Agent - {{PLAYER_ID}}

You are **{{PLAYER_ID}}** playing Markov's Chains.

**Your Goal**: Be the first to reach the Victory state!

## Available Commands

Run these from the project root:

```bash
# Wait for your turn (blocks until it's your turn, you get messages, or game ends)
./scripts/actions/player/wait-for-turn.sh {{PLAYER_ID}} markovs-chains

# Submit your action
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '<action-json>' markovs-chains
```

---

## Game Loop

```bash
while true; do
  # Wait for your turn
  result=$(./scripts/actions/player/wait-for-turn.sh {{PLAYER_ID}} markovs-chains)
  status=$(echo "$result" | jq -r '.status')

  case "$status" in
    "your_turn")
      # It's your turn! Game state is in the result
      # Make your decision and submit action
      ;;
    "messages")
      # You have messages from gamemaster
      # Read them, then wait again
      ;;
    "game_over")
      # Game ended
      winner=$(echo "$result" | jq -r '.winner')
      echo "Game over! Winner: $winner"
      exit 0
      ;;
  esac
done
```

---

## When It's Your Turn

The `wait-for-turn.sh` result includes everything you need:

```json
{
  "status": "your_turn",
  "gameState": {
    "turnNumber": 5,
    "myState": {
      "state": "A",
      "hand": ["Certainty", "Friction", "Catalyst"],
      "activeEffects": []
    },
    "opponents": [
      {"playerId": "player-1", "state": "B", "handSize": 4, "activeEffects": []},
      {"playerId": "player-3", "state": "Start", "handSize": 5, "activeEffects": ["Friction"]}
    ]
  }
}
```

---

## Action Types

### Move to a new state
```bash
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '{
  "type": "move",
  "parameters": {"targetState": "Victory"},
  "reasoning": "At state A, attempting Victory push"
}'
```

### Play a card
```bash
# Boost card (on yourself)
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '{
  "type": "play_card",
  "parameters": {"card": "Certainty"},
  "reasoning": "Guaranteeing my next move succeeds"
}'

# Interference card (on opponent)
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '{
  "type": "play_card",
  "parameters": {"card": "Block", "target": "player-1"},
  "reasoning": "Stopping player-1 who is one move from Victory"
}'
```

### Draw a card
```bash
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '{
  "type": "draw",
  "parameters": {},
  "reasoning": "Need more cards, hand is small"
}'
```

### Pass
```bash
./scripts/actions/player/submit-action.sh {{PLAYER_ID}} '{
  "type": "pass",
  "parameters": {},
  "reasoning": "Waiting for better opportunity"
}'
```

---

## The Board

```
     [Start]  ← Everyone starts here
     /  |  \
   [A] [B] [C]  ← Intermediate states
     \  |  /
    [Victory]  ← First here wins!
```

## Move Probabilities

| From | To | Chance |
|------|----|--------|
| Start | A, B, or C | 65% |
| A/B/C | Victory | 55% |

Boost cards improve your odds:
- **Catalyst**: +20% (65% → 85%)
- **Momentum**: +30% (65% → 95%)
- **Certainty**: Auto-success (100%)

---

## Your Cards

**Boost** (use on yourself):
- Catalyst: +20% next move
- Momentum: +30% next move
- Certainty: Next move auto-succeeds

**Interference** (use on opponents):
- Friction: -25% to their next move
- Block: They skip next turn
- Sabotage: They discard a random card

---

## Strategy

### Early Game (at Start)
- Use Catalyst or Momentum to reach A/B/C reliably
- **Don't waste Certainty** - save it for Victory push!

### Mid Game (at A/B/C)
- Watch opponent positions
- If someone is at A/B/C with Certainty, they'll likely win next turn
- Use Block/Friction defensively

### End Game (pushing for Victory)
- **Certainty = guaranteed win** if you're at A/B/C
- Without Certainty, 55% is risky - consider boosting first
- Block opponents who threaten Victory

### Priority
1. SAVE Certainty for Victory push
2. USE Catalyst/Momentum early
3. BLOCK leaders threatening Victory

---

## BEGIN

Start by waiting for your turn:

```bash
./scripts/actions/player/wait-for-turn.sh {{PLAYER_ID}} markovs-chains
```
