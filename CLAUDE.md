# Playtest - AI Game Playtesting Framework

AI-driven game playtesting framework with gamemaster orchestration and parallel player agents.

## Available Skills

These skills are available via `/skill-name` or Claude will use them when contextually relevant:

| Skill | Description |
|-------|-------------|
| `/start-game <game> [players]` | Initialize and run a multi-agent game playtest |
| `/stop-game [game]` | Emergency halt of active game session |
| `/view-results [game]` | Analyze completed game logs and display results |

### Examples

```
/start-game markovs-chains 3
/stop-game
/view-results markovs-chains
```

## Background Skills (Auto-Invoked)

These skills provide implementation guidance and Claude loads them automatically when relevant:

- **File Protocol** (`skills/file-protocol/SKILL.md`): File-based agent communication, JSON state management, atomic writes
- **Game Coordination** (`skills/game-coordination/SKILL.md`): Gamemaster agents, player spawning, multi-agent orchestration
- **Hook Sync** (`skills/hook-sync/SKILL.md`): Event-driven agent triggering, file change detection

## Project Structure

```
games/<game-name>/           # Game definitions and runtime
├── RULES.md                # Game rules (YAML frontmatter + markdown)
├── state/                  # Active game state files (gitignored)
│   ├── game-state.json    # Authoritative state
│   ├── turn-signal.json   # Turn notifications
│   └── player-actions/    # Player decisions
└── logs/                   # Game logs (tracked in git)
    ├── game-*-live.jsonl  # Live event stream
    └── debug/             # Debug captures with timing analysis

engine/                      # Core engine
├── templates/              # Game-agnostic agent prompt templates
├── schemas/                # JSON schemas
└── *.md                    # Architecture docs

scripts/actions/             # Encapsulated action scripts
├── gamemaster/             # wait-for-action, signal-turn, end-game
├── player/                 # wait-for-turn, submit-action
└── common/                 # send-message, read-messages

.claude/skills/             # Native Claude Code skills
.claude/hooks/              # Agent lifecycle hooks (debug capture)
```

## Quick Start

1. Start a game: `/start-game markovs-chains 3`
2. Monitor progress in `games/markovs-chains/state/`
3. View results: `/view-results markovs-chains`
