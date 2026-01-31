# Playtest Engine Extension Guide

A comprehensive guide to creating new games for the game-agnostic playtest framework.

## Architecture Overview

The playtest framework uses a three-agent architecture coordinated by a TypeScript engine:

```
┌─────────────────────────────────────────────────────────┐
│                    Coordinator Skill                     │
│  - Initializes game instance                            │
│  - Spawns gamemaster + player agents                    │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                   TypeScript Engine                      │
│  - State management (file-based)                        │
│  - Action validation and execution                      │
│  - Turn synchronization (blocking waits)                │
│  - Dynamic action discovery                             │
│  - Game-agnostic win condition detection                │
└─────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │Gamemaster │        │  Player   │        │  Player   │
    │  (Sonnet) │        │  (Haiku)  │        │  (Haiku)  │
    │Adjudicates│        │ Competes  │        │ Competes  │
    │ disputes  │        │  to WIN   │        │  to WIN   │
    └───────────┘        └───────────┘        └───────────┘
```

### Key Design Principles

1. **Engine Owns State** - Not agents. Prevents inconsistencies.
2. **Agents Decide, Engine Validates** - Actions execute optimistically, contested if invalid.
3. **File-Based Persistence** - No database. Simple, portable, git-friendly.
4. **Blocking Waits** - Engine synchronizes turns (prevents busy-polling).
5. **Game-Agnostic Core** - All game logic in RULES.md. New games need zero code.
6. **Dynamic Action Discovery** - `getAvailableActions()` exposes valid moves at runtime.

## Creating a New Game

### Step 1: Create Game Directory

```bash
mkdir -p games/my-new-game/state
```

### Step 2: Write RULES.md

The RULES.md file contains both machine-readable YAML frontmatter and human-readable rules.

```markdown
---
# Machine-readable config
name: "My Game Name"
version: "1.0"
players: 2-4                    # Range or exact number
starting_cards: 5               # Cards dealt at start
win_condition: "First player to reach the Victory state"  # Or "empty hand", "score >= 100"
max_turns: 50                   # Prevent infinite games

# Optional: Board definition (for movement-based games)
board:
  states: ["Start", "Middle", "Victory"]
  start: "Start"               # Initial player position
  edges:
    - { from: "Start", to: "Middle", probability: 0.6 }
    - { from: "Middle", to: "Victory", probability: 0.4 }

# Optional: Deck definition
deck:
  - { name: "Power Card", count: 4, type: "boost", effect: { type: "probability_boost", value: 0.2 } }
  - { name: "Block", count: 3, type: "interference", effect: { type: "block_turn", duration: 1 } }
  - { name: "Trap", count: 2, type: "trap", placeable: true, targetMode: "opponents", effect: { type: "probability_penalty", value: -0.15 } }

# Reference mechanics from the library
mechanics:
  - hand-management
  - push-your-luck

# Enable/disable engine capabilities
engine_mechanics:
  probability_movement: true    # Moves use edge probabilities
  card_boosts: true            # Cards can modify probability
  victory_declaration: false   # Players must declare victory for GM adjudication
---

# My Game Name - Rules

[Human-readable game rules here...]
```

### Supported Win Conditions

The engine auto-detects victory for common patterns:

| Pattern | Example | Detection |
|---------|---------|-----------|
| `reach <state>` | "First player to reach the Victory state" | `player.state === "Victory"` |
| `empty hand` | "First player to empty their hand wins" | `player.hand.length === 0` |
| `score >= N` | "First to reach score >= 100" | `player.score >= 100` |
| `eliminate opponents` | "Last player standing wins" | Only one non-eliminated player |

### Supported Card Effect Types

```yaml
# Probability modifiers
effect: { type: "probability_boost", value: 0.2 }     # +20% to next roll
effect: { type: "probability_penalty", value: -0.25 } # -25% to target's roll
effect: { type: "auto_success" }                       # Guaranteed success

# Turn manipulation
effect: { type: "block_turn", duration: 1 }           # Skip next turn
effect: { type: "skip" }                               # Skip this turn

# Card manipulation
effect: { type: "force_discard", value: 1 }           # Target discards N cards
effect: { type: "draw", value: 2 }                    # Draw N cards

# Movement manipulation
effect: { type: "force_retarget" }                    # Redirect opponent's move
effect: { type: "swap_positions" }                    # Swap with another player

# UNO-style
effect: { type: "wild" }                              # Change color
effect: { type: "wild_draw", value: 4 }               # Wild + draw 4
effect: { type: "reverse" }                           # Reverse turn order
effect: { type: "none", color: "Red", value: 5 }      # Number card
```

### Placeable Cards (State Cards)

Cards can be placed on board states to create traps/buffs:

