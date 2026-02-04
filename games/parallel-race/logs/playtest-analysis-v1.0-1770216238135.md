# Parallel Race v1.0 PLAYTEST ANALYSIS

**Game ID:** parallel-race-1770216238135  
**Version:** 1.0  
**Winner:** player-2 (by resignation of opponent)  
**Duration:** 4 rounds, 7 turns  
**Date:** 2026-02-04  
**End Reason:** Critical engine bug - movement cards did not update player positions

## Executive Summary

This playtest was **TERMINATED DUE TO CRITICAL ENGINE BUG**. The game's core mechanic (racing from Start to Finish using movement cards) completely failed. Despite players successfully playing movement cards (Dash +3, Burst +4, Sprint +2), no player positions updated from the starting position. The win condition became unreachable, making the game unwinnable.

**Critical Finding:** The freeplay mechanic does not properly integrate with point-to-point movement. Card effects are recognized but not executed on the movement graph.

## Game Flow Analysis

| Turn | Player | Action | Card/Effect | Result | Analysis |
|------|--------|--------|-------------|--------|----------|
| 1 | player-1 | play_card | Dash (+3) | Success | Card played, no position change |
| 1 | player-1 | pass | - | - | Ended turn |
| 2 | player-2 | play_card | Burst (+4) | Success | Card played, no position change |
| 2 | player-2 | pass | - | - | Ended turn |
| 3 | player-1 | play_card | Sprint (+2) | Success | Card played, no position change |
| 3 | player-1 | pass | - | - | Ended turn |
| 4 | player-2 | play_card | Sprint (+2) | Success | Card played, no position change |
| 4 | player-2 | pass + victory claim | - | REJECTED | False claim - still at start |
| 5 | player-1 | contest filed | - | ALLOWED | Contest of Sprint card rejected |
| 6 | player-2 | draw | 1 card | Success | Attempted to continue |
| 6 | player-2 | pass | - | - | Ended turn |
| 7 | player-1 | resign | - | ACCEPTED | Valid resignation due to bug |

## Critical Issues Found

### 1. BLOCKER: Point-to-Point Movement Integration Failure

**Severity:** CRITICAL - Game Unplayable  
**Description:** Movement cards (Sprint, Dash, Burst) are accepted by the engine and placed successfully, but do not trigger any position updates on the point-to-point movement graph.

**Expected Behavior:**
- Player plays Sprint (+2) from Start
- Player position updates: Start → Mile 1 → Mile 2
- Game state reflects new position

**Actual Behavior:**
- Player plays Sprint (+2) from Start
- Card is discarded, effect noted in log
- Player position remains: Start
- No movement occurs

**Root Cause:** The freeplay engine mechanic does not have proper hooks to execute card effects on the point-to-point movement system. Card plays are validated and logged, but the `move_forward` effect is not translated into node transitions.

**Impact:**
- Win condition (reaching Finish) is unreachable
- Game becomes unwinnable after any number of turns
- Players correctly identified the bug and were unable to continue

### 2. False Victory Declaration

**Description:** Player-2 attempted to declare victory by passing with `victoryDeclaration: true`, claiming to have reached Finish.

**Gamemaster Ruling:** REJECTED - Player was still at start position, not at Finish node.

**Analysis:** This appears to be a desperate attempt to end an unwinnable game rather than actual cheating. The victory declaration mechanic worked correctly (claim was rejected and rolled back).

### 3. Contest System Validation

**Description:** Player-1 filed a contest against player-2's Sprint card, noting the position tracking failure.

**Gamemaster Ruling:** ALLOWED - The card play itself was legal; the bug is in the engine, not player behavior.

**Analysis:** The contest system functioned correctly. Players understood they could challenge actions they suspected were invalid.

## What Worked

