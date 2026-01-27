# Playtest

A computational framework for game design exploration using LLM agents.

## Overview

Playtest enables rapid iteration on card game designs by:

- **Simulating games** with AI players (LLM-powered or random)
- **Validating rules** with an AI arbiter that interprets natural language
- **Analyzing balance** with a meta-observer that tracks game quality metrics
- **Exploring parameters** with automated sweeps through design space

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GAME ORCHESTRATOR                     │
│  (deterministic state machine, turn/phase management)    │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   PLAYER    │  │   PLAYER    │  │   ARBITER   │
│   AGENT     │  │   AGENT     │  │   AGENT     │
│             │  │             │  │             │
│ - Strategy  │  │ - Strategy  │  │ - Validates │
│ - Decisions │  │ - Decisions │  │ - Interprets│
└─────────────┘  └─────────────┘  └─────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │  META-OBSERVER  │
                │                 │
                │ - Game quality  │
                │ - Balance       │
                │ - Suggestions   │
                └─────────────────┘
```

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Run a game

```bash
# With random players
npm run playtest -- play -r games/simple-duel.yaml

# With LLM players (requires ANTHROPIC_API_KEY)
npm run playtest -- play -r games/simple-duel.yaml -p1 llm -p2 llm -v
```

### Explore parameters

```bash
# Basic exploration
npm run playtest -- explore -r games/simple-duel.yaml -n 10

# Override parameter ranges
npm run playtest -- explore -r games/simple-duel.yaml \
  --param "starting_life=10,15,20,25" \
  --param "mana_per_turn=1,2,3" \
  -n 5 -o report.json
```

### Analyze rules

```bash
npm run playtest -- analyze -r games/simple-duel.yaml
```

### Interactive mode

```bash
npm run playtest -- interactive -r games/simple-duel.yaml
```

## Defining Games

Games are defined in YAML format with structured and natural language components:

```yaml
game:
  name: "My Card Game"
  version: "1.0"
  players:
    min: 2
    max: 2

zones:
  - id: deck
    per_player: true
    visibility: hidden
  - id: hand
    per_player: true
    visibility: private
  - id: battlefield
    per_player: true
    visibility: public

resources:
  - id: life
    initial: 20
  - id: mana
    initial: 0
    per_turn: 1

turn_structure:
  phases: [upkeep, main, combat, end]

actions:
  play_card:
    valid_when: "phase == 'main' AND card.cost <= player.mana"
    effect: |
      Pay the card's mana cost.
      Move the card from hand to battlefield.

  attack:
    valid_when: "phase == 'combat'"
    effect: |
      Natural language description that the arbiter interprets...

win_conditions:
  - "opponent.life <= 0"

# Tunable parameters for exploration
parameters:
  starting_life:
    type: number
    default: 20
    min: 10
    max: 30
    step: 5
```

## Claude Code Integration

Playtest can be used as a Claude Code plugin via hooks:

```bash
# Initialize hooks
npm run playtest -- init --local

# Now in Claude Code, you can use:
# playtest new rules=games/simple-duel.yaml
# playtest state
# playtest action play_card card=Goblin
```

### How Hooks Work

1. **PreToolUse hooks** intercept bash commands starting with `playtest`
2. Commands are routed to the game orchestrator
3. Results are returned to Claude Code

## API Usage

```typescript
import {
  loadGameRules,
  GameOrchestrator,
  PlayerAgent,
  ArbiterAgent,
  AnthropicProvider,
} from 'playtest';

// Load rules
const rules = loadGameRules('games/simple-duel.yaml');

// Create orchestrator
const orchestrator = new GameOrchestrator(rules, ['p1', 'p2']);

// Register LLM agents
const llm = new AnthropicProvider();
orchestrator.registerAgent(new PlayerAgent({ id: 'p1' }, llm));
orchestrator.registerAgent(new PlayerAgent({ id: 'p2' }, llm));
orchestrator.registerAgent(new ArbiterAgent({ id: 'arbiter' }, llm));

// Run game
const finalState = await orchestrator.runGame();
console.log(`Winner: ${finalState.winner}`);
```

## Metrics

Playtest tracks various game quality metrics:

| Metric | Description |
|--------|-------------|
| First player win rate | Balance indicator (should be ~50%) |
| Average turn count | Game length |
| Actions per turn | Decision density |
| Lead changes | Back-and-forth gameplay |
| Arbiter interventions | Rule clarity |
| Close finish rate | Engagement proxy |

## Project Structure

```
playtest/
├── src/
│   ├── core/           # Types and state management
│   ├── rules/          # YAML parsing and validation
│   ├── engine/         # Orchestrator and explorer
│   ├── agents/         # Player, Arbiter, Observer
│   ├── hooks/          # Claude Code integration
│   └── cli/            # Command-line interface
├── games/              # Example game definitions
└── dist/               # Compiled output
```

## License

MIT
