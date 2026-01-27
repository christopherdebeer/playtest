---
name: start-game
description: Initialize and run game with coordinated multi-agent architecture
argument-hint: <game-name> [num-players]
allowed-tools: [Read, Write, Task, Bash, Glob]
---

# Start Game Command - Coordinated Multi-Agent Architecture

This command implements a coordinator that spawns ALL agents (gamemaster + players) upfront and they coordinate via file-based protocol.

## Architecture Overview

```
Coordinator (this command)
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

## Implementation Steps

### Step 1: Load Game Configuration

Read the game rules and extract configuration:

```javascript
// Parse game name from arguments
const gameName = args[0]; // e.g., "markovs-chains"
const numPlayersOverride = args[1] ? parseInt(args[1]) : null;

// Read game rules
const rulesPath = "games/" + gameName + "/RULES.md";
const rulesContent = await Read(rulesPath);

// Parse YAML frontmatter
const frontmatterMatch = rulesContent.match(/^---\n([\s\S]*?)\n---/);
if (!frontmatterMatch) {
  error("Invalid rules file: missing YAML frontmatter");
  return;
}

// Extract configuration
const config = {
  name: extractYAMLField(frontmatter, 'name'),
  version: extractYAMLField(frontmatter, 'version'),
  players: numPlayersOverride || extractYAMLField(frontmatter, 'players'),
  starting_cards: extractYAMLField(frontmatter, 'starting_cards'),
  max_turns: extractYAMLField(frontmatter, 'max_turns'),
  win_condition: extractYAMLField(frontmatter, 'win_condition')
};

console.log("Initializing " + config.name + " v" + config.version + " with " + config.players + " players");
```

### Step 2: Create Game Directories

Set up the directory structure:

```bash
mkdir -p games/${gameName}/state/player-actions
mkdir -p games/${gameName}/logs
mkdir -p games/${gameName}/traces
```

### Step 3: Load and Fill Agent Templates

Load the coordinated templates and fill in variables:

```javascript
// Load templates
const gamemasterTemplatePath = 'engine/templates/gamemaster-coordinated.md';
const playerTemplatePath = 'engine/templates/player-npm-interface.md';

const gamemasterTemplate = await Read(gamemasterTemplatePath);
const playerTemplate = await Read(playerTemplatePath);

// Fill gamemaster template
let gamemasterPrompt = gamemasterTemplate;
gamemasterPrompt = gamemasterPrompt.replace(/\{\{GAME_NAME\}\}/g, gameName);
gamemasterPrompt = gamemasterPrompt.replace(/\{\{NUM_PLAYERS\}\}/g, config.players.toString());
gamemasterPrompt = gamemasterPrompt.replace(/\{\{VERSION\}\}/g, config.version);
gamemasterPrompt = gamemasterPrompt.replace(/\{\{RULES_CONTENT\}\}/g, rulesContent);
gamemasterPrompt = gamemasterPrompt.replace(/\{\{STARTING_CARDS\}\}/g, config.starting_cards.toString());
gamemasterPrompt = gamemasterPrompt.replace(/\{\{MAX_TURNS\}\}/g, config.max_turns.toString());
gamemasterPrompt = gamemasterPrompt.replace(/\{\{WIN_CONDITION\}\}/g, config.win_condition);
// Add other game-specific replacements as needed

// Build player prompts (one for each player)
const playerPrompts = [];
for (let i = 1; i <= config.players; i++) {
  const playerId = "player-" + i;
  let playerPrompt = playerTemplate;

  playerPrompt = playerPrompt.replace(/\{\{GAME_NAME\}\}/g, gameName);
  playerPrompt = playerPrompt.replace(/\{\{PLAYER_ID\}\}/g, playerId);
  playerPrompt = playerPrompt.replace(/\{\{BRIEF_RULES\}\}/g, config.win_condition);
  // Add other replacements as needed

  playerPrompts.push(playerPrompt);
}

