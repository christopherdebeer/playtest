---
id: engine-001
name: "Pass"
slug: pass
category: other
summary: "Core pass action mechanic"
source: engine
---

# Pass

Core pass action mechanic allowing players to forfeit their turn or skip an action opportunity.

## Reference

- **ID**: engine-001
- **Category**: other
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - pass
---
```

## Engine Implementation

The pass mechanic is implemented in the game engine and provides core functionality for turn skipping.

### Hooks

- `onExecuteAction` - Handles pass action execution
- `getAvailableActions` - Determines when pass is available
- `describeAction` - Generates pass action description

### Configuration

No configuration required - pass is available by default in turn-based games.
