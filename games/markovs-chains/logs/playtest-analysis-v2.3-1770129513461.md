# Markov's Chains v2.3 PLAYTEST ANALYSIS

**Game ID:** markovs-chains-1770129513461
**Version:** 2.3
**Winner:** player-2 (turn 8, round 4)
**Duration:** 8 turns
**Date:** 2026-02-03

## Executive Summary

Player-2 achieved a decisive victory by reaching the Victory state on turn 8 (round 4), beating player-1 by a single turn. Both players followed optimal strategies: racing through the minimum 3-move path (Start → A → Checkpoint-X → Victory), using boost cards to improve the reduced probabilities, and saving their most powerful cards for critical transitions.

The game demonstrated excellent pacing with the v2.3 balance changes. The reduced probabilities (55%/40%/25%) created meaningful tension while still allowing completion in 8 turns. Player-2's victory came down to pure luck on the final 25% probability roll, highlighting the risk/reward balance of the game's core mechanic.

**Key Outcome:** Player-2 won by successfully rolling the hardest transition (25% Checkpoint → Victory) without needing their saved Certainty card, while player-1 was preparing to use Certainty on their next turn.

## Game Flow Analysis

| Turn | Player | State Before | Action | Result | State After | Analysis |
|------|--------|--------------|--------|--------|-------------|----------|
| 1 | player-1 | Start | Move to A | Success (55%) | A | Optimal opening, saved boosts |
| 2 | player-2 | Start | Move to A | Success (55%) | A | Mirror strategy, both at A |
| 3 | player-1 | A | Play Momentum | - | A | Pre-positioning for checkpoint (40%→70%) |
| 4 | player-2 | A | Play Catalyst | - | A | Conservative boost (40%→60%) |
| 5 | player-1 | A | Move to Checkpoint-X | Success (70% w/Momentum) | Checkpoint-X | Strong boosted roll succeeded |
| 6 | player-2 | A | Move to Checkpoint-X | Success (60% w/Catalyst) | Checkpoint-X | Both players tied at checkpoint |
| 7 | player-1 | Checkpoint-X | Play Certainty | - | Checkpoint-X | Setting up guaranteed victory next turn |
| 8 | player-2 | Checkpoint-X | Move to Victory | **Success (25%)** | **Victory** | Lucky roll wins the game! |

## Win Condition Analysis

**Win Condition:** First player to reach the Victory state

**How Player-2 Met It:**
- Successfully navigated all three mandatory layers: Start → A → Checkpoint-X → Victory
- Executed the minimum 3-move path without any failed transitions
- Won the race by achieving a successful 25% probability roll on turn 8 before player-1 could use their guaranteed Certainty card on turn 9

**Critical Moment:** Turn 8 - Player-2's 25% roll. This was the deciding factor. If it had failed, player-1 would have won with Certainty on turn 9.

## Key Observations

### What Worked Well

**Game Length:** 8 turns / 4 rounds is excellent for a 2-player game. Falls within the target 8-12 turn range.

**Probability Balance:** The v2.3 reductions (55%/40%/25%) created perfect tension:
- 55% Start transitions: Both players succeeded (expected)
- 40% Checkpoint transitions: Boosted to 70%/60%, both succeeded (strategic card usage)
- 25% Victory transition: High-stakes finale with genuine risk/reward

**Boost Card Usage:** Both players correctly identified that boost cards were essential:
- Player-1 used Momentum (+0.3) for the 40% checkpoint transition
- Player-2 used Catalyst (+0.2) for the same transition
- Player-1 saved Certainty for the final move (smart but too late)

**Minimum Path Strategy:** Both players correctly identified the optimal race strategy: fastest path to Victory without lateral moves or interference plays.

**No Contested Actions:** Clean game with all actions following the rules correctly.

### What Didn't Work / Wasn't Used

**State Cards (NEW in v2.3): Completely unused**
- Neither player played Hazard, Safe Haven, or Toll Gate
- Player-1 held Hazard until game end
- Player-2 held Safe Haven until game end
- **Major observation:** State cards too slow for optimal race strategies

**Interference Cards: Minimal usage**
- Player-2 held two Friction cards but never played them
- No Block or Sabotage cards were drawn/played
- Reason: Both players focused on racing, not disruption

**Utility Cards: Unused**
- Both players held State Swap cards but didn't use them
- Player-1 held Reroll but never needed it (all transitions succeeded)

**Lateral Movement:** Neither player moved laterally (A↔B↔C or Checkpoint-X↔Y)
- Makes sense: lateral moves don't advance toward victory

### Balance Findings

**Probability Distribution:**
- Layer 1 (55%): Appropriate difficulty for opening moves
- Layer 2 (40%): Forces boost card consideration (perfect design)
- Layer 3 (25%): Creates dramatic tension for final transition

**Card Economy:**
- Starting with 5 cards gave players enough options
- Both players had 3-4 cards remaining at game end (healthy hand size)
- Boost cards saw 100% usage (2/2 boost cards played)
- State cards saw 0% usage (0/2 state cards played)

**Game Speed:**
- 100% success rate on all transitions (both players got very lucky)
- No failed moves = no card advantage/disadvantage dynamics played out
- Game was faster than expected due to luck (8 turns vs. target 8-12)

**Strategic Depth:**
- Clear dominant strategy emerged: race + boost + no interference
- State cards added complexity but no actual value in 2-player race scenarios

