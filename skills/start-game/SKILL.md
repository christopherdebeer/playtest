---
name: start-game
description: Initialize and run a game with coordinated multi-agent architecture. Use when user wants to start a playtest, run a game, test game rules, or launch multi-agent game simulation.
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
cd /home/user/playtest/engine
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
const gamemasterDef = await Read('.claude/agents/gamemaster.md');
const playerDef = await Read('.claude/agents/player.md');
```

### Step 3: Spawn Agents in Parallel

**CRITICAL**: Use a SINGLE message with multiple Task calls.

**Model Selection**:
- Gamemaster: `sonnet` - needs rule interpretation and validation
- Players: `haiku` - fast pattern matching for gameplay decisions

**Tool Restrictions**:
- Gamemaster: Full Bash access for all `npx playtest` commands
- Players: Limited to `Bash(npx playtest wait *)`, `Bash(npx playtest submit *)`, `Bash(npx playtest status *)`

```javascript
// Spawn gamemaster (sonnet for rule interpretation)
Task({
  subagent_type: "gamemaster",
  model: "sonnet",
  description: `Gamemaster for ${GAME_NAME}`,
  prompt: `You are the gamemaster for ${GAME_NAME}.

GAME: ${GAME_NAME}
PLAYERS: ${NUM_PLAYERS}

Read the rules: npx playtest rules ${GAME_NAME}

Then monitor the game using:
- npx playtest pending ${GAME_NAME}  # Wait for player actions
- npx playtest state ${GAME_NAME}    # Check full state

Process player actions, validate against rules, and use:
- npx playtest roll ... for probability checks
- npx playtest update ... to update player state
- npx playtest advance ... to advance turns
- npx playtest end ... when someone wins

Focus ONLY on game management. Do not run unnecessary commands.`,
  run_in_background: true
});

// Spawn players (haiku for fast decisions)
for (let i = 1; i <= NUM_PLAYERS; i++) {
  Task({
    subagent_type: "player",
    model: "haiku",
    allowed_tools: ["Bash(npx playtest wait *)", "Bash(npx playtest submit *)", "Bash(npx playtest status *)"],
    description: `player-${i} for ${GAME_NAME}`,
    prompt: `You are player-${i} in ${GAME_NAME}. Play to WIN!

GAME: ${GAME_NAME}
YOUR ID: player-${i}

Game loop:
1. npx playtest wait ${GAME_NAME} -p player-${i}   # Wait for turn (returns your hand and game state)
2. Choose best action from your hand
3. npx playtest submit ${GAME_NAME} -p player-${i} -a '{"type":"...","card":"..."}'

Repeat until game_over. Do NOT run any commands besides wait and submit.`,
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
- `npx playtest submit <game> -p <id> -a '<json>'` - Submit action
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
