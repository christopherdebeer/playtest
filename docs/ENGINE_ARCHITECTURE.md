# Playtest Engine Architecture v3

## Design Principles

1. **Engine owns state** - All game state, randomization, and validation handled by TypeScript engine
2. **Agents make decisions** - Gamemaster interprets rules, players choose actions
3. **Game-agnostic core** - Engine works with any game via config from RULES.md
4. **CLI interface** - Agents interact via `npx playtest <command>` calls
5. **Blocking waits** - Engine handles turn synchronization (not agents)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Gamemaster  │  │   Player 1   │  │   Player 2   │  ...     │
│  │    Agent     │  │    Agent     │  │    Agent     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          │  npx playtest   │  npx playtest   │  npx playtest
          │  <command>      │  <command>      │  <command>
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    CLI Router                            │   │
│  │  init | register | wait | act | roll | draw | end       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │   Game   │ │   Turn   │ │   Deck   │ │   Rules Parser   │   │
│  │  State   │ │ Manager  │ │ Manager  │ │  (YAML + NL)     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      File System                                 │
│  games/<game>/state/game.json     (authoritative state)         │
│  games/<game>/state/pending.json  (pending actions queue)       │
│  games/<game>/logs/<id>.jsonl     (event log)                   │
│  games/<game>/RULES.md            (game config + rules)         │
└─────────────────────────────────────────────────────────────────┘
```

## CLI Commands

### Game Lifecycle

```bash
# Initialize new game (coordinator calls this)
npx playtest init <game> --players <n>
# Returns: { gameId, status: "waiting_for_players" }

# Register agent as role (called by agent-start hook)
npx playtest register <game> --role <gamemaster|player> --agent-id <id>
# Returns: { role, playerId?, rules, instructions }

# Get current game status
npx playtest status <game>
# Returns: { gameId, status, turn, currentPlayer, players }
```

### Turn Management

```bash
# Block until it's this player's turn (long-running, up to timeout)
npx playtest wait <game> --player <id> --timeout <seconds>
# Returns: { status: "your_turn"|"game_over", state, hand, opponents }

# Execute player action directly (contest-based system)
npx playtest act <game> --player <id> --action '<json>'
# Returns: { success, effect, validation, gameState }
```

### Game Mechanics (Engine Handles Randomization)

```bash
# Roll probability check (e.g., movement)
npx playtest roll <game> --probability <0.0-1.0> --context '<description>'
# Returns: { roll, threshold, success, logged: true }

# Draw cards from deck
npx playtest draw <game> --player <id> --count <n>
# Returns: { cards: [...], deckRemaining }

# Shuffle deck or discard pile
npx playtest shuffle <game> --target <deck|discard>
# Returns: { shuffled: true, count }
```

### Gamemaster Functions

```bash
# Apply effect to player (gamemaster validates action)
npx playtest effect <game> --player <id> --effect '<json>'
# Returns: { applied, newState }

# End game with winner
npx playtest end <game> --winner <id> --reason '<text>'
# Returns: { gameId, winner, totalTurns, logged: true }

# Request rule interpretation (escalation from player)
npx playtest ruling <game> --question '<text>'
# Returns: { pending: true, questionId }  (gamemaster answers async)
```

## Agent Roles

### Gamemaster Agent

**Responsibilities:**
- Read and interpret game rules from RULES.md
- Process player actions (validate against rules)
- Resolve complex rule interactions
- Decide edge cases and ambiguities
- End game when win condition met

**Does NOT:**
- Handle randomization (engine does dice/probability)
- Manage deck operations (engine shuffles/draws)
- Track state (engine owns game state)
- Make player decisions

**Prompt Pattern:**
```
You are the GAMEMASTER for {game}.
Your role is to interpret rules and validate player actions.

RULES:
{rules_markdown}

COMMANDS AVAILABLE:
- npx playtest status {game}     # Check game state
- npx playtest pending {game}    # Wait for contests
- npx playtest adjudicate ...    # Rule on contests
- npx playtest end ...           # Declare winner

Wait for contests via pending. If a player contests, adjudicate the dispute.
```

### Player Agent

**Responsibilities:**
- Wait for their turn
- Analyze visible game state
- Choose optimal action from legal options
- Submit action with reasoning

**Does NOT:**
- See other players' hands
- Control randomization
- Interpret ambiguous rules (escalate to gamemaster)
- Access opponent private state

**Prompt Pattern:**
```
You are PLAYER {id} in {game}.
Your goal is to WIN by {win_condition}.

