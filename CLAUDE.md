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
/start-game uno 3
/stop-game uno-1706789012345
/view-results uno
```

## Architecture (v4 Instance-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                     Coordinator (skill)                     │
│  1. npx playtest init <game> --players <n>                  │
│  2. Parse instanceId from output                            │
│  3. Spawn agents with instance IDs                          │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Engine                         │
│  - Instance management (state/<instanceId>/game.json)       │
│  - Registration returns rules (npx playtest register)       │
│  - Turn blocking (npx playtest wait)                        │
│  - Concurrent game instances supported                       │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │ Player 1  │        │ Player 2  │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │ register→ │        │ register→ │        │ register→ │
    │   rules   │        │   rules   │        │   rules   │
    └───────────┘        └───────────┘        └───────────┘
```

## Project Structure

```
games/<game-name>/           # Game definitions and runtime
├── RULES.md                # Game rules (YAML frontmatter + markdown)
├── state/                  # Active game instances (gitignored)
│   └── <instanceId>/      # Per-instance state directory
│       └── game.json      # Authoritative state managed by engine
└── logs/                   # Game logs
    └── <instanceId>.jsonl # Event stream per instance

engine/                      # TypeScript game engine
├── src/                    # Source code
│   ├── index.ts           # CLI entry point
│   ├── game.ts            # State management + instance resolution
│   ├── rules.ts           # YAML/markdown parsing + mechanics
│   └── types.ts           # Type definitions
├── dist/                   # Compiled output
└── ARCHITECTURE.md        # Detailed architecture docs

mechanics/                   # BGG game mechanics database (192 mechanics)
├── index.json             # Master index with all mechanics
├── README.md              # Mechanics documentation
└── <category>/            # 17 categories total

skills/                      # Claude Code skills
├── start-game/            # Launch multi-agent playtest
├── stop-game/             # Emergency halt and cleanup
└── view-results/          # Analyze game logs
```

## Engine CLI Reference

```bash
# Game lifecycle
npx playtest init <game> -p <n>              # Initialize instance, get spawn instructions
npx playtest list [game]                     # List active instances
npx playtest reset <instance> [-p <n>]       # Reset (optionally reinit)
npx playtest end <instance> -w <id> -r 'why' # End game with winner

# Agent registration (returns rules - agents use this FIRST)
npx playtest register <instance> -r <role> -a <agentId> [-p <playerId>]

# Player commands (agents use these)
npx playtest wait <instance> -p <id>         # Block until your turn
npx playtest act <instance> -p <id> -a '{}'  # Execute action directly

# Gamemaster commands
npx playtest pending <instance>              # Wait for adjudication request
npx playtest adjudicate <instance> ...       # Rule on contests/resignations
npx playtest state <instance>                # Full game state

# Game mechanics
npx playtest roll <instance> --probability <p>   # Probability check
npx playtest draw <instance> -p <id> -n <count>  # Draw cards
npx playtest play <instance> -p <id> -c '<name>' # Play card by name

# Info
npx playtest status <instance>               # Game status (name or instanceId)
npx playtest rules <instance>                # Get rules markdown

# Mechanics reference (from mechanics/ folder)
npx playtest mechanic --list                 # List all categories
npx playtest mechanic -c <category>          # List mechanics in category
npx playtest mechanic <slug|id|name>         # Look up mechanic
npx playtest mechanic <query>                # Search mechanics
```

## Key Concepts

### Instance IDs

Each game session has a unique instance ID (e.g., `uno-1706789012345`). This enables:
- Multiple concurrent games of the same type
- Unambiguous command targeting
- Clean state isolation

Commands accept either game name (resolves to most recent instance) or full instance ID.

### Agent Registration

Agents register with the instance to receive rules:

```bash
# Gamemaster registers
npx playtest register uno-1706789012345 -r gamemaster -a gm-agent

# Player registers
npx playtest register uno-1706789012345 -r player -a p1-agent -p player-1
```

Registration returns the full rules and config, eliminating the need for a separate `rules` command during gameplay.

## Quick Start

1. Start a game: `/start-game uno 3`
2. Note the instance ID in the output
3. Monitor progress: `npx playtest status <instanceId>`
4. View results: `/view-results <instanceId>`
