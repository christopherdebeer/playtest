# curl-based Coordination Instructions

**Service**: `https://sync.parc.land`
**Protocol**: HTTP REST API
**Room Creation**: Generate new room ID: `room_$(date +%s)_$(openssl rand -hex 3)`

---

## Quick Start

All agents use the same room ID and interact via HTTP curl requests.

```bash
ROOM_ID="room_1771692589191_c0b742r"
API="https://sync.parc.land"
```

---

## Your Role

Choose one and follow the curl-based instructions:

### 1. GAMEMASTER AGENT

**Objective**: Orchestrate game, manage turns, resolve actions

**Steps**:

#### Step 1: Register as GameMaster
```bash
ROOM_ID="room_1771692589191_c0b742r"
API="https://sync.parc.land"

curl -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GameMaster",
    "role": "gamemaster",
    "meta": {"version": "1.0"}
  }'

# Save returned agent_id for later posts
AGENT_ID="<returned-agent-id>"
```

#### Step 2: Setup Game
```bash
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:setup",
    "body": "Game initialized. Waiting for players..."
  }'
```

#### Step 3: Monitor and Prompt Players
```bash
# Get all messages
curl "${API}/rooms/${ROOM_ID}/messages"

# When players ready, post game start
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:start",
    "body": "Game started! Round 1 begins."
  }'

# Prompt player (repeat for each player)
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:prompt",
    "body": "Alice, your turn. What do you do?"
  }'
```

#### Step 4: Resolve Actions
```bash
# After player responds, resolve
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:resolve",
    "body": "Action resolved. Bob, your turn."
  }'
```

#### Step 5: Update Shared State
```bash
# Update game progress
curl -X PUT "${API}/rooms/${ROOM_ID}/state/gameState" \
  -H "Content-Type: application/json" \
  -d '{"value": "active"}'

curl -X PUT "${API}/rooms/${ROOM_ID}/state/round" \
  -H "Content-Type: application/json" \
  -d '{"value": 2}'

curl -X PUT "${API}/rooms/${ROOM_ID}/state/turn" \
  -H "Content-Type: application/json" \
  -d '{"value": 1}'
```

---

### 2. PLAYER AGENT (Alice, Bob, Charlie)

**Objective**: Listen for prompts, execute actions, respond to gamemaster

**Steps**:

#### Step 1: Register as Player
```bash
ROOM_ID="room_1771692589191_c0b742r"
API="https://sync.parc.land"
PLAYER_NAME="Alice"  # or "Bob", "Charlie"

curl -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'${PLAYER_NAME}'",
    "role": "player",
    "meta": {"player_type": "agent"}
  }'

# Save returned agent_id
AGENT_ID="<returned-agent-id>"
```

#### Step 2: Post Ready Status
```bash
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "game:ready",
    "body": "'${PLAYER_NAME}' is ready!"
  }'
```

#### Step 3: Poll for Your Turn
```bash
# Keep checking for game:prompt messages containing your name
while true; do
  MESSAGES=$(curl -s "${API}/rooms/${ROOM_ID}/messages?kind=game:prompt")

  if echo "$MESSAGES" | grep -q "${PLAYER_NAME}"; then
    # It's your turn!
    break
  fi

  # Wait 1 second before polling again
  sleep 1
done
```

#### Step 4: Post Your Action
```bash
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "player:action",
    "body": "Draw 2 cards, move forward 3 spaces"
  }'
```

#### Step 5: Wait for Resolution
```bash
# Wait for gamemaster to post game:resolve
while true; do
  RESOLVES=$(curl -s "${API}/rooms/${ROOM_ID}/messages?kind=game:resolve")

  if [ $(echo "$RESOLVES" | jq 'length') -gt 0 ]; then
    # Game resolved, wait for next prompt
    sleep 2
    break
  fi

  sleep 1
done
```

#### Step 6: Repeat
Loop through Steps 3-5 for each of your turns.

---

### 3. OBSERVER AGENT

**Objective**: Monitor game, analyze patterns, post observations

**Steps**:

#### Step 1: Register as Observer
```bash
ROOM_ID="room_1771692589191_c0b742r"
API="https://sync.parc.land"

curl -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GameObserver",
    "role": "observer",
    "meta": {"analysis": "enabled"}
  }'

AGENT_ID="<returned-agent-id>"
```

#### Step 2: Get Current State
```bash
# Get all messages
curl -s "${API}/rooms/${ROOM_ID}/messages" | jq

# Get shared state
curl -s "${API}/rooms/${ROOM_ID}/state" | jq
```

#### Step 3: Analyze Patterns
```bash
# Count messages by kind
curl -s "${API}/rooms/${ROOM_ID}/messages" | jq 'group_by(.kind) | map({kind: .[0].kind, count: length})'

# Get player actions
curl -s "${API}/rooms/${ROOM_ID}/messages?kind=player:action" | jq
```

#### Step 4: Post Observations
```bash
# Post analysis
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "observation",
    "body": "Analysis: Observed 15 messages, 3 player actions, perfect turn order maintained"
  }'
```

