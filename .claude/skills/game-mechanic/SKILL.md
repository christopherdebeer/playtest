---
name: game-mechanic
description: Game design assistant for exploring mechanics, authoring new games, and refining existing ones. Use when the user asks to "explore mechanics", "create a game", "suggest mechanics", "analyze game rules", "validate game", or wants help with game design.
argument-hint: <command> [args...] (explore|suggest|analyze|author|validate|refine)
allowed-tools: Read, Bash, Glob, Grep, Write, Edit
---

# Game Mechanic Design Assistant

This skill helps users explore the 192-mechanic library, author new games, analyze existing game compositions, and refine game designs through targeted playtesting.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                   /game-mechanic Skill                               │
│  explore | suggest | analyze | author | validate | refine            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Resources                                        │
│  - mechanics/index.json (192 mechanics, 17 categories)              │
│  - src/mechanics/*.ts (implemented engine mechanics)                 │
│  - games/*/RULES.md (existing game definitions)                      │
│  - ./playtest CLI (mechanic lookup, validation, playtesting)        │
└─────────────────────────────────────────────────────────────────────┘
```

## Commands

### `explore` - Navigate the Mechanics Library

Browse and search the mechanics library by category, keyword, or similarity.

**Usage:**
- `/game-mechanic explore` - List all categories
- `/game-mechanic explore cards` - List mechanics in a category
- `/game-mechanic explore auction-english` - Details on specific mechanic
- `/game-mechanic explore --similar set-collection` - Find related mechanics

**Implementation:**
```bash
# List categories
./playtest mechanic --list

# Browse category
./playtest mechanic --category cards

# Lookup specific mechanic
./playtest mechanic auction-english --markdown

# For similarity, read mechanic details and find related by category/keywords
```

### `suggest` - AI-Powered Mechanic Recommendations

Get mechanic suggestions based on design goals, themes, or constraints.

**Usage:**
- `/game-mechanic suggest --theme pirates` - Mechanics for theme
- `/game-mechanic suggest --like catan` - Similar to known game
- `/game-mechanic suggest --complexity light` - By complexity level
- `/game-mechanic suggest --players 2 --duration 30` - By constraints

**Implementation:**
1. Parse user criteria (theme, player count, duration, complexity)
2. Read mechanics/index.json to get full mechanic list
3. For each relevant category, use ./playtest mechanic to get details
4. Recommend mechanics that fit criteria with explanations
5. Suggest example configurations

### `analyze` - Understand Game Composition

Analyze an existing game's mechanics and structure.

**Usage:**
- `/game-mechanic analyze markovs-chains` - Analyze existing game
- `/game-mechanic analyze ./my-game/RULES.md` - Analyze custom rules file

**Implementation:**
```bash
# Read game rules
cat games/{game}/RULES.md

# Extract mechanics from YAML frontmatter
# - mechanics: array of slugs from library
# - engine_mechanics: implemented TypeScript mechanics

# For each mechanic, lookup details
./playtest mechanic {slug} --json
```

Output should include:
- Mechanics used (from library reference)
- Engine mechanics enabled (with configs)
- Missing/recommended mechanics
- Potential conflicts or synergies

### `author` - Create New Games

Scaffold a new game with selected mechanics.

**Usage:**
- `/game-mechanic author my-game --mechanics hand-management,set-collection`
- `/game-mechanic author auction-game --template auction`

**Implementation:**
1. Create games/{name}/ directory
2. Generate RULES.md with:
   - YAML frontmatter with mechanics configuration
   - Markdown sections for Overview, Setup, Gameplay, Winning, Card Types
3. Include engine_mechanics config for selected TypeScript mechanics
4. Add placeholder deck/board configuration
5. Run validation

**RULES.md Template Structure:**
```yaml
---
name: "Game Name"
version: "1.0"
players: 2-4
starting_cards: 5
win_condition: "Description of how to win"
max_rounds: 50

mechanics:
  - hand-management
  - set-collection

engine_mechanics:
  action_points:
    points_per_turn: 3
    action_costs:
      move: 1
      play_card: 1