console.log("Templates loaded and filled for " + config.players + " players");
```

### Step 4: Spawn ALL Agents in Parallel

**CRITICAL**: Spawn all agents in a SINGLE message with multiple Task calls.

This is the key to the coordinated architecture - all agents must be spawned by the coordinator (not by the gamemaster).

```javascript
console.log("Spawning " + (config.players + 1) + " agents (1 gamemaster + " + config.players + " players)...");

// YOU MUST MAKE ALL THESE TASK CALLS IN A SINGLE MESSAGE

// 1. Spawn gamemaster (long-running background agent)
await Task({
  subagent_type: "general-purpose",
  model: "sonnet", // Gamemaster needs good reasoning
  description: "Gamemaster for " + gameName,
  prompt: gamemasterPrompt,
  run_in_background: true  // CRITICAL: Long-running
});

// 2. Spawn player-1 (long-running background agent)
await Task({
  subagent_type: "general-purpose",
  model: "haiku", // Players can use faster model
  description: "player-1 for " + gameName,
  prompt: playerPrompts[0],
  run_in_background: true  // CRITICAL: Long-running
});

// 3. Spawn player-2 (long-running background agent)
await Task({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "player-2 for " + gameName,
  prompt: playerPrompts[1],
  run_in_background: true  // CRITICAL: Long-running
});

// 4. Spawn player-3 (long-running background agent)
await Task({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "player-3 for " + gameName,
  prompt: playerPrompts[2],
  run_in_background: true  // CRITICAL: Long-running
});

// If more than 3 players, spawn additional player agents...
// (repeat pattern for player-4, player-5, etc.)

console.log("All " + (config.players + 1) + " agents spawned successfully");
console.log("Check running agents with: /tasks");
```

**Why this works**:
- All agents are REAL subagents (not simulated)
- All run in PARALLEL (background mode)
- Gamemaster doesn't spawn players (coordinator does)
- Agents coordinate via file-based protocol (polling)

### Step 5: Monitor Game Completion

Wait for the game to complete by polling the game state:

```javascript
console.log("\\nGame session started for " + gameName);
console.log("\\nMonitoring game progress...");
console.log("Game state: games/" + gameName + "/state/game-state.json");
console.log("Turn signals: games/" + gameName + "/state/turn-signal.json");
console.log("Player actions: games/" + gameName + "/state/player-actions/");
console.log("\\nWaiting for game to complete...\\n");

// Poll every 5 seconds
let lastTurn = 0;
const maxWaitMinutes = 30;
const maxIterations = (maxWaitMinutes * 60) / 5; // 30 minutes timeout
let iterations = 0;

while (iterations < maxIterations) {
  try {
    // Read current game state
    const stateContent = await Read("games/" + gameName + "/state/game-state.json");
    const state = JSON.parse(stateContent);

    // Check if game complete
    if (state.gameStatus === "completed") {
      console.log("\\n✓ Game complete");
      console.log("Winner: " + (state.winner || 'No winner'));
      console.log("Total turns: " + state.turnNumber);
      break;
    }

    // Show progress if turn changed
    if (state.turnNumber > lastTurn) {
      console.log("Turn " + state.turnNumber + ": " + state.currentPlayer + "'s turn");
      lastTurn = state.turnNumber;
    }
  } catch (error) {
    // State file doesn't exist yet (game not started)
    // This is normal during initialization
  }

  // Wait 5 seconds before checking again
  await Bash("sleep 5");
  iterations++;
}

if (iterations >= maxIterations) {
  console.log("\\n⚠ Game timed out after " + maxWaitMinutes + " minutes");
  console.log("Check game state manually: games/" + gameName + "/state/game-state.json");
}
```

### Step 6: Report Final Results

Read and display the final game results:

```javascript
console.log("\\n--- Final Results ---\\n");

