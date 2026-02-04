---
id: engine-012
name: "Win by Score Threshold"
slug: win-score-threshold
category: victory
summary: "Win by reaching score threshold"
source: engine
---

# Win by Score Threshold

Win condition where a player wins by reaching or exceeding a target score.

## Reference

- **ID**: engine-012
- **Category**: victory
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-score-threshold
---
```

## Engine Implementation

The win-score-threshold mechanic checks for victory when a player's score meets or exceeds the configured threshold.

### Configuration Schema

```yaml
win_score_threshold:
  threshold: number                 # Target score to win
  operator: ">= | > | == | ="      # Comparison operator
```

### Hooks

- `onCheckWin` - Checks if score threshold has been met

### Example Games

- Catan (first to 10 points)
- Ticket to Ride (reach point threshold)
- Splendor (reach 15 points)
