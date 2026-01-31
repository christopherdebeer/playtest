# Proposals

Design proposals and improvement plans for the Playtest framework.

## Active Proposals

| ID | Title | Status | Priority | Source |
|----|-------|--------|----------|--------|
| [001](./001-agent-loop-ergonomics.md) | Agent Loop Ergonomics | Draft | P0 | markovs-chains |
| [002](./002-duplicate-command-execution.md) | Duplicate Command Execution | Investigation | P1 | markovs-chains |
| [006](./006-ap-cost-per-card.md) | AP Cost Per Card | Implemented | P0 | AAOTE v0.1 |
| [007](./007-grid-movement-validation.md) | Grid Movement Validation | Implemented | P0 | AAOTE v0.1 |
| [008](./008-hand-limits-card-types.md) | Hand Limits & Card Type Restrictions | Implemented | P1 | AAOTE v0.1 |
| [009](./009-agent-adjudication-recovery.md) | Agent Recovery After Adjudication | Implemented | P1 | AAOTE v0.1 |
| [010](./010-default-winner-config.md) | Configurable Default Winner | Implemented | P2 | AAOTE v0.1 |

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

## Context: AAOTE Playtest (2026-01-31)

Proposals 006-010 originated from the first AAOTE playtest session:

```
Instance: aaote-1769882818599
Players: 3 (cheater, random, random personas)
Result: player-1 won at turn 40 (max turns)
Events logged: 127
```

### Key Findings

1. **AP enforcement missing** - Players drew 5-10 cards per action (should be max 3)
2. **Grid validation skipped** - Player moved to "Fake Location" without error
3. **Items discarded** - Forbidden Items played like events, making Enemy win impossible
4. **Agent sync issues** - 5 respawns needed after resignation rejections
5. **Wrong default winner** - Engine gave win to player-1, not The Enemy

See [playtest analysis](/games/aaote/logs/playtest-analysis-v0.1-2026-01-31.md) for full details.

## Implementation Order

1. **Proposal 001** (P0): Fix agent loop ergonomics first - games must complete
2. **Proposal 002** (P1): Then investigate duplicate commands - performance/correctness
3. **Proposal 006** (P0): AP cost per card - critical for balanced gameplay
4. **Proposal 007** (P0): Grid validation - required for spatial games
5. **Proposal 008** (P1): Hand limits & card types - game balance
6. **Proposal 009** (P1): Agent recovery - reliability improvement
7. **Proposal 010** (P2): Default winner config - game-specific rules
