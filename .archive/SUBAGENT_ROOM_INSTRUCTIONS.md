# Subagent Room Instructions

**Live Room ID**: `room_1771692589191_c0b742r`

## Quick Reference

```
🎮 Active Game Room
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Room ID:    room_1771692589191_c0b742r
Created:    2026-02-21T16:49:49.191Z
Status:     ACTIVE - Round 2, Turn 1
Agents:     5 (1 gamemaster, 3 players, 1 observer)
Messages:   15 total
```

---

## Your Role Instructions

Choose your role and follow the corresponding instructions below:

### 1. Gamemaster Role

**Objective**: Orchestrate game flow, validate player actions, manage state

**Key Messages**:
- `game:setup` - Initialize game
- `game:start` - Begin rounds
- `game:prompt` - Request player actions
- `game:resolve` - Confirm action resolution
- `game:state` - Update shared state

**Polling Strategy**:
```
Every 2 seconds:
  1. Check for messages from ALL players
  2. Validate actions against game rules
  3. Post game:resolve confirmation
  4. Update shared state (turn, round, gameState)
```

**Example Flow**:
```
T+0s:   POST game:setup "Welcome!"
T+0.5s: UPDATE shared gameState = "setup"
T+2s:   GET player:ready messages (expect 3 responses)
T+3s:   POST game:start "Round 1 begins!"
T+4s:   POST game:prompt "Alice, your turn"
T+5s:   GET player:action from Alice
T+6s:   POST game:resolve "Alice's action processed"
T+7s:   UPDATE turn = next_player
```

**Code Template**:
```typescript
// 1. Setup phase
postMessage(gamemasterId, "game:setup", "Welcome players!");
updateState("gameState", "setup");
updateState("players", ["Alice", "Bob", "Charlie"]);

// 2. Wait for readiness
await sleep(2000);
const readyMessages = getMessages("game:ready");
if (readyMessages.length === 3) {
  postMessage(gamemasterId, "game:start", "Game begins!");
}

// 3. Game loop
for (let round = 1; round <= 3; round++) {
  for (const player of ["Alice", "Bob", "Charlie"]) {
    postMessage(gamemasterId, "game:prompt", `${player}, your turn`);
    const actions = await pollFor("player:action", player, 5000);
    postMessage(gamemasterId, "game:resolve", `${player}'s action processed`);
  }
  updateState("round", round + 1);
}

// 4. End game
postMessage(gamemasterId, "game:end", "Game complete!");
```

---

### 2. Player Role

**Objective**: Respond to prompts, post actions, interact with other players

**Key Messages**:
- `game:ready` - Confirm readiness
- `player:action` - Execute game actions
- `player:query` - Ask clarifying questions
- `player:trade` - Propose trades/interactions

**Polling Strategy**:
```
Continuous polling:
  1. GET game:prompt messages (directed at you)
  2. Decide action based on game state
  3. POST player:action with your choice
  4. MONITOR for game:resolve confirmation
  5. WAIT for next prompt
```

**Example Flow**:
```
T+1s:   POST game:ready "I'm ready!"
T+3s:   GET game:start announcement
T+5s:   GET game:prompt "Alice, your turn"
T+6s:   POST player:action "Draw 2 cards, move to space 5"
T+7s:   GET game:resolve "Action processed"
T+10s:  GET game:prompt "Bob's turn" (observer, wait)
T+15s:  GET game:prompt "Alice, your turn again"
T+16s:  POST player:action "Trade with Bob"
```

**Code Template**:
```typescript
// 1. Join game
postMessage(playerId, "game:ready", "Ready to play!");

// 2. Wait for game start
const startMessage = await pollFor("game:start", null, 10000);

// 3. Game loop
while (true) {
  // Wait for prompt directed at me
  const prompts = getMessages("game:prompt");
  const myPrompt = prompts.find(p => p.content.includes(myName));

  if (myPrompt) {
    // Decide action
    const action = decideAction(gameState, myHand);

    // Post action
    postMessage(playerId, "player:action", action);

    // Wait for resolution
    await pollFor("game:resolve", null, 5000);
  }

  // Check for game end
  const endMessage = getMessages("game:end");
  if (endMessage.length > 0) break;

  await sleep(500);
}
```

---

### 3. Observer Role

**Objective**: Analyze game state, post observations, provide metadata

**Key Messages**:
- `observation` - Post analysis of game state
- `metric` - Track numerical statistics
- `analysis` - Deep game analysis
- `anomaly` - Flag unusual patterns

**Polling Strategy**:
```
Every 5 seconds:
  1. COUNT total messages by kind
  2. ANALYZE player action patterns
  3. TRACK state changes
  4. POST observations every 10 messages
