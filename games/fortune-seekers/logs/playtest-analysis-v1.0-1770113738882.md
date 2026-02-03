# Fortune Seekers v1.0 - Playtest Analysis

**Game ID:** fortune-seekers-1770113738882
**Version:** 1.0
**Winner:** player-2 (80 points)
**Final Scores:** player-1: 70, player-2: 80
**Duration:** 20 rounds, 41 turns
**End Condition:** Maximum rounds reached
**Date:** 2026-02-03

## Executive Summary

This playtest revealed that Fortune Seekers v1.0 has a **critical pacing problem**. Neither player came close to the 100-point win condition despite playing the maximum 20 rounds. The game ended at 80% and 70% completion, indicating the scoring is significantly undertuned.

Both players adopted extremely conservative strategies, almost never taking more than one dice roll per turn. This risk-averse behavior dominated the game, leading to a slow, repetitive experience that failed to showcase the "push-your-luck" mechanic.

## Game Flow Analysis

| Round | P1 Score | P2 Score | Key Events | Analysis |
|-------|----------|----------|------------|----------|
| 1-2 | 0→30 | 0→20 | Crown Jewel, Diamond drafted | Strong opening from treasure cards |
| 3-4 | 30→40 | 20→30 | Single rolls banked | Conservative play begins |
| 5-7 | 40→50 | 30→50 | Silver Bars drafted | Catch-up through drafting |
| 8-10 | 50→60 | 50→60 | P2 bust (1), tied at 60 | First bust at turn 20, minimal impact |
| 11-14 | 60→70 | 60→70 | Single rolls continue | Extremely cautious, tied game |
| 15 | 70 | 70→80 | P1 bust (1) | P2 pulls ahead but still far from 100 |
| 16-20 | 70 | 80 | Game ends | Never reached win condition |

### Detailed Turn-by-Turn Observations

**Early Game (Rounds 1-4):** Players drafted high-value treasure cards (Crown Jewel: 30pts, Diamond: 20pts, Silver Bars: 10pts each). This accounted for 60-70% of total scores. Drafting was clearly more valuable than rolling.

**Mid Game (Rounds 5-14):** Players settled into a risk-averse pattern of rolling once and immediately banking 10 points per turn. No player attempted a second roll despite having safe opportunities.

**Late Game (Rounds 15-20):** Only 2 busts occurred in the entire game (turns 20 and 29), both on first rolls with 0 accumulated points. Players never accumulated enough to make busting costly.

## Mechanics Performance

### Push-Your-Luck: Grade D

**Problems Identified:**
- Players rarely pushed luck beyond one roll
- Expected value calculation favors extreme conservatism
- 10 points per successful roll is too low relative to bust risk
- Max 5 rolls/turn was never approached (highest was 3 rolls)
- Bust threshold of 1 (16.7% chance) feels too punishing for 10-point gains

**Usage Statistics:**
- Total rolls: 41
- Multi-roll sequences: 2 (turns 14, 16)
- Busts: 2 (4.9% of rolls)
- Average rolls per turn: 1.0

**Root Cause:** Risk/reward ratio is inverted. Banking 10 points safely is objectively superior to risking 16.7% bust for another 10 points (EV = 8.3).

### Open Drafting: Grade B+

**What Worked:**
- Display was consistently interesting with varied cards
- Immediate refill kept options flowing
- Strategic tension between treasure vs modifiers