## Strategic Patterns Observed

### Player-1 Strategy (Lost)
**Persona:** Strategic
- Played Momentum early (turn 3) to boost checkpoint transition
- Successfully used boosted transition (70% succeeded)
- Played Certainty on turn 7 to guarantee victory on turn 9
- **Mistake:** Waited too long to use Certainty. Should have used it on turn 7 to move to Victory immediately

### Player-2 Strategy (Won)
**Persona:** Rule-lawyer
- Played Catalyst on turn 4 for checkpoint boost
- Successfully used boosted transition (60% succeeded)
- Risked 25% roll on turn 8 instead of waiting for a better card
- **Lucky decision:** The 25% gamble paid off, winning the game before player-1's Certainty activated

### Dominant Strategy
Both players converged on:
1. Minimum path (3 moves): Start → A → Checkpoint → Victory
2. Save boost cards for low-probability transitions (40% and 25%)
3. Ignore state cards (too slow for racing)
4. Ignore interference (racing is more valuable than disruption)

## Mechanical Analysis

### Probability Movement Mechanic
**Grade: A**
- Worked perfectly as designed
- Created meaningful decisions (when to boost, when to risk)
- 25% final transition created dramatic tension

### Card Boost Mechanic
**Grade: A**
- Essential for success (40%→60%/70% very valuable)
- All boost cards were considered valuable by both players
- Certainty proved too powerful (guaranteed win) but was prevented from use by player-2's luck

### Victory Declaration Mechanic
**Grade: A**
- Engine auto-detected victory correctly on turn 8
- No contest filed, clean win

### State Cards (NEW in v2.3)
**Grade: D**
- **Major problem:** Completely unused in race scenarios
- Too slow to set up: Takes 1 turn to place, effects trigger later
- Not valuable in 2-player races (racing > board control)
- May be more valuable in 3-4 player games with congestion

## Recommendations for Next Version (v2.4)

### Critical Changes

1. **Rebalance or Remove State Cards**
   - Current implementation: 8 cards / 30 total deck (27% of deck)
   - Usage rate: 0% (unused in this playtest)
   - **Option A:** Remove state cards entirely if racing remains dominant
   - **Option B:** Make state cards trigger faster (instant effects?)
   - **Option C:** Add "start of turn" trigger for placed cards to increase value

2. **Increase Victory Transition Difficulty**
   - Current: 25% (player-2 succeeded on first try)
   - Player-1 was preparing to use Certainty (correct strategy)
   - **Recommendation:** Reduce to 20% to make Certainty/Momentum more essential for Victory transitions

3. **Limit Certainty Card Availability**
   - Currently: 2 copies in 30-card deck
   - Effect: Guarantees win if saved for Victory transition
   - **Recommendation:** Reduce to 1 copy to make it rarer

### Minor Adjustments

4. **Consider Adding "Forced State Card" Rule**
   - Require players to place 1 state card before reaching Victory state
   - This would force state card usage and add strategic depth

5. **Increase Interference Card Incentives**
   - Current design: Racing > interference in 2-player games
   - **Option A:** Add points for interference (not just win/lose)
   - **Option B:** Add "must play 1 card per round" rule to force interaction

6. **Lateral Movement Incentives**
   - Currently: No reason to move A↔B↔C or Checkpoint-X↔Y
   - **Option A:** Add bonus effects for visiting multiple states
   - **Option B:** Add negative effects for staying in same state too long

### Hyperparameter Suggestions

| Parameter | Current | Recommended | Reason |
|-----------|---------|-------------|--------|
| Checkpoint→Victory probability | 25% | 20% | Force more boost card usage |
| Certainty card count | 2 | 1 | Reduce "auto-win" card availability |
| State card count | 8 | 4 or 0 | Reduce dead cards in deck |
| Starting cards | 5 | 4 | Reduce initial hand bloat |

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | A | 8 turns perfect (target 8-12), 4 rounds ideal for 2-player |
| **Strategic Depth** | B+ | Clear dominant strategy, but boost timing created decisions |
| **Balance** | B | Probabilities well-tuned, but state cards completely unused |
| **Engine Performance** | A+ | No bugs, auto-victory detection worked, all mechanics functioned |
| **Player Experience** | A | Fast-paced, tense finish, clear winner |
| **Card Diversity** | C | Only boost cards used (3/12 card types: Momentum, Catalyst, Certainty) |
| **New Mechanic (State Cards)** | D | 0% usage rate = failed addition in v2.3 |

## Overall Assessment

**Overall Grade: B+**

Markov's Chains v2.3 delivered an excellent 2-player race experience with perfect game length, well-balanced probabilities, and meaningful strategic decisions around boost card timing. The core probability movement mechanic remains strong.

However, the v2.3 addition of state cards failed completely - neither player used them despite holding them until game end. This represents 27% of the deck being effectively dead cards in race scenarios.

**Recommendation:** Version 2.4 should either remove state cards entirely or redesign them to trigger faster. The core game (Start → A → Checkpoint → Victory with boost cards) is excellent and should be preserved.

The game would benefit from either:
- **Option A:** Lean into racing - remove state cards, tighten probabilities, reduce Certainty count
- **Option B:** Force interaction - require state card usage or add interference incentives

**Playtest Verdict:** Ready for production with state card adjustments. Core mechanics proven solid.
