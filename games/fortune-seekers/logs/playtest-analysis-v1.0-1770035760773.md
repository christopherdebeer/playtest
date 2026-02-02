# Fortune Seekers v1.0 - Playtest Analysis

**Game ID:** fortune-seekers-1770035760773
**Version:** v1.0
**Winner:** player-2 (70 points)
**Final Scores:** player-2: 70 pts | player-1: 0 pts
**Duration:** 20 rounds (41 turns)
**End Condition:** Maximum rounds reached
**Date:** 2026-02-02

## Executive Summary

Player-2 dominated this playtest, winning 70-0 through consistent, conservative play. Player-1 drafted high-value cards early (2x Crown Jewel worth 30 pts each) but failed to leverage them effectively, while player-2 focused on reliable push-your-luck banking strategies. The game reached the maximum 20 rounds without either player approaching the 100-point win condition, suggesting the target may be too high for the current card values and mechanics.

## Game Flow Analysis

### Opening Phase (Rounds 1-5)

| Round | Player-1 | Player-2 | Analysis |
|-------|----------|----------|----------|
| 1 | Drafted Crown Jewel (30 pts) | Drafted Silver Bar (10 pts) | P1 got lucky with highest-value card |
| 2 | Played Crown Jewel | Played Silver Bar | P2 scored first with Collector power (2x = 20 pts) |
| 3 | Drew card | Rolled 4 (+10 accumulated) | P2 started push-your-luck strategy |
| 4 | Played Crown Jewel | Drafted Extra Roll | P1 wasted second Crown Jewel for 0 pts |
| 5 | Drew card | Played Extra Roll | Setting up for roll phase |

**Key Observation:** Player-1 drafted extremely well (2x Crown Jewels) but the game doesn't properly award points for played cards, resulting in 0 points despite playing 60 pts worth of treasure.

### Mid-Game (Rounds 6-13)

Player-2 established a consistent pattern:
- Roll once or twice per turn
- Bank accumulated points conservatively
- Steady progression: 20 pts (R7) → 40 pts (R13) → 50 pts (R15)

Player-1 continued to draft and play cards but accumulated no points, suggesting a fundamental scoring issue with the card mechanics.

### End Game (Rounds 14-20)

| Round | Player-2 Score | Key Action |
|-------|----------------|------------|
| 13 | 40 pts | Banked 20 pts |
| 15 | 50 pts | Banked 10 pts |
| 17 | 60 pts | Banked 10 pts |
| 19 | 70 pts | Banked 10 pts (final score) |

Player-2 maintained steady 10-point increments per 2 rounds. Player-1 effectively stopped playing after round 15, passing every turn through round 20.

## Critical Issues Found

### 1. Card Scoring Broken
**Severity:** CRITICAL

Player-1 played valuable treasure cards (2x Crown Jewel = 60 pts, 1x Diamond = 20 pts, 1x Silver Bar = 10 pts, 2x Gold Coin = 10 pts) totaling ~100 points worth of cards, but scored 0 points.

**Expected:** Playing treasure cards should award points immediately
**Actual:** No points awarded for playing cards
**Impact:** Drafting strategy is completely non-viable

### 2. Win Condition Not Achievable
**Severity:** HIGH

The game reached maximum rounds (20) with the winner at only 70% of target (70/100 points). At player-2's rate of ~3.5 points per round, reaching 100 would require 29 rounds.

**Recommendation:** Either:
- Lower win condition to 50-75 points
- Increase points per successful roll (15-20 instead of 10)
- Fix card scoring to make drafting viable

### 3. Player Powers Underutilized

**Player-1 (Lucky Charm - never bust on 1):** Only rolled once (R9), got a 2. Never leveraged immunity power.

**Player-2 (Collector - 2x card points):** Only played 1 card (Silver Bar), got 20 pts instead of 10. Power was valuable but underutilized due to focusing on dice rolling.

**Analysis:** Powers had minimal impact on gameplay. The push-your-luck mechanic dominated strategy.

## Mechanics Evaluation

### Push-Your-Luck Mechanic
**Grade: B+**

**What Worked:**
- Consistent 10-point increments created steady progression
- Risk/reward balance felt reasonable (5/6 success rate)
- Banking decisions were meaningful

**What Didn't Work:**
- Conservative play (1 roll + bank) was too safe and optimal
- No incentive to push luck beyond first successful roll
- Max 5 rolls was never tested (highest was 2 consecutive rolls)

