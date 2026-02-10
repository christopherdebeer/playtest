---
id: engine-019
name: "Win by Single Loser"
slug: win-single-loser
category: victory
summary: "Last place loses, everyone else wins"
source: engine
---

# Win by Single Loser

Win condition where instead of a single winner, the game has a single loser — the player with the lowest score is eliminated or penalized while all other players win.

## Reference

- **ID**: engine-019
- **Category**: victory
- **Source**: Engine-specific (win condition variant of single-loser-game)

## Usage in RULES.md

```yaml
---
mechanics:
  win_single_loser:
    loser_condition: "lowest_score"
    loser_penalty: "eliminated"
---
```

## Engine Implementation

At game end, identifies the player with the worst performance metric and declares them the loser.

### Configuration Schema

```yaml
win_single_loser:
  loser_condition: string       # How the loser is determined
  loser_penalty: string         # What happens to the loser
```

### Hooks

- `onCheckWin` - Identifies the single loser at game end

### Example Games

- Council of Whispers
