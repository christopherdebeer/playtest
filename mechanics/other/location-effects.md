---
id: engine-016
name: "Location Effects"
slug: location-effects
category: other
summary: "Effects triggered by locations"
source: engine
---

# Location Effects

Mechanic for triggering effects based on player or piece locations on the board.

## Reference

- **ID**: engine-016
- **Category**: other
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - location-effects
---
```

## Engine Implementation

The location-effects mechanic triggers special effects when players move to or occupy specific board locations.

### Hooks

Currently implemented as a passive mechanic that works in conjunction with movement mechanics.

### Configuration

Effects are typically defined in location data rather than mechanic configuration.

### Example Games

- Monopoly (property effects)
- Clue (room abilities)
- Talisman (space effects)
