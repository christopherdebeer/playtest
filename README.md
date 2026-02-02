# Playtest

AI-driven game playtesting framework with TypeScript engine and multi-agent orchestration.

## Overview

Playtest enables automated testing of board/card games using:
- **TypeScript Engine**: Manages state, randomization, turns, and deck operations
- **Gamemaster Agent**: Interprets rules and validates player actions
- **Player Agents**: Compete to win using strategic decision-making

## Installation

### As a Claude Code Plugin (Recommended)

Install directly from GitHub:

```bash
claude plugin add https://github.com/christopherdebeer/playtest
```

This gives you access to:
- `/start-game` - Initialize multi-agent playtesting
- `/stop-game` - Emergency halt active sessions
- `/view-results` - Analyze game logs
- Automatic agent definitions (gamemaster, player)
- SubagentStart hooks for injecting game rules

### As a Standalone Project

Clone the repository for local development:

```bash
git clone https://github.com/christopherdebeer/playtest
cd playtest
npm install
npm run build
```

## Quick Start

```bash
# Initialize a game
cd engine && ./playtest init markovs-chains --players 2

# Or use the skill
/playtest markovs-chains 2
```

## Directory Structure

```
playtest/
├── .claude-plugin/         # Plugin manifest (for Claude Code)
│   └── plugin.json        # Plugin metadata and configuration
├── agents/                # Game-agnostic agent definitions (symlink to .claude/agents/)
│   ├── gamemaster.md
│   └── player.md
├── skills/                # Claude Code skills
│   ├── start-game/
│   ├── stop-game/
│   └── view-results/
├── hooks/                 # SubagentStart hooks
│   ├── player-start-hook.sh
│   └── gamemaster-start-hook.sh
├── engine/                # TypeScript game engine
│   ├── src/              # Engine source code
│   └── ARCHITECTURE.md   # v3 architecture docs
└── games/                # Game definitions
    ├── markovs-chains/   # Probability-based racing game
    │   └── RULES.md     # Game rules + structured config
    └── uno/             # Classic card game
        └── RULES.md
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
./playtest init <game> -p <n>          # Initialize game
./playtest status <game>               # Check status
./playtest wait <game> -p <id>         # Wait for turn (blocking)
./playtest act <game> -p <id> -a ..    # Execute action
./playtest roll <game> --probability   # Probability roll
./playtest draw <game> -p <id>         # Draw cards
./playtest end <game> -w <id> -r ..    # End game
```

## Available Games

- **markovs-chains**: Probability-based racing game with card effects
- **uno**: Classic card matching game

## Skills

- `/playtest <game> [players]` - Start a playtest