1. **Contest/Adjudication System** - Players successfully filed contests, and the gamemaster properly evaluated them
2. **Resignation Flow** - Clean resignation process with detailed reasoning
3. **Card Play Mechanics** - Cards were drawn and played successfully (though effects didn't execute)
4. **Freeplay Action Logging** - All actions were properly logged with timestamps
5. **Victory Declaration Validation** - False victory claims were correctly rejected

## What Didn't Work

1. **Point-to-Point Movement** - Complete failure (BLOCKER)
2. **Card Effect Execution** - Movement effects not applied to game state
3. **Win Condition** - Unreachable due to movement bug
4. **Freeplay Integration** - Does not properly execute mechanics from other systems

## Mechanics Observed

- **point-to-point-movement** - FAILED (not functional)
- **freeplay** - PARTIAL (actions accepted but effects not executed)
- **contest-based-adjudication** - WORKING
- **victory-declaration** - WORKING (correctly rejected false claim)

## Player Behavior Analysis

### player-1 (Casual Persona)
- Played conservatively with medium-value cards
- Correctly identified the engine bug
- Filed a valid contest when position tracking failed
- Resigned appropriately when game became unwinnable

**Strategy:** Attempted steady advancement, recognized futility

### player-2 (Cheater Persona)
- Played aggressively with high-value Burst card first
- Attempted false victory declaration when stuck
- Continued playing after rejection

**Strategy:** Aggressive opening, attempted rule exploitation when frustrated

## Grading

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | N/A | Game unplayable - terminated at turn 7 |
| Strategic Depth | N/A | Cannot evaluate - core mechanic non-functional |
| Balance | N/A | Cannot evaluate - no movement occurred |
| Engine Performance | F | Critical bug makes game completely unplayable |
| Mechanic Integration | F | Freeplay and point-to-point systems do not communicate |

## Recommendations for Next Version

### Priority 1: CRITICAL FIXES (Required Before Next Playtest)

1. **Fix Point-to-Point Movement in Freeplay Mode**
   - Implement proper effect execution hooks in freeplay engine
   - Ensure `move_forward` effects trigger node transitions
   - Add validation that position updates occur after card play
   - Test: Player plays Sprint (+2) from Start → should be at Mile 2

2. **Add Position Validation**
   - After each action, verify player positions match expected values
   - Log position changes explicitly in action results
   - Throw errors if effects fail to execute

3. **Integration Testing**
   - Create unit tests for freeplay + point-to-point interaction
   - Test each movement card type (Sprint, Dash, Burst, Stumble)
   - Verify win condition is reachable

### Priority 2: Design Improvements (After Core Fix)

4. **Clarify Movement Card Behavior**
   - Should Sprint (+2) move exactly 2 nodes, or 2 spaces?
   - What happens if a player tries to move beyond Finish?
   - Can Stumble move a player backward from Start?

5. **Freeplay Pacing**
   - Current round length (8 actions) was never reached due to bug
   - Consider whether simultaneous play makes sense for a race (might create timing issues)
   - Evaluate if turn-based play would be clearer for this game type

6. **Block Card Mechanic**
   - Block cards were never played (players focused on movement)
   - Consider whether blocking makes sense in freeplay mode
   - May need to clarify when/how blocks apply to simultaneous actions

### Priority 3: Polish (After Playable)

7. **Visual Feedback**
   - Add clear position indicators in game state
   - Show distance to finish for each player
   - Log movement transitions explicitly

8. **Victory Condition**
   - Current "first to Finish" is clear
   - Consider adding alternate win conditions (e.g., turns limit)

## Technical Notes

**Engine Version:** Freeplay + Point-to-Point Movement v1.0  
**Test Environment:** Claude Code Playtest Framework  
**Agent IDs:** player-1 (casual), player-2 (cheater), gm-agent (gamemaster)

**Bug Report Filed:** Movement card effects not executed in freeplay mode - investigate GameEngine.executeAction() integration with point-to-point movement mechanic.

## Conclusion

This playtest successfully identified a critical engine bug that prevents the game from functioning. While the game design appears sound (simple race with card-based movement), it cannot be properly evaluated until the freeplay + point-to-point movement integration is fixed.

**Status:** Game is currently UNPLAYABLE and requires engine fixes before re-testing.

**Next Steps:**
1. Fix effect execution in freeplay mode
2. Add integration tests
3. Re-run playtest with same configuration
4. Evaluate game balance and pacing once functional
