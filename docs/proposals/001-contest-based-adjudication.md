# Contest-Based Adjudication Architecture

| Field | Value |
|-------|-------|
| **Date** | 2026-01-28 |
| **Status** | Draft / Not Implemented |
| **Author** | Claude |

## Summary

Replace the current "gamemaster validates every turn" model with a contest-based system where players execute actions directly and the gamemaster is only invoked when a player contests a previous move.

## Motivation

### Current Architecture Problems

1. **Latency**: Every turn requires gamemaster validation (sonnet model), adding 15-30s per turn
2. **Overhead**: Gamemaster must process every action, even trivial ones (playing a number card)
3. **Bottleneck**: Single gamemaster serializes all game flow
4. **Cost**: Sonnet invocations for routine validation

### Observed Metrics (UNO Playtest)

- Turn cycle: 30-40 seconds
- Gamemaster processing: ~15-20s per action
- Player decision: ~10-15s
- Simple actions (play matching card) don't need complex validation

## Proposed Architecture

### Core Concept

Players execute actions directly against the engine. The engine performs basic rule validation (card in hand, color matches, etc.). The next player can "contest" if they believe the previous action was invalid.

```
┌──────────────────────────────────────────────────────────┐
│                    Current Flow                          │
│  Player → submit → Gamemaster → validate → play → next   │
│                    (every turn)                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    Proposed Flow                         │
│  Player → play directly → Engine validates basics        │
│                    ↓                                     │
│           Next player sees result                        │
│                    ↓                                     │
│     [Optional] Contest → Gamemaster adjudicates          │
└──────────────────────────────────────────────────────────┘
```

### New Commands

```bash
# Player executes action directly (replaces submit)
npx playtest act <game> -p <id> -a '{"type":"play_card","card":"Red 5"}'

# Next player can contest the previous action
npx playtest contest <game> -p <id> -r "Wild Draw Four can only be played when no other option"

# Gamemaster adjudicates a contest
npx playtest adjudicate <game> --allow|--reject -r "reason"
```

### Engine Validation Levels

```
Level 0 (Engine - automatic):
├── Card exists in player's hand
├── It's the player's turn
├── Basic type matching (color or number for UNO)
└── Game is in progress

Level 1 (Contest triggers gamemaster):
├── Complex card effects (Wild Draw Four legality)
├── Action ordering disputes
├── Rule interpretation
└── Edge cases
```

### State Changes

```typescript
interface GameState {
  // ... existing fields ...

  // New fields for contest system
  lastAction?: {
    player: string;
    action: Action;
    timestamp: string;
    contestWindow: number;  // ms to contest (e.g., 5000)
  };

  pendingContest?: {
    contestedBy: string;
    reason: string;
    originalAction: Action;
  };

  contestHistory: Array<{
    action: Action;
    contestedBy: string;
    ruling: 'allowed' | 'rejected';
    reason: string;
  }>;
}
```

### Flow Diagrams

#### Normal Turn (No Contest)

```
Player-1                Engine                 Player-2
   │                      │                      │
   │──act(play Red 5)────▶│                      │
   │                      │──validate basics────▶│
   │                      │◀─────────────────────│
   │◀──success, turn=2────│                      │
   │                      │                      │
   │                      │──wait unblocks──────▶│
   │                      │                      │
   │                      │◀──act(play Red 8)────│
   │                      │                      │
```

#### Contested Turn

```
Player-1                Engine              Gamemaster           Player-2
   │                      │                      │                   │
   │──act(Wild Draw 4)───▶│                      │                   │
   │                      │──basic validation────│                   │
   │◀──success────────────│                      │                   │
   │                      │                      │                   │
   │                      │──────────────────────│──wait unblocks───▶│
   │                      │                      │                   │
   │                      │◀─────────────────────│◀──contest─────────│
   │                      │                      │                   │
   │                      │──invoke gamemaster──▶│                   │
   │                      │                      │                   │
   │                      │◀──adjudicate: reject─│                   │
   │                      │                      │                   │
   │◀──action reversed────│                      │                   │
   │  (draw 4 back, etc)  │                      │                   │
```

### Agent Changes

#### Player Agent (Minimal Change)

```markdown
## New Commands

# Execute your action directly
npx playtest act {GAME} -p {PLAYER_ID} -a '{"type":"play_card","card":"..."}'

# If you believe previous player cheated, contest
npx playtest contest {GAME} -p {PLAYER_ID} -r "reason"
```

#### Gamemaster Agent (Reduced Role)

```markdown
## New Role

You are only invoked when there's a contest. You do NOT monitor every turn.

When invoked:
1. Read the contest details
2. Get full game state and rules
3. Determine if the contested action was valid
4. Issue ruling: npx playtest adjudicate {GAME} --allow|--reject -r "reason"
```

### Benefits

| Metric | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| Turn latency | 30-40s | 10-15s | ~60% faster |
| Gamemaster invocations | Every turn | ~5% of turns | 95% reduction |
| Cost per game | High (sonnet every turn) | Low (sonnet on contest) | ~90% cost reduction |
| Player autonomy | Low | High | Better gameplay feel |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Players don't contest invalid moves | Add "auto-contest" mode where engine flags suspicious actions |
| Abuse of contest system | Limit contests per player, penalize frivolous contests |
| Complex games need more validation | Per-game config for validation level |
| Race conditions on contest window | Use timestamps and atomic state updates |

### Implementation Phases

#### Phase 1: Engine Support
- [ ] Add `act` command for direct action execution
- [ ] Add `contest` command
- [ ] Add `adjudicate` command
- [ ] Implement contest window timing
- [ ] Add state fields for contest tracking

#### Phase 2: Agent Updates
- [ ] Update player agent to use `act` instead of `submit`
- [ ] Add contest logic to player agent
- [ ] Reduce gamemaster to on-demand adjudication
- [ ] Update start-game skill

#### Phase 3: Refinement
- [ ] Add auto-contest for suspicious actions
- [ ] Implement contest penalties
- [ ] Per-game validation level config
- [ ] Performance benchmarking

## Alternatives Considered

### 1. Parallel Gamemaster Validation

Run gamemaster validation in parallel with player's next turn. Rejected if invalid.

**Rejected because**: Still incurs cost of validating every turn.

### 2. Rule-Based Engine Validation

Encode all rules in engine, no gamemaster needed.

**Rejected because**: Rules are complex and game-specific, hard to encode generically.

### 3. Post-Game Validation

Let game complete, validate transcript afterward.

**Rejected because**: Bad player experience, wasted time on invalid games.

## Open Questions

1. What's the right contest window duration? (5s? 10s? configurable?)
2. Should there be a "challenge" cost (like in tennis)?
3. How to handle network latency in contest timing?
4. Should auto-contest be opt-in or default?

## References

- Current architecture: `engine/ARCHITECTURE.md`
- Agent definitions: `.claude/agents/`
- UNO playtest logs: `games/uno/logs/`
