# Game Engine Coordinator

**Purpose**: Root orchestrator that spawns all agents (gamemaster + players) and manages their lifecycle.

---

## Architecture

The coordinator is the entry point that:
1. Spawns the gamemaster agent (background, long-running)
2. Spawns all player agents (background, long-running)
3. Monitors game completion
4. Reports final results

All agents run in parallel and coordinate via file-based protocol.

---

## Implementation

### Step 1: Load Game Configuration

```javascript
// Read game rules
const rulesPath = `games/${gameName}/RULES.md`;
const rulesContent = await Read(rulesPath);

// Parse YAML frontmatter
const frontmatterMatch = rulesContent.match(/^---\n([\s\S]*?)\n---/);
const config = parseYAML(frontmatterMatch[1]);

// Extract configuration
const numPlayers = config.players;
const gameName = config.name;
const version = config.version;
```

### Step 2: Create Game Directories

```bash
mkdir -p games/${gameName}/state/player-actions
mkdir -p games/${gameName}/logs
mkdir -p games/${gameName}/traces
```

### Step 3: Build Agent Prompts

Load templates and fill variables:

```javascript
// Load templates
const gamemasterTemplate = await Read('engine/templates/gamemaster.md');
const playerTemplate = await Read('engine/templates/player.md');

// Fill gamemaster prompt
const gamemasterPrompt = fillTemplate(gamemasterTemplate, {
  GAME_NAME: gameName,
  NUM_PLAYERS: numPlayers,
  VERSION: version,
  RULES_CONTENT: rulesContent,
  // ... other variables
});

// Create player prompt builder function
function buildPlayerPrompt(playerId) {
  return fillTemplate(playerTemplate, {
    PLAYER_ID: playerId,
    GAME_NAME: gameName,
    // Note: Player prompt is generic, will read current state from files
  });
}
```

### Step 4: Spawn All Agents in Parallel

**CRITICAL**: Spawn all agents in a single message using multiple Task calls:

```javascript
// Spawn gamemaster in background
const gamemasterTask = Task({
  subagent_type: "general-purpose",
  model: "sonnet",
  description: `Gamemaster for ${gameName}`,
  prompt: gamemasterPrompt,
  run_in_background: true  // Long-running
});

// Spawn all players in background
const playerTasks = [];
for (let i = 1; i <= numPlayers; i++) {
  const playerId = `player-${i}`;
  const playerPrompt = buildPlayerPrompt(playerId);

  playerTasks.push(Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: `${playerId} for ${gameName}`,
    prompt: playerPrompt,
    run_in_background: true  // Long-running
  }));
}

// All agents now running in parallel
```

### Step 5: Monitor Game Completion

Wait for gamemaster to signal completion:

```javascript
// Poll for game completion
while (true) {
  const gameState = await Read(`games/${gameName}/state/game-state.json`);
  const state = JSON.parse(gameState);

  if (state.gameStatus === "completed") {
    break;
  }

  // Check every 5 seconds
  await sleep(5000);
}

// Game complete, read results
const finalLog = await Read(`games/${gameName}/logs/game-*.json`);
```

### Step 6: Report Results

```javascript
console.log(`Game Complete!`);
console.log(`Winner: ${finalLog.winner}`);
console.log(`Turns: ${finalLog.totalTurns}`);
console.log(`\nFiles:`);
console.log(`- Live log: games/${gameName}/logs/game-*-live.jsonl`);
console.log(`- Summary: games/${gameName}/logs/game-*.json`);
console.log(`- Trace: games/${gameName}/traces/game-*.md`);
```

---

## Agent Coordination Protocol

### Gamemaster Agent (Long-Running)

**Lifecycle**:
```
1. Initialize game (create game-state.json, deck, deal cards)
2. Log game_start event
3. Enter turn loop:
   a. Write turn-signal.json for current player
   b. Poll for player-actions/{player-id}.json
   c. Read and validate action
   d. Update game-state.json
   e. Log events to JSONL
   f. Check win condition
   g. If game continues, advance to next player
   h. If game ends, write final logs and exit
4. Clean up state files
5. Exit
```

**Key points**:
- Gamemaster does NOT spawn players
- Gamemaster polls for action files (players write them)
- Gamemaster is the only agent that modifies game-state.json

### Player Agents (Long-Running)

**Lifecycle**:
```
1. Enter infinite loop:
   a. Poll for turn-signal.json
   b. Check if currentPlayer matches my ID
   c. If not my turn, sleep and retry
   d. If my turn:
      - Read game-state.json (my hand, visible info)
      - Analyze options
      - Choose best action
      - Write player-actions/{my-id}.json
      - Delete turn-signal.json (consumed)
   e. Sleep briefly, then loop back
2. Exit when game-state.json shows gameStatus="completed"
```

**Key points**:
- Players are always running, polling for their turn
- Players only act when turn-signal.currentPlayer matches their ID
- Players write action files, gamemaster reads them
- Players do NOT modify game-state.json

---

## File-Based Coordination

### Turn Signal Flow