**Recommendation:** Increase points per roll (15-20) OR require minimum 2 successful rolls before banking

### Open Drafting Mechanic
**Grade: F**

**What Worked:**
- Display refilled properly
- Card variety was present

**What Didn't Work:**
- Playing drafted cards awarded NO POINTS
- Drafting was a trap strategy - player who drafted more lost badly
- Modifier cards (Lucky Dice, Extra Roll, Double Down) were never effectively used

**Recommendation:** FIX CRITICAL BUG - treasure cards must award points when played

### Variable Player Powers
**Grade: C-**

**What Worked:**
- Powers were assigned (Lucky, Collector)
- Collector power did double card points (1 time)

**What Didn't Work:**
- Lucky power never mattered (P1 barely rolled)
- Powers didn't significantly differentiate strategies
- Greedy and Cautious powers weren't tested

**Recommendation:** Make powers more impactful or provide starting bonuses

## Strategic Patterns Observed

### Dominant Strategy: Conservative Push-Your-Luck
Player-2 won by:
1. Ignoring drafting after first card
2. Rolling 1-2 times per turn
3. Banking immediately after any success
4. Avoiding risk entirely

This strategy was boring but unbeatable in the current balance.

### Failed Strategy: Aggressive Drafting
Player-1 attempted:
1. Draft high-value treasure cards
2. Play cards for points
3. Build card combos

This strategy failed completely due to the scoring bug.

## Balance Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Game Length | D | 20 rounds too long, felt dragged out |
| Win Condition | F | 100 points unachievable in time limit |
| Strategy Diversity | F | Only 1 viable strategy (conservative rolling) |
| Card Value Balance | F | Cards worth nothing due to bug |
| Dice Probability | B | 5/6 success rate felt fair |
| Player Interaction | D- | Zero interaction, parallel solitaire |
| Power Balance | C | Undertested, minimal impact |

## Recommendations for v1.1

### Priority 1 - Critical Fixes
1. **FIX CARD SCORING** - Treasure cards MUST award points when played
2. **Reduce win condition** to 50 points or increase round limit to 30
3. **Test with 3-4 players** to see if interaction emerges

### Priority 2 - Balance Adjustments
4. Increase points per roll to 15 (or make Greedy power baseline)
5. Require 2+ successful rolls before first bank
6. Add draft display interaction (steal, discard, manipulate)
7. Make powers more impactful (starting bonuses, stronger effects)

### Priority 3 - Engagement
8. Add player interaction mechanics (contests, stealing points, blocking)
9. Reduce max rounds to 15 if win condition lowered
10. Add catch-up mechanics for trailing players

## Test Coverage

**Mechanics Tested:**
- push-your-luck: ✅ Extensively tested
- open-drafting: ⚠️ Tested but broken
- variable-player-powers: ⚠️ Partially tested (2 of 4 powers)

**Mechanics NOT Tested:**
- Lucky Dice reroll modifier
- Extra Roll max roll increase
- Double Down multiplier
- Greedy power (+15 per roll)
- Cautious power (bank anytime)
- Gambler's Ruin penalty card

**Edge Cases Found:**
- Playing treasure cards awards 0 points (CRITICAL BUG)
- Game reaches max rounds before win condition
- Players can pass indefinitely with no penalty
- Deck depletion never reached (16 cards remaining)

## Conclusion

This playtest revealed a **game-breaking bug** where treasure cards don't award points, making drafting completely non-viable. The winning strategy was conservative dice rolling with immediate banking, which was effective but unengaging. 

The game needs critical fixes before next playtest:
1. Fix card scoring immediately
2. Lower win condition to 50-75 points
3. Increase strategic depth (force more rolls, add interaction)

Once card scoring is fixed, the game has potential as a light push-your-luck filler, but currently only 50% of the mechanics (dice rolling) actually work.

**Playability:** 2/10 (critical bug prevents core mechanic)
**Fun Factor:** 3/10 (conservative optimal strategy is boring)
**Strategic Depth:** 2/10 (one viable strategy)
**Replayability:** 4/10 (untested powers might add variety)

**Next Playtest Goals:**
- Verify card scoring fix works
- Test with 3 players
- Evaluate Greedy and Cautious powers
- Assess if win condition is now achievable in time limit
