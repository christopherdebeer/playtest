# Game Playtester Plugin

AI-driven game playtesting framework for Claude Code that enables automated playtesting of card games using a gamemaster orchestration pattern with parallel player agents.

## Overview

This plugin provides a generic framework for testing card game rules and balance by:
- **Gamemaster agent**: Enforces rules impartially and orchestrates gameplay
- **Player agents**: Act as competitive players trying to win (spawned dynamically as Haiku agents)
- **File-based communication**: Agents coordinate via structured JSON files
- **Hook synchronization**: Event-driven architecture triggers agents based on game state changes

## Use Cases

- **Game design iteration**: Rapidly test rule variations
- **Balance analysis**: Identify dominant strategies or broken mechanics
- **Rule clarity testing**: Find ambiguous or confusing rule interactions
- **Automated QA**: Run hundreds of games to find edge cases

## Quick Start

1. Create a game configuration in `games/<game-name>/RULES.md`
2. Run `/game-playtester:start-game uno` to start a game session
3. Watch as the gamemaster and player agents play automatically
4. View results with `/game-playtester:view-results`

## Game Configuration

Games are defined in `games/<game-name>/RULES.md` using markdown with YAML frontmatter:

```markdown
---
name: "Game Name"
players: 2-4
cards_per_player: 7
deck_size: 108
special_mechanics:
  - skip
  - reverse
  - draw
win_condition: "First player to empty their hand"
---

# Game Rules

Detailed natural language rules here...
```

## Directory Structure

```
.claude-plugin/
  plugin.json           # Plugin manifest
commands/               # User commands
skills/                 # Agent skills
hooks/                  # Event synchronization
games/                  # Game configurations
  <game-name>/
    RULES.md           # Game rules with frontmatter
    logs/              # Game execution logs
    traces/            # Detailed agent traces
    state/             # Active game state files
```

## Architecture

### File-Based Communication

During gameplay, agents communicate through structured files in `games/<game-name>/state/`:

- `game-state.json`: Current game state (deck, discard pile, scores)
- `turn-signal.json`: Current player and available actions
- `player-actions/<player-id>.json`: Player decisions
- `game-log.json`: Complete move history

### Agent Flow

1. Gamemaster initializes game state
2. Gamemaster writes turn signal → Hook detects change
3. Hook spawns player agent (Haiku model) with game context
4. Player agent writes action decision
5. Hook triggers gamemaster to validate and process
6. Gamemaster updates state and signals next player
7. Repeat until win condition met

### Hook System

Hybrid hooks combine:
- **Script validation**: Check file format and detect changes
- **AI decision**: Determine appropriate agent to spawn and context to provide

## Commands

- `/game-playtester:start-game <game-name>`: Start a new game session
- `/game-playtester:view-results`: Analyze completed game logs
- `/game-playtester:stop-game`: Emergency halt current game

## Example: UNO

See `games/uno/RULES.md` for a complete example configuration demonstrating:
- Structured game parameters in YAML frontmatter
- Natural language rule descriptions
- Special card effects (Skip, Reverse, Draw Two, Wild)
- Win conditions and scoring

## Development

This plugin demonstrates:
- Dynamic agent spawning via Task tool
- Multi-agent coordination patterns
- File-based inter-agent communication
- Event-driven hook architecture
- Generic game engine with specific rule configs

## Future Enhancements

- Statistical analysis across multiple games
- Player strategy profiling
- Rule conflict detection
- Tournament mode (round-robin, elimination)
- Visual game replay
- Custom player personalities
