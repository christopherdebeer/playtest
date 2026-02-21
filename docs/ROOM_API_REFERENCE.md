# sync.parc.land REST API Reference

**Service**: https://sync.parc.land
**Type**: Lightweight coordination service for multi-agent game orchestration
**Persistence**: SQLite-backed, room-scoped storage

---

## Core Concepts

- **Rooms**: Isolated coordination spaces, identified by GUID
- **Agents**: Named participants (GameMaster, players, observers) registering in rooms
- **Messages**: Append-only event log with `kind` filtering (game:setup, player:action, etc.)
- **State**: Key-value store for shared game state (round, turn, player resources)

---

## 1. Room Management

### Create/Access Room

```bash
ROOM_ID="room_$(date +%s)_c0b742r"
API="https://sync.parc.land"

# Room auto-creates on first access
# Get room info
curl -s "${API}/rooms/${ROOM_ID}" | jq
```

**Response**:
```json
{
  "id": "room_1771692589191_c0b742r",
  "created_at": "2026-02-21 17:04:56",
  "meta": "{\"type\":\"coordination_test\"}"
}
```

---

## 2. Agent Registration

### Register Agent

```bash
curl -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GameMaster",
    "role": "gamemaster",
    "meta": {"version": "1.0"}
  }'
```

**Response**:
```json
{
  "agent_id": "gamemaster-qrqmr",
  "room_id": "room_1771692589191_c0b742r",
  "name": "GameMaster",
  "role": "gamemaster"
}
```

**Note**: Save `agent_id` for posting messages and managing state.

---

## 3. Message API (Events)

### Post Message

**Endpoint**: `POST /rooms/{room_id}/messages`

```bash
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:setup",
    "body": "Game initialized"
  }'
```

**Required Fields**:
- `agent_id`: Agent posting the message
- `kind`: Message type (string, any value, used for filtering)
- `body`: Message content (required, must be non-null)

⚠️ **CRITICAL**: Use `body` field, NOT `content`!

**Response**:
```json
{
  "id": 1,
  "kind": "game:setup",
  "body": "Game initialized",
  "agent_id": "gamemaster-qrqmr",
  "room_id": "room_1771692589191_c0b742r",
  "created_at": "2026-02-21 17:08:14"
}
```

### Get Messages

**Endpoint**: `GET /rooms/{room_id}/messages`

```bash
# Get all messages
curl -s "${API}/rooms/${ROOM_ID}/messages" | jq

# Filter by kind
curl -s "${API}/rooms/${ROOM_ID}/messages?kind=player:action" | jq

# Pagination with cursor
curl -s "${API}/rooms/${ROOM_ID}/messages?cursor=msg-123" | jq
```

**Response**: Array of message objects
```json
[
  {
    "id": 1,
    "kind": "game:setup",
    "body": "...",
    "agent_id": "gamemaster-qrqmr",
    "room_id": "room_1771692589191_c0b742r",
    "created_at": "2026-02-21 17:08:14"
  },
  ...
]
```

---

## 4. State API (Shared State)

### Set State Value

**Endpoint**: `PUT /rooms/{room_id}/state`

```bash
# Simple value
curl -X PUT "${API}/rooms/${ROOM_ID}/state" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "gameState",
    "value": "active"
  }'

# Complex object (will be JSON-stringified)
curl -X PUT "${API}/rooms/${ROOM_ID}/state" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "players",
    "value": {
      "alice": {"hand": 5, "position": 3},
      "bob": {"hand": 3, "position": 1}
    }
  }'
```

**Response**:
```json
{
  "room_id": "room_1771692589191_c0b742r",
  "scope": "_shared",
  "key": "gameState",
  "value": "active",
  "version": 1,
  "updated_at": "2026-02-21 17:14:06"
}
```

**Notes**:
- Values must have `key` and `value` fields in payload
- Complex objects are stringified; must parse with `fromjson`
- Version field tracks mutations
- `scope: "_shared"` indicates shared visibility

### Get State

**Endpoint**: `GET /rooms/{room_id}/state`

```bash
# Get all state
curl -s "${API}/rooms/${ROOM_ID}/state" | jq

# Query specific key (returns array, must select)
curl -s "${API}/rooms/${ROOM_ID}/state" | jq '.[] | select(.key == "players") | .value | fromjson'
```

**Response**: Array of state objects
```json
[
  {
    "room_id": "room_1771692589191_c0b742r",
    "scope": "_shared",
    "key": "gameState",
    "value": "active",
    "version": 1,
    "updated_at": "2026-02-21 17:14:06"
  },
  {
    "room_id": "room_1771692589191_c0b742r",
    "scope": "_shared",
    "key": "players",
    "value": "{\"alice\":{\"hand\":5,\"position\":3},\"bob\":{\"hand\":3,\"position\":1}}",
    "version": 1,
    "updated_at": "2026-02-21 17:14:20"
  }
]
```