```yaml
deck:
  - name: "Hazard"
    count: 3
    type: "trap"
    placeable: true                              # Can be placed on board
    targetMode: "opponents"                      # Affects opponents only
    effect: { type: "probability_penalty", value: -0.2 }
```

Target modes:
- `owner` - Only affects the player who placed it
- `opponents` - Only affects other players
- `all` - Affects everyone

### Board Topology

Edges define movement between states:

```yaml
board:
  states: ["A", "B", "C", "D"]
  edges:
    # One-to-one
    - { from: "A", to: "B", probability: 0.7 }

    # One-to-many
    - { from: "A", to: ["B", "C"], probability: 0.6 }

    # Many-to-one
    - { from: ["B", "C"], to: "D", probability: 0.5 }

    # Lateral movement
    - { from: "B", to: "C", probability: 0.4 }
    - { from: "C", to: "B", probability: 0.4 }
```

## Available Action Types

The engine supports these action types:

| Action | Description | Required Fields | Optional Fields |
|--------|-------------|-----------------|-----------------|
| `move` | Move to adjacent state | `target` | `boost`, `declareVictory`, `victoryReason` |
| `play_card` | Play card from hand | `card` | `target`, `declaredColor` |
| `place_card` | Place card on board | `card`, `targetState` | |
| `draw` | Draw from deck | | `count` |
| `pass` | Skip turn | | `reasoning` |
| `resign` | Forfeit game | `reason` | |

## Information Hiding

The engine automatically filters what each agent sees:

**Players see:**
- Their own hand (full cards)
- Opponent hand sizes (not contents)
- Opponent positions/states
- Opponent active effects
- Shared game state (discard pile, placed cards, etc.)
- **NOT**: opponent hands, deck contents, deck order

**Gamemaster sees:**
- Everything (all hands, deck, full state)

## Extension Points

### Custom Shared State

Use `state.shared` for game-specific data:

```typescript
// Accessible to all players and GM
state.shared = {
  discardPile: [...],
  currentColor: "red",      // UNO-style
  turnDirection: "clockwise",
  placedCards: [...],       // State cards
  customGameData: {...}
};
```

### Mechanics Library

Reference 192+ mechanics from `/mechanics/`:

```yaml
mechanics:
  - hand-management      # cards/hand-management.md
  - push-your-luck       # dice/push-your-luck.md
  - auction-bidding      # auction/auction-bidding.md
  - worker-placement     # worker-placement/worker-placement.md
```

Look up mechanics:
```bash
./playtest mechanic hand-management           # By slug
./playtest mechanic -c cards                  # By category
./playtest mechanic --search "auction"        # Search
```

Categories: action, auction, building, cards, conflict, cooperative, dice, economic, ending, information, movement, other, physical, social, turn-order, victory, worker-placement

## Example: Different Game Types

### Board Race Game (like Markov's Chains)

```yaml
board:
  states: ["Start", "A", "B", "Victory"]
  edges:
    - { from: "Start", to: ["A", "B"], probability: 0.6 }
    - { from: ["A", "B"], to: "Victory", probability: 0.4 }

deck:
  - { name: "Boost", count: 4, effect: { type: "probability_boost", value: 0.2 } }

engine_mechanics:
  probability_movement: true
  victory_declaration: true
```

### Card Shedding Game (like UNO)

```yaml
# No board needed
starting_cards: 7
win_condition: "First player to empty their hand wins"

deck:
  - { name: "Red 5", count: 2, type: "number", effect: { type: "none", color: "Red", value: 5 } }
  - { name: "Skip", count: 4, type: "action", effect: { type: "skip", color: "Red" } }
  - { name: "Wild", count: 4, type: "wild", effect: { type: "wild" } }

engine_mechanics:
  probability_movement: false
```

### Point Collection Game

```yaml
win_condition: "score >= 100"

deck:
  - { name: "Gold", count: 10, effect: { type: "score_add", value: 10 } }
  - { name: "Silver", count: 20, effect: { type: "score_add", value: 5 } }
```

### Auction Game

```yaml
mechanics:
  - auction-bidding
  - income

deck:
  - { name: "Rare Item", count: 3, type: "item", effect: { type: "victory_points", value: 20 } }
```

## Testing Your Game

```bash
# Initialize
./playtest init my-new-game --players 2

# Returns instanceId, use it in all subsequent commands
# Then spawn agents via Claude Code skills or manually

# Monitor
./playtest status <instanceId>
./playtest list my-new-game

# Check logs
cat games/my-new-game/logs/<instanceId>.jsonl
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `engine/src/types.ts` | TypeScript interfaces for all game types |
| `engine/src/game.ts` | Core state management and action execution |
| `engine/src/rules.ts` | YAML parser and deck builder |
| `.claude/agents/gamemaster.md` | Gamemaster agent definition |
| `.claude/agents/player.md` | Player agent definition |
| `mechanics/index.json` | Master mechanics library index |
