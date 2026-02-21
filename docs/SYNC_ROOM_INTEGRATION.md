# sync.parc.land Integration for /playtest

This document outlines how to integrate sync.parc.land room coordination into the `/playtest` framework for multi-agent game orchestration.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  /playtest CLI                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │ playtest markovs-chains 2                          │     │
│  └────┬───────────────────────────────────────────────┘     │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────┐                    │
│  │ 1. Create Room on sync.parc.land    │                    │
│  │    ROOM_ID = "room_..."              │                    │
│  └──────────┬──────────────────────────┘                    │
│             │                                                │
│  ┌──────────▼──────────────────────────────────────┐        │
│  │ 2. Spawn Agents                                 │        │
│  │    - GameMaster agent (orchestrator)            │        │
│  │    - N Player agents (parallel)                 │        │
│  │    - Observer agent (monitoring)                │        │
│  └──────────┬──────────────────────────────────────┘        │
│             │                                                │
│  ┌──────────▼──────────────────────────────────────┐        │
│  │ 3. All agents coordinate via sync.parc.land     │        │
│  │    Messages API: POST game events                │        │
│  │    State API: UPDATE shared game state           │        │
│  │    Polling: GET messages/state periodically      │        │
│  └──────────┬──────────────────────────────────────┘        │
│             │                                                │
│  ┌──────────▼──────────────────────────────────────┐        │
│  │ 4. Game Completes                               │        │
│  │    Collect transcript from room                  │        │
│  │    Analyze coordination quality                  │        │
│  └─────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
        ▲                                         │
        │                                         ▼
        │                         https://sync.parc.land
        │
        └─ Returns room ID to user/logs
```

---

## Integration Points

### 1. CLI Entry Point (`/playtest` skill)

The skill should:
1. Accept game name and player count
2. Spawn orchestration agents with room ID
3. Wait for game completion
4. Return transcript and metrics

```typescript
// Pseudo-code
async function playtest(gameName: string, playerCount: number) {
  // Load game rules
  const rules = await loadGameRules(`games/${gameName}/RULES.md`);

  // Create coordination room
  const roomId = await createRoom("playtest-" + gameName);

  // Spawn agents (all in parallel)
  const agents = await Promise.all([
    spawnGameMaster(gameName, roomId, rules),
    ...Array(playerCount).fill(0).map((_, i) =>
      spawnPlayer(gameName, roomId, "Alice|Bob|Charlie"[i])
    ),
    spawnObserver(gameName, roomId)
  ]);

  // Wait for completion (observe game:end message)
  const transcript = await waitForCompletion(roomId);

  // Analyze and report
  return analyzeGameRun(transcript);
}
```

### 2. GameMaster Agent Role

**Responsibilities**:
- Load game rules from RULES.md
- Initialize shared state
- Orchestrate turn sequence
- Validate player actions
- Update state after each action
- Determine win conditions

**Implementation Pattern**:

```typescript
class GameMaster {
  constructor(roomId: string, rules: GameRules) {
    this.roomId = roomId;
    this.rules = rules;
    this.agentId = null;
  }

  async initialize() {
    // Register as gamemaster
    this.agentId = await registerAgent(this.roomId, "GameMaster", "gamemaster");

    // Initialize game state from rules
    const initialState = this.rules.getInitialState();
    await updateState(this.roomId, "gameState", "setup");
    await updateState(this.roomId, "round", 1);
    await updateState(this.roomId, "turn", 1);
    await updateState(this.roomId, "players", initialState.players);

    // Announce setup
    await postMessage(this.agentId, "game:setup", `Game: ${this.rules.name}`);
  }

