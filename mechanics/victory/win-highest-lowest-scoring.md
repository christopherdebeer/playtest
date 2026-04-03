---
id: engine-018
name: "Win by Highest/Lowest Scoring"
slug: win-highest-lowest-scoring
category: victory
summary: "Win by highest or lowest score at game end"
source: engine
---

# Win by Highest/Lowest Scoring

Win condition where the player with the highest (or lowest) score at game end wins. Used when no player reaches a threshold — the game runs to completion and scoring determines the winner.

## Reference

- **ID**: engine-018
- **Category**: victory
- **Source**: Engine-specific (win condition variant of highest-lowest-scoring)

## Usage in RULES.md

```yaml
---
mechanics:
  win_highest_lowest_scoring: { mode: "highest" }
---
```

## Engine Implementation

Checks scores when the game ends (max rounds reached or other ending trigger) and declares the player with the highest (or lowest) score as the winner.

### Configuration Schema

```yaml
win_highest_lowest_scoring:
  mode: "highest" | "lowest"    # Which extreme wins
```

### Hooks

- `onCheckWin` - Checks scoring at game end

### Example Games

- Arcane Assembly, Draft Duel, Grand Bazaar, Rondel Express, Spellbook Showdown, Council of Whispers, Shadow Operations
