# Coordinated Multi-Agent Architecture

**Version**: 2.0
**Date**: 2026-01-27

---

## Overview

This document describes the corrected multi-agent architecture where the **coordinator** spawns ALL agents (gamemaster + players) and they coordinate via file-based protocol.

## Problem with V1 Architecture

**V1 (Broken)**:
```
Coordinator
└─> Spawns Gamemaster
    └─> Gamemaster tries to spawn Players ❌ (doesn't work reliably)
```

**Issues**:
- Gamemaster simulates players inline instead of spawning real subagents
- No true multi-agent coordination
- Information leaks possible
- Not observable/debuggable

## V2 Architecture (Correct)

**V2 (Fixed)**:
```
Coordinator (Root)
├─> Spawns Gamemaster (background, long-running)
├─> Spawns Player-1 (background, long-running)
├─> Spawns Player-2 (background, long-running)
└─> Spawns Player-3 (background, long-running)

All agents run in parallel, coordinate via files:
- Gamemaster writes turn-signal.json
- Players poll for turn-signal.json
- Players write player-actions/*.json
- Gamemaster polls for player-actions/*.json
```

**Benefits**:
- ✅ True multi-agent system
- ✅ Agents are isolated (no shared memory)
- ✅ File-based coordination (observable)
- ✅ Proper information hiding
- ✅ Real parallel execution

---

## Agent Roles

### 1. Coordinator (Root Process)

**Responsibility**: Spawn all agents and monitor completion

**Lifecycle**:
1. Load game rules
2. Create directories
3. Build agent prompts
4. Spawn gamemaster (background)
5. Spawn all players (background)
6. Poll for game completion
7. Report results

