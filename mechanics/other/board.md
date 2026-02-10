---
id: engine-027
name: "Board"
slug: board
category: other
summary: "Core board state and topology"
source: engine
---

# Board

Core engine service for board topology, state graph, and player position tracking. Provides the foundational board system that movement and area-based mechanics build upon.

## Reference

- **ID**: engine-027
- **Category**: other (core service)
- **Source**: Engine core

## Usage in RULES.md

```yaml
---
mechanics:
  board:
    states: ["Start", "A", "B", "C", "Victory"]
    start: "Start"
    edges:
      - { from: "Start", to: ["A", "B", "C"], probability: 0.65 }
      - { from: ["A", "B", "C"], to: "Victory", probability: 0.55 }
---
```

## Engine Implementation

The `board` pseudo-key in RULES.md serves a dual role: it declares the board core mechanic AND provides board topology configuration. During config normalization, the board config is extracted to `config.board`.

Auto-enabled via dependency resolution when any board-based mechanic is used (area-movement, grid-movement, board-state, point-to-point-movement, etc.).

### Configuration Schema

```yaml
board:
  states: string[]          # List of board states/locations
  start: string             # Starting state for all players
  edges:                    # Connections between states
    - from: string | string[]
      to: string | string[]
      probability: number   # Optional transition probability
```

### Hooks Defined (for other mechanics)

- `onBeforePlayerMove` - Before a player moves (can block or modify target)
- `onPlayerMoved` - After a player moves to a new board state

### Dependents

13+ mechanics require `board`: area-movement, grid-movement, board-state, point-to-point-movement, movement-points, hidden-movement, zone-of-control, track-movement, rondel, and more.

### Example Games

- Used by 3+ games including Markov's Chains, Shadow Operations, Rondel Express
