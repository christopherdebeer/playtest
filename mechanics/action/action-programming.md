---
id: engine-025
name: "Action Programming"
slug: action-programming
category: action
summary: "Program action sequences to execute"
source: engine
---

# Action Programming

Players pre-program a sequence of actions that are then executed in order. Requires planning ahead and anticipating other players' moves.

## Reference

- **ID**: engine-025
- **Category**: action
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
mechanics:
  action_programming: true
---
```

## Engine Implementation

Manages queued action sequences with sequential execution.

### Hooks

- `onExecuteAction` - Execute programmed action sequence
- `getAvailableActions` - Expose programming options
- `preValidateAction` - Validate programmed action sequence

### Example Games

- Arcane Assembly
- RoboRally, Colt Express (BGG reference)
