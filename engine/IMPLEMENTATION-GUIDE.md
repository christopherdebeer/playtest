# Game Playtesting Engine - Implementation Guide

This guide shows how to use the engine templates to create game playtesting sessions with proper agent coordination.

---

## Prerequisites

1. **Game rules file**: `games/{game-name}/RULES.md` with YAML frontmatter
2. **Engine templates**: `engine/templates/gamemaster.md` and `engine/templates/player.md`
3. **JSON schemas**: `engine/schemas/*.schema.json` for validation

---

## Implementation Pattern

### Phase 1: Coordinator (Entry Point)

The coordinator is the starting point. It reads the game rules, sets up directories, and spawns the gamemaster agent.

```javascript
// Example: /start-game command implementation

async function startGame(gameName, numPlayers) {
  // Step 1: Load and parse rules
  const rulesPath = `games/${gameName}/RULES.md`;
  const rulesContent = await Read(rulesPath);

  // Extract YAML frontmatter
  const frontmatterMatch = rulesContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error("No YAML frontmatter found in RULES.md");
  }

  const config = parseYAML(frontmatterMatch[1]);

  // Step 2: Create directory structure
  await Bash({
    command: `mkdir -p games/${gameName}/state/player-actions games/${gameName}/logs games/${gameName}/traces`,
    description: "Create game directories"
  });

  // Step 3: Load gamemaster template
  const gamemasterTemplate = await Read("engine/templates/gamemaster.md");

  // Step 4: Fill in template variables
  const gamemasterPrompt = fillTemplate(gamemasterTemplate, {
    GAME_NAME: gameName,
    NUM_PLAYERS: numPlayers || config.players,
    VERSION: config.version,
    RULES_CONTENT: rulesContent,
    STARTING_CARDS: config.starting_cards || config.cards_per_player,
    MAX_TURNS: config.max_turns || 100,
    WIN_CONDITION: config.win_condition,
    // Game-specific fields
    DECK_INITIALIZATION_RULES: extractDeckRules(rulesContent),
    PLAYER_SPECIFIC_FIELDS: extractPlayerFields(config),
    GAME_SPECIFIC_FIELDS: extractGameFields(config),
    AVAILABLE_ACTIONS_FOR_TURN_1: extractInitialActions(rulesContent),
    BRIEF_RULES_REMINDER: extractBriefRules(rulesContent),
    STRATEGY_HINTS: extractStrategySection(rulesContent),
    BALANCE_ANALYSIS: "Analyze card usage, success rates, game length",
    DESIGN_RECOMMENDATIONS: "Suggest improvements based on observed gameplay"
  });

  // Step 5: Spawn gamemaster agent
  console.log(`Starting ${gameName} with ${numPlayers} players...`);

  await Task({
    subagent_type: "general-purpose",
    model: "sonnet",  // Gamemaster needs reasoning
    description: `Gamemaster for ${gameName}`,
    prompt: gamemasterPrompt,
    run_in_background: false  // Block until game completes
  });

  // Step 6: Report results
  const finalLog = await Read(`games/${gameName}/logs/game-*`);
  reportGameResults(finalLog);
}

// Helper function to fill template variables
function fillTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}
```

---

### Phase 2: Gamemaster Agent

The gamemaster is spawned by the coordinator and manages the entire game lifecycle.

#### Key Implementation Points

**1. Initialization**

```javascript
// After being spawned, gamemaster first creates game state

const gameId = `${gameName}-${Date.now()}`;

// Initialize deck (game-specific)
const deck = createDeck();  // Implement per game rules
shuffle(deck);

// Deal cards to players
const players = {};
for (let i = 1; i <= numPlayers; i++) {
  const playerId = `player-${i}`;
  const hand = deck.splice(0, startingCards);

  players[playerId] = {
    hand: hand,
    handSize: hand.length,
    // Game-specific fields
    state: "Start",  // For Markov's Chains
    score: 0,        // For scoring games
    activeEffects: [],
    blocked: false
  };
}

// Create game state
const gameState = {
  gameId: gameId,
  gameName: gameName,
  version: version,
  turnNumber: 1,
  currentPlayer: "player-1",
  maxTurns: maxTurns,
  players: players,
  deck: deck,
  deckSize: deck.length,
  discardPile: [],
  gameSpecific: {
    // Game-specific fields (e.g., topCard for UNO, edgeWeights for Markov's Chains)
  },
  winner: null,
  gameStatus: "active"
};

// Write to file
await Write({
  file_path: `games/${gameName}/state/game-state.json`,
  content: JSON.stringify(gameState, null, 2)
});

// Initialize JSONL log
const logPath = `games/${gameName}/logs/game-${gameId}-live.jsonl`;
await appendLog(logPath, {
  timestamp: new Date().toISOString(),
  type: "game_start",
  gameId: gameId,
  gameName: gameName,
  version: version,
  players: Object.keys(players),
  initialState: gameState
});
```

