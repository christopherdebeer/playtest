# Playtest - AI Game Playtesting Framework

This project is an AI-driven game playtesting framework with gamemaster orchestration and parallel player agents.

## Available Commands

When the user requests any of these commands, follow the instructions in the referenced file:

### `/playtest:start-game <game-name> [num-players]`
Initialize and run a game with coordinated multi-agent architecture.
**Instructions**: Read and follow `commands/start-game.md`

### `/playtest:stop-game [game-name]`
Emergency halt of active game session.
**Instructions**: Read and follow `commands/stop-game.md`

### `/playtest:view-results [game-name] [log-file]`
Analyze completed game logs and display results.
**Instructions**: Read and follow `commands/view-results.md`

## Skills (Auto-Invoked)

These skills provide implementation guidance and should be referenced when relevant:

- **File Protocol** (`skills/file-protocol/SKILL.md`): Use when implementing file-based agent communication, JSON state management, atomic writes, or race condition handling.

- **Game Coordination** (`skills/game-coordination/SKILL.md`): Use when implementing gamemaster agents, spawning player agents, or coordinating multiple agents in parallel.

- **Hook Sync** (`skills/hook-sync/SKILL.md`): Use when implementing hook-based coordination or event-driven agent triggering.

## Project Structure

```
games/                    # Game definitions and runtime state
├── <game-name>/
│   ├── RULES.md         # Game rules with YAML frontmatter
│   ├── state/           # Active game state files
│   └── logs/            # Game logs (JSONL)

engine/                   # Core engine components
├── templates/           # Agent prompt templates
├── schemas/             # JSON schemas for validation
└── *.md                 # Architecture documentation

commands/                 # Slash command implementations
skills/                   # Skill definitions
hooks/                    # Hook configurations
```

## Quick Start

To start a game:
```
/playtest:start-game markovs-chains 3
```

To view results after a game:
```
/playtest:view-results markovs-chains
```

## How Commands Work

When you invoke a `/playtest:*` command:
1. Read the corresponding `commands/*.md` file
2. Follow the implementation steps exactly
3. Use the allowed tools specified in the command's frontmatter
4. Reference skills as needed for implementation details
