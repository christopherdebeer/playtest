---
id: engine-002
name: "Freeplay"
slug: freeplay
category: other
summary: "Parallel play without turn-based alternation"
source: engine
---

# Freeplay

Experimental mechanic enabling parallel play without turn-based alternation, allowing players to act simultaneously.

## Reference

- **ID**: engine-002
- **Category**: other
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - freeplay
---
```

## Engine Implementation

The freeplay mechanic enables experimental parallel play modes where players can act simultaneously rather than taking turns.

### Configuration Schema

```yaml
freeplay:
  actions_per_round: number         # Actions each player can take per round
  interaction_timeout: number       # Timeout for interactive actions
  allow_concurrent_resource_access: boolean  # Allow simultaneous resource access
  interaction_actions: array        # Actions that require player interaction
```

### Hooks

- `preValidateAction` - Validates freeplay action constraints
- `onTurnEnd` - Manages round transitions
- `getAvailableActions` - Determines available actions in freeplay mode
