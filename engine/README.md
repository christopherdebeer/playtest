# Game Playtesting Engine

A game-agnostic multi-agent framework for playtesting board/card games using Claude AI agents.

## Overview

This engine enables automated playtesting of turn-based games using:
- **Gamemaster agent** (Sonnet): Enforces rules, manages state, validates actions
- **Player agents** (Haiku): Make strategic decisions, write actions
- **File-based coordination**: JSON files as communication protocol
- **Observable gameplay**: JSONL logs capture all events for analysis

## Quick Start

### 1. Create a Game

Create a rules file at `games/{your-game}/RULES.md`:

```markdown
---
name: "Your Game"
version: "1.0"
players: 3
starting_cards: 5
win_condition: "First player to..."
---

# Your Game Rules

[Detailed rules here...]
```

### 2. Run a Playtest

```bash
/start-game your-game 3
```

The engine will:
1. Spawn a gamemaster agent
2. Initialize game state
3. Spawn player agents for each turn
4. Coordinate gameplay via JSON files
5. Log all events continuously
6. Report final results

### 3. Analyze Results

Check the output:
- **Logs**: `games/{your-game}/logs/game-{id}-live.jsonl` (continuous event stream)
- **Summary**: `games/{your-game}/logs/game-{id}.json` (final stats)
- **Trace**: `games/{your-game}/traces/game-{id}.md` (turn-by-turn analysis)

## Architecture

```
┌────────────────────┐
│    COORDINATOR     │  Entry point, spawns gamemaster
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│    GAMEMASTER      │  Sonnet agent, manages game
│   (Sonnet Agent)   │  - Validates actions
└────┬──────┬────────┘  - Updates state
     │      │            - Spawns players
     ▼      ▼
┌──────┐ ┌──────┐
│ P1   │ │ P2   │       Haiku agents, make decisions
│Haiku │ │Haiku │       - Read game state
└──┬───┘ └───┬──┘       - Choose actions
   │         │           - Write action files
   └────┬────┘
        │
        ▼
┌───────────────────────┐
│    FILE SYSTEM        │  JSON communication
│  ├─ game-state.json   │  - Game state (authoritative)
│  ├─ turn-signal.json  │  - Turn notifications
│  └─ player-actions/   │  - Player decisions
└───────────────────────┘
```

## Core Components

### 1. JSON Schemas (`engine/schemas/`)

Defines the communication protocol:
- `game-state.schema.json` - Authoritative game state
- `turn-signal.schema.json` - Turn notifications to players
- `player-action.schema.json` - Player decisions
- `game-log-event.schema.json` - Log event format

### 2. Agent Templates (`engine/templates/`)

Reusable prompt templates:
- `gamemaster.md` - Template for gamemaster agents
- `player.md` - Template for player agents

Templates use `{{VARIABLE}}` syntax for game-specific customization.

### 3. Documentation

- `ENGINE-ARCHITECTURE.md` - Detailed architecture specification
- `IMPLEMENTATION-GUIDE.md` - Step-by-step implementation guide
- `README.md` - This file

## Coordination Protocol

### Turn Sequence

```
1. Gamemaster writes turn-signal.json
2. Gamemaster spawns player agent via Task tool
3. Player reads turn-signal.json and game-state.json
4. Player analyzes options and chooses action
5. Player writes player-actions/{player-id}.json
6. Player exits
7. Gamemaster polls for action file
8. Gamemaster validates action
9. Gamemaster updates game-state.json
10. Gamemaster logs events to JSONL
11. Gamemaster checks win condition
12. If game continues, go to step 1 for next player
```

### File Structure

```
games/
└── {game-name}/
    ├── RULES.md              Game rules with YAML config
    ├── state/                Runtime state (temporary)
    │   ├── game-state.json   Authoritative game state
    │   ├── turn-signal.json  Current player notification
    │   └── player-actions/   Player decision files
    │       ├── player-1.json
    │       ├── player-2.json
    │       └── player-3.json
    ├── logs/                 Permanent game records
    │   ├── game-{id}-live.jsonl  Continuous event stream
    │   └── game-{id}.json         Final game summary
    └── traces/               Detailed analysis
        └── game-{id}.md      Turn-by-turn breakdown
```

## Key Features

### ✅ True Multi-Agent Coordination

- **Real subagents**: Each player is an actual spawned agent, not simulated
- **Isolated decision-making**: Players have no shared memory
- **File-based sync**: All coordination happens through JSON files

### ✅ Information Hiding

- **Private data**: Players only see their own cards/hands
- **Public data**: Players see opponent hand sizes, positions, effects
- **Turn signals**: Only include information visible to current player

### ✅ Observable Gameplay

- **Continuous logging**: JSONL format captures every event in real-time
- **Reasoning capture**: Player agents log their strategic thinking
- **Statistical analysis**: Logs enable balance analysis and iteration