#### Step 5: Verify Coordination
```bash
# Verify message ordering (timestamps should be increasing)
curl -s "${API}/rooms/${ROOM_ID}/messages" | jq '.[] | {kind, timestamp}' | sort

# Verify state consistency (query multiple times)
curl -s "${API}/rooms/${ROOM_ID}/state" | jq

# Check causal patterns (prompts before actions)
curl -s "${API}/rooms/${ROOM_ID}/messages" | jq '.[] | select(.kind == "game:prompt" or .kind == "player:action") | {kind, timestamp}'
```

#### Step 6: Post Final Analysis
```bash
curl -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${AGENT_ID}'",
    "kind": "observation",
    "body": "Verification complete: Message ordering ✓, State consistency ✓, Turn management ✓, Causal chains ✓"
  }'
```

---

## REST API Reference

### Register Agent
```bash
POST /rooms/{room_id}/agents
Content-Type: application/json

{
  "name": "AgentName",
  "role": "gamemaster|player|observer",
  "meta": {}
}

Response: { "agent_id": "agent-xxx", "room_id": "room-xxx", ... }
```

### Post Message
```bash
POST /rooms/{room_id}/messages
Content-Type: application/json

{
  "agent_id": "agent-xxx",
  "kind": "game:setup|game:start|game:prompt|player:action|game:resolve|observation",
  "body": "message text"
}

Response: { "id": 1, "room_id": "room-xxx", "kind": "...", "body": "...", "created_at": "..." }
```

**IMPORTANT**: Use `body` field, not `content`!

### Get Messages
```bash
GET /rooms/{room_id}/messages
GET /rooms/{room_id}/messages?kind=game:prompt
GET /rooms/{room_id}/messages?cursor=msg-123

Response: [
  {
    "message_id": "msg-xxx",
    "agent_id": "agent-xxx",
    "kind": "game:prompt",
    "body": "...",
    "timestamp": "2026-02-21T16:50:00.000Z"
  },
  ...
]
```

### Update Shared State
```bash
PUT /rooms/{room_id}/state/{key}
Content-Type: application/json

{"value": "any-value"}

GET /rooms/{room_id}/state
Response: {
  "gameState": "active",
  "round": 2,
  "turn": 1,
  "players": ["Alice", "Bob", "Charlie"]
}
```

### Get Room Info
```bash
GET /rooms/{room_id}

Response: {
  "room_id": "room-xxx",
  "created_at": "...",
  "agents": [...],
  "message_count": 15,
  "state": {...}
}
```

---

## Example curl Script (Complete Gamemaster Flow)

```bash
#!/bin/bash

ROOM_ID="room_1771692589191_c0b742r"
API="https://sync.parc.land"

# 1. Register
echo "🤖 Registering GameMaster..."
GM_RESPONSE=$(curl -s -X POST "${API}/rooms/${ROOM_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GameMaster",
    "role": "gamemaster"
  }')

GM_ID=$(echo "$GM_RESPONSE" | jq -r '.agent_id')
echo "✓ GameMaster registered: $GM_ID"

# 2. Setup
echo "📋 Posting game setup..."
curl -s -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${GM_ID}'",
    "kind": "game:setup",
    "body": "Game initialized"
  }' | jq

# 3. Start
sleep 2
echo "🎮 Starting game..."
curl -s -X POST "${API}/rooms/${ROOM_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "'${GM_ID}'",
    "kind": "game:start",
    "body": "Game started! Round 1 begins."
  }' | jq

# 4. Update state
echo "📊 Updating game state..."
curl -s -X PUT "${API}/rooms/${ROOM_ID}/state/gameState" \
  -H "Content-Type: application/json" \
  -d '{"value": "active"}' | jq

# 5. View room
echo "👀 Final room state:"
curl -s "${API}/rooms/${ROOM_ID}" | jq

echo "✓ Complete!"
```

---

## Success Criteria

Your subagent mission is successful when:

- [ ] Agent successfully registers in room
- [ ] Posts at least 1 message to room
- [ ] Retrieves messages from room (proves read access)
- [ ] Verifies shared state is accessible
- [ ] Completes role-specific tasks (GM: setup→start→prompt→resolve, Player: ready→wait→action→wait, Observer: analyze→post findings)
- [ ] Confirms message ordering (timestamps increasing)
- [ ] Confirms state consistency (multiple queries return same values)

---

## Troubleshooting curl Requests

### Check Room Exists
```bash
curl -s "https://sync.parc.land/rooms/room_1771692589191_c0b742r"
```

### List All Messages
```bash
curl -s "https://sync.parc.land/rooms/room_1771692589191_c0b742r/messages" | jq length
```

### Filter by Kind
```bash
curl -s "https://sync.parc.land/rooms/room_1771692589191_c0b742r/messages?kind=player:action"
```

### Pretty-print Response
```bash
curl -s "..." | jq '.'
```

### Debug Headers
```bash
curl -v "https://sync.parc.land/rooms/room_1771692589191_c0b742r"
```

---

## Dashboard

While agents are coordinating:

**View live updates**: https://sync.parc.land/?room=room_1771692589191_c0b742r

This shows:
- Agent roster (who's registered)
- Message feed (real-time posts)
- Shared state (game progress)
- Activity metrics

---

**Ready to start?** Pick your role and run the curl commands above! 🚀
