# Engine Masters v1.0 PLAYTEST ANALYSIS

**Game ID:** engine-masters-1770216175985
**Version:** 1.0
**Winner:** player-1 (by timeout)
**Final Scores:** player-1: 0 points, player-2: 0 points
**Duration:** 30 rounds (61 turns)
**Date:** 2026-02-04

## CRITICAL ISSUE: Game Stalled Completely

This playtest revealed a **catastrophic failure** - the game completely stalled with both players passing repeatedly for 20+ rounds. Neither player scored a single point in 30 rounds despite the win condition being 50 points.

## Game Flow Analysis

| Phase | Rounds | Activity | Analysis |
|-------|--------|----------|----------|
| **Early Game** | 1-5 | Minimal activity | Players played 1-2 cards each, acquired 1 Bronze Generator each |
| **Mid Game** | 6-12 | Mostly passing | Players passed most turns, one card played in round 12 |
| **Late Game** | 13-30 | Complete stall | Both players passed every single turn for 18 rounds |

### Detailed Turn Breakdown

**Rounds 1-5 (Active Play):**
- Turn 1: player-1 plays Copper Generator (+1 power), passes
- Turn 2: player-2 plays Copper Generator (+1 power), passes
- Turn 3: player-1 plays Basic Assembler (draw 1), passes
- Turn 4: player-2 acquires Bronze Generator (cost 3), passes
- Turn 5: player-1 plays Copper Generator, passes; player-2 draws from deck, passes

**Rounds 6-11 (Transition to Stall):**
- All 12 turns: Both players just passed immediately

**Round 12 (Brief Activity):**
- player-1 plays Bronze Generator (+2 power), passes
- player-2 passes

**Rounds 13-30 (Complete Stall):**
- All 36 turns: Both players passed immediately
- No cards played, no acquisitions, no progress toward victory

### Final State

**player-1:**
- Hand: 2 cards (Copper Generator, Basic Assembler)
- Resources: 2 power, engine level 1
- Score: 0 points
- Acquired cards: 1 (Bronze Generator)

**player-2:**
- Hand: 3 cards (2x Basic Assembler, Copper Generator)
- Resources: 1 power, engine level 1
- Score: 0 points
- Acquired cards: 1 (Bronze Generator)

**Supply:** Completely untouched except for 2 Bronze Generators sold

## Root Cause Analysis

### Why Did the Game Stall?

Several possible causes:

1. **Insufficient Starting Resources**
   - Starting power: 3
   - Cheapest card: Bronze Generator (3 power)
   - After buying one card, players had 0-1 power remaining
   - No automatic resource growth occurred (or was too slow)

2. **Automatic Resource Growth Not Working**
   - The rules state: "Your power grows by 10% (rounded down) + 1 per engine level"
   - With 1-3 power and engine level 1, this should give 1-2 power per turn
   - But players still couldn't afford anything after 20+ rounds
   - **LIKELY BUG:** The automatic growth mechanic may not be implemented in the engine

3. **Player Agent Confusion**
   - Both agents may not understand the deck-building mechanics
   - They passed even when they might have had valid actions
   - No attempt to play cards from hand to generate power

4. **Draw Phase Not Working**
   - Rules state "Draw 5 cards from your personal deck"
   - Final state shows empty decks but small hands (2-3 cards)
   - **LIKELY BUG:** The draw phase may not be happening automatically

## Mechanics Assessment

### Deck Building - **GRADE: F**
**Observation:** Completely non-functional.
- Only 2 acquisitions in entire game (1 per player)
- Supply remained essentially full
- Players never built their engines beyond starting cards
- No deck cycling, no trash actions, no strategic purchases

**Issue:** Without working resource generation, the acquisition mechanic never got tested.

### Automatic Resource Growth - **GRADE: F**
**Observation:** Either not implemented or extremely broken.
- Players stuck with 1-2 power for 20+ rounds
- Should have been generating 1-2 power per turn minimum
- With even minimal growth, players would have 30+ power by round 30

**Issue:** This is the PRIMARY MECHANIC FAILURE. The automatic growth is the engine that drives the game, and it's not working.