### ✅ Game Agnostic

- **Template-based**: Same framework works for any turn-based game
- **Configurable**: YAML frontmatter defines game parameters
- **Extensible**: Easy to add game-specific mechanics

## Example Games

### UNO

Classic card matching game:
- 3-4 players
- Match color or number
- Special action cards (Skip, Reverse, Draw 2)
- First to empty hand wins

**Location**: `games/uno/`

### Markov's Chains

Probability-based racing game:
- 3 players
- Probabilistic state transitions
- Cards boost odds or interfere with opponents
- First to reach Victory state wins

**Location**: `games/markovs-chains/`

Both games demonstrate the engine's versatility and provide reference implementations.

## Usage Patterns

### Running a Single Game

```javascript
// Spawn gamemaster for one game
await Task({
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Gamemaster for uno",
  prompt: filledGamemasterTemplate,
  run_in_background: false
});
```

### Running a Tournament

```javascript
// Run 10 games in parallel
const games = [];
for (let i = 0; i < 10; i++) {
  games.push(Task({
    subagent_type: "general-purpose",
    model: "sonnet",
    description: `Game ${i}`,
    prompt: gamemasterPrompt,
    run_in_background: true
  }));
}

// Wait for completion
for (const game of games) {
  await TaskOutput({ task_id: game.taskId });
}

// Aggregate statistics
aggregateResults(games);
```

### Iterative Design

```javascript
// Version 1.0
playtest(game, version="1.0");
analyzeResults();

// Update rules based on findings
updateRules(changes);

// Version 2.0
playtest(game, version="2.0");
compareVersions("1.0", "2.0");
```

## Performance

### Cost Estimate

Per game with 3 players, 10 turns:
- **Gamemaster** (Sonnet): ~1 invocation ≈ $0.05
- **Players** (Haiku): ~30 invocations ≈ $0.03
- **Total**: ~$0.08 per game

For 100 games: ~$8.00

### Timing

- **Initialization**: ~5 seconds
- **Per turn**: ~2-3 seconds
- **10-turn game**: ~30-40 seconds
- **Logging**: Negligible overhead

## Best Practices

### DO:

✅ **Spawn real player subagents** using Task tool for each turn
✅ **Validate all actions** before applying to game state
✅ **Hide private information** in turn signals
✅ **Log continuously** to JSONL after every event
✅ **Poll for action files** with timeout
✅ **Use templates** for consistent prompt structure

### DON'T:

❌ **Don't simulate players inline** - always spawn actual subagents
❌ **Don't rely on hooks** for coordination (they don't work in subagent contexts)
❌ **Don't leak information** - players shouldn't see private data
❌ **Don't skip validation** - always check actions are legal
❌ **Don't forget timeouts** - set max wait for player actions
❌ **Don't reuse action files** - delete after consuming

## Troubleshooting

### Player agent doesn't spawn

**Symptom**: Gamemaster hangs waiting for action

**Fix**:
- Check Task tool syntax in gamemaster
- Verify player prompt has no errors
- Ensure model (haiku) is available

### Invalid actions

**Symptom**: Gamemaster rejects player actions repeatedly

**Fix**:
- Clarify availableActions in turn-signal
- Add examples to player prompt
- Improve validation error messages

### Information leak

**Symptom**: Player knows things they shouldn't

**Fix**:
- Audit turn-signal.json visibleState
- Filter out private fields from opponents
- Review createTurnSignal() function

## Future Enhancements

### Planned Features

1. **Hook-based triggering**: When hooks work in subagent contexts
2. **Agent personalities**: Aggressive, defensive, balanced play styles
3. **Multi-game tournaments**: Parallel game execution with aggregation
4. **Real-time visualization**: Web UI showing game state
5. **Human vs AI**: Support for human players in the mix

### Contributing

To add a new game:

1. Create `games/{game}/RULES.md` with YAML frontmatter
2. Use engine templates for agent prompts
3. Implement game-specific logic in gamemaster
4. Test with `/start-game {game}`
5. Analyze logs and iterate

## Documentation

- **[Architecture](ENGINE-ARCHITECTURE.md)**: Detailed system design
- **[Implementation Guide](IMPLEMENTATION-GUIDE.md)**: Step-by-step coding guide
- **[Schemas](schemas/)**: JSON schema definitions
- **[Templates](templates/)**: Agent prompt templates

## Examples

See complete implementations:
- **UNO**: `games/uno/`
- **Markov's Chains**: `games/markovs-chains/`

Both include:
- Rules with YAML config
- Complete game logs
- Analysis documents
- Iterative design process

## License

[Your license here]

## Credits

Built for automated game playtesting using Claude AI agents by Anthropic.

---

**Version**: 1.0
**Last Updated**: 2026-01-27