**2. Turn Loop with ACTUAL Player Agent Spawning**

```javascript
// Main game loop
while (gameState.gameStatus === "active") {
  const currentPlayerId = gameState.currentPlayer;
  const turnNumber = gameState.turnNumber;

  // Create turn signal
  const turnSignal = createTurnSignal(gameState, currentPlayerId);

  await Write({
    file_path: `games/${gameName}/state/turn-signal.json`,
    content: JSON.stringify(turnSignal, null, 2)
  });

  // *** CRITICAL: Spawn ACTUAL player subagent ***
  const playerPrompt = buildPlayerPrompt(
    currentPlayerId,
    turnNumber,
    gameState,
    turnSignal
  );

  await Task({
    subagent_type: "general-purpose",
    model: "haiku",  // Fast and cost-effective for players
    description: `Player ${currentPlayerId} turn ${turnNumber}`,
    prompt: playerPrompt,
    run_in_background: false  // Wait for player to complete
  });

  // *** Wait for player action (polling) ***
  const action = await waitForPlayerAction(currentPlayerId, gameName);

  // Validate action
  const validation = validateAction(action, gameState, turnSignal);

  if (!validation.valid) {
    // Log error and potentially retry
    await appendLog(logPath, {
      timestamp: new Date().toISOString(),
      type: "error",
      message: `Invalid action from ${currentPlayerId}`,
      details: validation.reason
    });
    continue;  // Skip to next iteration or retry
  }

  // Log player action
  await appendLog(logPath, {
    timestamp: new Date().toISOString(),
    type: "player_action",
    playerId: currentPlayerId,
    turnNumber: turnNumber,
    action: action.action,
    reasoning: action.reasoning
  });

  // Apply action to game state
  applyAction(gameState, action);

  // Log state changes
  await appendLog(logPath, {
    timestamp: new Date().toISOString(),
    type: "gamemaster_action",
    playerId: currentPlayerId,
    turnNumber: turnNumber,
    action: action.action.type,
    effect: describeEffect(action, gameState)
  });

  // Check win condition
  if (checkWinCondition(gameState)) {
    gameState.winner = determineWinner(gameState);
    gameState.gameStatus = "completed";
    break;
  }

  // Advance turn
  gameState.turnNumber++;
  gameState.currentPlayer = getNextPlayer(gameState);

  // Update game state file
  await Write({
    file_path: `games/${gameName}/state/game-state.json`,
    content: JSON.stringify(gameState, null, 2)
  });
}

// Game ended, write final logs
await writeFinalLogs(gameState, logPath);
```

**3. Player Action Polling**

```javascript
async function waitForPlayerAction(playerId, gameName, timeout = 60000) {
  const actionPath = `games/${gameName}/state/player-actions/${playerId}.json`;
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    try {
      // Try to read action file
      const actionContent = await Read(actionPath);

      // File exists and was read successfully
      const action = JSON.parse(actionContent);

      // Consume the action file (delete it)
      await Bash({
        command: `rm ${actionPath}`,
        description: `Remove consumed action file for ${playerId}`
      });

      return action;
    } catch (error) {
      // File doesn't exist yet or couldn't be read
      attempts++;

      // Wait briefly before polling again
      // Note: In actual Claude Code, we'd just try again immediately
      // as there's no built-in sleep function
      if (attempts >= 60) {
        throw new Error(`Timeout waiting for ${playerId} action after ${attempts} attempts`);
      }

      // Continue loop to try again
    }
  }

  throw new Error(`Timeout waiting for ${playerId} after ${timeout}ms`);
}
```

