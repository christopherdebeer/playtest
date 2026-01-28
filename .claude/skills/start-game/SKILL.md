---
name: start-game
description: Initialize and run a game with coordinated multi-agent architecture. Use when user wants to start a playtest, run a game, test game rules, or launch multi-agent game simulation.
argument-hint: <game-name> [num-players]
allowed-tools: Read, Write, Task, Bash, Glob
disable-model-invocation: true
---

# Start Game - Coordinated Multi-Agent Architecture

This skill spawns ALL agents (gamemaster + players) upfront and they coordinate via file-based protocol.

## Architecture Overview

```
Coordinator (this skill)
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

## Arguments

- `$0` or `$ARGUMENTS[0]`: Game name (e.g., "markovs-chains")
- `$1` or `$ARGUMENTS[1]`: Number of players (optional, defaults to game config)

## Implementation Steps

### Step 1: Load Game Configuration

Read the game rules and extract configuration:

```javascript
const gameName = "$0"; // e.g., "markovs-chains"
const numPlayersOverride = "$1" ? parseInt("$1") : null;

// Read game rules
const rulesPath = "games/" + gameName + "/RULES.md";
const rulesContent = await Read(rulesPath);

// Parse YAML frontmatter for config
// Extract: name, version, players, starting_cards, max_turns, win_condition
```

### Step 2: Clean Up Previous Game State

**CRITICAL**: Remove any existing game state files:

```bash
rm -f games/${gameName}/state/game-state.json
rm -f games/${gameName}/state/turn-signal.json
rm -f games/${gameName}/state/player-actions/*.json
```

### Step 3: Create Game Directories

```bash
mkdir -p games/${gameName}/state/player-actions
mkdir -p games/${gameName}/logs
mkdir -p games/${gameName}/traces
```

### Step 4: Load and Fill Agent Templates

Load templates from `engine/templates/`:
- `gamemaster-coordinated.md` for gamemaster
- `player-npm-interface.md` for players

Fill template variables: `{{GAME_NAME}}`, `{{NUM_PLAYERS}}`, `{{RULES_CONTENT}}`, etc.

### Step 5: Spawn ALL Agents in Parallel

**CRITICAL**: Spawn all agents in a SINGLE message with multiple Task calls.

```javascript
// 1. Spawn gamemaster (Sonnet for reasoning)
await Task({
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Gamemaster for " + gameName,
  prompt: gamemasterPrompt,
  run_in_background: true
});

// 2-4. Spawn players (Haiku for speed)
for (let i = 1; i <= numPlayers; i++) {
  await Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: "player-" + i + " for " + gameName,
    prompt: playerPrompts[i-1],
    run_in_background: true
  });
}
```

### Step 6: Monitor Game Completion

Poll `games/${gameName}/state/game-state.json` every 5 seconds until `gameStatus === "completed"`.

### Step 7: Report Final Results

Display winner, total turns, and point to log files.

## Reference Files

For detailed templates and schemas, see:
- `engine/templates/gamemaster-coordinated.md`
- `engine/templates/player-npm-interface.md`
- `engine/schemas/` - JSON schemas for validation
- `skills/game-coordination/SKILL.md` - Coordination patterns
- `skills/file-protocol/SKILL.md` - File-based communication