**Tools**:
- `Read` - Load rules and results
- `Write` - N/A (doesn't write game files)
- `Task` - Spawn all agents
- `Bash` - Create directories

**Does NOT**:
- Make game decisions
- Write to game state
- Coordinate turns directly

---

### 2. Gamemaster (Long-Running Background Agent)

**Responsibility**: Manage game loop, validate actions, update state

**Lifecycle**:
```
1. Initialize game (create game-state.json, deal cards)
2. Log game_start event
3. Write initial turn-signal.json for player-1
4. Loop until game ends:
   a. Poll for player-actions/{current-player}.json
   b. Read and validate action
   c. Update game-state.json
   d. Log events to JSONL
   e. Check win condition
   f. If continuing: Write next turn-signal.json
   g. If ended: Write final logs and exit
5. Clean up state files
6. Exit
```

**Polling Pattern**:
```javascript
// Wait for player action (60 second timeout)
const actionPath = `games/${game}/state/player-actions/${currentPlayer}.json`;
for (let i = 0; i < 60; i++) {
  try {
    const action = await Read(actionPath);
    await Bash(`rm ${actionPath}`);  // Consume
    return JSON.parse(action);
  } catch {
    await sleep(1000);  // Try again in 1 second
  }
}
throw new Error("Player timeout");
```

**Tools**:
- `Read` - Read player actions, game state
- `Write` - Update game state, write turn signals, logs
- `Bash` - Delete consumed action files, append to JSONL

**Does NOT**:
- Spawn player agents (they're already running)
- Simulate player decisions
- Make assumptions about player timing

---

### 3. Players (Long-Running Background Agents)

**Responsibility**: Poll for turns, make decisions, write actions

**Lifecycle**:
```
1. Enter infinite loop:
   a. Try to read turn-signal.json
   b. If exists and currentPlayer == myId:
      - Read game-state.json
      - Analyze visible state
      - Choose best action
      - Write player-actions/{myId}.json
      - Wait briefly for processing
   c. If exists but currentPlayer != myId:
      - Sleep 1 second, retry
   d. If doesn't exist:
      - Check if game is complete (read game-state.json)
      - If complete: exit
      - If not: sleep 1 second, retry
2. Exit when game complete
```

**Polling Pattern**:
```javascript
while (true) {
  try {
    const turnSignal = await Read(`games/${game}/state/turn-signal.json`);
    const signal = JSON.parse(turnSignal);

    if (signal.currentPlayer === myId) {
      // My turn! Make decision
      const action = decideAction(signal);
      await Write({
        file_path: `games/${game}/state/player-actions/${myId}.json`,
        content: JSON.stringify(action)
      });
      await sleep(2000);  // Wait for processing
    } else {
      // Not my turn
      await sleep(1000);
    }
  } catch {
    // Check if game ended
    const state = await Read(`games/${game}/state/game-state.json`);
    if (JSON.parse(state).gameStatus === "completed") {
      break;  // Exit loop
    }
    await sleep(1000);
  }
}
```

**Tools**:
- `Read` - Read turn signal, game state
- `Write` - Write action files

**Does NOT**:
- Modify game-state.json
- See other players' private information
- Spawn other agents
- Coordinate with other players directly

---

## File-Based Coordination Protocol

### Files Used

```
games/{game}/state/
├── game-state.json          (Gamemaster writes, all read)
├── turn-signal.json         (Gamemaster writes, players read)
└── player-actions/
    ├── player-1.json        (Player-1 writes, gamemaster reads)
    ├── player-2.json        (Player-2 writes, gamemaster reads)
    └── player-3.json        (Player-3 writes, gamemaster reads)

games/{game}/logs/
├── game-{id}-live.jsonl     (Gamemaster appends)
└── game-{id}.json           (Gamemaster writes at end)
```

### Turn Flow

```
1. Gamemaster writes turn-signal.json:
   {
     "currentPlayer": "player-2",
     "turnNumber": 5,
     "availableActions": [...],
     "visibleState": {
       "yourHand": [...],
       "opponents": {...},
       "sharedState": {...}
     }
   }

2. Player-2 (polling) detects turn-signal.json
   - Reads currentPlayer === "player-2" ✓
   - Reads game-state.json for full context
   - Analyzes options
   - Chooses action

3. Player-2 writes player-actions/player-2.json:
   {
     "playerId": "player-2",
     "turnNumber": 5,
     "action": {
       "type": "play_card",
       "parameters": {"card": "Momentum"}
     },
     "reasoning": "..."
   }

4. Gamemaster (polling) detects player-actions/player-2.json
   - Reads action
   - Validates (is it legal?)
   - Updates game-state.json
   - Logs events to JSONL
   - Checks win condition
   - Deletes player-actions/player-2.json (consumed)
   - Writes next turn-signal.json (for player-3)

5. Cycle repeats for player-3, then player-1, etc.
```

---

## Implementation Steps

### Step 1: Coordinator Spawns All Agents

```javascript
// coordinator.js (or /start-game command)

async function startGame(gameName, numPlayers) {
  // 1. Setup
  const rules = await Read(`games/${gameName}/RULES.md`);
  await Bash(`mkdir -p games/${gameName}/state/player-actions games/${gameName}/logs`);

  // 2. Build prompts
  const gamemasterPrompt = buildGamemasterPrompt(gameName, rules);
  const playerPrompts = [];
  for (let i = 1; i <= numPlayers; i++) {
    playerPrompts.push(buildPlayerPrompt(`player-${i}`, gameName, rules));
  }

  // 3. Spawn ALL agents in parallel (in a single message)

  // Spawn gamemaster
  Task({
    subagent_type: "general-purpose",
    model: "sonnet",
    description: `Gamemaster for ${gameName}`,
    prompt: gamemasterPrompt,
    run_in_background: true
  });

  // Spawn all players
  for (let i = 0; i < numPlayers; i++) {
    Task({
      subagent_type: "general-purpose",
      model: "haiku",
      description: `player-${i+1} for ${gameName}`,
      prompt: playerPrompts[i],
      run_in_background: true
    });
  }

  // 4. Monitor for completion
  while (true) {
    try {
      const state = await Read(`games/${gameName}/state/game-state.json`);
      if (JSON.parse(state).gameStatus === "completed") {
        break;
      }
    } catch {}
    await sleep(5000);
  }

  // 5. Report results
  const results = await Read(`games/${gameName}/logs/game-*.json`);
  console.log(results);
}
```

### Step 2: Gamemaster Runs Loop

```javascript
// gamemaster agent

// Initialize game
createGameState();
createJSONLLog();
writeTurnSignal("player-1");

// Turn loop
while (gameState.gameStatus === "active") {
  // Poll for current player's action
  const action = await pollForAction(currentPlayer);  // Blocks up to 60s

  // Validate and apply
  if (valid(action)) {
    apply(action);
    updateGameState();
    logEvents();

    // Check end condition
    if (checkWin()) {
      gameState.gameStatus = "completed";
      writeFinalLogs();
      break;
    }

    // Next player
    currentPlayer = getNext();
    writeTurnSignal(currentPlayer);
  }
}

// Cleanup and exit
cleanup();
```

### Step 3: Players Run Loop

```javascript
// player agent

const myId = "{{PLAYER_ID}}";

while (true) {
  try {
    // Poll for turn signal
    const signal = await Read(`games/${game}/state/turn-signal.json`);
    const turnSignal = JSON.parse(signal);

    if (turnSignal.currentPlayer === myId) {
      // My turn!
      const state = await Read(`games/${game}/state/game-state.json`);
      const action = decideAction(state, turnSignal);

      await Write({
        file_path: `games/${game}/state/player-actions/${myId}.json`,
        content: JSON.stringify(action)
      });

      await sleep(2000);  // Wait for GM to process
    } else {
      // Not my turn
      await sleep(1000);
    }
  } catch {
    // Check if game complete
    const state = await Read(`games/${game}/state/game-state.json`);
    if (JSON.parse(state).gameStatus === "completed") {
      break;  // Exit
    }
    await sleep(1000);
  }
}
```

---

## Key Differences from V1

| Aspect | V1 (Broken) | V2 (Fixed) |
|--------|-------------|------------|
| **Agent Spawning** | Gamemaster spawns players | Coordinator spawns ALL |
| **Player Lifecycle** | One-shot per turn | Long-running polling loop |
| **Coordination** | Direct spawning | File-based signals |
| **Execution** | Sequential | Parallel |
| **Observable** | No | Yes (via files) |
| **True Multi-Agent** | No (simulated) | Yes (real subagents) |

---

## Benefits

1. **True Multi-Agent System**: All agents are real subagents running in parallel
2. **Agent Isolation**: No shared memory, only file-based communication
3. **Observable**: All coordination visible through file system
4. **Debuggable**: Can inspect turn-signal.json and action files at any time
5. **Information Hiding**: Players only see what's in turn-signal.json
6. **Scalable**: Easy to add more players or game complexity

---

## Testing

### Verify All Agents Spawn

```bash
# Check running tasks
/tasks

# Should show:
# - 1 gamemaster agent (sonnet)
# - N player agents (haiku)
```

### Verify File Coordination

```bash
# Watch turn signals
watch -n 1 'cat games/markovs-chains/state/turn-signal.json'

# Watch action files
watch -n 1 'ls -la games/markovs-chains/state/player-actions/'

# Watch game state
watch -n 1 'cat games/markovs-chains/state/game-state.json | jq .currentPlayer'
```

### Verify JSONL Logging

```bash
# Stream live events
tail -f games/markovs-chains/logs/game-*-live.jsonl | jq .
```

---

## Next Steps

1. ✅ Create coordinator implementation (update `/start-game` command)
2. ✅ Update gamemaster template (don't spawn players, poll for actions)
3. ✅ Update player template (polling loop instead of one-shot)
4. ⬜ Test with Markov's Chains
5. ⬜ Validate all agents spawn correctly
6. ⬜ Verify file-based coordination works
7. ⬜ Compare results with V1 (simulated) architecture

---

## Files Created

- `engine/coordinator.md` - Coordinator specification
- `engine/templates/gamemaster-coordinated.md` - Gamemaster template for V2
- `engine/templates/player-coordinated.md` - Player template for V2
- `engine/COORDINATED-ARCHITECTURE.md` - This document

---

## Summary

The V2 architecture fixes the fundamental flaw in V1 by having the **coordinator spawn ALL agents** (gamemaster + players) upfront. They then coordinate via file-based protocol with polling. This creates a true multi-agent system where:

- Gamemaster manages game loop and validates actions
- Players poll for their turns and write actions
- All coordination happens through JSON files
- Everything is observable and debuggable

This is the correct implementation of the game playtesting engine framework.
