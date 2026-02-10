---
id: engine-024
name: "Tableau Building"
slug: tableau-building
category: building
summary: "Build personal card tableaux"
source: engine
---

# Tableau Building

Players build a personal tableau of cards in front of them, creating an engine of ongoing benefits, scoring opportunities, and synergies between cards.

## Reference

- **ID**: engine-024
- **Category**: building
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
mechanics:
  tableau_building:
    max_size: 6
    score_per_card: 3
---
```

## Engine Implementation

Manages personal card tableaux with size limits and scoring.

### Configuration Schema

```yaml
tableau_building:
  max_size: number          # Maximum cards in tableau
  score_per_card: number    # Base points per card placed
```

### Hooks

- `onExecuteAction` - Handle card placement to tableau
- `getAvailableActions` - Expose tableau placement options
- `onCheckWin` - Score tableau at game end

### Example Games

- Alliance
- Race for the Galaxy, Wingspan, Terraforming Mars (BGG reference)
