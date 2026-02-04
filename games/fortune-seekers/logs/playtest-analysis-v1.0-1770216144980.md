# Fortune Seekers v1.0 - Playtest Analysis

**Game ID:** fortune-seekers-1770216144980  
**Version:** 1.0  
**Winner:** player-1 (50 points vs 0 points)  
**Duration:** 20 rounds (max rounds reached), 41 turns  
**End Condition:** Timeout - Neither player reached 100 point goal  
**Date:** 2026-02-04

## Executive Summary

This playtest revealed a critical game balance issue: **neither player came close to the 100 point win condition** in 20 rounds. Player-1 won with only 50 points while player-2 scored 0 points. The game ended by timeout, not by achieving victory. This suggests the scoring system is severely underpowered or the win threshold is too high.

## Game Flow Analysis

| Round | Player-1 Action | Player-1 Score | Player-2 Action | Player-2 Score | Notes |
|-------|-----------------|----------------|-----------------|----------------|-------|
| 1 | Draft: Extra Roll | 0 | Draft: Diamond | 0 | P2 takes valuable card |
| 2 | Draft: Gold Coin | 0 | Draft: Extra Roll | 0 | Both collecting cards |
| 3 | Play: Gold Coin (+5) | 5 | Play: Diamond (+20) | 20 | P2 takes early lead |
| 4 | Play: Extra Roll | 5 | Play: Extra Roll | 20 | Setting up for rolls |
| 5 | Draft: Silver Bar | 5 | Draft: Double Down | 20 | Card accumulation |
| 6 | Play: Silver Bar (+10) | 15 | Play: Double Down | 20 | P1 gaining ground |
| 7 | Roll: 6 (+10 acc) | 15 | Draft: Gold Coin | 20 | P1 starts push-your-luck |
| 8 | Roll: 4 (+20 acc) | 15 | Draft: Gold Coin | 20 | P1 building accumulator |
| 9 | Roll: 1 (BUST -20) | 15 | Draft: Gold Coin | 20 | Critical bust! |
| 10 | Pass | 15 | Draft: Gold Coin | 20 | P2 hoarding coins |
| 11 | Roll: 3 (+10 acc) | 15 | Draft: Gold Coin | 20 | P1 tries again |
| 12 | Roll: 2 (+20 acc) | 15 | Draft: Gold Coin | 20 | Conservative rolling |
| 13 | Roll: 2 (+30 acc) | 15 | Play: Gold Coin (+5) | 25 | P1 building up |
| 14 | Roll: 5 (+40 acc) | 15 | Play: Gold Coin (+5) | 30 | 40 points at risk |
| 15 | Roll: 5 (+50 acc) | 15 | Pass | 30 | P1 has huge accumulator |
| 16 | Bank: 50 pts | 50 | Draft: Crown Jewel | 30 | Smart bank! P1 takes lead |
| 17 | Roll: 4 (+10 acc) | 50 | Play: Crown Jewel (+30) | 60 | Wait, P2 at 60? |
| 18 | Roll: 3 (+20 acc) | 50 | Pass | 60 | P2 should be winning |
| 19 | Roll: 5 (+30 acc) | 50 | Pass | 60 | Scores seem wrong |
| 20 | Draft: Silver Bar | 50 | Pass | 60 | Game ends |

**CRITICAL DISCREPANCY**: The game log shows player-2 playing cards worth 60 points total (Diamond 20 + Gold Coin 5 + Gold Coin 5 + Crown Jewel 30), but final score shows 0 points. This indicates a **scoring bug in the engine**.

## Key Observations

### What Worked

1. **Push-your-luck mechanic** - The dice rolling with bust risk created tension (Round 9 bust was dramatic)
2. **Draft display** - Players could see and compete for valuable cards
3. **Banking decision** - Player-1's Round 16 bank of 50 points was a smart strategic moment
4. **Card variety** - Mix of treasure, modifier, and risk cards provided choices

### Critical Issues Found

1. **SCORING BUG** - Player-2's score shows 0 despite playing 60 points worth of cards. The engine is not tracking scores correctly.

2. **Game length vs win condition mismatch** - 20 rounds was insufficient to reach 100 points even with correct scoring:
   - Player-1: 15 pts from cards + 50 pts from dice = 65 total theoretical
   - Player-2: 60 pts from cards + 0 from dice = 60 total
   - Even combined, neither approached 100