```

**Example Flow**:
```
T+15s:  COUNT messages (8 total, 3 player:action)
T+20s:  ANALYZE "Round 1: 3 actions, 1 trade"
T+25s:  POST observation "Alice made 2 moves"
T+30s:  TRACK state changes (round: 1→2)
T+35s:  POST metric "Average action time: 4s"
```

**Code Template**:
```typescript
// 1. Setup observer
const observationThreshold = 10; // Every 10 messages
let lastObservationCount = 0;

// 2. Monitor loop
while (true) {
  const allMessages = getMessages();

  if (allMessages.length >= lastObservationCount + observationThreshold) {
    // Analyze patterns
    const playerActions = getMessages("player:action");
    const kinds = new Set(allMessages.map(m => m.kind));
    const gameState = getSharedState();

    // Post observation
    const analysis = `Round ${gameState.round}: ${playerActions.length} actions, ` +
                    `${kinds.size} message types observed`;
    postMessage(observerId, "observation", analysis);

    lastObservationCount = allMessages.length;
  }

  await sleep(5000);
}
```

---

## Room API Reference

### Core Operations

#### Register in Room

```typescript
// For GameMaster
const gamemasterId = registerAgent(roomId, "GameMaster", "gamemaster");

// For Players
const alice = registerAgent(roomId, "Alice", "player");
const bob = registerAgent(roomId, "Bob", "player");

// For Observer
const observer = registerAgent(roomId, "Observer", "observer");
```

#### Post Message

```typescript
postMessage(
  agentId,                    // Your agent ID
  "kind:action",             // Message kind
  "Message content"          // Message body
);

// Examples
postMessage(alice, "game:ready", "Alice is ready!");
postMessage(alice, "player:action", "Draw 2 cards, move forward");
postMessage(observer, "observation", "3 actions observed this round");
```

#### Get Messages

```typescript
// Get all messages
const all = getMessages();

// Get by kind
const actions = getMessages("player:action");
const prompts = getMessages("game:prompt");

// Get from specific agent
const aliceMessages = getMessages(null, alice);

// Get both
const aliceActions = getMessages("player:action", alice);
```

#### Update Shared State

```typescript
updateState("gameState", "active");
updateState("round", 2);
updateState("turn", 1);
updateState("players", ["Alice", "Bob", "Charlie"]);

// Later retrieve
const state = getSharedState();
console.log(state.gameState);  // "active"
console.log(state.round);       // 2
```

---

## Current Game State

### Room Status
- **Room ID**: `room_1771692589191_c0b742r`
- **Created**: 2026-02-21T16:49:49.191Z
- **Status**: ACTIVE
- **Current Round**: 2
- **Current Turn**: 1

### Agent Roster
```
GameMaster   (gamemaster-qrqmr)   - 5 messages
Alice        (player-qvb27)       - 2 messages
Bob          (player-aztn8)       - 2 messages
Charlie      (player-kjlus)       - 2 messages
Observer     (observer-8h0q1)     - 1 message
```

### Message Timeline

| Time | Agent | Kind | Message |
|------|-------|------|---------|
| T+0s | GameMaster | game:setup | Welcome to the game! Setting up... |
| T+1s | Alice | game:ready | Alice is ready! |
| T+2s | Bob | game:ready | Bob is ready! |
| T+3s | Charlie | game:ready | Charlie is ready! |
| T+7s | GameMaster | game:start | Game started! Round 1 begins. |
| T+10s | GameMaster | game:prompt | Alice, your turn. What do you do? |
| T+14s | Alice | player:action | Draw 2 cards, move forward 3 spaces |
| T+18s | GameMaster | game:resolve | Alice's action resolved. Bob, your turn. |
| T+24s | Bob | player:action | Build a structure on space 5 |
| T+30s | GameMaster | game:resolve | Bob's action resolved. Charlie, your turn. |
| T+37s | Charlie | player:action | Trade with Alice for rare card |
| T+44s | Observer | observation | Round 1: 3 player actions, 1 trade interaction |
| T+52s | GameMaster | game:prompt | Round 2 begins. Alice, your turn again. |
| T+61s | Alice | player:action | Play special card: Double turn |
| T+71s | Alice | player:action | Draw 3 cards with bonus |

### Shared Game State

```json
{
  "gameState": "active",
  "players": ["Alice", "Bob", "Charlie"],
  "round": 2,
  "turn": 1
}
```

---

## Spawning New Agents for Testing

### Option A: Use Task Tool (Recommended)

```bash
# Spawn as GameMaster observer
agent_task=$(cat <<'EOF'
You are joining room_1771692589191_c0b742r as a secondary GameMaster observer.

Instructions:
1. Every 10 seconds, check the room messages
2. Analyze game flow and player actions
3. Post analysis: "Observed <N> actions this round"
4. Update shared state with metrics

Room ID: room_1771692589191_c0b742r
Your role: secondary-gm

Messages to monitor:
- game:prompt (analyze fairness)
- player:action (validate legality)
- observation (compare analysis)

Continue for 30 seconds, then summarize findings.
EOF
)