RULES SUMMARY:
{rules_summary}

COMMANDS AVAILABLE:
- npx playtest wait {game} --player {id}   # Wait for your turn
- npx playtest act {game} --player {id} --action '<json>'

When it's your turn, analyze your options and execute the best action.
```

## State Management

### game.json Structure

```json
{
  "gameId": "markovs-chains-1234567890",
  "gameName": "markovs-chains",
  "status": "in_progress",
  "turn": 5,
  "currentPlayer": "player-2",
  "players": {
    "player-1": {
      "agentId": "abc123",
      "state": { /* game-specific */ },
      "hand": [ /* private, not exposed to other players */ ],
      "effects": []
    },
    "player-2": { /* ... */ }
  },
  "shared": {
    /* game-specific shared state (board, discard pile, etc.) */
  },
  "deck": [ /* hidden from all */ ],
  "config": {
    /* parsed from RULES.md frontmatter */
  }
}
```

### Information Hiding

Engine automatically filters state based on role:

| Requester | Sees Own Hand | Sees Others' Hands | Sees Deck | Sees Full State |
|-----------|---------------|-------------------|-----------|-----------------|
| Player    | Yes           | No (count only)   | No        | No              |
| Gamemaster| Yes (all)     | Yes (all)         | Yes       | Yes             |

## Rules Parser

RULES.md format:

```yaml
---
name: "Game Name"
version: "1.0"
players: 2-4
win_condition: "First to reach Victory state"
max_turns: 15

# Structured config for engine
deck:
  - name: "Card A"
    count: 4
    effect: { type: "boost", value: 0.2 }
  - name: "Card B"
    count: 3
    effect: { type: "block", duration: 1 }

board:
  states: ["Start", "A", "B", "C", "Victory"]
  edges:
    - from: "Start"
      to: ["A", "B", "C"]
      probability: 0.65
    - from: ["A", "B", "C"]
      to: "Victory"
      probability: 0.55
---

# Game Name - Rules

Natural language rules for gamemaster interpretation...
```

The engine:
1. Parses YAML frontmatter for structured config
2. Passes full markdown to gamemaster for interpretation
3. Uses structured config for deck/board initialization
4. Defers ambiguous situations to gamemaster

## Event Flow

### Game Start
1. Coordinator calls `npx playtest init markovs-chains --players 2`
2. Engine creates game.json with status "waiting_for_players"
3. Coordinator spawns gamemaster + player agents
4. Each agent's start hook calls `npx playtest register`
5. When all registered, engine sets status "in_progress"
6. Engine signals first player's turn

### Turn Execution
1. Player calls `npx playtest wait` (blocks)
2. Engine returns state when it's their turn
3. Player analyzes and calls `npx playtest act`
4. Engine validates action schema and game rules
5. Engine executes action directly (contest-based)
6. If another player contests, gamemaster adjudicates
7. Engine updates state, logs event
8. Engine signals next player

### Game End
1. Gamemaster detects win condition
2. Calls `npx playtest end --winner player-1 --reason "Reached Victory"`
3. Engine logs final event, sets status "completed"
4. All waiting agents receive "game_over" response

## File Structure

```
playtest/
├── engine/
│   ├── src/
│   │   ├── index.ts        # CLI entry (commander.js)
│   │   ├── commands/       # CLI command handlers
│   │   ├── game.ts         # Game state management
│   │   ├── turns.ts        # Turn blocking/signaling
│   │   ├── deck.ts         # Deck operations
│   │   ├── rules.ts        # YAML + markdown parser
│   │   └── types.ts        # TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── games/
│   └── <game>/
│       ├── RULES.md        # Game definition
│       └── state/          # Runtime (gitignored)
├── .claude/
│   ├── agents/
│   │   ├── gamemaster.md   # Game-agnostic
│   │   └── player.md       # Game-agnostic
│   └── hooks/
│       └── agent-start.sh  # Registration hook
└── skills/
    └── start-game/
        └── SKILL.md        # Entry point
```

## Key Differences from v2

| Aspect | v2 (Current) | v3 (New) |
|--------|--------------|----------|
| State ownership | Agents manage | Engine manages |
| Randomization | Agents roll | Engine rolls |
| Validation | Gamemaster does all | Engine validates format, GM validates rules |
| Turn sync | Bash inotifywait | Engine blocks on wait command |
| Information hiding | Manual in prompts | Engine filters automatically |
| Game specifics | Hardcoded in prompts | Parsed from RULES.md |
| CLI interface | Multiple bash scripts | Single `npx playtest` entry |