**What Didn't:**
- Only 4 cards drafted total (Crown Jewel, Diamond, 2x Silver Bar)
- Modifier cards (Lucky Dice, Extra Roll, Double Down) were never used
- "Extra Roll" card held by player-2 but never played
- Risk cards (Gambler's Ruin) never appeared in play

**Observation:** Drafting was the PRIMARY scoring mechanism, not push-your-luck. Players scored 60+ points from cards vs 10-20 from rolling.

### Variable Player Powers: Grade F (Not Used)

**Critical Issue:** The rules mention 4 unique powers (Lucky Charm, Greedy, Collector, Cautious), but there is **no evidence these were assigned or used** in the game log.

**Impact:** This completely removed a core differentiating mechanic. Powers like "Greedy" (15 points/roll) or "Collector" (double card points) could have significantly impacted strategy and pacing.

## Balance Findings

### Scoring Rate Analysis

**Target:** 100 points in ~10-15 rounds (based on max 20)
**Actual:** 70-80 points in 20 rounds (30-40% short)

**Points Per Round:**
- Early game (rounds 1-4): 15 pts/round (from treasure cards)
- Mid-late game (rounds 5-20): 3.1 pts/round (from rolling)
- Overall average: 4.0 pts/round

**Projection:** At this rate, reaching 100 points would require 25 rounds (25% over max).

### Strategy Viability

**Dominant Strategy:** Draft high-value treasures early, then roll once and bank repeatedly.

**Non-Viable Strategies:**
- Aggressive rolling (too risky for reward)
- Using modifier cards (never beneficial enough)
- Accumulating large point pools (bust risk too high)

### Mathematical Analysis

**Single Roll Expected Value:**
- Success (5/6): +10 points
- Bust (1/6): -0 points (nothing accumulated)
- EV = 8.33 points

**Two Rolls Expected Value:**
- Success-Success (25/36): +20 points
- Success-Bust (5/36): -10 points
- Bust immediately (6/36): 0 points
- EV = 12.5 points vs 16.7% total bust risk

The math shows going for 2+ rolls IS better, but players didn't perceive it that way behaviorally.

## Key Moments

| Turn | Player | Action | Significance |
|------|--------|--------|--------------|
| 1 | player-1 | Draft Crown Jewel | 30-point lead from single card |
| 2 | player-2 | Draft Diamond | 20 points, closes gap |
| 14 | player-2 | Roll 3 times to 30pts | Rare aggressive play, successful |
| 20 | player-2 | Bust on first roll | First bust, minimal cost (0 lost) |
| 29 | player-1 | Bust on first roll | Second bust, falls behind by 10 |
| 40 | player-2 | Bank to 80 | Final scoring action before timeout |

## Player Strategies

### player-1 (70 points, 2nd place)
**Strategy:** Ultra-conservative rolling (1 roll/turn), relied on early Crown Jewel (30pts) for advantage. Suffered from bust on round 15 which proved decisive. Never attempted multi-roll sequences after round 3.

**Strengths:** Safe, consistent banking minimized losses
**Weaknesses:** Didn't capitalize on opportunities to push luck when ahead or tied

### player-2 (80 points, WINNER)
**Strategy:** Slightly more aggressive early (3-roll sequence on turn 14), drafted Extra Roll modifier (never used). Won by avoiding busts during critical rounds 15-20 while player-1 busted.

**Strengths:** One successful aggressive sequence netted 30 points
**Weaknesses:** Still mostly conservative, didn't use modifier card

## Critical Issues

### 1. Pacing Crisis (CRITICAL)
The game is **33% too slow**. Players need approximately 25 rounds to reach 100 points at current rates, but max is 20. This creates an unsatisfying experience where games consistently end without reaching the natural win condition.

**Recommended Fix:**
- Increase points per roll from 10 → 15
- OR reduce win condition from 100 → 70 points
- OR extend max rounds to 30

### 2. Risk/Reward Imbalance (HIGH)
Players correctly identified that banking immediately is safer than rolling again. The push-your-luck mechanic fails when pushing luck is objectively worse.

**Recommended Fix:**
- Reduce bust threshold to only "snake eyes" (1-1 on 2d6) = 2.8% chance
- OR increase points per roll to 15
- OR add escalating bonuses (roll 2: +15, roll 3: +20, etc.)

### 3. Variable Powers Not Implemented (HIGH)
Powers that define player strategy were completely absent.

**Recommended Fix:**
- Ensure powers are assigned during setup
- Log power assignments in game events
- Display active powers to players

### 4. Drafting Dominates Scoring (MEDIUM)
70% of points came from 4 treasure cards in the first 6 rounds. Rolling felt like filler.

**Recommended Fix:**
- Reduce treasure card values by 33% (Crown: 30→20, Diamond: 20→15)
- OR make drafting cost something (skip rolling phase)
- OR increase roll rewards to match card value

### 5. Modifier Cards Ignored (LOW)
Modifiers (Lucky Dice, Extra Roll, Double Down) were never used despite being drafted.

**Recommended Fix:**
- Make modifiers automatic/passive instead of activated
- OR increase modifier power level significantly
- OR reduce modifier opportunity cost

## Recommendations for v1.1

### Priority 1 - Critical Fixes
1. **Increase scoring rate 40%**: Change points per roll from 10 → 15
2. **Implement Variable Powers**: Ensure powers are assigned and logged
3. **Extend game length**: Increase max rounds from 20 → 25

### Priority 2 - Balance Improvements
4. **Reduce treasure card values by 25%**: Crown (30→23), Diamond (20→15), Silver (10→8)
5. **Add roll bonuses**: 2nd roll = +15, 3rd roll = +20, 4th roll = +25, 5th roll = +30
6. **Make bust threshold stricter**: Require rolling 1 twice in a row (or 2d6 snake eyes)

### Priority 3 - Mechanic Enhancements
7. **Auto-activate modifiers**: Extra Roll/Double Down trigger automatically when held
8. **Add mid-game draft**: Allow drafting on rounds 10, 15, 20
9. **Increase starting display**: 5 → 7 cards for more choice

## Playtesting Metrics

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | F | Never reached win condition, needs 25% longer |
| **Strategic Depth** | D | Dominant strategy too obvious, no meaningful choices |
| **Balance** | C | Tied until final rounds, but both players underperformed |
| **Push-Your-Luck** | D | Mechanic failed, too conservative |
| **Drafting** | B | Worked well but overshadowed rolling |
| **Player Powers** | F | Not implemented/used |
| **Engine Performance** | A | No bugs, clean execution |
| **Overall** | D+ | Needs significant rebalancing before next test |

## Conclusion

Fortune Seekers v1.0 has a solid foundation but requires substantial tuning. The core mechanics (push-your-luck and drafting) are present but imbalanced. The push-your-luck element, which should be the game's centerpiece, is currently a risk-averse grind. Variable powers were absent entirely.

**The game cannot progress to public release without addressing the pacing crisis and risk/reward imbalance.**

**Recommended Next Steps:**
1. Implement variable powers system
2. Increase roll values to 15 points
3. Extend max rounds to 25
4. Run another playtest with more aggressive player personas
5. Consider adding catch-up mechanics for trailing players

**Version 1.1 Target:** Game reaches natural conclusion (100 points) in 15-18 rounds with varied strategies.
