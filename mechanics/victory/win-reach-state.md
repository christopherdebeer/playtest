---
id: engine-011
name: "Win by Reaching State"
slug: win-reach-state
category: victory
summary: "Win by reaching specific board state"
source: engine
---

# Win by Reaching State

Win condition where a player wins by achieving a specific board state or game condition.

## Reference

- **ID**: engine-011
- **Category**: victory
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-reach-state
---
```

## Engine Implementation

The win-reach-state mechanic checks for victory when a player achieves a predefined target state.

### Configuration Schema

```yaml
win_reach_state:
  target_state: string  # Description of the winning state condition
```

### Hooks

- `onCheckWin` - Checks if target state has been reached

### Example Games

- Chess (checkmate state)
- Tic-Tac-Toe (three in a row)
- Connect Four
