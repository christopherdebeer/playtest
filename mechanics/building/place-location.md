---
id: engine-017
name: "Place Location"
slug: place-location
category: building
summary: "Location placement mechanics"
source: engine
---

# Place Location

Location placement mechanic for positioning location tiles or markers on the game board.

## Reference

- **ID**: engine-017
- **Category**: building
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - place-location
---
```

## Engine Implementation

The place-location mechanic handles placement of location tiles or markers onto the board, with adjacency rules and placement validation.

### Hooks

- `preValidateAction` - Validates location placement
- `onExecuteAction` - Executes location placement
- `getAvailableActions` - Determines valid placement positions
- `describeAction` - Generates placement action descriptions

### Configuration

Configuration typically includes placement rules, adjacency requirements, and valid board positions.

### Example Games

- Carcassonne (tile placement)
- Betrayal at House on the Hill (room tiles)
- Galaxy Trucker (ship building)
