---
id: engine-007
name: "Placed Card Effects"
slug: placed-card-effects
category: cards
summary: "Effects from placed cards"
source: engine
---

# Placed Card Effects

Mechanic for triggering effects from cards that have been placed on the board or in play areas.

## Reference

- **ID**: engine-007
- **Category**: cards
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - placed-card-effects
---
```

## Engine Implementation

The placed-card-effects mechanic triggers and resolves effects from cards that are currently in play on the board.

### Hooks

Currently implemented as a passive mechanic that works in conjunction with other card mechanics.

### Configuration

Effects are typically defined in card data rather than mechanic configuration.
