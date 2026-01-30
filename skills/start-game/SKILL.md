---
name: start-game
description: This skill should be used when the user asks to "start a playtest", "run a game", "test game rules", "launch multi-agent game simulation", or wants to initialize a game. Initializes and runs games with coordinated multi-agent architecture using TypeScript engine orchestration.
argument-hint: <game-name> [num-players]
allowed-tools: Read, Task, Bash, Glob
---

# Start Game - Engine-Driven Architecture (v3)

This skill uses the TypeScript engine to manage game state, with agents for decision-making only.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (this skill)                 │
│  1. npx playtest init <game> --players <n>                  │
│  2. Spawn gamemaster + player agents                        │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - State management (games/<game>/state/game.json)          │
│  - Turn blocking (npx playtest wait)                        │
│  - Randomization (npx playtest roll)                        │
│  - Deck operations (npx playtest draw/discard)              │
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

# Initialize game state via engine
npx playtest init "$GAME_NAME" --players "$NUM_PLAYERS"
```

This creates `games/{GAME_NAME}/state/game.json` with:
- Shuffled deck
- Dealt hands
- Turn order
- Initial positions

### Step 2: Read Agent Templates

```javascript
// Read game-agnostic agent templates
const gamemasterDef = await Read('agents/gamemaster.md');
const playerDef = await Read('agents/player.md');
```

### Step 3: Spawn Agents in Parallel

**CRITICAL**: Use a SINGLE message with multiple Task calls.

Agent definitions are in `agents/`:
- `gamemaster.md` - sonnet model, full playtest CLI access
- `player.md` - haiku model, limited to wait/submit/status

```javascript
// Spawn gamemaster agent (uses agents/gamemaster.md definition)
Task({
  subagent_type: "gamemaster",
  description: `Gamemaster for ${GAME_NAME}`,
  prompt: `GAME: ${GAME_NAME}
PLAYERS: ${NUM_PLAYERS}

Begin your gamemaster duties now.`,
  run_in_background: true
});

// Spawn player agents (uses agents/player.md definition)
for (let i = 1; i <= NUM_PLAYERS; i++) {
  Task({
    subagent_type: "player",
    description: `player-${i} for ${GAME_NAME}`,
    prompt: `GAME: ${GAME_NAME}
YOUR ID: player-${i}

Begin playing now. Play to WIN!`,
    run_in_background: true
  });
}
```

### Step 4: Report Status

```markdown
## Game Launched: {GAME_NAME}

**Engine initialized** with {NUM_PLAYERS} players

**Agents spawned:**
- Gamemaster (validates rules, resolves actions)
- player-1 through player-{NUM_PLAYERS} (compete to win)

**Monitor:**
- Status: `npx playtest status {GAME_NAME}`
- State: `cat games/{GAME_NAME}/state/game.json`
- Logs: `games/{GAME_NAME}/logs/{gameId}.jsonl`
```

## Engine CLI Reference

**Initialization:**
- `npx playtest init <game> -p <n>` - Create game

**Turn Management:**
- `npx playtest wait <game> -p <id>` - Block until turn (player)
- `npx playtest act <game> -p <id> -a '<json>'` - Execute action
- `npx playtest advance <game>` - Next turn (gamemaster)

**Game Mechanics:**
- `npx playtest roll <game> --probability <p>` - Dice/probability
- `npx playtest draw <game> -p <id> -n <count>` - Draw cards
- `npx playtest update <game> -p <id> -s '<json>'` - Update state

**State:**
- `npx playtest status <game>` - Game status
- `npx playtest state <game>` - Full state (gamemaster)
- `npx playtest state <game> -p <id>` - Player view

**End:**
- `npx playtest end <game> -w <id> -r '<reason>'` - End game

## Key Differences from v2

| v2 | v3 |
|----|-----|
| Bash scripts for everything | TypeScript engine |
| Agents manage state | Engine manages state |
| Agents do randomization | Engine does randomization |
| inotifywait polling | Engine blocking waits |
| Manual info hiding | Automatic info hiding |
