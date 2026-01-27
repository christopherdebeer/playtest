# Game Playtesting Continuous Logging

This document describes the continuous logging system for game playtesting sessions.

## Overview

All game sessions log events in real-time to a JSONL (JSON Lines) file located at:
```
games/<game-name>/logs/game-<gameId>-live.jsonl
```

Each line in the file is a complete JSON object representing a single event.

## Log Event Types

### 1. Player Action

Logged whenever a player agent writes their action decision.

```json
{
  "timestamp": "2026-01-27T11:05:32.123Z",
  "type": "player_action",
  "playerId": "player-1",
  "turnNumber": 5,
  "action": {
    "type": "play",
    "card": "Red-7",
    "declareColor": null,
    "callUno": false
  },
  "reasoning": "Playing Red-7 to match the current color and reduce my hand size"
}
```

**Fields:**
- `timestamp`: ISO-8601 timestamp when action was logged
- `type`: Always "player_action"
- `playerId`: Which player took the action
- `turnNumber`: Game turn number
- `action`: The action object (game-specific structure)
- `reasoning`: Player agent's explanation for their decision

### 2. Gamemaster Action

Logged whenever the gamemaster validates and processes a player action.

```json
{
  "timestamp": "2026-01-27T11:05:33.456Z",
  "type": "gamemaster_action",
  "turnNumber": 5,
  "action": "validate_and_update",
  "reasoning": "Player-1's Red-7 is valid - matches current color. Removing from hand, adding to discard pile.",
  "stateChanges": {
    "player-1": {
      "cardCount": 6,
      "cardRemoved": "Red-7"
    },
    "discardPile": {
      "topCard": "Red-7"
    }
  },
  "gameState": {
    "turnNumber": 5,
    "currentPlayer": "player-2",
    "currentColor": "Red",
    "topCard": "Red-7",
    "playerCardCounts": {
      "player-1": 6,
      "player-2": 7,
      "player-3": 8
    }
  }
}
```

**Fields:**
- `timestamp`: ISO-8601 timestamp when action was logged
- `type`: Always "gamemaster_action"
- `turnNumber`: Game turn number
- `action`: Type of gamemaster action (validate_and_update, game_end, etc.)
- `reasoning`: Gamemaster's explanation for validation and effects
- `stateChanges`: Summary of what changed in the game state
- `gameState`: Snapshot of visible game state after update

### 3. State Update

Logged whenever game state is modified (optional, for detailed tracking).

```json
{
  "timestamp": "2026-01-27T11:05:33.789Z",
  "type": "state_update",
  "turnNumber": 5,
  "changes": {
    "currentPlayer": "player-2",
    "direction": "clockwise"
  },
  "newState": {
    "gameId": "uno-1738024000000",
    "turnNumber": 6,
    "currentPlayer": "player-2",
    "gameActive": true
  }
}
```

**Fields:**
- `timestamp`: ISO-8601 timestamp when state was updated
- `type`: Always "state_update"
- `turnNumber`: Game turn number
- `changes`: Object describing what changed
- `newState`: Complete state snapshot after update

### 4. Game Event

Logged for major game milestones.

```json
{
  "timestamp": "2026-01-27T11:05:00.000Z",
  "type": "game_event",
  "event": "game_start",
  "details": {
    "gameId": "uno-1738024000000",
    "players": ["player-1", "player-2", "player-3"],
    "initialState": {
      "cardsPerPlayer": 7,
      "startingCard": "Green-0"
    }
  }
}
```

```json
{
  "timestamp": "2026-01-27T11:45:00.000Z",
  "type": "game_event",
  "event": "game_end",
  "details": {
    "winner": "player-3",
    "finalScores": {
      "player-1": 38,
      "player-2": 94,
      "player-3": 0
    },
    "totalTurns": 42,
    "duration": "40m 0s"
  }
}
```

**Fields:**
- `timestamp`: ISO-8601 timestamp of the event
- `type`: Always "game_event"
- `event`: Event name (game_start, game_end, turn_start, etc.)
- `details`: Event-specific information

## How Logging Works

### Hook-Based Logging

The PostToolUse hook on Write tool automatically logs events:

1. **When turn-signal.json is written**: Gamemaster triggers player agent
2. **When player action is written**:
   - Hook reads action file
   - Appends player_action log entry to JSONL file
   - If gamemaster agent: processes action and logs gamemaster_action
3. **When game-state.json is updated**: Hook logs state_update (optional)

### Log File Location

Log files are created in the game's logs directory:
```
games/
  uno/
    logs/
      game-1738024000000-live.jsonl    # Continuous log
      game-1738024000000.json          # Final summary (written at end)
```

### Reading Logs

To read and analyze logs:

```bash
# View all events
cat games/uno/logs/game-<gameId>-live.jsonl

# View only player actions
grep '"type": "player_action"' games/uno/logs/game-<gameId>-live.jsonl | jq .

# View only gamemaster actions
grep '"type": "gamemaster_action"' games/uno/logs/game-<gameId>-live.jsonl | jq .

# Count events by type
jq -s 'group_by(.type) | map({type: .[0].type, count: length})' games/uno/logs/game-<gameId>-live.jsonl
```

## Implementation Notes

### Appending to JSONL

Use Bash with echo and >> to append log entries:

```bash
echo '{"timestamp":"2026-01-27T11:05:32Z","type":"player_action",...}' >> games/uno/logs/game-123-live.jsonl
```

**Important**: Don't use the Write tool to append - it will overwrite the file. Use Bash echo with >> operator.

### Timestamp Generation

Use ISO-8601 format with milliseconds:
```bash
date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
```

### JSON Formatting

Each log entry must be:
- A single line (no newlines within the JSON)
- Valid JSON
- Properly escaped strings

Example:
```bash
echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\",\"type\":\"player_action\",\"playerId\":\"player-1\",\"turnNumber\":5,\"action\":{\"type\":\"play\",\"card\":\"Red-7\"},\"reasoning\":\"Playing Red-7 to match color\"}" >> games/uno/logs/game-123-live.jsonl
```

## Benefits

1. **Real-time visibility**: Watch game progress as it happens
2. **Complete audit trail**: Every action and decision is recorded
3. **Debugging**: Understand exactly what happened and when
4. **Analysis**: Parse logs to compute statistics and insights
5. **Replay**: Reconstruct game state at any point in time
6. **Agent evaluation**: Assess decision quality with full reasoning

## Example Log Sequence

```jsonl
{"timestamp":"2026-01-27T10:52:00.000Z","type":"game_event","event":"game_start","details":{"gameId":"uno-1738024000000","players":["player-1","player-2","player-3"]}}
{"timestamp":"2026-01-27T10:52:10.123Z","type":"player_action","playerId":"player-1","turnNumber":1,"action":{"type":"draw"},"reasoning":"No playable cards"}
{"timestamp":"2026-01-27T10:52:11.456Z","type":"gamemaster_action","turnNumber":1,"action":"validate_and_update","reasoning":"Valid draw action. Player-1 drew Green-5","stateChanges":{"player-1":{"cardCount":8}}}
{"timestamp":"2026-01-27T10:52:20.789Z","type":"player_action","playerId":"player-2","turnNumber":2,"action":{"type":"play","card":"Green-Skip"},"reasoning":"Playing Green-Skip to skip player-3"}
{"timestamp":"2026-01-27T10:52:21.234Z","type":"gamemaster_action","turnNumber":2,"action":"validate_and_update","reasoning":"Valid play. Green-Skip matches color. Player-3 is skipped","stateChanges":{"player-2":{"cardCount":6},"skipped":"player-3"}}
```