3. **Risk-reward imbalance** - Rolling dice (10 pts per success, 1/6 bust chance) is less attractive than drafting treasure cards (5-30 pts guaranteed). Player-2 never rolled dice at all.

4. **Accumulator mechanic unclear** - Player-1 accumulated 30 points by Round 20 but the final state shows this wasn't banked. Rules unclear on what happens to unbanked accumulator at game end.

5. **No urgency** - Players passed frequently (13+ pass actions) suggesting they lacked compelling actions to take.

### Player Behavior Patterns

**Player-1 (casual persona)**:
- Balanced strategy: drafted cards AND rolled dice
- Took calculated risks (rolled 10 times total)
- Successfully banked 50 points once
- Final hand: 1 Silver Bar, 30 unbanked accumulator

**Player-2 (strategic persona)**:
- Risk-averse: NEVER rolled dice
- Pure drafting strategy
- Hoarded 6 Gold Coins early/mid game
- Played high-value cards (Diamond, Crown Jewel)
- Final hand: 4 Gold Coins (20 pts value)

## Balance Findings

### Scoring Rate
- **Current**: ~2.5 points per round average (with bugs)
- **Required**: 5 points per round to reach 100 in 20 rounds
- **Problem**: Base scoring is too slow

### Dice Rolling Economics
- Expected value per roll: (5/6) × 10 = 8.33 points
- But requires banking to realize value
- Risk of bust (lose all accumulated) discourages rolling
- **Verdict**: Not attractive enough vs safe card drafting

### Card Values
- Gold Coin (5 pts): Easy to get, accumulate
- Diamond (20 pts): Strong mid-game
- Crown Jewel (30 pts): Highest value, but still not enough
- **Problem**: Even high-value cards insufficient to reach 100

### Variable Powers Not Seen
- Game state doesn't show which powers players had
- No evidence of power effects in action log
- Powers may not be implemented or visible

## Recommendations for Next Version

### HIGH PRIORITY

1. **Fix scoring bug** - Player-2's score should be 60, not 0. Investigate card point application logic.

2. **Reduce win condition to 50 points** OR **increase max rounds to 40** - Current 100/20 is mathematically impossible.

3. **Buff dice rolling rewards**:
   - Increase base roll value from 10 to 15 points
   - OR add multiplier for consecutive successful rolls
   - OR reduce bust threshold probability

4. **Clarify accumulator rules**:
   - What happens to unbanked accumulator at turn end?
   - Does it carry over or disappear?
   - At game end, does it count toward final score?

### MEDIUM PRIORITY

5. **Display player powers** - Make sure powers are visible in state and logs

6. **Add pressure mechanics**:
   - Introduce round-based scoring bonuses (e.g., "Round 10+: double points")
   - Or add catch-up mechanics for trailing player
   - Or make draft display shrink over time (increase scarcity)

7. **Reduce pass spam**:
   - Make pass cost something (lose 1 pt?)
   - OR make pass end turn immediately (no more actions)
   - OR add "must roll at least once per turn" rule

8. **Balance card distribution**:
   - More high-value cards (Diamond, Crown Jewel)
   - OR make Gold Coins worth 10 instead of 5
   - OR add set collection bonuses

### LOW PRIORITY

9. **Add player power indicators** to action log (e.g., "rolled 15 pts with Greedy power")

10. **Track bust statistics** for balance analysis

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | D | 20 rounds insufficient; neither player close to 100 |
| **Strategic Depth** | C+ | Multiple strategies visible but not balanced |
| **Balance** | F | Scoring bug + math impossible win condition |
| **Engine Performance** | D- | Critical scoring bug breaks the game |
| **Player Engagement** | C | Too many passes suggest lack of compelling moves |
| **Push-Your-Luck Mechanic** | B- | Works but undervalued vs safe plays |
| **Overall Playability** | D | Needs significant fixes before next test |

## Conclusion

This playtest uncovered a **game-breaking scoring bug** and a **fundamental balance issue** with the win condition. The game cannot be completed as designed because 100 points is unreachable in 20 rounds with current scoring rates.

**Next version must**:
1. Fix player-2 scoring bug
2. Adjust win condition to 50 points OR double max rounds
3. Make dice rolling more attractive than pure card drafting

Without these changes, the game will always end in timeout with no winner achieving the stated goal.