**4. Building Player Prompt**

```javascript
function buildPlayerPrompt(playerId, turnNumber, gameState, turnSignal) {
  // Load player template
  const playerTemplate = readTemplate("engine/templates/player.md");

  const playerData = gameState.players[playerId];

  // Build opponents info
  const opponents = {};
  for (const [pid, pdata] of Object.entries(gameState.players)) {
    if (pid !== playerId) {
      opponents[pid] = {
        handSize: pdata.handSize,
        position: pdata.state || pdata.position,
        effects: pdata.activeEffects,
        score: pdata.score
      };
    }
  }

  // Fill template
  return fillTemplate(playerTemplate, {
    PLAYER_ID: playerId,
    GAME_NAME: gameState.gameName,
    TURN_NUMBER: turnNumber,
    GAME_ID: gameState.gameId,
    YOUR_HAND: JSON.stringify(playerData.hand),
    YOUR_POSITION: playerData.state || playerData.position || "N/A",
    YOUR_EFFECTS: JSON.stringify(playerData.activeEffects || []),
    YOUR_SCORE: playerData.score || 0,
    AVAILABLE_ACTIONS: JSON.stringify(turnSignal.availableActions, null, 2),
    OPPONENTS_INFO: JSON.stringify(opponents, null, 2),
    SHARED_STATE: JSON.stringify(turnSignal.visibleState.sharedState, null, 2),
    WIN_CONDITION: gameState.gameSpecific.winCondition || "First to meet win condition",
    STRATEGY_GUIDELINES: extractStrategyForGame(gameState.gameName),
    GAME_SPECIFIC_STRATEGY: extractGameSpecificStrategy(gameState.gameName)
  });
}
```

---

### Phase 3: Player Agent

The player agent is one-shot: spawn, decide, write, exit.

#### Implementation

The player agent receives a pre-filled prompt from the gamemaster and follows these steps:

```javascript
// Player agent execution (conceptual - this happens in spawned agent)

// Step 1: Read turn signal (confirmation)
const turnSignal = await Read(`games/${gameName}/state/turn-signal.json`);

// Verify it's our turn
if (turnSignal.currentPlayer !== playerId) {
  throw new Error("Not my turn!");
}

// Step 2: Read game state
const gameState = await Read(`games/${gameName}/state/game-state.json`);

// Step 3: Extract relevant information
const myHand = gameState.players[playerId].hand;
const availableActions = turnSignal.availableActions;
const opponents = turnSignal.visibleState.opponents;
const sharedState = turnSignal.visibleState.sharedState;

// Step 4: Analyze and decide
// (This is where AI reasoning happens - Claude analyzes the strategic situation)

const bestAction = analyzeAndChooseBestAction(
  myHand,
  availableActions,
  opponents,
  sharedState
);

// Step 5: Write action file
const action = {
  playerId: playerId,
  turnNumber: turnSignal.turnNumber,
  gameId: turnSignal.gameId,
  action: bestAction,
  reasoning: "Strategic explanation of why this action was chosen...",
  alternativesConsidered: ["Action 1", "Action 2"],
  timestamp: new Date().toISOString()
};

await Write({
  file_path: `games/${gameName}/state/player-actions/${playerId}.json`,
  content: JSON.stringify(action, null, 2)
});

// Step 6: Exit (agent terminates)
// Gamemaster will detect the action file and continue the game
```

---

## Complete Example: Markov's Chains

Let's trace through a complete turn for Markov's Chains:

### Turn 1: Player-1's Turn

**1. Gamemaster creates turn-signal.json**:

