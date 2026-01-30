# Proposals

Design proposals and improvement plans for the Playtest framework.

## Active Proposals

| ID | Title | Status | Priority |
|----|-------|--------|----------|
| [001](./001-agent-loop-ergonomics.md) | Agent Loop Ergonomics | Draft | P0 |
| [002](./002-duplicate-command-execution.md) | Duplicate Command Execution | Investigation | P1 |

## Proposal Status Definitions

- **Draft**: Initial proposal, ready for review
- **Investigation**: Needs more research before implementation
- **Approved**: Ready for implementation
- **In Progress**: Currently being implemented
- **Complete**: Implemented and verified
- **Rejected**: Not proceeding with this proposal

## Priority Definitions

- **P0**: Critical - Blocks core functionality
- **P1**: High - Significant impact on usability
- **P2**: Medium - Nice to have improvements
- **P3**: Low - Future considerations

## Context: markovs-chains Playtest (2026-01-30)

These proposals originated from observing a playtest session:

```
Instance: markovs-chains-1769791889889
Players: 2
Result: Game stuck at turn 1 (player-2's turn)
Actions completed: 1 (player-1: Start → A)
```

### Key Observations

1. **All agents exited prematurely** - None maintained persistent game loop
2. **All commands executed twice** - Systematic duplicate execution
3. **Player-2 misinterpreted state** - Thought game had error when waiting for their turn
4. **Gamemaster exited** - Left after first pending call without error

### Agent Trace Summary

```
Gamemaster: register(x2) → pending(x2) → EXIT
Player-1:   register(x2) → wait(x2) → status(x2) → act(x2) → wait(x2) → EXIT
Player-2:   register(x2) → wait(x2) → status(x2) → wait(x2) → EXIT (error assumption)
```

## Implementation Order

1. **Proposal 001** (P0): Fix agent loop ergonomics first - games must complete
2. **Proposal 002** (P1): Then investigate duplicate commands - performance/correctness
