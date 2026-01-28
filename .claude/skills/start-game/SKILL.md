---
name: start-game
description: Initialize and run a game with coordinated multi-agent architecture. Use when user wants to start a playtest, run a game, test game rules, or launch multi-agent game simulation.
argument-hint: <game-name> [num-players]
allowed-tools: Read, Write, Task, Bash, Glob
disable-model-invocation: true
---

# Start Game - Coordinated Multi-Agent Architecture

This skill spawns ALL agents (gamemaster + players) upfront. Agents use encapsulated action scripts that handle blocking and coordination internally.

## Architecture Overview

```
Coordinator (this skill)
├─> Spawns Gamemaster (background)
├─> Spawns Player-1 (background)
├─> Spawns Player-2 (background)
└─> Spawns Player-3 (background)

Agent Coordination (via action scripts):
┌─────────────┐     signal-turn.sh      ┌─────────────┐
│ Gamemaster  │ ──────────────────────> │   Players   │
│             │                         │             │
│ wait-for-   │ <────────────────────── │ submit-     │
│ action.sh   │     (action file)       │ action.sh   │
└─────────────┘                         └─────────────┘

- Built-in circuit breakers prevent infinite waits
- Message bus for gamemaster→player communication
- Debug capture on game completion
```

## Arguments

- `$0` or `$ARGUMENTS[0]`: Game name (e.g., "markovs-chains")
- `$1` or `$ARGUMENTS[1]`: Number of players (optional, default: 3)

## Implementation Steps

### Step 1: Validate Game Exists

```bash
GAME_NAME="$0"  # e.g., "markovs-chains"
NUM_PLAYERS="${1:-3}"

# Check game directory exists
if [ ! -d "games/$GAME_NAME" ]; then
  echo "Error: Game '$GAME_NAME' not found"
  exit 1
fi

# Check prompts exist
if [ ! -f "games/$GAME_NAME/prompts/gamemaster-prompt.md" ]; then
  echo "Error: Gamemaster prompt not found"
  exit 1
fi
```

### Step 2: Clean Up Previous Game State

**CRITICAL**: Remove stale state files to prevent conflicts:

```bash
rm -f games/${GAME_NAME}/state/game-state.json
rm -f games/${GAME_NAME}/state/turn-signal.json
rm -f games/${GAME_NAME}/state/player-actions/*.json
rm -rf games/${GAME_NAME}/state/messages/
```

### Step 3: Create Game Directories

```bash
mkdir -p games/${GAME_NAME}/state/player-actions
mkdir -p games/${GAME_NAME}/state/messages
mkdir -p games/${GAME_NAME}/logs/debug
```

### Step 4: Load Agent Prompts

Load pre-built prompts from the game directory:

```javascript
// Gamemaster prompt (ready to use)
const gamemasterPrompt = await Read(`games/${GAME_NAME}/prompts/gamemaster-prompt.md`);

// Player prompt (needs {{PLAYER_ID}} replacement)
const playerPromptTemplate = await Read(`games/${GAME_NAME}/prompts/player-prompt.md`);

// Create player prompts
const playerPrompts = [];
for (let i = 1; i <= NUM_PLAYERS; i++) {
  playerPrompts.push(
    playerPromptTemplate.replace(/\{\{PLAYER_ID\}\}/g, `player-${i}`)
  );
}
```

### Step 5: Spawn ALL Agents in Parallel

**CRITICAL**: Use a SINGLE message with multiple Task calls to spawn all agents simultaneously.

```javascript
// Spawn gamemaster (Sonnet for complex reasoning)
Task({
  subagent_type: "general-purpose",
  model: "sonnet",
  description: `Gamemaster for ${GAME_NAME}`,
  prompt: gamemasterPrompt,
  allowed_tools: ["Read", "Write", "Bash"],
  run_in_background: true
});

// Spawn all players (Haiku for speed/cost)
for (let i = 1; i <= NUM_PLAYERS; i++) {
  Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: `player-${i} for ${GAME_NAME}`,
    prompt: playerPrompts[i-1],
    allowed_tools: ["Read", "Write", "Bash"],
    run_in_background: true
  });
}
```

### Step 6: Report Launch Status

```markdown
## Game Launched: {GAME_NAME}

**Agents spawned:**
- Gamemaster (Sonnet)
- player-1, player-2, player-3 (Haiku)

**Monitor progress:**
- Game state: `games/{GAME_NAME}/state/game-state.json`
- Live log: `games/{GAME_NAME}/logs/game-*-live.jsonl`

**When complete:**
- Debug capture: `games/{GAME_NAME}/logs/debug/`
- Use `/view-results {GAME_NAME}` to see analysis
```

### Step 7: (Optional) Monitor Until Completion

Poll game state every 10 seconds until completion:

```bash
while true; do
  sleep 10
  STATUS=$(jq -r '.gameStatus // "pending"' games/${GAME_NAME}/state/game-state.json 2>/dev/null)
  TURN=$(jq -r '.turnNumber // 0' games/${GAME_NAME}/state/game-state.json 2>/dev/null)

  echo "Turn $TURN - Status: $STATUS"

  if [ "$STATUS" = "completed" ]; then
    WINNER=$(jq -r '.winner' games/${GAME_NAME}/state/game-state.json)
    echo "Game complete! Winner: $WINNER"
    break
  fi
done
```

## Action Scripts Reference

Agents use these scripts (they don't need to know internals):

**Gamemaster:**
- `scripts/actions/gamemaster/wait-for-action.sh` - Block until player acts
- `scripts/actions/gamemaster/signal-turn.sh` - Signal next player
- `scripts/actions/gamemaster/force-pass.sh` - Handle timeouts
- `scripts/actions/gamemaster/end-game.sh` - End and declare winner

**Players:**
- `scripts/actions/player/wait-for-turn.sh` - Block until your turn
- `scripts/actions/player/submit-action.sh` - Submit action

**Common:**
- `scripts/actions/common/send-message.sh` - Inter-agent messages
- `scripts/actions/common/read-messages.sh` - Read messages

## Reference Files

- `games/{game}/prompts/gamemaster-prompt.md` - Gamemaster prompt
- `games/{game}/prompts/player-prompt.md` - Player prompt template
- `games/{game}/rules/` - Game rules for reference
- `scripts/actions/README.md` - Action scripts documentation
- `.claude/hooks/gamemaster-stop-hook.sh` - Debug capture hook