```
1. Gamemaster writes turn-signal.json:
   {
     "currentPlayer": "player-2",
     "turnNumber": 5,
     "availableActions": [...],
     "visibleState": {...}
   }

2. Player-2 (polling) detects turn-signal.json
   - Reads currentPlayer === "player-2"
   - Reads game-state.json for details
   - Decides action

3. Player-2 writes player-actions/player-2.json:
   {
     "playerId": "player-2",
     "action": {...},
     "reasoning": "..."
   }

4. Gamemaster (polling) detects player-actions/player-2.json
   - Reads and validates action
   - Updates game-state.json
   - Logs events
   - Deletes player-actions/player-2.json
   - Writes next turn-signal.json
```

### Polling Strategy

**Gamemaster polling for actions**:
```javascript
// After writing turn-signal.json
const actionPath = `games/${gameName}/state/player-actions/${currentPlayer}.json`;
let attempts = 0;
const maxAttempts = 60;  // 60 seconds timeout

while (attempts < maxAttempts) {
  try {
    const action = await Read(actionPath);
    // Found it! Process action
    await Bash(`rm ${actionPath}`);  // Consume action
    return JSON.parse(action);
  } catch {
    // Not found yet, wait
    attempts++;
    await sleep(1000);  // Check every second
  }
}

throw new Error(`Timeout waiting for ${currentPlayer}`);
```

**Player polling for turn**:
```javascript
// In player's infinite loop
while (true) {
  try {
    const turnSignal = await Read(`games/${gameName}/state/turn-signal.json`);
    const signal = JSON.parse(turnSignal);

    if (signal.currentPlayer === myPlayerId) {
      // It's my turn! Act now
      const action = decideAction(signal);
      await Write({
        file_path: `games/${gameName}/state/player-actions/${myPlayerId}.json`,
        content: JSON.stringify(action)
      });

      // Wait for gamemaster to process (turn-signal will be deleted/updated)
      await sleep(2000);
    } else {
      // Not my turn, wait
      await sleep(1000);
    }
  } catch {
    // No turn-signal file exists, game may be over
    const gameState = await Read(`games/${gameName}/state/game-state.json`);
    if (JSON.parse(gameState).gameStatus === "completed") {
      // Game over, exit
      break;
    }
    // Game still active, just no signal yet
    await sleep(1000);
  }
}
```

---

## Complete Example: Coordinator Implementation

```javascript
async function startGame(gameName, numPlayers) {
  console.log(`Starting ${gameName} with ${numPlayers} players...`);

  // 1. Load rules
  const rules = await Read(`games/${gameName}/RULES.md`);
  const config = parseYAML(extractFrontmatter(rules));

  // 2. Create directories
  await Bash(`mkdir -p games/${gameName}/state/player-actions games/${gameName}/logs games/${gameName}/traces`);

  // 3. Load templates
  const gamemasterTemplate = await Read('engine/templates/gamemaster.md');
  const playerTemplate = await Read('engine/templates/player.md');

  // 4. Build gamemaster prompt
  const gamemasterPrompt = fillTemplate(gamemasterTemplate, {
    GAME_NAME: gameName,
    NUM_PLAYERS: numPlayers,
    RULES_CONTENT: rules,
    // ... other variables
  });

  // 5. Spawn ALL agents in parallel (single message, multiple Task calls)

  // Spawn gamemaster
  await Task({
    subagent_type: "general-purpose",
    model: "sonnet",
    description: `Gamemaster for ${gameName}`,
    prompt: gamemasterPrompt,
    run_in_background: true
  });

  // Spawn all players
  for (let i = 1; i <= numPlayers; i++) {
    const playerId = `player-${i}`;
    const playerPrompt = buildPlayerPrompt(playerId, gameName, rules);

    await Task({
      subagent_type: "general-purpose",
      model: "haiku",
      description: `${playerId} for ${gameName}`,
      prompt: playerPrompt,
      run_in_background: true
    });
  }

  console.log(`All agents spawned. Game running...`);

  // 6. Monitor for completion
  while (true) {
    try {
      const gameState = await Read(`games/${gameName}/state/game-state.json`);
      const state = JSON.parse(gameState);

      if (state.gameStatus === "completed") {
        console.log(`Game complete! Winner: ${state.winner}`);
        break;
      }
    } catch {
      // State file doesn't exist yet
    }

    await sleep(5000);  // Check every 5 seconds
  }

  // 7. Report results
  const finalLog = await Read(`games/${gameName}/logs/game-*.json`);
  console.log(finalLog);
}
```

---

## Benefits of This Architecture

1. **True Multi-Agent**: All agents are real subagents, not simulated
2. **Parallel Execution**: Gamemaster and players run simultaneously
3. **File-Based Sync**: Clear communication protocol via JSON files
4. **Agent Isolation**: Players don't share memory or state
5. **Observable**: All coordination happens through files (easy to debug)
6. **Scalable**: Easy to add more players or game complexity

---

## Troubleshooting

### Agents don't start
- Check Task tool calls succeeded
- Verify prompts don't have syntax errors
- Check model availability (sonnet, haiku)

### Game hangs
- Check if gamemaster is polling for actions
- Check if players are polling for turn signals
- Look for infinite loops or deadlocks

### Actions not processed
- Check player is writing to correct path
- Check gamemaster is reading from correct path
- Verify JSON schema matches expected format

---

## Next Steps

1. Implement coordinator as `/start-game` command
2. Update gamemaster template to NOT spawn players
3. Update player template with polling loop
4. Test with Markov's Chains
5. Validate all agents spawn correctly