try {
  // Find the most recent game log
  const logFiles = await Bash("ls -t games/" + gameName + "/logs/game-*.json | head -1");
  const logPath = logFiles.trim();

  if (logPath) {
    const logContent = await Read(logPath);
    const results = JSON.parse(logContent);

    console.log("Game ID: " + results.gameId);
    console.log("Winner: " + results.winner);
    console.log("Total Turns: " + results.totalTurns);

    if (results.statistics) {
      console.log("\\nStatistics:");
      console.log(JSON.stringify(results.statistics, null, 2));
    }

    if (results.balanceObservations) {
      console.log("\\nBalance Observations:");
      console.log(JSON.stringify(results.balanceObservations, null, 2));
    }

    console.log("\\nFull logs:");
    console.log("- Summary: " + logPath);
    console.log("- Live events: games/" + gameName + "/logs/game-*-live.jsonl");

    const traceFiles = await Bash("ls games/" + gameName + "/traces/game-*.md 2>/dev/null | head -1");
    if (traceFiles.trim()) {
      console.log("- Detailed trace: " + traceFiles.trim());
    }
  }
} catch (error) {
  console.log("Could not read final results: " + error.message);
  console.log("Check: games/" + gameName + "/logs/");
}

console.log("\\n✓ Game session complete");
```

## How It Works

### Gamemaster Agent (Long-Running)

The gamemaster:
1. Initializes game (creates game-state.json, deals cards)
2. Writes first turn-signal.json
3. **Polls** for player-actions/*.json files (60 second timeout)
4. Validates and applies actions
5. Updates game-state.json
6. Logs events to JSONL
7. Checks win condition
8. Writes next turn-signal.json
9. Repeats until game ends

**Key**: Gamemaster does NOT spawn players - they're already running.

### Player Agents (Long-Running)

Each player:
1. Runs infinite polling loop
2. **Polls** for turn-signal.json
3. Checks if `currentPlayer === myId`
4. If my turn: reads game state, decides action, writes player-actions/{myId}.json
5. If not my turn: sleeps 1 second and retries
6. If game complete: exits loop

**Key**: Players run continuously, polling for their turn.

### File-Based Coordination

All coordination happens through JSON files:
- `game-state.json` - Authoritative game state (gamemaster writes, all read)
- `turn-signal.json` - Turn notification (gamemaster writes, players read)
- `player-actions/{player-id}.json` - Player decisions (players write, gamemaster reads)

This is observable and debuggable - you can inspect files at any time.

## Validation

After running the command, verify:

1. **Agents spawned**: Run `/tasks` - should show 4 agents (1 gamemaster + 3 players)
2. **File coordination**: Watch `games/${gameName}/state/turn-signal.json` - should update each turn
3. **Player actions**: Check `games/${gameName}/state/player-actions/` - files appear and disappear
4. **Events logged**: Tail `games/${gameName}/logs/game-*-live.jsonl` - continuous events
5. **Game completes**: Final logs written to `games/${gameName}/logs/game-*.json`
6. **No simulation**: Agents are real subagents, not inline simulation

## Troubleshooting

**Agents don't spawn**:
- Check templates exist: `engine/templates/gamemaster-coordinated.md` and `player-npm-interface.md`
- Verify Task calls have `run_in_background: true`
- Check model availability (sonnet, haiku)

**Game hangs**:
- Check if gamemaster initialized game (game-state.json exists)
- Check if players are polling (look for turn-signal.json)
- Check for stuck action files in player-actions/
- Verify polling loops aren't broken

**Players simulated inline**:
- Verify you spawned all agents in Step 4 (not just gamemaster)
- Check gamemaster template doesn't have player logic
- Ensure all Task calls used `run_in_background: true`

## See Also

- `engine/COORDINATED-ARCHITECTURE.md` - Full architecture documentation
- `engine/coordinator.md` - Coordinator specification
- `engine/templates/gamemaster-coordinated.md` - Gamemaster template
- `engine/templates/player-npm-interface.md` - Player template with npm script interface
