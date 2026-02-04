---
id: engine-003
name: "Board State"
slug: board-state
category: other
summary: "Board state management"
source: engine
---

# Board State

Core board state management mechanic for tracking and manipulating game board state.

## Reference

- **ID**: engine-003
- **Category**: other
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - board-state
---
```

## Engine Implementation

The board-state mechanic provides core functionality for managing game board state, including position tracking and state validation.

### Hooks

- `preValidateAction` - Validates board state constraints
- `onExecuteAction` - Updates board state
- `getAvailableActions` - Determines available actions based on board state
- `describeAction` - Generates board state action descriptions

### Configuration

No explicit configuration required - board state is managed automatically by the engine.