```json
{
  "currentPlayer": "player-1",
  "turnNumber": 1,
  "gameId": "markovs-chains-1769521821",
  "availableActions": [
    {
      "type": "play_card",
      "description": "Play a card from your hand",
      "parameters": {
        "card": "string (one of your cards)"
      }
    },
    {
      "type": "move",
      "description": "Attempt to transition to a connected state",
      "parameters": {
        "targetState": "string (one of: A, B, C)"
      }
    },
    {
      "type": "pass",
      "description": "Do nothing this turn"
    }
  ],
  "visibleState": {
    "yourHand": ["Catalyst", "Friction", "Redirect", "Block"],
    "yourPosition": "Start",
    "yourEffects": [],
    "opponents": {
      "player-2": {
        "handSize": 4,
        "position": "Start",
        "effects": []
      },
      "player-3": {
        "handSize": 4,
        "position": "Start",
        "effects": []
      }
    },
    "sharedState": {
      "edgeWeights": {
        "Start->A": 0.65,
        "Start->B": 0.65,
        "Start->C": 0.65,
        "A->Victory": 0.55,
        "B->Victory": 0.55,
        "C->Victory": 0.55
      }
    }
  },
  "gameRules": "Race to Victory state via probabilistic transitions. Use cards to boost odds or interfere with opponents.",
  "timestamp": "2026-01-27T14:00:00Z"
}
```

**2. Gamemaster spawns player-1 agent**:

```javascript
await Task({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Player player-1 turn 1",
  prompt: `# Player Agent - player-1

You are player-1 playing Markov's Chains.

## Current Situation

**Turn**: 1
**Your Hand**: ["Catalyst", "Friction", "Redirect", "Block"]
**Your Position**: Start

**Opponents**:
- player-2: at Start, 4 cards
- player-3: at Start, 4 cards

**Available Actions**:
1. play_card: Play a card from your hand
2. move: Attempt transition to A, B, or C (65% base probability)
3. pass: Do nothing

**Strategy**: You need 2 successful transitions to reach Victory (Start→Intermediate→Victory). Catalyst boosts probability by +0.3. Consider playing it before moving.

Make your decision and write to: games/markovs-chains/state/player-actions/player-1.json

**Format**:
{
  "playerId": "player-1",
  "turnNumber": 1,
  "gameId": "markovs-chains-1769521821",
  "action": {
    "type": "...",
    "parameters": {...}
  },
  "reasoning": "...",
  "alternativesConsidered": ["..."]
}`,
  run_in_background: false
});
```

**3. Player-1 agent decides and writes action**:

```json
{
  "playerId": "player-1",
  "turnNumber": 1,
  "gameId": "markovs-chains-1769521821",
  "action": {
    "type": "play_card",
    "parameters": {
      "card": "Catalyst"
    }
  },
  "reasoning": "Playing Catalyst first to boost my next move from 65% to 95%. This gives me a much better chance of successfully moving to state A on my next action. With 95% odds, I'm almost guaranteed to advance.",
  "alternativesConsidered": [
    "Move to A immediately - Only 65% chance, too risky for turn 1",
    "Save Catalyst for later - No, better to use it now while all players are tied"
  ],
  "timestamp": "2026-01-27T14:00:15Z"
}
```

**4. Gamemaster reads action, validates, applies**:

```javascript
// Read action
const action = await waitForPlayerAction("player-1", "markovs-chains");

// Validate
if (action.action.type === "play_card") {
  const card = action.action.parameters.card;
  if (!gameState.players["player-1"].hand.includes(card)) {
    // Invalid!
  }
  // Valid, proceed
}

// Apply effect
if (action.action.parameters.card === "Catalyst") {
  gameState.players["player-1"].activeEffects.push({
    type: "boost",
    amount: 0.3,
    duration: 1  // Next move only
  });
  gameState.players["player-1"].hand = gameState.players["player-1"].hand.filter(c => c !== "Catalyst");
  gameState.players["player-1"].handSize--;
}

// Log
await appendLog(...);

// Update state file
await Write({
  file_path: "games/markovs-chains/state/game-state.json",
  content: JSON.stringify(gameState, null, 2)
});

// Continue to next turn...
```

---

## Key Implementation Points

### ✅ DO:

1. **Spawn real subagents** for each player turn using Task tool
2. **Poll for action files** after spawning player agents
3. **Validate all actions** against rules before applying
4. **Hide private information** in turn signals (only show what player can see)
5. **Log continuously** to JSONL after every event
6. **Use templates** to ensure consistent prompt structure

### ❌ DON'T:

1. **Don't simulate players inline** - Always spawn actual subagents
2. **Don't use hooks** for coordination (they don't work in subagent contexts)
3. **Don't leak information** - Players shouldn't see other players' hands
4. **Don't skip validation** - Always check actions are legal
5. **Don't forget polling timeout** - Set max wait time for player actions
6. **Don't reuse action files** - Delete after consuming

