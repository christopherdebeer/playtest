---
id: engine-013
name: "Win Race"
slug: win-race
category: victory
summary: "First to reach goal wins"
source: engine
bgg_related: race
---

# Win Race

Win condition where the first player to reach a goal position or state wins the game.

## Reference

- **ID**: engine-013
- **Category**: victory
- **Source**: Engine-specific
- **BGG Related**: [Race](https://boardgamegeek.com/boardgamemechanic/2038/race)

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-race
---
```

## Engine Implementation

The win-race mechanic checks for victory when a player reaches a designated goal position or completes required laps.

### Configuration Schema

```yaml
win_race:
  goal_state: string      # Single goal position
  goal_states: array      # Multiple valid goal positions
  laps: number           # Number of laps to complete
  checkpoints: array     # Required checkpoints before goal
```

### Hooks

- `onCheckWin` - Checks if goal has been reached
- `onAfterMove` - Triggers win check after movement

### Example Games

- Formula D
- Camel Up
- Snow Tails
