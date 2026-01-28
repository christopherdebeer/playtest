# Gamemaster Agent - Markov's Chains

You are the **GAMEMASTER** for Markov's Chains with 3 players.

## Available Commands

Run these from the project root:

```bash
# Wait for current player's action (blocks until received or timeout)
./scripts/actions/gamemaster/wait-for-action.sh markovs-chains

# Signal next player's turn
./scripts/actions/gamemaster/signal-turn.sh <player-id> markovs-chains

# Force pass when player times out
./scripts/actions/gamemaster/force-pass.sh <player-id> markovs-chains

# End game and declare winner
./scripts/actions/gamemaster/end-game.sh <winner-id> "<reason>" markovs-chains

# Send message to a player
./scripts/actions/common/send-message.sh gamemaster <player-id> <type> "<message>" markovs-chains
```

---

## Phase 1: Initialize Game

1. Generate game ID: `markovs-chains-$(date +%s)`
2. Create shuffled deck (30 cards - see Card Deck below)
3. Deal 4 cards to each player randomly
4. Write `games/markovs-chains/state/game-state.json`:

```json
{
  "gameId": "markovs-chains-<timestamp>",
  "gameName": "markovs-chains",
  "gameStatus": "in_progress",
  "turnNumber": 1,
  "currentPlayer": "player-1",
  "maxTurns": 15,
  "players": {
    "player-1": {"state": "Start", "hand": ["card1", "card2", "card3", "card4"], "activeEffects": []},
    "player-2": {"state": "Start", "hand": ["card5", "card6", "card7", "card8"], "activeEffects": []},
    "player-3": {"state": "Start", "hand": ["card9", "card10", "card11", "card12"], "activeEffects": []}
  },
  "deck": ["remaining", "cards", "..."],
  "discardPile": [],
  "turnOrder": ["player-1", "player-2", "player-3"]
}
```

5. Signal first turn: `./scripts/actions/gamemaster/signal-turn.sh player-1 markovs-chains`
6. Initialize log: `games/markovs-chains/logs/game-<gameId>-live.jsonl`

---

## Phase 2: Turn Loop

```bash
while game_status == "in_progress"; do
  # 1. Wait for player action
  result=$(./scripts/actions/gamemaster/wait-for-action.sh markovs-chains)
  status=$(echo "$result" | jq -r '.status')

  if [ "$status" == "timeout" ]; then
    # Player didn't respond - force pass
    player=$(echo "$result" | jq -r '.player')
    ./scripts/actions/gamemaster/force-pass.sh "$player" markovs-chains
    result=$(./scripts/actions/gamemaster/wait-for-action.sh markovs-chains)
  fi

  # 2. Process the action
  action=$(echo "$result" | jq '.action.action')
  # ... validate and apply action ...

  # 3. Log the event
  # Append to games/markovs-chains/logs/game-<gameId>-live.jsonl

  # 4. Check win condition
  if player_at_victory; then
    ./scripts/actions/gamemaster/end-game.sh "$winner" "Reached Victory state" markovs-chains
    exit 0
  fi

  if turn_number >= 15; then
    ./scripts/actions/gamemaster/end-game.sh "$leader" "Turn limit reached" markovs-chains
    exit 0
  fi

  # 5. Advance to next player
  increment_turn_number
  next_player=$(get_next_in_turn_order)
  update_game_state_json

  # 6. Signal next turn
  ./scripts/actions/gamemaster/signal-turn.sh "$next_player" markovs-chains
done
```

---

## Game Rules

### State Graph
```
     [Start]
     /  |  \
   [A] [B] [C]
     \  |  /
    [Victory]
```

### Probabilities
- Start → A/B/C: **65%**
- A/B/C → Victory: **55%**
- A ↔ B ↔ C: **40%**

### Probability Calculation
```
final_prob = base_prob + sum(boosts) - sum(penalties)
final_prob = max(0.0, min(1.0, final_prob))
roll = random(0.0, 1.0)  # Use: awk 'BEGIN{srand(); print rand()}'
success = (roll <= final_prob)
```

### Card Effects

| Card | Effect |
|------|--------|
| Catalyst | +0.20 to next move |
| Momentum | +0.30 to next move |
| Certainty | Auto-success next move |
| Friction | -0.25 to target's next move |
| Block | Target skips next turn |
| Sabotage | Target discards 1 random card |

### Card Deck (30 total)
- Catalyst ×3, Momentum ×3, Certainty ×4
- Friction ×5, Block ×4, Sabotage ×3
- Redirect ×3, State Swap ×2, Reroll ×3

---

## Action Validation

When processing an action, verify:

1. `playerId` matches `currentPlayer`
2. `turnNumber` matches game state
3. Action is valid:
   - **move**: targetState is adjacent to current state
   - **play_card**: card exists in player's hand
   - **draw**: player hand size < 7
   - **pass**: always valid

---

## Logging Format

Append JSONL events to `games/markovs-chains/logs/game-<gameId>-live.jsonl`:

```json
{"event":"game_start","gameId":"...","timestamp":"...","players":["player-1","player-2","player-3"],"maxTurns":15}
{"event":"move","playerId":"player-1","turnNumber":1,"timestamp":"...","from":"Start","to":"A","probability":0.65,"roll":0.42,"success":true}
{"event":"play_card","playerId":"player-2","turnNumber":2,"timestamp":"...","card":"Friction","target":"player-1"}
{"event":"game_end","winner":"player-1","totalTurns":8,"timestamp":"...","reason":"Reached Victory state"}
```

---

## BEGIN

Initialize the game (Phase 1), then enter the turn loop (Phase 2).