### Chaining - **GRADE: F** 
**Observation:** Never tested.
- No combo cards acquired
- No chains triggered (except possibly Generator Synergy once)
- Chain mechanics require active play, which never happened

**Issue:** Can't evaluate chaining when no cards are being played.

## Critical Bugs Identified

### 1. Automatic Resource Growth Not Functioning
**Severity:** CRITICAL - Game Breaking

The core mechanic is not working. With engine_level=1 and starting power around 3, players should gain approximately:
- Round 1: +1 power (10% of 3 + 1 = 1)
- Round 2: +1 power  
- By round 10: Should have accumulated 10+ power
- By round 30: Should have 30+ power

Instead, final power levels were 1-2. This is impossible if automatic growth is working.

**Recommendation:** Check engine implementation of automatic_resource_growth timing="turn" rules.

### 2. Draw Phase Not Working
**Severity:** CRITICAL - Game Breaking

Rules state "Draw 5 cards from your personal deck into your hand" each turn. Final state shows:
- Empty personal decks
- Hands of only 2-3 cards
- No evidence of cards cycling through draw/discard

**Recommendation:** Verify Phase 2 (Draw Phase) is being executed before action phase.

### 3. Phase Execution Order
**Severity:** HIGH

The turn structure may not be executing correctly:
1. Engine Growth (automatic) - NOT WORKING
2. Draw Phase (5 cards) - LIKELY NOT WORKING  
3. Action Phase - Working (players can pass)
4. Cleanup - Unknown

**Recommendation:** Add logging to each phase to verify execution.

## Player Agent Behavior

Both players showed identical patterns:
- Initial few turns: Attempted basic actions
- Mid-game: Gave up and started passing
- Late game: Continued passing until timeout

**Issue:** The agents may have recognized they were stuck and couldn't progress, leading to repeated passing.

## Game Balance Assessment

**Cannot be evaluated.** The game never functioned, so balance cannot be assessed.

## Recommendations for Next Version

### Immediate Fixes (Required before next playtest)

1. **FIX AUTOMATIC RESOURCE GROWTH**
   - Verify the automatic_resource_growth rules are being applied each turn
   - Add logging to show: "player-1 gains 1 power from growth (10% of 3) + 1 power from engine_bonus"
   - Test that power actually accumulates turn over turn

2. **FIX DRAW PHASE**
   - Ensure 5 cards are drawn at start of each turn
   - Implement deck shuffling when empty (reshuffle discard)
   - Log draw actions: "player-1 draws 5 cards: [names]"

3. **ADD PHASE LOGGING**
   - Log each phase: "PHASE 1: Engine Growth", "PHASE 2: Draw", etc.
   - Show resource changes: "power: 3 -> 5 (+2 from growth)"
   - This will make debugging much easier

4. **INCREASE STARTING RESOURCES**
   - Temporary fix: Start with 10 power instead of 3
   - This would allow some play even if growth is slow
   - Remove once automatic growth is fixed

### Testing Before Next Playtest

Run unit tests to verify:
1. Power grows by (10% + engine_level) each turn
2. Deck draw happens automatically
3. Acquired cards go to discard pile
4. Discard shuffles into deck when empty
5. Played cards go to discard pile

### Long-term Design Considerations

Once the engine is fixed:
1. Re-test to verify game can actually reach 50 points
2. Adjust costs/effects based on actual growth rates
3. Test chaining mechanics with real play
4. Balance engine upgrade costs vs. generator costs

## Conclusion

This playtest was a **complete failure due to critical engine bugs**, not game design issues. The game mechanics (deck building, automatic growth, chaining) are sound in theory but completely non-functional in practice.

**Priority 1:** Fix automatic resource growth  
**Priority 2:** Fix draw phase  
**Priority 3:** Add debugging logs  
**Priority 4:** Re-test with fixed engine  

The game cannot be evaluated for balance or fun until these fundamental mechanics work.

## Next Steps

1. Fix the engine bugs listed above
2. Run a 5-turn test game with logging enabled
3. Verify resources grow and cards cycle
4. Run a full 30-round playtest
5. Then evaluate game balance and design

---

**Gamemaster Note:** This analysis is based on the log file showing repeated passing and final state showing no progress. The game design itself may be excellent, but the implementation prevented any meaningful playtest.
