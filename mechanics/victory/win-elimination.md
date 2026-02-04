---
id: engine-009
name: "Win by Elimination"
slug: win-elimination
category: victory
summary: "Win by being last player standing"
source: engine
bgg_related: player-elimination
---

# Win by Elimination

Win condition where the last remaining player wins after all others have been eliminated.

## Reference

- **ID**: engine-009
- **Category**: victory
- **Source**: Engine-specific
- **BGG Related**: [Player Elimination](https://boardgamegeek.com/boardgamemechanic/2685/player-elimination)

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-elimination
---
```

## Engine Implementation

The win-elimination mechanic checks for victory when only one player remains active in the game.

### Configuration Schema

```yaml
win_elimination:
  enabled: boolean  # Enable elimination win condition
```

### Hooks

- `onCheckWin` - Checks if only one player remains

### Example Games

- Risk
- Bang!
- King of Tokyo
