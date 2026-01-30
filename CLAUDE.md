# Playtest - AI Game Playtesting Framework

AI-driven game playtesting framework with TypeScript engine orchestration and parallel player agents.

## Available Skills

| Skill | Description |
|-------|-------------|
| `/start-game <game> [players]` | Initialize and run a multi-agent game playtest |
| `/stop-game [instance]` | Emergency halt of active game session |
| `/view-results [instance]` | Analyze completed game logs and display results |

### Examples

```
/start-game markovs-chains 2
/stop-game mc-a1b2c3
/view-results mc-a1b2c3
```

## Architecture (v4 Instance-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (skill)                     │
│  1. npx playtest init <game> --players <n>                  │
│     → Returns instance ID + spawn instructions              │
│  2. Spawn agents with instance ID from spawn instructions   │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - Instance-based state (games/<game>/state/<instance>.json)│
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
    │ Register  │        │ Register  │        │ Register  │
    │ Pending   │        │ Wait/Act  │        │ Wait/Act  │
    └───────────┘        └───────────┘        └───────────┘
```

## Project Structure

```
games/<game-name>/           # Game definitions and runtime
├── RULES.md                # Game rules (YAML frontmatter + markdown)
├── state/                  # Active game state (gitignored)
│   └── <instance>.json    # State per instance (e.g., mc-a1b2c3.json)
└── logs/                   # Game logs
    └── <gameId>.jsonl     # Event stream

engine/                      # TypeScript game engine
├── src/                    # Source code
│   ├── index.ts           # CLI entry point
│   ├── game.ts            # State management
│   ├── rules.ts           # YAML/markdown parsing + mechanics
│   └── types.ts           # Type definitions
├── dist/                   # Compiled output
└── ARCHITECTURE.md        # Detailed architecture docs

mechanics/                   # BGG game mechanics database (192 mechanics)
├── index.json             # Master index with all mechanics
└── <category>/            # 17 categories total

skills/                      # Claude Code skills
├── start-game/            # Launch multi-agent playtest
├── stop-game/             # Emergency halt and cleanup
└── view-results/          # Analyze game logs
```

## Engine CLI Reference

```bash
# Game lifecycle - returns instance ID and spawn instructions
npx playtest init <game> -p <n>              # Initialize game instance
npx playtest reset <instance> [-p <n>]       # Reset (optionally reinit)
npx playtest end <instance> -w <id> -r '<why>'  # End game with winner

# Registration - returns rules + config (agents call this FIRST)
npx playtest register <instance> --role <role> [--player <id>]

# Player commands (agents use these)
npx playtest wait <instance> -p <id>         # Block until your turn
npx playtest act <instance> -p <id> -a '{}'  # Execute action directly

# Gamemaster commands
npx playtest pending <instance>              # Wait for player action
npx playtest adjudicate <instance> [opts]    # Adjudicate events
npx playtest state <instance>                # Full game state

# Game mechanics
npx playtest roll <instance> --probability <p>   # Probability check
npx playtest draw <instance> -p <id> -n <count>  # Draw cards
npx playtest play <instance> -p <id> -c '<name>' # Play card by name

# Info
npx playtest status <instance>               # Game status
npx playtest rules <game>                    # Get rules markdown (by game name)

# Mechanics reference (from mechanics/ folder)
npx playtest mechanic --list                 # List all categories
npx playtest mechanic -c <category>          # List mechanics in category
npx playtest mechanic <slug|id|name>         # Look up mechanic
npx playtest mechanic <query>                # Search mechanics
npx playtest mechanic <slug> --markdown      # Full description
```

## Agent Flow (v4)

1. **Agent spawns** with prompt containing `INSTANCE` and `PLAYER_ID`
2. **Agent registers**: `npx playtest register {INSTANCE} --role player --player {PLAYER_ID}`
   - Returns rules, config, and game status
3. **Agent enters wait loop**: `npx playtest wait {INSTANCE} -p {PLAYER_ID}`
4. **Agent acts**: `npx playtest act {INSTANCE} -p {PLAYER_ID} -a '{...}'`

## Quick Start

1. Start a game: `/start-game markovs-chains 2`
2. Get instance ID from output (e.g., `mc-a1b2c3`)
3. Monitor progress: `npx playtest status mc-a1b2c3`
4. View results: `/view-results mc-a1b2c3`

## Key Benefits (v4)

- **Concurrent instances**: Multiple games of same type can run simultaneously
- **Explicit agent flow**: Register → Wait → Act (no hook-based rules injection)
- **Instance IDs**: Short, unique identifiers (e.g., `mc-a1b2c3`)
- **Spawn instructions**: Init returns exact prompts for spawning agents