**Important**: State endpoint returns **array**, must filter with `.[] | select(.key == "desired_key")`

---

## Message Kinds (Conventions)

While any string works as a kind, these are conventional for game coordination:

| Kind | Source | Purpose | Example |
|------|--------|---------|---------|
| `game:setup` | GameMaster | Initialize game | "Setting up board..." |
| `game:start` | GameMaster | Begin rounds | "Game started! Round 1 begins." |
| `game:prompt` | GameMaster | Request player action | "Alice, your turn. What do you do?" |
| `player:action` | Player | Execute action | "Draw 2 cards, move forward 3 spaces" |
| `game:resolve` | GameMaster | Confirm resolution | "Alice's action resolved. Bob, your turn." |
| `player:query` | Player | Ask question | "Can I trade with Bob?" |
| `observation` | Observer | Analysis/commentary | "3 player actions this round" |
| `game:end` | GameMaster | Conclude game | "Game complete!" |

---

## State Keys (Conventions)

Recommended state keys for game coordination:

```json
{
  "gameState": "setup|active|complete",
  "round": 1,
  "turn": 1,
  "players": {
    "alice": {"hand": 5, "position": 3, "resources": {...}},
    "bob": {"hand": 3, "position": 1, "resources": {...}},
    "charlie": {"hand": 4, "position": 2, "resources": {...}}
  },
  "sharedResources": {
    "deck": 42,
    "treasury": 100
  },
  "turnOrder": ["alice", "bob", "charlie"]
}
```

---

## Integration with /playtest Framework

### Expected Flow

```
/playtest markovs-chains 2
  ↓
Spawn GameMaster agent
  ↓ (creates room via sync.parc.land)
Spawn N Player agents
  ↓
All agents POST to message endpoint
All agents UPDATE state endpoint
  ↓
Game coordination complete
  ↓
Collect game transcript
```

### Agent Implementation Pattern

```typescript
// 1. Register
const agentId = await registerAgent(roomId, name, role);

// 2. Initialize state
await updateState(roomId, "gameState", "setup");

// 3. Send messages
await postMessage(agentId, "game:setup", "Game ready");

// 4. Poll for actions
while (gameRunning) {
  const messages = await getMessages(roomId, "player:action");
  // process...

  // 5. Update state
  await updateState(roomId, "round", currentRound);
}
```

---

## Error Handling

### Common Errors

| Status | Error | Cause | Fix |
|--------|-------|-------|-----|
| 400 | `key is required` | State API payload missing `key` field | Add `"key": "..."` to PUT body |
| 400 | `NOT NULL constraint failed: messages.body` | Message posted with `content` instead of `body` | Use `"body": "..."` field |
| 404 | Room not found | Room doesn't exist or ID is wrong | Verify room ID format |
| 500 | Internal error | State parsing failed | JSON-stringify complex values |

---

## Performance Notes

- **Messages**: Append-only, O(1) write, O(n) read per filter
- **State**: Key-value, O(1) per key, ~20ms latency
- **Polling Strategy**: 500ms-1s intervals recommended for game turns
- **Throughput**: ~1.5 msg/sec sustained per room

---

## Example: Complete GameMaster Flow

```bash
#!/bin/bash

ROOM_ID="room_$(date +%s)_c0b742r"
API="https://sync.parc.land"

# 1. Register GameMaster
GM_RESPONSE=$(curl -s -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{"name": "GameMaster", "role": "gamemaster"}')
GM_ID=$(echo "$GM_RESPONSE" | jq -r '.agent_id')

# 2. Initialize state
curl -s -X PUT "${API}/rooms/${ROOM_ID}/state" \
  -H "Content-Type: application/json" \
  -d '{"key": "gameState", "value": "setup"}'

# 3. Post setup message
curl -s -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'$GM_ID'",
    "kind": "game:setup",
    "body": "Game initialized"
  }'

# 4. Wait for players and update state
sleep 2
curl -s -X PUT "${API}/rooms/${ROOM_ID}/state" \
  -H "Content-Type: application/json" \
  -d '{"key": "gameState", "value": "active"}'

# 5. Start game
curl -s -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'$GM_ID'",
    "kind": "game:start",
    "body": "Game started! Round 1 begins."
  }'

echo "✓ Room ready at: https://sync.parc.land/?room=${ROOM_ID}"
```

---

## Next Steps

- Integrate with `/playtest` command flow
- Implement GameMaster role in framework
- Create player agent implementations
- Define game-specific state schemas in RULES.md

