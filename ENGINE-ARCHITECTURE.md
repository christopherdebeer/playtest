# Game Playtesting Engine - Architecture Specification

**Version**: 1.0
**Purpose**: Game-agnostic multi-agent coordination framework for playtesting board/card games
**Date**: 2026-01-27

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Specifications](#component-specifications)
3. [Coordination Protocol](#coordination-protocol)
4. [JSON Schemas](#json-schemas)
5. [Agent Templates](#agent-templates)
6. [Implementation Guide](#implementation-guide)
7. [Testing & Validation](#testing--validation)

---

## Architecture Overview

### Design Principles

1. **Game Agnostic**: Engine works for any turn-based game
2. **Agent Isolation**: Each player is a separate subagent with no shared memory
3. **File-Based Coordination**: JSON files are the single source of truth
4. **Gamemaster Authority**: One agent enforces rules and validates actions
5. **Observable**: JSONL logs capture all events for analysis

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATOR (Main)                        │
│  - Spawns gamemaster                                         │
│  - Monitors game completion                                  │
│  - Aggregates logs                                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  GAMEMASTER AGENT (Sonnet)                   │
│  - Loads rules from RULES.md                                 │
│  - Initializes game state                                    │
│  - Spawns player agents                                      │
│  - Writes turn signals                                       │
│  - Validates player actions                                  │
│  - Updates game state                                        │
│  - Detects win conditions                                    │
│  - Writes logs                                               │
└────────┬────────────────────────────────────────────────────┘
         │
         │ (spawns & coordinates)
         │
    ┌────┴──────┬──────────┬──────────┐
    ▼           ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ PLAYER  │ │ PLAYER  │ │ PLAYER  │ │ PLAYER  │
│   1     │ │   2     │ │   3     │ │   4     │
│ (Haiku) │ │ (Haiku) │ │ (Haiku) │ │ (Haiku) │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │          │          │
     └───────────┴──────────┴──────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   FILE SYSTEM (State)                        │
│                                                              │
│  games/<game>/state/                                         │
│    ├── game-state.json       (authoritative state)          │
│    ├── turn-signal.json      (gamemaster → player)          │
│    └── player-actions/                                       │
│        ├── player-1.json     (player → gamemaster)          │
│        ├── player-2.json                                     │
│        └── player-3.json                                     │
│                                                              │
│  games/<game>/logs/                                          │
│    └── game-<id>-live.jsonl  (continuous event log)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Coordinator (Main Thread)

**Role**: Entry point, spawns gamemaster, monitors completion

**Responsibilities**:
- Parse game rules YAML frontmatter
- Create game directory structure
- Spawn gamemaster agent with game rules
- Wait for game completion
- Report final results

**Tools Used**:
- `Read` - Load RULES.md
- `Bash` - Create directories
- `Task` - Spawn gamemaster agent
- `TaskOutput` - Get results (optional)

**Does NOT**:
- Simulate game logic
- Make game decisions
- Coordinate turns directly

---

### 2. Gamemaster Agent

**Role**: Authoritative game state manager and rule enforcer

**Model**: Sonnet (needs reasoning for complex rule interpretation)

**Lifecycle**:
1. Initialize game state
2. Spawn player agents
3. Loop: Signal turn → Wait for action → Validate → Update state
4. Detect win condition
5. Write final logs
6. Exit

**Responsibilities**:
- **Initialize**: Create game-state.json with initial deck, hands, turn order
- **Spawn Players**: Launch N player subagents with unique IDs
- **Signal Turns**: Write turn-signal.json to notify current player
- **Wait for Actions**: Poll for player-actions/<player-id>.json
- **Validate**: Check action legality against rules
- **Update State**: Apply valid actions to game-state.json
- **Log Events**: Append to JSONL log continuously
- **Detect Win**: Check win condition after each action
- **Conclude**: Write final game log and trace

**Tools Used**:
- `Read` - Load rules, read player actions
- `Write` - Update game state, write signals, write logs
- `Task` - Spawn player subagents
- `Bash` - File cleanup

**Critical**: Must spawn ACTUAL player subagents, not simulate them inline

---

### 3. Player Agent

**Role**: Game-playing decision maker

**Model**: Haiku (fast, cost-effective for repeated decisions)

**Lifecycle**:
1. Read turn-signal.json (triggered by gamemaster)
2. Read game-state.json (limited to visible info)
3. Analyze game state
4. Choose action
5. Write player-actions/<player-id>.json
6. Exit (one-shot per turn)

**Responsibilities**:
- **Read Signal**: Parse turn-signal.json to know it's their turn
- **Read State**: Load visible game state (hand, board, etc.)
- **Decide**: Choose legal action based on strategy
- **Write Action**: Output decision to player-actions/ directory
- **Log Reasoning**: Include thought process in action JSON

**Tools Used**:
- `Read` - Load turn signal, game state
- `Write` - Write action file

**Critical**:
- One-shot execution (spawn, decide, write, exit)
- No memory between turns
- Cannot see other players' hands (information hiding)

---

## Coordination Protocol

### Turn Sequence Flow

```
1. GAMEMASTER: Write turn-signal.json
   {
     "currentPlayer": "player-1",
     "turnNumber": 5,
     "availableActions": [...],
     "visibleState": {...}
   }

2. GAMEMASTER: Spawn player-1 agent
   - Pass game name and player ID
   - Agent runs one-shot

3. PLAYER-1: Read turn-signal.json
   - Confirm it's their turn
   - Parse available actions

4. PLAYER-1: Read game-state.json
   - Load hand, visible cards, etc.
   - Respect information hiding

5. PLAYER-1: Decide on action
   - Apply strategy/heuristics
   - Choose from available actions

6. PLAYER-1: Write player-actions/player-1.json
   {
     "playerId": "player-1",
     "turnNumber": 5,
     "action": {
       "type": "play_card",
       "card": "Catalyst"
     },
     "reasoning": "..."
   }

7. PLAYER-1: Exit (agent terminates)

8. GAMEMASTER: Detect player-actions/player-1.json (polling)
   - Read action file
   - Validate against rules

9. GAMEMASTER: Update game-state.json
   - Apply action effects
   - Update turn number
   - Check win condition

10. GAMEMASTER: Log to JSONL
    {"type": "player_action", ...}
    {"type": "gamemaster_validation", ...}

11. GAMEMASTER: Check if game continues
    - If win condition: Write final logs, exit
    - If continue: Go to step 1 with next player
```

### Polling Strategy

**Problem**: Hooks don't trigger within subagent contexts

**Solution**: Gamemaster polls for action files

```javascript
// Gamemaster waits for player action
function waitForPlayerAction(playerId, timeout = 60000) {
  const actionPath = `games/${gameName}/state/player-actions/${playerId}.json`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (fileExists(actionPath)) {
      const action = readJSON(actionPath);
      deleteFile(actionPath); // Consume action
      return action;
    }
    sleep(1000); // Poll every 1 second
  }

  throw new Error(`Timeout waiting for ${playerId}`);
}
```

**Implementation in Claude**:
```javascript
// Gamemaster agent after spawning player
let actionReceived = false;
let attempts = 0;
const maxAttempts = 60;

while (!actionReceived && attempts < maxAttempts) {
  const actionFile = await Read(`games/${gameName}/state/player-actions/${playerId}.json`);

  if (actionFile.exists) {
    // Process action
    actionReceived = true;
  } else {
    // Wait briefly, increment counter
    attempts++;
    // Note: Actual sleep via bash sleep or just try again immediately
  }
}
```

---

## JSON Schemas

### 1. Game State (`game-state.json`)

**Purpose**: Authoritative game state (single source of truth)

```json
{
  "gameId": "string (unique identifier)",
  "gameName": "string (e.g., 'uno', 'markovs-chains')",
  "version": "string (rules version)",
  "turnNumber": "integer",
  "currentPlayer": "string (player-id)",
  "maxTurns": "integer (optional, for timeout)",

  "players": {
    "player-1": {
      "hand": ["array of cards - PRIVATE"],
      "handSize": "integer - PUBLIC",
      "state": "string (game-specific, e.g., board position)",
      "score": "integer (optional)",
      "activeEffects": ["array of status effects"],
      "blocked": "boolean (optional)"
    }
    // ... more players
  },

  "deck": ["array of remaining cards"],
  "deckSize": "integer",
  "discardPile": ["array of discarded cards"],

  "gameSpecific": {
    // Custom fields per game
    // e.g., "topCard" for UNO
    // e.g., "edgeWeights" for Markov's Chains
  },

  "winner": "string (player-id, null if ongoing)",
  "gameStatus": "string ('active' | 'completed' | 'cancelled')"
}
```

**Information Hiding**: Players should only see their own `hand`, not others'

---

### 2. Turn Signal (`turn-signal.json`)

**Purpose**: Notify player it's their turn, provide context

```json
{
  "currentPlayer": "string (player-id)",
  "turnNumber": "integer",
  "gameId": "string",

  "availableActions": [
    {
      "type": "string (e.g., 'play_card', 'draw', 'move', 'pass')",
      "description": "string (human-readable)",
      "constraints": ["array of constraints, e.g., 'must match color'"]
    }
  ],

  "visibleState": {
    "yourHand": ["array of your cards"],
    "yourPosition": "string (board position)",
    "yourEffects": ["array of active effects on you"],

    "opponents": {
      "player-2": {
        "handSize": "integer",
        "position": "string",
        "effects": ["array"]
      }
      // ... more opponents
    },

    "sharedState": {
      // Game-specific visible info
      // e.g., "topCard" in UNO
      // e.g., "edgeWeights" in Markov's Chains
    }
  },

  "gameRules": "string (brief reminder of key rules)",
  "timestamp": "ISO 8601 timestamp"
}
```

**Design**: Contains only what player needs to make decision

---

### 3. Player Action (`player-actions/<player-id>.json`)

**Purpose**: Player's decision communicated to gamemaster

```json
{
  "playerId": "string (must match filename)",
  "turnNumber": "integer (must match current turn)",
  "gameId": "string",

  "action": {
    "type": "string (e.g., 'play_card', 'move', 'draw', 'pass')",
    "parameters": {
      // Action-specific fields
      // e.g., "card": "Red 5"
      // e.g., "targetState": "A"
      // e.g., "targetPlayer": "player-2"
    }
  },

  "reasoning": "string (why player chose this action)",
  "alternativesConsidered": ["array of other options"],
  "timestamp": "ISO 8601 timestamp"
}
```

**Validation**: Gamemaster checks:
- `playerId` matches expected player
- `turnNumber` matches current turn
- `action.type` is in `availableActions`
- `action.parameters` satisfy constraints

---

### 4. Game Log (`game-<id>-live.jsonl`)

**Purpose**: Continuous event stream for analysis

**Format**: Line-delimited JSON (one event per line)

```jsonl
{"timestamp": "...", "type": "game_start", "gameId": "...", "players": [...]}
{"timestamp": "...", "type": "player_action", "playerId": "...", "action": {...}, "reasoning": "..."}
{"timestamp": "...", "type": "gamemaster_validation", "valid": true, "effect": "..."}
{"timestamp": "...", "type": "state_change", "field": "...", "oldValue": "...", "newValue": "..."}
{"timestamp": "...", "type": "game_end", "winner": "...", "totalTurns": 10}
```

**Event Types**:
- `game_start`
- `player_action`
- `gamemaster_validation`
- `state_change`
- `turn_transition`
- `game_end`
- `error`

---

### 5. Final Game Summary (`game-<id>.json`)

**Purpose**: Post-game analysis data

```json
{
  "gameId": "string",
  "gameName": "string",
  "version": "string",
  "timestamp": "ISO 8601",

  "players": ["array of player IDs"],
  "winner": "string",
  "totalTurns": "integer",
  "duration": "string (human readable)",

  "finalStates": {
    "player-1": "...",
    "player-2": "..."
  },

  "statistics": {
    // Game-specific stats
    // e.g., "cardsPlayed": 42
    // e.g., "moveSuccessRate": 0.67
  },

  "balanceObservations": {
    // Analysis for game design iteration
  },

  "keyMoments": [
    {
      "turn": "integer",
      "event": "string (description)"
    }
  ],

  "recommendations": {
    // Suggestions for rule changes
  }
}
```

---

## Agent Templates

### Gamemaster Agent Template

```markdown
# Gamemaster Agent - {GAME_NAME}

## Your Role

You are the GAMEMASTER for {GAME_NAME}. You are the authoritative rule enforcer and state manager.

## Critical Requirements

1. **Spawn Real Player Agents**: You MUST spawn actual player subagents using the Task tool. Do NOT simulate player decisions inline.
2. **One Turn at a Time**: Signal turn → spawn player → wait for action → validate → update state → repeat.
3. **Information Hiding**: When writing turn-signal.json, include only what that player can see.
4. **Validate All Actions**: Check every action against rules before applying.
5. **Continuous Logging**: Append to JSONL log after every event.

## Game Rules

{FULL_RULES_CONTENT}

## Initialization Phase

1. Create game ID: `{game-name}-{timestamp}`
2. Initialize deck according to rules
3. Deal {X} cards to each player
4. Create `game-state.json` with:
   - Game metadata
   - Player list with hands (private)
   - Deck and discard pile
   - Turn order
5. Create initial `turn-signal.json` for player-1
6. Append game_start event to JSONL log

## Turn Loop Phase

For each turn:

1. **Spawn Player Agent**:
   ```
   await Task({
     subagent_type: "general-purpose",
     model: "haiku",
     description: "Player {N} turn {T}",
     prompt: `You are {PLAYER_ID} in {GAME_NAME}.

     Your task:
     1. Read games/{game}/state/turn-signal.json
     2. Read games/{game}/state/game-state.json
     3. Analyze your options
     4. Write your action to games/{game}/state/player-actions/{player-id}.json

     Your visible state:
     - Your hand: {hand}
     - Game situation: {context}

     Available actions: {actions}

     Choose the best action and write it to your action file, then exit.`,
     run_in_background: false
   });
   ```

2. **Wait for Action** (polling):
   - Check for `player-actions/{player-id}.json`
   - Poll every 1-2 seconds
   - Timeout after 60 seconds

3. **Validate Action**:
   - Check action type is legal
   - Check parameters satisfy constraints
   - If invalid: log error, re-prompt player

4. **Apply Action**:
   - Update game-state.json
   - Apply side effects
   - Check win condition

5. **Log Event**:
   - Append player_action to JSONL
   - Append validation to JSONL
   - Append state_change to JSONL

6. **Check Continuation**:
   - If winner: go to Conclusion Phase
   - If max turns reached: go to Conclusion Phase
   - Else: advance to next player, write new turn-signal.json

## Conclusion Phase

1. Calculate final scores
2. Write `game-{id}.json` summary with:
   - Winner and final states
   - Statistics
   - Balance observations
   - Key moments
3. Write `game-{id}.md` trace (optional, detailed)
4. Clean up state directory
5. Report completion

## Tools Available

- **Read**: Load rules, state, actions
- **Write**: Update state, signals, logs
- **Task**: Spawn player agents
- **Bash**: File operations

## Begin

Initialize the game now.
```

---

### Player Agent Template

```markdown
# Player Agent - {PLAYER_ID}

## Your Role

You are {PLAYER_ID} playing {GAME_NAME}. Make the best strategic decision for your turn.

## Your Task

1. **Read Turn Signal**:
   - File: `games/{game}/state/turn-signal.json`
   - Confirm it's your turn
   - Note available actions

2. **Read Game State**:
   - File: `games/{game}/state/game-state.json`
   - Load your hand (visible to you only)
   - Load opponent states (hand sizes, positions, etc.)
   - Load shared state (board, discard pile, etc.)

3. **Analyze Options**:
   - Consider each available action
   - Evaluate strategic value
   - Think about opponent positions

4. **Choose Action**:
   - Select best action
   - Explain reasoning

5. **Write Action File**:
   - File: `games/{game}/state/player-actions/{player-id}.json`
   - Format:
   ```json
   {
     "playerId": "{player-id}",
     "turnNumber": {turn},
     "gameId": "{game-id}",
     "action": {
       "type": "...",
       "parameters": {...}
     },
     "reasoning": "Explain why you chose this",
     "alternativesConsidered": ["Other options you evaluated"]
   }
   ```

6. **Exit**: Your job is done after writing the action file.

## Game Context

**Game**: {GAME_NAME}
**Your ID**: {PLAYER_ID}
**Turn**: {TURN_NUMBER}

**Available Actions**:
{AVAILABLE_ACTIONS}

**Your State**:
{PLAYER_VISIBLE_STATE}

**Opponents**:
{OPPONENTS_STATE}

**Shared State**:
{SHARED_STATE}

## Strategy Guidelines

{GAME_SPECIFIC_STRATEGY_HINTS}

## Tools Available

- **Read**: Load turn signal and game state
- **Write**: Write your action file

## Begin

Make your decision now and write your action file.
```

---

## Implementation Guide

### Step 1: Game Directory Structure

```
games/
└── {game-name}/
    ├── RULES.md              (game rules with YAML frontmatter)
    ├── state/                (runtime state files)
    │   ├── game-state.json
    │   ├── turn-signal.json
    │   └── player-actions/
    │       ├── player-1.json
    │       ├── player-2.json
    │       └── player-3.json
    ├── logs/                 (game logs)
    │   ├── game-{id}-live.jsonl
    │   └── game-{id}.json
    └── traces/               (optional detailed traces)
        └── game-{id}.md
```

### Step 2: Coordinator Implementation

```javascript
// In /start-game command or skill

async function startGame(gameName, numPlayers) {
  // 1. Load rules
  const rules = await Read(`games/${gameName}/RULES.md`);
  const config = parseYAMLFrontmatter(rules);

  // 2. Validate
  if (!config.players || !config.win_condition) {
    error("Invalid game configuration");
    return;
  }

  // 3. Create directories
  await Bash({
    command: `mkdir -p games/${gameName}/state/player-actions games/${gameName}/logs games/${gameName}/traces`
  });

  // 4. Spawn gamemaster
  const gamemasterPrompt = buildGamemasterPrompt(gameName, rules, numPlayers);

  await Task({
    subagent_type: "general-purpose",
    model: "sonnet",
    description: `Gamemaster for ${gameName}`,
    prompt: gamemasterPrompt,
    run_in_background: false // Block until game completes
  });

  // 5. Report completion
  const finalLog = await Read(`games/${gameName}/logs/game-*.json`);
  reportResults(finalLog);
}
```

### Step 3: Gamemaster Implementation

```markdown
Key points for gamemaster:

1. After initialization, enter turn loop
2. For each turn:
   a. Write turn-signal.json
   b. Build player-specific prompt with visible state
   c. Spawn player agent via Task tool (NOT inline simulation)
   d. Poll for player-actions/{player-id}.json
   e. Read and validate action
   f. Update game-state.json
   g. Append to JSONL log
   h. Check win condition
3. Exit loop when game ends
```

### Step 4: Player Implementation

```markdown
Player agent lifecycle:

1. Spawn with prompt containing:
   - Player ID
   - Turn number
   - Available actions
   - Visible game state
2. Agent reads turn-signal.json (for confirmation)
3. Agent reads game-state.json (for details)
4. Agent decides on action
5. Agent writes player-actions/{player-id}.json
6. Agent exits (terminates)
```

---

## Testing & Validation

### Unit Tests

1. **Schema Validation**:
   - game-state.json conforms to schema
   - turn-signal.json conforms to schema
   - player-actions/*.json conform to schema

2. **Agent Spawning**:
   - Gamemaster spawns actual subagents (check process list)
   - Players execute one-shot (spawn, write, exit)

3. **Information Hiding**:
   - Players cannot see other players' hands
   - Turn signal contains only visible state

### Integration Tests

1. **Turn Coordination**:
   - Gamemaster writes turn-signal
   - Player spawns and writes action
   - Gamemaster reads and validates action
   - State updates correctly

2. **Win Condition**:
   - Game detects winner correctly
   - Game ends when condition met
   - Final logs written

### Game-Specific Tests

1. Run game with known strategy
2. Verify actions follow rules
3. Check log completeness
4. Validate statistics

---

## Appendix A: Troubleshooting

### Issue: Player agent doesn't spawn

**Symptoms**: Gamemaster hangs waiting for action

**Diagnosis**:
- Check Task tool call in gamemaster logs
- Verify prompt syntax is correct
- Check if model is available (haiku)

**Fix**:
- Review gamemaster agent implementation
- Ensure Task tool uses `run_in_background: false` for synchronous execution
- Add timeout handling

---

### Issue: Player writes invalid action

**Symptoms**: Gamemaster rejects action repeatedly

**Diagnosis**:
- Check player prompt includes available actions clearly
- Review action validation logic in gamemaster
- Check if player has incorrect game state

**Fix**:
- Improve turn-signal.json clarity
- Add examples of valid actions to player prompt
- Add retry logic with clearer error messages

---

### Issue: Information leak

**Symptoms**: Player makes decisions based on hidden info

**Diagnosis**:
- Review turn-signal.json content
- Check if player prompt includes other players' hands

**Fix**:
- Filter game-state.json before including in turn-signal
- Only include public information in player prompts

---

## Appendix B: Performance Optimization

### Reduce Latency

1. **Use Haiku for Players**: Fast, cost-effective
2. **Parallel Player Spawns**: For simultaneous games (different matches)
3. **Minimize File I/O**: Batch state updates

### Reduce Cost

1. **Haiku for Players**: ~$0.001 per decision
2. **Sonnet Only for Gamemaster**: Complex reasoning needed
3. **Prompt Caching**: Reuse rules across turns

---

## Appendix C: Future Enhancements

### Hook-Based Triggering

When hooks work in subagent contexts:
- PostToolUse hook on Write(turn-signal.json) → auto-spawn player
- PostToolUse hook on Write(player-action.json) → notify gamemaster

### Agent Personalities

Add personality presets:
- Aggressive (risk-taking)
- Defensive (cautious)
- Balanced (mixed strategy)

Pass personality to player prompt for varied gameplay.

### Multi-Game Tournaments

Run N games in parallel with different random seeds, aggregate statistics.

---

## Appendix D: Reference Implementations

See existing games:
- `games/uno/` - Card game with color/number matching
- `games/markovs-chains/` - Probability-based racing game

Both demonstrate the coordination protocol in practice.
