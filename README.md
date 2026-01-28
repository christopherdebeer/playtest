# Playtest

AI-driven game playtesting framework with TypeScript engine and multi-agent orchestration.

## Overview

Playtest enables automated testing of board/card games using:
- **TypeScript Engine**: Manages state, randomization, turns, and deck operations
- **Gamemaster Agent**: Interprets rules and validates player actions
- **Player Agents**: Compete to win using strategic decision-making

## Quick Start

```bash
# Initialize a game
cd engine && npx playtest init markovs-chains --players 2

# Or use the skill
/start-game markovs-chains 2
```

## Directory Structure

```
playtest/
├── engine/                 # TypeScript game engine
│   ├── src/               # Engine source code
│   └── ARCHITECTURE.md    # v3 architecture docs
├── games/                 # Game definitions
│   ├── markovs-chains/    # Probability-based racing game
│   │   └── RULES.md      # Game rules + structured config
│   └── uno/              # Classic card game
│       └── RULES.md
├── .claude/
│   └── agents/           # Game-agnostic agent definitions
│       ├── gamemaster.md
│       └── player.md
└── skills/               # Claude Code skills
    ├── start-game/
    ├── stop-game/
    └── view-results/
```

## Game Configuration

Games are defined in `games/<game>/RULES.md` with YAML frontmatter:

```yaml
---
name: "Game Name"
players: 2-4
starting_cards: 7
win_condition: "First to empty hand"
max_turns: 100

deck:
  - { name: "Card A", count: 4, type: "action", effect: { type: "skip" } }
  - { name: "Card B", count: 2, type: "wild", effect: { type: "wild" } }

board:  # optional
  states: ["Start", "Middle", "End"]
  edges:
    - { from: "Start", to: "Middle", probability: 0.7 }
---

# Game Rules

Natural language rules for gamemaster interpretation...
```

## Engine CLI

```bash
npx playtest init <game> -p <n>          # Initialize game
npx playtest status <game>               # Check status
npx playtest wait <game> -p <id>         # Wait for turn (blocking)
npx playtest submit <game> -p <id> -a .. # Submit action
npx playtest roll <game> --probability   # Probability roll
npx playtest draw <game> -p <id>         # Draw cards
npx playtest end <game> -w <id> -r ..    # End game
```

## Available Games

- **markovs-chains**: Probability-based racing game with card effects
- **uno**: Classic card matching game

## Skills

- `/start-game <game> [players]` - Start a playtest
- `/stop-game [game]` - Emergency halt
- `/view-results [game]` - Analyze logs
