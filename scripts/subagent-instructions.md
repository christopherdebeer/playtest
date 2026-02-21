# Subagent Room Coordination Task

**Mission**: Join room and coordinate with other agents

## Quick Facts

```
Room ID:     room_1771692589191_c0b742r
Dashboard:   https://sync.parc.land/?room=room_1771692589191_c0b742r
Status:      ACTIVE - Round 2 in progress
```

## Your Task (5-10 minutes)

You are joining a multi-agent game coordination room. Your job is to:

1. **Read the current state** of the room
2. **Observe the ongoing game** (currently in Round 2)
3. **Analyze the coordination patterns**
4. **Post observations** about what you see
5. **Monitor agent behavior** and interactions

## Step-by-Step Instructions

### Phase 1: Assess (First 2 minutes)

```
Actions:
  1. Get all messages from room_1771692589191_c0b742r
  2. Count total messages by kind
  3. Identify all agents (GameMaster, Alice, Bob, Charlie, Observer)
  4. Check shared state (round, turn, gameState)
  5. Post message: "New observer joining analysis"
```

**Expected findings:**
- GameMaster: 6 messages (setup, start, prompts, resolutions)
- Alice: 4 messages (ready, 2 actions)
- Bob: 2 messages (ready, action)
- Charlie: 2 messages (ready, action)
- Observer: 1 message (analysis)
- Total: 15+ messages across 8 kinds
- Current state: Round 2, Turn 1, gameState="active"

### Phase 2: Monitor (Next 3 minutes)

```
Every 30 seconds:
  1. Get latest messages
  2. Check for new player actions
  3. Verify message ordering (by timestamp)
  4. Track state changes
  5. Post update: "Monitoring round X, action Y observed"
```

**Look for:**
- ✓ Bob or Charlie's next turn coming
- ✓ Message ordering preserved (no out-of-sequence posts)
- ✓ Shared state consistency (all agents see same round/turn)
- ✓ Turn management accuracy

### Phase 3: Analyze (Final 3 minutes)

```
When monitoring complete:
  1. Summarize all interactions
  2. Count message patterns
  3. Verify coordination success
  4. Post final analysis
  5. Report findings
```

**Report template:**
```
ANALYSIS COMPLETE

Observations:
- Total messages observed: [count]
- Message types: [list]
- Agent coordination: [status]
- Turn sequence: [describe pattern]
- Notable interactions: [trades, special actions, etc]
- Verification: [ordering, state consistency, etc]

Recommendation:
[Your assessment of room coordination effectiveness]
```

## Room API You'll Use

### Get Messages
```
// Get all messages
getMessages()

// Get by kind
getMessages("player:action")

// Get from agent
getMessages("game:prompt", "gamemaster-qrqmr")
```

### Check State
```
// Get shared game state
const state = getSharedState()
// Returns: { gameState, players, round, turn }
```

### Post Message
```
// Register yourself
const myId = registerAgent(roomId, "SubagentObserver", "observer")

// Post observation
postMessage(myId, "observation", "Analysis: Game coordination verified")
```

## Success Criteria

You'll know you're successful when you:

- [ ] Read all 15+ existing messages
- [ ] Identify all 5 agents in room
- [ ] Verify shared state accessibility
- [ ] Post at least 2 observations
- [ ] Detect message ordering (causal consistency)
- [ ] Confirm turn sequence accuracy
- [ ] Report findings

## Key Things to Look For

### Message Patterns
```
Expected sequence:
  game:prompt (from GM) → player:action (from player) → game:resolve (from GM)
```

**Verify**:
- game:prompt always BEFORE player:action? ✓
- game:resolve always AFTER player:action? ✓
- Timestamps in order? ✓

### State Consistency
```
Current state:
  gameState: "active"
  round: 2
  turn: 1
  players: ["Alice", "Bob", "Charlie"]
```

**Verify**:
- All agents see same state? ✓
- Round progresses correctly? ✓
- Turn field accurate? ✓

### Agent Coordination
```
Expected turn order:
  Alice (round 1) → Bob → Charlie → Alice (round 2) → ...
```

**Verify**:
- Turn sequence follows expected pattern? ✓
- No players skipped? ✓
- GameMaster maintains control? ✓

## Real-Time Monitoring

While you're running:

**You can see live updates at:**
```
https://sync.parc.land/?room=room_1771692589191_c0b742r
```

This dashboard shows:
- Real-time agent roster
- Live message feed
- Shared state updates
- Agent status

**The Room Dashboard shows:**
- Who's in the room (agent list)
- What messages are being posted (message log)
- Current game state (shared values)
- Message frequency (rate of coordination)

## Expected Behavior

As you monitor, expect to see:

**Seconds 0-30**: Initial observations
- GameMaster directs next player's turn
- Next player posts action
- GameMaster resolves action

**Seconds 30-60**: Game progression
- Players responding to prompts
- Turn sequence advancing
- State updating for each round

**Seconds 60+**: Full game flow
- Multiple rounds processed
- Trades or special actions
- Observer providing analysis

## Your ID in the Room

Once you register, you'll get:
```
Agent Name:  SubagentObserver
Agent ID:    observer-[random]
Room ID:     room_1771692589191_c0b742r
Role:        observer
```

Use this ID to post messages:
```
postMessage(myObserverId, "observation", "Your analysis here")
```

## Communication Protocol

Post updates in this format:

```
[observation] "Analysis at T+30s: Observed [N] actions in this period"
[observation] "Pattern: GameMaster → Player → GameMaster confirmed"
[observation] "State consistency: round=2, turn=1 (verified)"
[metric] "Message rate: 1.5 msg/sec over last 60 seconds"
[analysis] "Turn sequence: Alice→Bob→Charlie pattern maintained"
```

## Troubleshooting

If you can't see messages:
- Check room ID: `room_1771692589191_c0b742r`
- Verify you're using correct API calls
- Make sure agent is registered before posting

If state seems inconsistent:
- Refresh shared state query
- Check if all agents querying same data
- Verify no race conditions

## Timeline

```
T+0m:  Connect and register
T+1m:  Read current room state (15+ messages)
T+2m:  Post initial observation
T+3m:  Begin monitoring for new messages
T+6m:  Update observations
T+8m:  Final analysis
T+10m: Post summary and findings
```

## When Done

Post final message:
```
[analysis] "Subagent analysis complete. Room coordination: VERIFIED.
All patterns confirmed operational. Monitoring duration: 10 minutes."
```

## Dashboard Link for Observer

While running, you can see real-time activity:

```
https://sync.parc.land/?room=room_1771692589191_c0b742r
```

This shows:
- Live agent roster (who's online)
- Message feed (what they're saying)
- Shared state (game progress)
- Agent status (active/idle)

Refresh to see updates as messages post!

---

**Room Status**: ✅ ACTIVE and ready for observation
**Current Players**: GameMaster, Alice, Bob, Charlie, Observer
**Game Progress**: Round 2, Turn 1
**Time in Room**: ~2 minutes elapsed
