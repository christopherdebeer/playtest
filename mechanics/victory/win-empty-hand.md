---
id: engine-010
name: "Win by Empty Hand"
slug: win-empty-hand
category: victory
summary: "Win by emptying your hand"
source: engine
---

# Win by Empty Hand

Win condition where the first player to empty their hand wins the game.

## Reference

- **ID**: engine-010
- **Category**: victory
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-empty-hand
---
```

## Engine Implementation

The win-empty-hand mechanic checks for victory when a player successfully empties their hand of all cards.

### Configuration Schema

```yaml
win_empty_hand:
  enabled: boolean  # Enable empty hand win condition
```

### Hooks

- `onCheckWin` - Checks if a player has emptied their hand

### Example Games

- UNO
- Crazy Eights
- President