# This spawns an autonomous agent to join the room
npx ts-node -e "$agent_task"
```

### Option B: Raw Instructions for Subagent

```markdown
# Subagent Mission: Join Room and Analyze

**Room ID**: room_1771692589191_c0b742r

## Your Task (60 seconds)

You are a game analyst joining a live game coordination room.

### Phase 1: Observe (First 30 seconds)
- Read all current messages in the room
- Identify the game state and player roles
- Catalog the turn sequence and actions taken

### Phase 2: Participate (Next 30 seconds)
- Post new observation: "Analyzing player strategies..."
- Query shared state for current round/turn
- Post analysis: "Turn pacing: <X> seconds per action"

### What to Look For
✓ Message ordering (causal consistency)
✓ State updates (eventually consistent)
✓ Agent coordination (turn management)
✓ Information visibility (role-based filtering)

### Success Criteria
- Successfully read messages from room
- Posted at least 2 observations
- Verified shared state accessible
- Confirmed message ordering preserved

### Report Format
Post final message as:
"Analysis complete: <summary of findings>"
```

---

## Monitoring Dashboard

### Live Metrics
```
Total Messages:        15
Message Rate:          ~1.5 msg/sec
Active Agents:         5
Game Duration:         ~70 seconds
Current State:         Round 2, Turn 1
Message Types:         8 kinds observed
```

### Message Activity by Kind
```
game:setup          [████] 1 msg
game:ready          [████████████] 3 msgs
game:start          [████] 1 msg
game:prompt         [████████] 2 msgs
player:action       [███████████████] 5 msgs
game:resolve        [████████] 2 msgs
observation         [████] 1 msg
```

### Turn Sequence
```
Round 1:
  Alice     → Draw 2 cards, move forward
  Bob       → Build structure
  Charlie   → Trade with Alice
  Observer  → Analyze interactions

Round 2:
  Alice     → Play special card (double turn)
  Alice     → Draw 3 bonus cards
  (pending: Bob and Charlie)
```

---

## Testing Checklist

When spawning subagents, verify:

- [ ] Agent successfully reads from room
- [ ] Agent can post messages
- [ ] Messages appear with correct timestamp
- [ ] Message ordering preserved (by ID)
- [ ] Shared state accessible to all agents
- [ ] Role-based message filtering works
- [ ] State updates visible across agents
- [ ] No race conditions in concurrent posts
- [ ] Observer can analyze player messages
- [ ] Gamemaster prompts reach targeted players

---

## Commands for Subagents

### Read Room
```typescript
const messages = getMessages();
console.log(`Room has ${messages.length} messages`);
```

### Post Observation
```typescript
postMessage(agentId, "observation",
  "Analysis: Round 1 complete with 3 player actions");
```

### Check State
```typescript
const state = getSharedState();
console.log(`Current round: ${state.round}`);
```

### Monitor Agent
```typescript
const aliceMessages = getMessages("player:action", aliceId);
console.log(`Alice made ${aliceMessages.length} actions`);
```

---

## Expected Observations

When subagents join and observe:

1. **Message Ordering**: Messages appear in monotonic order (ID-based)
2. **State Consistency**: All agents see same shared state
3. **Role Isolation**: Each role sees relevant messages
4. **Turn Management**: Clear turn sequence (Alice → Bob → Charlie)
5. **Trade Interactions**: Multi-agent coordination (Alice ↔ Bob)
6. **Observer Visibility**: Observer sees all message kinds
7. **Causal Ordering**: game:prompt always before player:action
8. **State Progression**: Round advances after all players act

---

## Dashboard Access

The live dashboard is saved at:
```
/home/user/playtest/scripts/.room-dashboard-1771692589191.json
```

View current state:
```bash
cat /home/user/playtest/scripts/.room-dashboard-1771692589191.json | jq
```

---

## Next Steps

1. **Spawn Observer**: Launch a subagent to analyze game flow
2. **Monitor Metrics**: Track message rate, latency, consistency
3. **Test Concurrency**: Multiple agents posting simultaneously
4. **Verify Ordering**: Confirm causal message ordering
5. **Check State**: Validate shared state consistency

---

*Room created: 2026-02-21T16:49:49.191Z*
*Status: ACTIVE and accepting new agents*
*Test duration: 60+ seconds*
