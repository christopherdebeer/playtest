# Proposal 009: Agent Recovery After Adjudication

**Status**: Draft
**Category**: Agent Ergonomics
**Priority**: High
**Discovered**: AAOTE Playtest v0.1 (2026-01-31)

## Problem Statement

When a player agent submits a resignation (or victory claim) that gets rejected by the gamemaster, the agent fails to re-enter its game loop. The agent believes the game is over and stops playing, requiring manual intervention.

### Evidence from Playtest

```
Turn 10: player-3 submits resignation
Turn 10: GM rejects resignation
Turn 11-13: player-3 agent stopped, manual passes required
(Agent respawned)

Turn 32: player-2 submits resignation
Turn 32: GM rejects resignation
Turn 32+: player-2 agent stopped, manual respawn required
```

Both resignation rejections caused the respective agents to stop functioning, requiring 5 total respawns during the playtest.

### Root Cause

The player agent's game loop exits after submitting a resignation:

```typescript
// Current player agent behavior (pseudocode)
async function playGame() {
  while (true) {
    const turnResult = await waitForTurn();

    if (shouldResign()) {
      await submitResignation();
      console.log("Game over - resigned");
      return;  // <-- Exits loop, assumes resignation accepted
    }

    await executeAction();
  }
}
```

The agent doesn't check if the resignation was accepted or rejected.

## Proposed Solution

### Solution A: Blocking Resignation with Result (Recommended)

Modify the resignation submission to return the adjudication result:

```bash
# Current
./playtest player:resign <game> -p <player> -r "reason"
# Returns immediately, adjudication happens async

# Proposed
./playtest player:resign <game> -p <player> -r "reason" --wait
# Blocks until GM adjudicates, returns result
```

Response format:
```json
{
  "success": true,
  "resignation": {
    "accepted": false,
    "reason": "GM ruling: Victory is not impossible..."
  },
  "gameStatus": "in_progress",
  "yourTurn": true
}
```

### Solution B: Notification System

Add a notification when returning to `player:turn`:

```json
{
  "success": true,
  "turn": 11,
  "currentPlayer": "player-3",
  "notifications": [
    {
      "type": "resignation_rejected",
      "message": "Your resignation was rejected. Reason: ...",
      "timestamp": "2026-01-31T18:15:27Z"
    }
  ],
  "actions": [...]
}
```

### Solution C: Agent Prompt Update

Update the player agent prompt to handle rejections:

```markdown
## Resignation Handling

When you submit a resignation:
1. Call `./playtest player:resign ...`
2. IMMEDIATELY call `./playtest player:turn ...` to check result
3. If game status is still "in_progress", continue playing
4. Only exit if game status is "ended" or "cancelled"

NEVER assume your resignation was accepted. Always verify game status.
```

## Recommended Approach

Implement **Solution A** (blocking resignation) as the primary fix, with **Solution B** (notifications) as a fallback for async scenarios.

### Implementation Details

#### Engine Changes

```typescript
// engine/src/index.ts - resign command

program
  .command('player:resign <game>')
  .option('-p, --player <id>', 'Player ID')
  .option('-r, --reason <reason>', 'Resignation reason')
  .option('--wait', 'Wait for adjudication result')
  .action(async (game, options) => {
    const result = await submitResignation(game, options.player, options.reason);

    if (options.wait) {
      // Block until GM adjudicates
      const adjudication = await waitForAdjudication(game, options.player, 'resignation');
      console.log(JSON.stringify({
        success: true,
        resignation: {
          accepted: adjudication.accepted,
          reason: adjudication.rulingReason
        },
        gameStatus: adjudication.gameStatus,
        yourTurn: adjudication.currentPlayer === options.player
      }));
    } else {
      console.log(JSON.stringify(result));
    }
  });
```

#### Wait for Adjudication

```typescript
async function waitForAdjudication(
  gameId: string,
  playerId: string,
  type: 'resignation' | 'victory'
): Promise<AdjudicationResult> {
  const timeout = 120000; // 2 minute timeout
  const pollInterval = 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const state = loadGameState(gameId);
    const pending = state.contestState?.resignations?.find(
      r => r.player === playerId && r.accepted !== undefined
    );

    if (pending) {
      return {
        accepted: pending.accepted,
        rulingReason: pending.rulingReason,
        gameStatus: state.status,
        currentPlayer: state.currentPlayer
      };
    }

    await sleep(pollInterval);
  }

  throw new Error('Adjudication timeout');
}
```

#### Player Agent Update

```markdown
<!-- .claude/agents/player.md addition -->

## Resignation and Victory Claims

When submitting a resignation or victory claim:

1. Use the `--wait` flag to block until adjudication:
   ```bash
   ./playtest player:resign {INSTANCE_ID} -p {PLAYER_ID} -r "reason" --wait
   ```

2. Check the response:
   - If `resignation.accepted: true` - Game is over, you may exit
   - If `resignation.accepted: false` - Game continues, resume your turn loop

3. CRITICAL: Never exit your game loop until you receive confirmation that the game has ended.
```

### Files to Modify

1. `engine/src/index.ts` - Add `--wait` flag to resign command
2. `engine/src/game.ts` - Add `waitForAdjudication()` helper
3. `.claude/agents/player.md` - Update resignation handling instructions

## Testing

1. Submit resignation, GM accepts - agent exits cleanly
2. Submit resignation, GM rejects - agent continues playing
3. Submit victory claim, GM accepts - game ends
4. Submit victory claim, GM rejects - agent continues playing
5. Adjudication timeout - agent receives error, continues playing

## Edge Cases

1. **GM Agent Crashes**: Timeout should trigger, agent continues
2. **Network Issues**: Retry logic with exponential backoff
3. **Multiple Resignations**: Queue and process in order
4. **Resignation During Own Turn**: Resume turn after rejection

## Migration

- Add `--wait` flag as optional (backwards compatible)
- Update agent prompts to recommend `--wait` usage
- Log warning if resignation submitted without `--wait`

---

*Proposal created based on AAOTE playtest findings*
