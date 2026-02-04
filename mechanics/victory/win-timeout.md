---
id: engine-014
name: "Win on Timeout"
slug: win-timeout
category: victory
summary: "Determine winner when max_rounds reached"
source: engine
---

# Win on Timeout

Win condition that determines the winner when the maximum number of rounds is reached.

## Reference

- **ID**: engine-014
- **Category**: victory
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - win-timeout
---
```

## Engine Implementation

The win-timeout mechanic determines the winner when the game reaches its maximum round limit, typically by comparing scores or checking for specific role victories.

### Configuration Schema

```yaml
win_timeout:
  type: highest_score | role | specific_player | no_winner  # Victory determination method
  role: string              # Role that wins on timeout (if type is "role")
  role_name: string         # Display name for role
  reveal_role: boolean      # Reveal role on timeout win
  player_condition: string  # Condition for specific player win
  reason: string           # Explanation for timeout win
```

### Hooks

- `onCheckWin` - Checks win condition when max_rounds reached

### Example Games

- The Resistance (traitors win if maximum missions played)
- Love Letter (highest score at end of deck)
