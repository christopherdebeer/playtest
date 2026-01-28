# Action Scripts - Encapsulated Agent Actions

These scripts provide a clean interface for agent coordination, abstracting away
the implementation details of blocking, timeouts, and message passing.

## Design Principles

1. **Agents don't need to know about inotifywait** - blocking is built into the scripts
2. **Circuit breakers prevent infinite waits** - configurable timeouts on all blocking operations
3. **Message bus for inter-agent communication** - gamemaster can send messages to players
4. **JSON in, JSON out** - all scripts return structured JSON for easy parsing

## Player Scripts

### `player/wait-for-turn.sh`
Blocks until it's the player's turn.

```bash
./scripts/actions/player/wait-for-turn.sh <player-id> [game-name] [timeout-seconds]

# Example:
./scripts/actions/player/wait-for-turn.sh player-1 markovs-chains 300
```

**Returns:**
- `{"status": "your_turn", "gameState": {...}}` - It's your turn, game state included
- `{"status": "messages", "messages": [...]}` - Pending messages to process
- `{"status": "game_over", "winner": "..."}` - Game has ended
- `{"status": "timeout", ...}` - Circuit breaker triggered (exit code 124)

### `player/submit-action.sh`
Submit a player action.

```bash
./scripts/actions/player/submit-action.sh <player-id> '<action-json>' [game-name]

# Example:
./scripts/actions/player/submit-action.sh player-1 '{"type":"move","parameters":{"targetState":"A"},"reasoning":"Moving to A"}' markovs-chains
```

**Action types:** `move`, `draw`, `play_card`, `pass`

## Gamemaster Scripts

### `gamemaster/wait-for-action.sh`
Blocks until the current player submits an action.

```bash
./scripts/actions/gamemaster/wait-for-action.sh [game-name] [timeout-seconds]

# Example:
./scripts/actions/gamemaster/wait-for-action.sh markovs-chains 180
```

**Returns:**
- `{"status": "action_received", "player": "...", "action": {...}}` - Player action received
- `{"status": "timeout", "player": "...", "suggestion": "..."}` - Player didn't respond

### `gamemaster/signal-turn.sh`
Signal the next player's turn.

```bash
./scripts/actions/gamemaster/signal-turn.sh <next-player-id> [game-name]

# Example:
./scripts/actions/gamemaster/signal-turn.sh player-2 markovs-chains
```

### `gamemaster/force-pass.sh`
Force a player to pass (used when they timeout).

```bash
./scripts/actions/gamemaster/force-pass.sh <player-id> [game-name]
```

### `gamemaster/end-game.sh`
End the game and declare a winner.

```bash
./scripts/actions/gamemaster/end-game.sh <winner-id> <reason> [game-name]

# Example:
./scripts/actions/gamemaster/end-game.sh player-2 "Reached Victory state"
```

## Common Scripts

### `common/send-message.sh`
Send a message to another agent.

```bash
./scripts/actions/common/send-message.sh <from> <to> <type> <content> [game-name]

# Example:
./scripts/actions/common/send-message.sh gamemaster player-1 reminder "Please make your move"
```

**Message types:** `reminder`, `warning`, `info`, `system`

### `common/read-messages.sh`
Read pending messages.

```bash
./scripts/actions/common/read-messages.sh <agent-id> [game-name] [--keep]
```

## Circuit Breaker Behavior

All blocking scripts have built-in circuit breakers:

| Script | Default Timeout | Exit Code |
|--------|-----------------|-----------|
| wait-for-turn.sh | 300s (5 min) | 124 |
| wait-for-action.sh | 180s (3 min) | 124 |

When a timeout occurs:
1. Script returns JSON with `status: "timeout"`
2. Exit code is 124 (standard timeout code)
3. Gamemaster can use `force-pass.sh` to skip unresponsive players

## Message Flow

```
┌─────────────┐                    ┌─────────────┐
│ Gamemaster  │                    │   Player    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  signal-turn.sh                  │
       │─────────────────────────────────>│
       │                                  │  wait-for-turn.sh
       │                                  │  (returns with game state)
       │                                  │
       │  wait-for-action.sh              │
       │  (blocking)                      │  submit-action.sh
       │<─────────────────────────────────│
       │                                  │
       │  (process action)                │
       │                                  │
       │  signal-turn.sh (next player)    │
       └──────────────────────────────────┘
```

## Example Agent Loop

### Player Agent
```bash
while true; do
  result=$(./scripts/actions/player/wait-for-turn.sh player-1)
  status=$(echo "$result" | jq -r '.status')

  case "$status" in
    "your_turn")
      # Make decision based on gameState
      action='{"type":"move","parameters":{"targetState":"A"}}'
      ./scripts/actions/player/submit-action.sh player-1 "$action"
      ;;
    "messages")
      # Process messages
      ;;
    "game_over")
      exit 0
      ;;
    "timeout")
      exit 124
      ;;
  esac
done
```

### Gamemaster Agent
```bash
while true; do
  result=$(./scripts/actions/gamemaster/wait-for-action.sh)
  status=$(echo "$result" | jq -r '.status')

  case "$status" in
    "action_received")
      # Process action, update state
      # ...
      ./scripts/actions/gamemaster/signal-turn.sh "$next_player"
      ;;
    "timeout")
      # Force pass for unresponsive player
      player=$(echo "$result" | jq -r '.player')
      ./scripts/actions/gamemaster/force-pass.sh "$player"
      ;;
    "game_not_active")
      exit 0
      ;;
  esac
done
```

## File Locations

```
games/<game>/state/
├── game-state.json          # Main game state
├── turn-signal.json         # Current turn indicator
├── player-actions/          # Player action submissions
│   └── <player-id>.json
└── messages/                # Inter-agent messages
    └── <agent-id>/
        └── <msg-id>.json
```
