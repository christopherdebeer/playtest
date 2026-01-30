# Proposal 001: Agent Loop Ergonomics Improvements

**Status**: Draft
**Date**: 2026-01-30
**Observed In**: markovs-chains playtest (instance `markovs-chains-1769791889889`)

## Problem Statement

Player and gamemaster agents exit prematurely instead of maintaining a persistent game loop until the game explicitly ends. This causes games to stall mid-progress.

## Observed Behavior

### Playtest Results

| Agent | Expected | Actual |
|-------|----------|--------|
| player-1 | Loop until game ends | Exited after 1 move |
| player-2 | Loop until game ends | Exited thinking error occurred |
| gamemaster | Loop pending→adjudicate | Exited after first pending |

### Game State at Failure

```json
{
  "status": "in_progress",
  "turn": 1,
  "currentPlayer": "player-2",
  "players": {
    "player-1": { "state": "A", "registered": true },
    "player-2": { "state": "Start", "registered": true }
  }
}
```

Game stuck: player-2's turn but agent exited.

## Root Causes

### 1. Weak Loop Instructions

Current prompt (player.md:59-78):
```markdown
## Game Loop
2. while game not over:
     Wait for turn...
```

The pseudocode "while" syntax is interpreted as informational, not imperative.

### 2. Ambiguous Exit Conditions

```markdown
If status is "game_over":
  - Exit
```

Agents find other reasons to exit before receiving explicit `game_over` status.

### 3. Unclear `wait` Command Output

Player-2 repeatedly called `wait` and gave up, claiming "persistent issue with game instance" when the game was actually waiting for their action.

## Proposed Solutions

### Solution A: Strengthen Agent Prompts

#### A1. Add Critical Loop Section (Top of File)

Add to both `player.md` and `gamemaster.md`:

```markdown
## CRITICAL: PERSISTENT GAME LOOP

**YOU MUST STAY IN THE GAME UNTIL IT EXPLICITLY ENDS.**

- NEVER exit early
- NEVER assume errors mean the game is over
- ONLY exit when status shows `"game_over"`, `"completed"`, or `"ended"`

If a command fails: RETRY after checking status
If `wait` returns: CHECK if it's your turn and ACT
```

#### A2. Explicit Exit Conditions

```markdown
## Exit Conditions (ONLY THESE)

Exit the game loop ONLY when you receive one of:
- `"status": "game_over"`
- `"status": "completed"`
- `"status": "ended"`
- `"winner"` field is present in response

ANY other status means the game is still active. KEEP PLAYING.
```

#### A3. Error Recovery Instructions

```markdown
## Error Recovery

If you receive an error:
1. Call `npx playtest status {INSTANCE_ID}` to check game state
2. If status is NOT "game_over": the game is still active
3. Retry your action or wait for your turn
4. NEVER exit on recoverable errors
```

### Solution B: Improve Engine CLI Output

#### B1. Enhanced `wait` Command Response

Current:
```json
{
  "status": "your_turn",
  "turn": 1,
  "currentPlayer": "player-1"
}
```

Proposed:
```json
{
  "status": "your_turn",
  "turn": 1,
  "currentPlayer": "player-1",
  "message": "IT IS YOUR TURN. Execute an action using 'npx playtest act'.",
  "requiredAction": "act",
  "gameActive": true
}
```

#### B2. Enhanced `status` Command Response

Add explicit field:
```json
{
  "gameActive": true,
  "status": "in_progress"
}
```

#### B3. Error Message Improvements

Current error:
```json
{ "error": "Not your turn" }
```

Proposed:
```json
{
  "error": "Not your turn",
  "gameActive": true,
  "message": "Game is still active. Wait for your turn.",
  "suggestion": "Use 'npx playtest wait' to block until your turn"
}
```

### Solution C: Add Loop Timeout/Heartbeat (Future)

Consider adding coordinator-level monitoring:
- Heartbeat checks on agent activity
- Timeout detection for stuck agents
- Automatic agent restart for stalled games

## Implementation Plan

### Phase 1: Prompt Changes (Immediate)

1. [ ] Update `.claude/agents/player.md` with Solutions A1, A2, A3
2. [ ] Update `.claude/agents/gamemaster.md` with Solutions A1, A2, A3
3. [ ] Re-run playtest to validate

### Phase 2: Engine CLI Changes

4. [ ] Add `gameActive` field to all status responses
5. [ ] Add `message` and `requiredAction` to `wait` response
6. [ ] Improve error messages with recovery suggestions

### Phase 3: Monitoring (Future)

7. [ ] Add coordinator heartbeat monitoring
8. [ ] Implement agent timeout detection
9. [ ] Add stuck-game recovery mechanism

## Success Criteria

- [ ] Agents maintain game loop until explicit `game_over`
- [ ] Games complete without manual intervention
- [ ] Error recovery works without agent exit

## Files to Modify

| File | Changes |
|------|---------|
| `.claude/agents/player.md` | Add critical loop section, exit conditions, error recovery |
| `.claude/agents/gamemaster.md` | Add critical loop section, exit conditions, error recovery |
| `engine/src/game.ts` | Add `gameActive` field, improve error messages |
| `engine/src/index.ts` | Update CLI response formatting |

## Testing

Run playtest after each phase:
```bash
/start-game markovs-chains 2
```

Monitor for:
- Agents staying in loop
- Proper exit on game completion
- Error recovery behavior
