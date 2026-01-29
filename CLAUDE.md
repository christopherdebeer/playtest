# Playtest - AI Game Playtesting Framework

AI-driven game playtesting framework with TypeScript engine orchestration and parallel player agents.

## Available Skills

| Skill | Description |
|-------|-------------|
| `/start-game <game> [players]` | Initialize and run a multi-agent game playtest |
| `/stop-game [game]` | Emergency halt of active game session |
| `/view-results [game]` | Analyze completed game logs and display results |

### Examples

```
/start-game uno 3
/stop-game
/view-results uno
```

## Architecture (v3 Engine-Driven)

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (skill)                     │
│  1. npx playtest init <game> --players <n>                  │
│  2. Spawn gamemaster (sonnet) + player agents (haiku)       │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - State management (games/<game>/state/game.json)          │
│  - Turn blocking (npx playtest wait)                        │
│  - Randomization (npx playtest roll)                        │
│  - Deck operations (npx playtest draw/play/discard)         │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │ Player 1  │        │ Player 2  │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │ Validates │        │ Decides   │        │ Decides   │
    └───────────┘        └───────────┘        └───────────┘
```

## Project Structure

```
games/<game-name>/           # Game definitions and runtime
├── RULES.md                # Game rules (YAML frontmatter + markdown)
├── state/                  # Active game state (gitignored)
│   └── game.json          # Authoritative state managed by engine
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
├── README.md              # Mechanics documentation
├── action/                # Action-related mechanics
├── auction/               # Auction and bidding variants
├── cards/                 # Card game mechanics (hand-management, etc.)
├── cooperative/           # Co-op and team mechanics
├── dice/                  # Dice and randomness
├── movement/              # Movement mechanics
└── .../                   # 17 categories total

skills/                      # Claude Code skills
├── start-game/            # Launch multi-agent playtest
├── stop-game/             # Emergency halt and cleanup
└── view-results/          # Analyze game logs
```

## Engine CLI Reference

```bash
# Game lifecycle
npx playtest init <game> -p <n>              # Initialize game
npx playtest reset <game> [-p <n>]           # Reset (optionally reinit)
npx playtest end <game> -w <id> -r '<why>'   # End game with winner

# Player commands (agents use these)
npx playtest wait <game> -p <id>             # Block until your turn
npx playtest submit <game> -p <id> -a '{}'   # Submit action

# Gamemaster commands
npx playtest pending <game>                  # Wait for player action
npx playtest advance <game>                  # Next player's turn
npx playtest state <game>                    # Full game state

# Game mechanics
npx playtest roll <game> --probability <p>   # Probability check
npx playtest draw <game> -p <id> -n <count>  # Draw cards
npx playtest play <game> -p <id> -c '<name>' # Play card by name

# Info
npx playtest status <game>                   # Game status
npx playtest rules <game>                    # Get rules markdown

# Mechanics reference (from mechanics/ folder)
npx playtest mechanic --list                 # List all categories
npx playtest mechanic -c <category>          # List mechanics in category
npx playtest mechanic <slug|id|name>         # Look up mechanic
npx playtest mechanic <query>                # Search mechanics
npx playtest mechanic <slug> --markdown      # Full description
```

## Quick Start

1. Start a game: `/start-game uno 3`
2. Monitor progress: `npx playtest status uno`
3. View results: `/view-results uno`
