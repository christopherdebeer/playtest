---
name: start-game
description: This skill should be used when the user asks to "start a playtest", "run a game", "test game rules", "launch multi-agent game simulation", or wants to initialize a game. Initializes and runs games with coordinated multi-agent architecture using TypeScript engine orchestration.
argument-hint: <game-name> [num-players]
allowed-tools: Read, Task, Bash, Glob
---

# Start Game - Instance-Based Architecture (v4)

This skill uses the TypeScript engine to manage game state, with agents for decision-making only.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (this skill)                 │
│  1. npx playtest init <game> --players <n>                  │
│  2. Parse spawn instructions from init output               │
│  3. Spawn agents with instance ID and player IDs            │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - State management by instance ID                          │
│  - Register command returns rules                           │
│  - Turn blocking (npx playtest wait)                        │
│  - Action validation (npx playtest act)                     │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │ Player 1  │        │ Player 2  │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │           │        │           │        │           │
    │ Validates │        │ Decides   │        │ Decides   │
    │ rules     │        │ actions   │        │ actions   │
    └───────────┘        └───────────┘        └───────────┘
```

## Arguments

- `$0`: Game name (e.g., "markovs-chains")
- `$1`: Number of players (optional, default: 2)

## Implementation Steps

### Step 1: Initialize Game via Engine

```bash
GAME_NAME="$0"
NUM_PLAYERS="${1:-2}"

# Initialize game - returns instance ID and spawn instructions
npx playtest init "$GAME_NAME" --players "$NUM_PLAYERS"
```

This returns JSON with:
- `instance`: Short unique instance ID (e.g., "mc-a1b2c3")
- `spawn.gamemaster`: Prompt and firstCommand for gamemaster
- `spawn.players[]`: Prompts and firstCommands for each player

### Step 2: Parse Spawn Instructions

Extract from the init output:
- `INSTANCE_ID` from `instance` field
- Gamemaster prompt from `spawn.gamemaster.prompt`
- Player prompts from `spawn.players[].prompt`

### Step 3: Spawn Agents with Instance IDs

**CRITICAL**: Use a SINGLE message with multiple Task calls. Use the prompts from spawn instructions.

```javascript
// Get spawn instructions from init output
const initResult = JSON.parse(initOutput);
const INSTANCE = initResult.instance;

// Spawn gamemaster agent
Task({
  subagent_type: "gamemaster",
  description: `Gamemaster for ${INSTANCE}`,
  prompt: initResult.spawn.gamemaster.prompt,
  run_in_background: true
});

// Spawn player agents
for (const player of initResult.spawn.players) {
  Task({
    subagent_type: "player",
    description: `${player.id} for ${INSTANCE}`,
    prompt: player.prompt,
    run_in_background: true
  });
}
```

### Step 4: Report Status

```markdown
## Game Launched: {GAME_NAME}

**Instance ID**: {INSTANCE}

**Agents spawned:**
- Gamemaster (validates rules, resolves actions)
- player-1 through player-{NUM_PLAYERS} (compete to win)

**Monitor:**
- Status: `npx playtest status {INSTANCE}`
- State: `cat games/{GAME_NAME}/state/{INSTANCE}.json`
- Logs: `games/{GAME_NAME}/logs/{gameId}.jsonl`
```

## Agent Flow (New Architecture)

1. **Agent spawns** with prompt containing `INSTANCE` and `PLAYER_ID`
2. **Agent registers**: `npx playtest register {INSTANCE} --role player --player {PLAYER_ID}`
   - Returns rules, config, and game status
3. **Agent enters wait loop**: `npx playtest wait {INSTANCE} -p {PLAYER_ID}`
4. **Agent acts**: `npx playtest act {INSTANCE} -p {PLAYER_ID} -a '{...}'`

## Engine CLI Reference

**Initialization:**
- `npx playtest init <game> -p <n>` - Create game instance, returns spawn instructions

**Registration (returns rules):**
- `npx playtest register <instance> --role <role> [--player <id>]` - Register and get rules

**Turn Management:**
- `npx playtest wait <instance> -p <id>` - Block until turn (player)
- `npx playtest act <instance> -p <id> -a '<json>'` - Execute action
- `npx playtest pending <instance>` - Wait for events (gamemaster)
- `npx playtest adjudicate <instance> [options]` - Adjudicate events

**State:**
- `npx playtest status <instance>` - Game status
- `npx playtest state <instance>` - Full state (gamemaster)

**End:**
- `npx playtest end <instance> -w <id> -r '<reason>'` - End game

## Key Benefits (v4 vs v3)

| v3 | v4 |
|----|-----|
| Hook-based rules injection | Register command returns rules |
| Single game per name | Multiple concurrent instances |
| Agents figure out how to start | Explicit spawn instructions |
| Game name in commands | Instance ID in commands |
