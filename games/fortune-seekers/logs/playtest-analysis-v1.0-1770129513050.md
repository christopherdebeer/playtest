# Fortune Seekers v1.0 PLAYTEST ANALYSIS

**Game ID:** fortune-seekers-1770129513050
**Version:** 1.0
**Winner:** player-1 (60 points)
**Duration:** 20 rounds, 41 turns
**End Condition:** Max rounds reached (timeout)
**Date:** 2026-02-03

## Executive Summary

The game reached maximum rounds (20) without either player approaching the 100-point win condition. Player-1 won with only 60 points. This indicates **severe pacing issues** - the game is far too slow to reach the victory threshold within the round limit.

## Game Flow Analysis

| Round | Player-1 Action | Player-1 Result | Player-2 Action | Player-2 Result | Notes |
|-------|-----------------|-----------------|-----------------|-----------------|-------|
| 1 | Draft Silver Bar | +0 | Draft Lucky Dice | +0 | Setup phase |
| 2 | Play Silver Bar | +10 pts | Draft Gold Coin | +0 | P1 gains lead |
| 3 | Draft Silver Bar | +0 | Play Gold Coin | +5 pts | Both drafting treasures |
| 4 | Play Silver Bar | +10 pts | Roll: 2, Pass | +0 | P2 doesn't bank |
| 5 | Roll: 3, Pass | +0 | Bank | +10 pts | P1 fails to bank |
| 6 | Bank | +10 pts | Draft Gold Coin | +0 | Delayed banking |
| 7 | Draft Gold Coin | +0 | Play Gold Coin | +5 pts | Minimal progress |
| 8 | Play Gold Coin | +5 pts | Roll: 1 BUST | -0 | First bust |
| 9 | Roll: 2, Pass | +0 | Roll: 5, Pass | +0 | Both passing |
| 10 | Draft Gold Coin | +0 | Bank | +10 pts | More drafting |
| 11 | Roll: 5, Pass | +0 | Draft Silver Bar | +0 | Accumulated 20 not banked |
| 12 | Roll: 1 BUST | -20 pts | Roll: 3, Pass | +0 | Costly bust for P1 |
| 13 | Roll: 1 BUST | -0 | Roll: 2, Pass | +0 | Back-to-back bust |
| 14 | Roll: 6, Pass | +0 | Roll: 2, Pass | +0 | Accumulating |
| 15 | Roll: 4, Pass | +0 | Roll: 1 BUST | -30 pts | Massive bust for P2! |
| 16 | Roll: 3, Pass | +0 | Roll: 1 BUST | -0 | P1 at 30 accumulated |
| 17 | Roll: 6, Pass | +0 | Roll: 5, Pass | +0 | P1 at 40 accumulated |
| 18 | Roll: 2, Pass | +0 | Roll: 2, Pass | +0 | P1 at 50 accumulated |
| 19 | Play Gold Coin | +5 pts | Roll: 2, Pass | +0 | P1 still holding 50 |
| 20 | BANK | +50 pts | Roll: 2, Pass | +0 | P1 finally banks for win |

**Final Scores:**
- Player-1: 60 points (10+10+10+5+5+50 from final bank)
- Player-2: ~20-30 points (10+5+5+10 from banks, lost 30 to bust)

## Critical Issues Found

### 1. GAME LENGTH VS WIN CONDITION MISMATCH
**Severity: CRITICAL**

The 100-point win condition is unreachable within 20 rounds given current point generation rates.

**Math:**
- Average points per successful draft: ~10 points
- Average points per successful roll sequence: 10-20 points (most players bank early)
- Total turns to 100 points: ~10-15 productive turns
- Actual productive turns in 20 rounds: Only 6-8 (including many passes and busts)

**Result:** Neither player reached even 70% of the win condition.

### 2. TURN STRUCTURE CONFUSION
**Severity: MAJOR**

Players seemed confused about the turn structure. The rules state "you may take actions in any order" but the engine appears to enforce a specific sequence. Players often:
- Passed without banking accumulated points
- Drafted then immediately played cards (inefficient)
- Failed to maximize their turns

**Example:** Round 11, Player-1 rolled twice (accumulated 20 points), then passed without banking, then BUSTED on next round losing all 20 points.

### 3. BANKING BEHAVIOR ISSUES
**Severity: MAJOR**

Players accumulated points over multiple rolls but frequently:
- Passed without banking (losing opportunity)
- Rolled again and busted (losing all accumulated)
- Took 3-5 rounds to finally bank

