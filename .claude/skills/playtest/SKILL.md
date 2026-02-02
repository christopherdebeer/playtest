---
name: playtest
description: This skill should be used when the user asks to "start a playtest", "run a game", "test game rules", "launch multi-agent game simulation", or wants to initialize a game. Initializes and runs games with coordinated multi-agent architecture using TypeScript engine orchestration.
argument-hint: <game-name> [num-players]
allowed-tools: Read, Task, Bash, Glob
---

# Start Game - Instance-Based Architecture (v4)

This skill uses the TypeScript engine to manage game instances, with agents for decision-making only.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (this skill)                 │
│  1. ./playtest init <game> --players <n>                  │
│  2. Parse instanceId and spawnInstructions from output      │
│  3. Spawn gamemaster + player agents with instance IDs      │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - Instance management (games/<game>/state/<instanceId>/)   │
│  - Turn blocking (./playtest wait)                        │
│  - Registration with rules (./playtest register)          │
│  - Concurrent game support                                   │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │ Player 1  │        │ Player 2  │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │ Registers │        │ Registers │        │ Registers │
    │ → Rules   │        │ → Rules   │        │ → Rules   │
    └───────────┘        └───────────┘        └───────────┘
```

## Arguments

- `$0`: Game name (e.g., "uno", "markovs-chains")
- `$1`: Number of players (optional, default: 2)

## Implementation Steps

### Step 1: Initialize Game Instance via Engine

```bash
GAME_NAME="$0"
NUM_PLAYERS="${1:-2}"

# Initialize game - returns instanceId and spawn instructions
# Use node directly for ~10x faster execution than npx
./playtest init "$GAME_NAME" --players "$NUM_PLAYERS"
```

The init command returns JSON with:
- `instanceId`: Unique game instance ID (e.g., "uno-1706789012345")
- `gameName`: The base game name
- `players`: Array of player IDs ["player-1", "player-2", ...]
- `spawnInstructions`: Pre-formatted prompts for each agent

### Step 2: Parse Init Output

Extract the `instanceId` and `spawnInstructions` from the JSON output.

### Step 3: Spawn Agents in Parallel with Instance IDs

**CRITICAL**: Use a SINGLE message with multiple Task calls.

```javascript
// Parse init output
const initResult = JSON.parse(initOutput);
const { instanceId, spawnInstructions } = initResult;

// Spawn gamemaster agent (uses agents/gamemaster.md definition)
Task({
  subagent_type: "gamemaster",
  description: `Gamemaster for ${instanceId}`,
  prompt: spawnInstructions.gamemaster.prompt,
  run_in_background: true
});

// Spawn player agents (uses agents/player.md definition)
for (const player of spawnInstructions.players) {
  Task({
    subagent_type: "player",
    description: `${player.playerId} for ${instanceId}`,
    prompt: player.prompt,
    run_in_background: true
  });
}
```

### Step 4: Report Status

```markdown
## Game Launched: {instanceId}

**Instance ID**: `{instanceId}` (use this in all commands)
**Game**: {gameName}
**Players**: {NUM_PLAYERS}

**Agents spawned:**
- Gamemaster (will register and wait for adjudication requests)
- player-1 through player-{NUM_PLAYERS} (will register and compete to win)

**Monitor:**
- Status: `./playtest status {instanceId}`
- List instances: `./playtest list {gameName}`
- Logs: `games/{gameName}/logs/{instanceId}.jsonl`

**Key Change**: Agents now call `register` as their first command to receive rules.
```

## Agent Flow

1. Agent spawns with `INSTANCE: {instanceId}` and `PLAYER_ID: {playerId}` (or `ROLE: gamemaster`)
2. Agent calls `./playtest register {instanceId} -r {role} -a {agentId} [-p {playerId}]`
3. Register returns rules and config - agent reads and understands them
4. Agent proceeds with game loop (wait/act for players, pending/adjudicate for GM)

## Engine CLI Reference

**Initialization:**
- `./playtest init <game> -p <n>` - Create game instance, get spawn instructions

**Registration:**
- `./playtest register <instance> -r <role> -a <agentId> [-p <playerId>]` - Register and get rules

**Instance Management:**
- `./playtest list [game]` - List active game instances
- `./playtest status <instance>` - Game status (accepts instance ID or game name)

**Turn Management:**
- `./playtest wait <game> -p <id>` - Block until turn (player)
- `./playtest actions <game> -p <id>` - **Discover available actions** (dynamic!)
- `./playtest act <game> -p <id> -a '<json>'` - Execute action
- `./playtest advance <game>` - Next turn (gamemaster)

**Gamemaster:**
- `./playtest pending <instance>` - Wait for contest/resignation/victory
- `./playtest adjudicate <instance> ...` - Rule on disputes

**End:**
- `./playtest end <instance> -w <id> -r '<reason>'` - End game

## Concurrent Games

Multiple instances of the same game can run simultaneously:

```bash
# Start two uno games
./playtest init uno -p 3  # Returns uno-1706789012345
./playtest init uno -p 2  # Returns uno-1706789067890

# Each agent uses its specific instance ID
# No conflicts between games
```