deck:
  - { name: "Card", count: 4, type: "action", effect: { type: "draw", value: 2 } }

board:
  states: ["Start", "A", "B", "Victory"]
  start: "Start"
  edges:
    - { from: "Start", to: "A", probability: 0.7 }
---

# Game Name

## Overview
Brief description of the game theme and goal.

## Setup
How to set up the game...

## Gameplay
Turn structure and actions...

## Winning
Victory conditions...

## Card Types
Description of each card type...
```

### `validate` - Check Game Rules

Validate a RULES.md file for errors and warnings.

**Usage:**
- `/game-mechanic validate markovs-chains`
- `/game-mechanic validate ./my-game/RULES.md`

**Implementation:**
```bash
# Use engine validation
./playtest validate {game-or-path}
```

Check for:
- YAML syntax errors
- Missing required fields
- Invalid mechanic slugs
- Deck/board configuration issues
- Unreachable board states
- Mechanic conflicts

### `refine` - Improve Game Design

Analyze playtest results and suggest improvements.

**Usage:**
- `/game-mechanic refine markovs-chains` - Review recent playtests
- `/game-mechanic refine markovs-chains --hypothesis "games end too quickly"`

**Implementation:**
1. Read recent logs from games/{game}/logs/*.jsonl
2. Analyze patterns:
   - Average game length
   - Win rate by player position
   - Most/least used actions
   - Common failure points
3. Suggest improvements:
   - Balance adjustments
   - New mechanics to add
   - Configuration tweaks
4. Recommend targeted playtest

## Engine Mechanics Reference

These mechanics have TypeScript implementations in src/mechanics/:

| Mechanic | Config Key | Description |
|----------|------------|-------------|
| Action Points | `action_points` | Budget points per turn |
| Area Movement | `area_movement` | Move between named areas |
| Automatic Resource Growth | `automatic_resource_growth` | Resources that grow over time |
| Catch The Leader | `catch_the_leader` | Balancing mechanic |
| Chaining | `chaining` | Actions trigger follow-ups |
| Closed Drafting | `closed_drafting` | Simultaneous drafting with passing |
| Deck Building | `deck_building` | Personal deck acquisition |
| Events | `events` | Random/scheduled game events |
| Ladder Climbing | `ladder_climbing` | Beat previous play or pass |
| Movement Points | `movement_points` | Movement budget per turn |
| Multi-Use Cards | `multi_use_cards` | Cards with multiple uses |
| Once Per Game Abilities | `once_per_game_abilities` | Special one-time powers |
| Open Drafting | `open_drafting` | Draft from visible pool |
| Point-to-Point Movement | `point_to_point_movement` | Graph-based movement |
| Push Your Luck | `push_your_luck` | Risk/reward dice rolling |
| Race Win | `win_race` | First to reach goal wins |
| Set Collection | `set_collection` | Collect matching cards |
| Sudden Death Ending | `sudden_death_ending` | Instant win conditions |
| Trick Taking | `trick_taking` | Card trick mechanics |
| Variable Powers | `variable_powers` | Asymmetric player abilities |

## Workflow Examples

### Creating a New Game

```
User: /game-mechanic author treasure-hunt --theme pirates

Steps:
1. Suggest mechanics fitting "pirates" theme:
   - area-movement (sailing between islands)
   - push-your-luck (risky treasure hunting)
   - set-collection (collect treasure sets)
   - variable-player-powers (different ship types)

2. Create games/treasure-hunt/RULES.md with scaffolded content

3. Run validation: ./playtest validate treasure-hunt

4. Suggest: "/playtest treasure-hunt 3" to test
```

### Analyzing and Refining

```
User: /game-mechanic analyze markovs-chains

Steps:
1. Read games/markovs-chains/RULES.md
2. List mechanics used
3. Check for missing synergies
4. Review any recent playtest logs
5. Suggest improvements
```

## Integration with /playtest

After authoring or refining a game, suggest testing:
```
/playtest {game-name} {num-players}
```

Review playtest logs for refinement:
```
games/{game}/logs/{instance}.jsonl
```