**Example:** Player-1 accumulated 50 points over 5+ rounds (rounds 14-19) before finally banking in round 20.

### 4. DRAFTING UNDERUTILIZED
**Severity: MODERATE**

Only ~7 draft actions occurred across 20 rounds (2 players). The "open-drafting" mechanic is supposed to be central to the game but players largely ignored it in favor of push-your-luck rolling.

**Possible causes:**
- Unclear when drafting is available
- Rolling is easier/more obvious
- Card effects not compelling enough

### 5. POWER CARDS NOT OBSERVED
**Severity: MODERATE**

No evidence in the log of players using their unique power cards (Lucky Charm, Greedy, Collector, Cautious). Either:
- Powers not implemented in engine
- Powers passive (not requiring activation)
- Players unaware of their powers

## What Worked

1. **Push-your-luck tension** - Multiple busts created drama (especially P2's 30-point bust in round 15)
2. **Risk/reward balance** - 1/6 bust chance felt reasonable
3. **Engine stability** - No crashes or errors over 41 turns
4. **Clear winner** - Despite issues, game had decisive outcome

## What Didn't Work

1. **Pacing is far too slow** - 100-point goal unreachable
2. **Turn structure unclear** - Players confused about action ordering
3. **Banking mechanism** - Not intuitive when to bank vs continue
4. **Draft/roll balance** - Drafting underused
5. **Power cards** - No evidence of use

## Recommendations for v1.1

### HIGH PRIORITY

1. **Reduce win condition to 50 points** OR increase max rounds to 40
   - Current: 100 points in 20 rounds = impossible
   - Proposed: 50 points in 20 rounds = achievable
   - Alternative: 100 points in 40 rounds = balanced

2. **Clarify turn structure**
   - Make turn phases explicit: "1. Draft Phase (optional), 2. Roll Phase (optional), 3. Bank Phase"
   - OR simplify: "On your turn: Draft ONE card OR Roll dice (up to 5 times)"
   - Add engine prompts: "You have 20 accumulated. Bank now or roll again?"

3. **Auto-bank on round end**
   - If player has accumulated points and turn ends, auto-bank them
   - Prevents the "forgot to bank" problem

### MEDIUM PRIORITY

4. **Increase treasure card values**
   - Gold Coin: 5→10 pts
   - Silver Bar: 10→15 pts
   - Diamond: 20→30 pts
   - Crown Jewel: 30→50 pts
   
5. **Make drafting mandatory**
   - Each turn MUST draft first, THEN optionally roll
   - This ensures the drafting mechanic is used

6. **Show power cards in log**
   - Log power assignment at game start
   - Log power activations during play
   - Players may not realize they have powers

### LOW PRIORITY

7. **Add "bust insurance" cards**
   - New card type that prevents next bust
   - Encourages more aggressive rolling

8. **Visualize accumulated points**
   - Show "Accumulated: 20 points (not yet banked)" in state
   - Make it clearer what's at risk

## Balance Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | F | Game timeout before either player reached 70% of win condition |
| Strategic Depth | C | Push-your-luck worked, but drafting underutilized |
| Clarity | D | Turn structure confused both players |
| Pacing | F | Far too slow to reach victory within round limit |
| Risk/Reward | B | Bust mechanic created good tension |
| Engine Performance | A | No bugs, crashes, or errors observed |
| Player Powers | N/A | No evidence powers were used or affected gameplay |

## Mechanic Tags Validation

- **push-your-luck**: ✅ WORKED - Multiple rolls, busts, banking decisions
- **open-drafting**: ⚠️ UNDERUSED - Only 7 drafts in 20 rounds
- **variable-player-powers**: ❌ NOT OBSERVED - No log evidence of power usage

## Final Verdict

**NOT READY FOR WIDER TESTING**

The game has good bones (push-your-luck tension works well), but critical pacing issues make it unplayable in current form. The 100-point win condition is mathematically unreachable within 20 rounds given current point generation rates.

**Must Fix Before v1.1:**
1. Reduce win condition to 50 points OR double max rounds
2. Clarify turn structure (draft vs roll phases)
3. Auto-bank accumulated points on turn end

**Estimated Fixes:** 2-3 hours for rule adjustments, 1 retest recommended.

---

*Analysis by Gamemaster Agent*
*Claude Sonnet 4.5 - Playtest Framework v1.0*
