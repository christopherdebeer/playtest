---
id: engine-015
name: "Hidden Objectives"
slug: hidden-objectives
category: information
summary: "Secret win conditions"
source: engine
---

# Hidden Objectives

Hidden objectives system where players have secret win conditions unknown to other players.

## Reference

- **ID**: engine-015
- **Category**: information
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - hidden-objectives
---
```

## Engine Implementation

The hidden-objectives mechanic manages secret victory conditions that are dealt to players and hidden from opponents.

### Configuration Schema

```yaml
hidden_objectives:
  deal_at_start: boolean           # Deal objectives at game start
  reveal_on_completion: boolean    # Reveal when objective completed
```

### Hooks

- `initPlayerState` - Deals hidden objectives to players
- `getVisibleState` - Hides objectives from other players

### Example Games

- Coup (hidden role objectives)
- Secret Hitler (hidden team objectives)
- Battlestar Galactica