---

## Testing Your Implementation

### 1. Verify Agent Spawning

Check gamemaster is spawning actual player subagents:

```javascript
// In gamemaster code, verify Task tool is called:
await Task({  // This should appear in logs
  subagent_type: "general-purpose",
  model: "haiku",
  description: `Player ${playerId} turn ${turn}`,
  prompt: playerPrompt,
  run_in_background: false
});
```

### 2. Verify Information Hiding

Check turn-signal.json doesn't include other players' private data:

```javascript
// Good:
"opponents": {
  "player-2": {
    "handSize": 4,  // Public
    "position": "A"  // Public
  }
}

// Bad:
"opponents": {
  "player-2": {
    "hand": ["Red 5", "Blue 3"],  // PRIVATE - shouldn't be here!
    "handSize": 2,
    "position": "A"
  }
}
```

### 3. Verify Logging

Check JSONL file has continuous event stream:

```bash
cat games/markovs-chains/logs/game-*-live.jsonl | wc -l
# Should show multiple lines (one per event)

cat games/markovs-chains/logs/game-*-live.jsonl | jq .type
# Should show event types: game_start, player_action, gamemaster_action, etc.
```

### 4. Verify Action Files

Check player-actions/ directory during game:

```bash
ls games/markovs-chains/state/player-actions/
# Should show player-*.json files temporarily, then deleted after consumption
```

---

## Performance Optimization

### Model Selection

- **Gamemaster**: Sonnet (needs complex reasoning)
- **Players**: Haiku (fast, cheap, good enough for tactical decisions)

### Cost Estimation

Per game with 3 players, 10 turns:
- Gamemaster (Sonnet): ~1 invocation = ~$0.05
- Players (Haiku): ~30 invocations (10 turns × 3 players) = ~$0.03
- **Total**: ~$0.08 per game

For 100 games: ~$8.00

### Parallelization

Run multiple games in parallel for tournaments:

```javascript
const games = [];
for (let i = 0; i < 10; i++) {
  games.push(
    Task({
      subagent_type: "general-purpose",
      model: "sonnet",
      description: `Game ${i}`,
      prompt: gamemasterPrompt,
      run_in_background: true  // Run in background
    })
  );
}

// Wait for all games
for (const game of games) {
  await TaskOutput({ task_id: game.taskId });
}
```

---

## Troubleshooting

### Issue: Player agent doesn't spawn

**Symptoms**: Gamemaster hangs at "waiting for player action"

**Diagnosis**:
```bash
# Check if Task tool was called
grep "Task" gamemaster-logs

# Check for errors in Task spawning
grep "error" gamemaster-logs
```

**Solution**:
- Verify Task tool syntax is correct
- Check player prompt doesn't have syntax errors
- Ensure model is available (haiku)

---

### Issue: Player writes invalid action

**Symptoms**: Gamemaster repeatedly rejects actions

**Diagnosis**:
```bash
# Check what player wrote
cat games/markovs-chains/state/player-actions/player-1.json

# Check validation error
cat games/markovs-chains/logs/game-*-live.jsonl | grep error
```

**Solution**:
- Improve turn-signal clarity (availableActions)
- Add examples to player prompt
- Validate player has correct game state

---

### Issue: Information leak

**Symptoms**: Player makes decisions based on hidden info

**Diagnosis**:
```bash
# Check turn-signal.json for private data
cat games/markovs-chains/state/turn-signal.json | jq .visibleState.opponents
# Should NOT contain "hand" field
```

**Solution**:
- Filter game state before creating turn signal
- Only include public fields in visibleState
- Audit createTurnSignal() function

---

## Next Steps

1. **Implement for existing games**: Update UNO and Markov's Chains to use this framework
2. **Create new games**: Use templates to quickly add new games
3. **Add hooks**: When hooks work in subagent contexts, use them instead of polling
4. **Build tournament system**: Run multiple games in parallel, aggregate stats

---

## Reference Files

- **Architecture**: `ENGINE-ARCHITECTURE.md`
- **Schemas**: `engine/schemas/*.schema.json`
- **Templates**: `engine/templates/*.md`
- **Examples**: `games/uno/`, `games/markovs-chains/`
