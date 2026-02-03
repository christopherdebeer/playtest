# Draft Duel v1.0 PLAYTEST ANALYSIS

**Game ID:** draft-duel-1770129497757
**Version:** 1.0
**Winner:** player-2 (21 points)
**Loser:** player-1 (12 points)
**Duration:** 15 rounds, 30 turns
**Date:** 2026-02-03

## Executive Summary

Player-2 achieved a decisive victory with 21 points versus player-1's 12 points. The game reached the maximum round limit (15) rather than achieving the intended 3-round drafting structure. This indicates a fundamental disconnect between the game's design and its implementation.

## Critical Issue: Game Structure Failure

**MAJOR PROBLEM**: The game did not execute the intended closed-drafting mechanic at all.

### What Should Have Happened
- 3 drafting rounds with 7-card pools
- Simultaneous card selection and passing
- Pool exhaustion, then scoring

### What Actually Happened
- Players took turns drawing cards individually
- No draft pools were created
- No simultaneous selection occurred
- No card passing happened
- Players collected sets from their accumulated hands

**Impact**: The game essentially became a "draw and set collection" game, completely missing the core closed-drafting mechanic that defines Draft Duel.

## Game Flow Analysis

| Turn | Player-1 Action | Player-2 Action | Analysis |
|------|-----------------|-----------------|----------|
| 1-2 | Draw 1 card | Draw 1 card | Basic draw phase, no drafting |
| 3-4 | Draw 1 card | Draw 1 card | Continuing accumulation |
| 5-6 | Draw 1 card | Draw 1 card | Still no draft pools |
| 7-8 | Draw 1 card | Draw 1 card | Pattern continues |
| 9-10 | Collect Set (5pts) | Collect Set (5pts) | Both score first sets |
| 11-12 | Draw 1 card | Draw 1 card | Back to drawing |
| 13-14 | Draw 2 cards | Draw 1 card | P1 draws extra (catch-up?) |
| 15-16 | Draw 1 card | Draw 1 card | Steady state |
| 17-18 | Draw 1 card | Draw 1 card | Accumulation continues |
| 19-20 | Draw 1 card | Draw 1 card | Still drawing |
| 21-22 | Collect Set (5pts) | Collect Set (5pts) | Both score second sets |
| 23-24 | Draw 3 cards | Draw 1 card | P1 draws 3 (ability use) |
| 25-26 | Pass | Collect Set (5pts) | P1 gives up, P2 scores 3rd set |
| 27-28 | Pass | Draw 1 card | P1 continues passing |
| 29-30 | Pass | Collect Set (5pts) | P2 scores 4th set and wins |

## Key Observations

### What Worked
- **Set collection mechanic**: Successfully validated and scored sets
- **Turn-taking**: Alternating turns worked smoothly
- **Score tracking**: Final scores accurately reflected collected sets
- **Agent decisions**: Both agents understood how to collect sets

### What Didn't Work
- **Closed drafting**: Completely absent from gameplay
- **Draft pools**: Never created or populated
- **Simultaneous selection**: Never occurred
- **Card passing**: No cards were passed between players
- **Once-per-game abilities**: Not visibly used (though P1's turn 23 draw of 3 cards suggests Deep Pockets)
- **Catch-the-leader mechanic**: No evidence of catch-up bonuses triggering
- **Round structure**: Game ran to max rounds instead of completing 3 drafting rounds

### Balance Findings

**Player Performance:**
- Player-2: 4 sets collected, 21 points, never passed
- Player-1: 2 sets collected, 12 points, passed 3 consecutive turns at end

**Strategic Patterns:**
- Player-2 maintained consistent engagement throughout
- Player-1 appeared to give up after round 12 (passed remaining turns)
- No evidence of strategic drafting since drafting didn't occur
- Set collection was the only viable scoring path

**Catch-Up Mechanic:**
- Player-1 was behind from turn 10 onward (after first set exchange)
- Should have received extra draws and bonus points
- Turn 13 shows P1 drew 2 cards (possibly catch-up trigger)
- Turn 23 shows P1 drew 3 cards (likely ability use)
- However, gap widened to 9 points by end, suggesting catch-up insufficient

## Recommendations for Next Version

### Critical - Fix Core Mechanic
1. **Implement closed-drafting properly**
   - Create draft pools of 7 cards per player at round start
   - Implement simultaneous selection phase
   - Add card passing logic (left/right alternation)
   - Ensure pools exhaust before next round

2. **Fix round structure**
   - Game should run exactly 3 drafting rounds
   - Each round = pool distribution + 7 picks + passing
   - End game after round 3, not after arbitrary turn limit

### High Priority - Game Balance
3. **Strengthen catch-up mechanic**
   - Current implementation allows 9-point gaps
   - Consider increasing catch-up bonuses
   - Or decrease lead threshold from 5 to 3 points

4. **Clarify ability usage**
   - Add visible feedback when abilities are used
   - Log ability activations to game history
   - Prevent confusion about what triggered multi-draws

### Medium Priority - Gameplay
5. **Prevent player disengagement**
   - Player-1 passed 3 consecutive turns
   - Add minimum action requirements
   - Or provide incentive for continued play even when behind

6. **Add drafting strategy guidance**
   - Once drafting works, provide tips on reading the table
   - Explain hate-drafting concept
   - Show what cards opponents are collecting

### Low Priority - Polish
7. **Better set validation**
   - Turn 22: "Swift, Swift, Swift" counted as Element Set (should still work but name is misleading)
   - Turn 26: "Insight, Insight, Block" counted as Element Set (bonus + action cards)
   - Clarify whether Element Set requires element field or just matching names

8. **Add round transition announcements**
   - Clear feedback when rounds end
   - Show draft direction for upcoming round
   - Display scores between rounds

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | C | 15 rounds too long; should be 3 rounds |
| Strategic Depth | F | Core drafting mechanic didn't function |
| Balance | D | 9-point gap despite catch-up mechanic |
| Player Engagement | D | Player-1 gave up and passed 3 turns |
| Engine Performance | F | Critical mechanic (closed-drafting) not implemented |
| Set Collection | B | This mechanic worked correctly |
| Score Tracking | A | Accurate point calculation |

**Overall Grade: F**

The game cannot be properly evaluated because its core mechanic (closed drafting) did not function. The engine executed a completely different game than what was designed. This is a critical implementation failure that must be addressed before any balance or strategic depth can be assessed.

## Next Steps

1. Debug the closed-drafting mechanic implementation
2. Test with draft pool creation and passing
3. Verify simultaneous selection works
4. Re-run playtest once drafting is functional
5. Only then can we evaluate the game's actual strategic depth and balance

## Positive Notes

Despite the implementation issues:
- Set collection worked perfectly
- Agents understood the scoring system
- Game reached a conclusive end state
- No engine crashes or hangs
- Player state tracking was accurate

The foundation is solid; the game just needs its signature mechanic to actually function.
