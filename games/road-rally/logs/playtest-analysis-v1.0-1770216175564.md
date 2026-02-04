# Road Rally v1.0 - Playtest Analysis

**Game ID:** road-rally-1770216175564
**Version:** v1.0
**Winner:** player-1 (by resignation)
**Duration:** 11 rounds, 22 turns
**Date:** 2026-02-04
**End Reason:** Engine malfunction - auto-advance feature failed

## Executive Summary

This playtest revealed a critical engine bug that makes Road Rally unplayable. Despite player-1 winning 7 tricks, neither player ever advanced from the Starting Line. The ladder-climbing mechanic's `auto_advance_winner` feature completely failed to execute, causing an unresolvable game state after 11 rounds.

## Game Flow Analysis

| Round | Player-1 Action | Player-2 Action | Winner | Board Position |
|-------|----------------|-----------------|--------|----------------|
| 1 | Speed 5 (lead) | Speed 7 (beat) | player-1 | Start (BUG: no advance) |
| 2 | Speed 3 (lead) | Speed 5 (beat) | player-1 | Start (BUG: no advance) |
| 3 | Speed 2 (lead) | Speed 10 (beat) | player-1 | Start (BUG: no advance) |
| 4 | Speed 4 (lead) | Speed 10 (beat) | player-1 | Start (BUG: no advance) |
| 5 | Speed 9 (lead) | Speed 2 (beat) | player-1 | Start (BUG: no advance) |
| 6 | Speed 2 (lead) | Nitro Burst (beat) | player-1 | Start (BUG: no advance) |
| 7 | Turbo Boost (lead) | PASS | - | Battle not resolved |
| 8 | PASS | PASS | - | Pass loop begins |
| 9 | Draw + PASS | PASS | - | Pass loop continues |
| 10 | Draw + PASS | Draw + PASS | - | Pass loop continues |
| 11 | (trick resolved) | RESIGN | player-1 | Start (BUG: no advance) |

## Critical Engine Bug

### The Problem

The engine's `auto_advance_winner` configuration for ladder-climbing is completely non-functional:

```json
"ladder_climbing": {
  "auto_advance_winner": true
}
```

### Expected Behavior

According to Road Rally rules:
> "When all players pass in succession, the last player who played wins the battle. The winner advances one space on the track."

After each trick resolution, the winner should automatically move from their current node to the next node on the rally track.

### Actual Behavior

- Player-1 won 6 tricks cleanly (rounds 1-6)
- Trick winners were correctly identified in the log
- **ZERO board advancement occurred**
- Both players remained at "start" position throughout entire game
- `tricksWon` counter incremented correctly (player-1: 7 tricks)
- Movement system never triggered

### Evidence

From final game state:
```json
"players": {
  "player-1": {
    "state": "start",
    "tricksWon": 7  // Should be at "Pit1" or beyond
  },
  "player-2": {
    "state": "start",
    "tricksWon": 0
  }
}
```

## Secondary Issue: Pass Loop Confusion

Rounds 7-11 showed player confusion about pass mechanics:

1. Round 7, turn 13: player-1 leads Turbo Boost (11)
2. Turn 14: player-2 passes (correct - cannot beat 11)
3. Turn 15-20: Both players continue passing and drawing cards
4. Turn 21: Trick finally resolves (player-1 wins)

### Analysis

The extended pass loop occurred because:
- Players didn't understand when a trick automatically resolves
- The engine may have unclear feedback about trick resolution timing
- With no board movement, players couldn't verify tricks were resolving

## What Worked

### Trick-Taking Mechanics
- Card comparison logic functioned correctly
- Ladder-climbing "must beat previous play" rules worked
- Winner determination was accurate
- Trick history was properly logged

### Player Behavior
- Both agents understood card values and beating requirements
- Strategic passing decisions were observed
- Player-2's resignation was well-reasoned and rule-based

### Data Tracking
- Hand management worked
- Draw deck/discard pile cycling functioned
- Action logging was comprehensive

## What Didn't Work

### CRITICAL: Movement System
- **Grade: F (Complete Failure)**
- Zero board advancement despite 7 won tricks
- Makes the racing game impossible to complete
- Core win condition (reach Finish Line) is unreachable

### Trick Resolution Feedback
- **Grade: D**
- Players uncertain when tricks resolve
- Extended pass loops suggest unclear state communication
- Need clearer "Battle Won!" messages with position updates

## Recommendations for v1.1

### URGENT: Fix Movement System

1. **Debug auto_advance_winner**
   - Check point-to-point-movement integration
   - Verify trigger fires on trick resolution
   - Test node transition logic

2. **Explicit Move Actions**
   - If auto-advance cannot be fixed, implement manual `move` action
   - Winner must explicitly `move` to next node after winning trick

3. **Add Movement Logging**
   ```json
   {
     "event": "player_moved",
     "player": "player-1",
     "from": "Start",
     "to": "Pit1",
     "reason": "Won trick 1"
   }
   ```

### Improve Trick Resolution Clarity

1. Add explicit "battle_resolved" events
2. Show position changes in action results
3. Provide clear feedback: "You won the battle and advanced to Pit Stop 1!"

### Clarify Pass Mechanics

Add to rules:
> "When all players pass consecutively (no plays between passes), the trick immediately resolves."

### Testing Checklist for v1.1

- [ ] Player wins trick and advances one space
- [ ] Player wins trick at Pit Stop and receives bonus card
- [ ] Player advances through full track (Start to Finish)
- [ ] Win condition triggers when reaching Finish
- [ ] Multiple consecutive tricks advance player multiple spaces

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | N/A | Game unplayable, never progressed |
| Strategic Depth | C+ | Card play decisions were interesting |
| Balance | N/A | Cannot assess without functional movement |
| Engine Performance | F | Critical feature completely broken |
| Rules Clarity | B- | Pass mechanics caused confusion |
| Playability | F | Game cannot be completed |

## Conclusion

Road Rally's core design shows promise - the combination of trick-taking and racing creates interesting tension. However, the engine's complete failure to implement board movement makes the game entirely unplayable. 

**This game CANNOT proceed to public playtest until the movement system is fixed.**

The bug is likely in the bridge between the ladder-climbing mechanic and the point-to-point-movement mechanic. The `auto_advance_winner: true` configuration suggests the intention was for automatic movement, but this integration is not functioning.

Player-2's resignation was entirely justified and demonstrated good rule knowledge by identifying the specific engine failure.

## Next Steps

1. **BLOCK release** until movement bug is fixed
2. Debug point-to-point + ladder-climbing integration
3. Add movement logging for visibility
4. Re-test with same scenario (should see advancement)
5. Conduct full playthrough to verify win condition
