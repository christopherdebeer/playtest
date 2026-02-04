---
id: engine-006
name: "Place Card"
slug: place-card
category: cards
summary: "Card placement mechanics"
source: engine
---

# Place Card

Card placement mechanic for positioning cards on the game board or in specific zones.

## Reference

- **ID**: engine-006
- **Category**: cards
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - place-card
---
```

## Engine Implementation

The place-card mechanic handles placement of cards onto the board or into designated play areas, with position tracking and placement validation.

### Hooks

- `preValidateAction` - Validates card placement
- `onExecuteAction` - Executes card placement
- `getAvailableActions` - Determines valid placement positions
- `describeAction` - Generates placement action descriptions

### Configuration

Configuration typically includes valid placement zones and positioning rules.