  async orchestrateGame() {
    // Wait for players to be ready
    await this.waitForPlayersReady(3); // Expect 3 player ready messages

    // Post game start
    await postMessage(this.agentId, "game:start", "Round 1 begins!");
    await updateState(this.roomId, "gameState", "active");

    // Game loop
    let round = 1;
    while (round <= this.rules.maxRounds) {
      for (const playerName of this.rules.playerOrder) {
        // Prompt player
        await postMessage(this.agentId, "game:prompt",
          `${playerName}, your turn. ${this.rules.getTurnHints(playerName)}`);

        // Wait for action (with timeout)
        const action = await this.waitForPlayerAction(playerName, 10000);

        // Validate action
        if (!this.rules.isLegalAction(action, playerName)) {
          await postMessage(this.agentId, "game:error",
            `Illegal action from ${playerName}: ${action}`);
          continue;
        }

        // Update state based on action
        const newState = this.rules.applyAction(action, playerName);
        await updateState(this.roomId, "players", newState.players);

        // Post resolution
        await postMessage(this.agentId, "game:resolve",
          `${playerName}'s action resolved. ${action}`);
      }

      round++;
      await updateState(this.roomId, "round", round);
    }

    // Determine winner
    const winner = this.rules.getWinner();
    await postMessage(this.agentId, "game:end", `Game complete! ${winner} wins!`);
    await updateState(this.roomId, "gameState", "complete");
  }

  private async waitForPlayersReady(count: number): Promise<void> {
    const timeout = 30000; // 30s
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const ready = await getMessages(this.roomId, "game:ready");
      if (ready.length >= count) return;
      await sleep(500);
    }

    throw new Error("Players not ready within timeout");
  }

  private async waitForPlayerAction(playerName: string, timeout: number): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const actions = await getMessages(this.roomId, "player:action");
      const playerAction = actions.find(a => a.body.includes(playerName));
      if (playerAction) return playerAction.body;
      await sleep(500);
    }

    throw new Error(`No action from ${playerName} within timeout`);
  }
}
```

### 3. Player Agent Role

**Responsibilities**:
- Listen for game:prompt messages
- Decide action based on game state
- Post player:action message
- Update hand/resources based on resolution

**Implementation Pattern**:

```typescript
class PlayerAgent {
  constructor(roomId: string, playerName: string) {
    this.roomId = roomId;
    this.playerName = playerName;
    this.agentId = null;
  }

  async joinGame() {
    // Register as player
    this.agentId = await registerAgent(this.roomId, this.playerName, "player");

    // Announce ready
    await postMessage(this.agentId, "game:ready", `${this.playerName} is ready!`);
  }

  async playGame() {
    const timeout = 300000; // 5 minutes max game time

    while (true) {
      const messages = await getMessages(this.roomId);

      // Check for game end
      if (messages.some(m => m.kind === "game:end")) {
        console.log(`Game ended for ${this.playerName}`);
        break;
      }

      // Look for my prompt
      const prompts = await getMessages(this.roomId, "game:prompt");
      const myPrompt = prompts.find(p => p.body.includes(this.playerName));

      if (myPrompt) {
        // Get current state
        const state = await getState(this.roomId);

        // Decide action (simple strategy: random legal move)
        const legalActions = this.getLegalActions(state);
        const action = legalActions[Math.floor(Math.random() * legalActions.length)];

        // Post action
        await postMessage(this.agentId, "player:action", action);

        // Wait for resolution
        const resolutions = await getMessages(this.roomId, "game:resolve");
        // Update local state based on resolution...
      }

      await sleep(500);
    }
  }

  private getLegalActions(state: GameState): string[] {
    // Implement game-specific legal move generation
    // This is where the RULES.md defines possible actions
    return ["action1", "action2", "action3"];
  }
}
```

### 4. Observer Agent Role

**Responsibilities**:
- Monitor game progression
- Verify rule compliance
- Post periodic analysis
- Track game metrics

```typescript
class ObserverAgent {
  constructor(roomId: string) {
    this.roomId = roomId;
    this.agentId = null;
  }

  async monitor() {
    this.agentId = await registerAgent(this.roomId, "Observer", "observer");

    await postMessage(this.agentId, "observation", "Observer started");

    let lastMessageCount = 0;

    while (true) {
      const messages = await getMessages(this.roomId);

      // Check for game end
      if (messages.some(m => m.kind === "game:end")) {
        await postMessage(this.agentId, "observation",
          `Game complete. Total messages: ${messages.length}`);
        break;
      }

      // Periodic analysis
      if (messages.length >= lastMessageCount + 5) {
        const actionCount = messages.filter(m => m.kind === "player:action").length;
        await postMessage(this.agentId, "observation",
          `Progress: ${messages.length} messages, ${actionCount} player actions`);
        lastMessageCount = messages.length;
      }

      await sleep(2000);
    }
  }
}
```

---

## Game Rule Definition (RULES.md)

Each game should define rules that both GameMaster and Players can use:

```markdown
# Game Rules: Markov's Chains

## Setup
- 3 players
- Initial hand: 5 cards each
- Starting position: 0

## Turn Structure
1. Draw a card
2. Play 0-2 cards from hand
3. Move forward (distance = card values)
4. Resolve interactions if landing on another player

## Legal Actions
```

The framework should parse this to:
1. Validate actions during gameplay
2. Generate possible moves for player strategies
3. Determine win conditions
4. Update state correctly

---

## Workflow: Complete Example

```typescript
// 1. CLI invocation
npx playtest markovs-chains 2

// 2. Internally:
//    - Create room: room_1771692589191_c0b742r
//    - Load games/markovs-chains/RULES.md
//    - Spawn 3 agents (GameMaster, Alice, Bob, Observer)
//    - All agents join room and coordinate via HTTP

// 3. Message flow:
//    GameMaster: "game:setup" → initialize state
//    Alice:      "game:ready" → I'm ready
//    Bob:        "game:ready" → I'm ready
//    Observer:   "observation" → Game starting
//    GameMaster: "game:start" → Round 1 begins
//    GameMaster: "game:prompt" → Alice, your turn
//    Alice:      "player:action" → Draw 2 cards, move forward 3
//    GameMaster: "game:resolve" → Alice's action processed
//    GameMaster: "game:prompt" → Bob, your turn
//    Bob:        "player:action" → Build structure
//    GameMaster: "game:resolve" → Bob's action processed
//    ... (continue until game:end)
//    Observer:   "observation" → Final analysis

// 4. After completion:
//    - Collect all messages from room
//    - Extract winner from game:end message
//    - Analyze coordination patterns
//    - Report results to user
```

---

## State Schema Example

For Markov's Chains:

```json
{
  "gameState": "active",
  "round": 1,
  "turn": 1,
  "players": {
    "alice": {
      "hand": [2, 3, 5],
      "position": 3,
      "score": 0,
      "structures": []
    },
    "bob": {
      "hand": [1, 4, 5],
      "position": 0,
      "score": 0,
      "structures": []
    }
  },
  "board": {
    "spaces": 20,
    "interactions": []
  }
}
```

---

## Implementation Checklist

- [ ] Create `spawnGameMaster()` function
- [ ] Create `spawnPlayer()` function
- [ ] Create `spawnObserver()` function
- [ ] Implement room creation helper
- [ ] Add game rules parser (RULES.md → GameRules class)
- [ ] Integrate with `/playtest` CLI
- [ ] Add transcript collection and analysis
- [ ] Test with local game (e.g., markovs-chains)
- [ ] Verify message ordering and state consistency
- [ ] Add performance metrics collection

---

## Key Insights

1. **Messages are events**: Use them to orchestrate turn flow and player actions
2. **State is persistent**: Use it to track game progress that survives agent restarts
3. **Polling is simple**: No webhooks needed; agents periodically check for updates
4. **Isolation is free**: Each game gets its own room; no interference
5. **Scaling is easy**: Add more players by spawning more player agents

---

## Testing

Create a test game:

```bash
# Test with 2-player game
npx playtest markovs-chains 2

# Should see:
# - Room created
# - 4 agents joined (GM + 2 players + observer)
# - 20+ messages posted
# - Game completed with winner
# - Transcript saved
```

