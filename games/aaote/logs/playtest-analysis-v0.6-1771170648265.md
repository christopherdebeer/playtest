# AAOTE: An Agent of the Enemy v0.6 PLAYTEST ANALYSIS

**Game ID:** aaote-1771170648265
**Version:** 0.6
**Winner:** player-4 (The Explorer)
**Duration:** 16 turns (4 rounds)
**Date:** 2026-02-15
**End Condition:** Victory declaration - Explorer objective completed

---

## Executive Summary

Player-4 won by completing The Explorer objective in just 16 turns (50% of the 32-turn maximum), making this the fastest recorded AAOTE playtest. The game tested several v0.6 engine fixes but revealed critical new issues:

**Key Findings:**
- **CRITICAL BUG**: Forbidden Item curse enforcement still broken - player-3 held Shadow Key with no penalties
- **CRITICAL BUG**: Event card targeting completely non-functional - 4/4 event cards failed (Theft, Town Crier, Hidden Path, Confiscate)
- **POSITIVE**: Victory declaration mechanic worked perfectly
- **CONCERN**: Suspicion system unused again (0 accusations in 16 turns)
- **CONCERN**: Trading severely limited - only 3 offers, 0 completions

---

## Game Flow Analysis

### Round 1 (Turns 1-4): World Building Phase
| Turn | Player | Action | Analysis |
|------|--------|--------|----------|
| 1 | player-1 | Place Forest Clearing | Standard opening - create adjacent tile |
| 2 | player-2 | Place Merchant Camp | Trade hub established early |
| 3 | player-3 | Place Mountain Pass | Requires Rope to enter |
| 4 | player-4 | Place Crossroads | 4-connection hub tile |

**Observation**: All players spent their first turn placing locations, correctly recognizing that movement requires an expanded grid. This is healthy design - players understand the core mechanic.

### Round 2 (Turns 5-8): Divergent Strategies Emerge
| Turn | Player | Actions | Notes |
|------|--------|---------|-------|
| 5 | player-1 | Draw × 3 | Filled hand to max (7 cards) |
| 6 | player-2 | Move to Merchant Camp, Trade offer to p1 (Map Fragment for Supplies), Draw | First movement, first trade offer |
| 7 | player-3 | Trade offer to p1 (Rope for Supplies), Move to Mountain Pass, **Play Theft** | **EVENT FAIL #1** - Theft targeting broken |
| 8 | player-4 | Move to Crossroads, Place Ancient Ruins | Expanding exploration options |

**Critical Event**: player-3 played Theft targeting themselves (invalid). Mechanic agent correctly caught this and skipped the effect. This reveals that event cards requiring targeted players are not being handled correctly by the player agents.

### Round 3 (Turns 9-12): The Explorer's Sprint
| Turn | Player | Actions | Notes |
|------|--------|---------|-------|
| 9 | player-1 | **Play Town Crier**, Move to Forest Clearing, Draw | **EVENT FAIL #2** - Town Crier informational only |
| 10 | player-2 | Move to Ancient Ruins (visit #2), Draw, Pass | Conservative play |
| 11 | player-3 | Move to Ancient Ruins (visit #2), Draw, **Play Hidden Path** | **EVENT FAIL #3 + CURSE VIOLATION** |
| 12 | player-4 | Move Ancient Ruins → Forest Clearing → Mountain Pass (3 moves, 3 AP) | **EXPLORER PROGRESS: 4/6 locations** |

**Critical Event**: player-3 played Hidden Path while holding Shadow Key (Forbidden Item). The Shadow Key explicitly states "Holder cannot use Hidden Path or Hidden Cave unless they are The Enemy." player-3 is The Trader (not The Enemy). This should have been blocked by the forbidden-items mechanic but was not enforced.

**Mechanic Observation**: player-4 executed an aggressive exploration strategy - spending all 3 AP on movement to rapidly accumulate unique locations.

### Round 4 (Turns 13-16): Endgame Rush
| Turn | Player | Actions | Notes |
|------|--------|---------|-------|
| 13 | player-1 | Move to Ancient Ruins, **Play Confiscate**, Draw | **EVENT FAIL #4** - Confiscate targeting broken |
| 14 | player-2 | Draw, Move to Forest Clearing, Pass | No progress toward Collector objective |
| 15 | player-3 | Trade offer to p1 (Shadow Key for Supplies), Move to Forest Clearing, Pass | **Trying to offload curse** |
| 16 | player-4 | Move to Merchant Camp (visit #5), **Declare Victory** | **EXPLORER WINS: 6/6 locations** |

**Victory Path**: player-4's visited locations:
1. Origin (starting, counts per rules)
2. Crossroads (T8)
3. Ancient Ruins (T12)
4. Forest Clearing (T12)
5. Mountain Pass (T12)
6. Merchant Camp (T16)

**GM Verification**: Correctly accepted - all 6 unique named locations verified.

---

## Objective Progress at Game End

| Player | Objective | Progress | Notes |
|--------|-----------|----------|-------|
| player-1 | **The Enemy** | 0/3 Forbidden Items | Only Shadow Key was in play (held by p3) |
| player-2 | **The Collector** | 4/4 items, but 0 traded | Failed: Lantern, Map Fragment x2, Supplies (no trades completed) |
| player-3 | **The Trader** | 0/3 trades | Offered 3 trades, none accepted |
| player-4 | **The Explorer** | 6/6 locations | **WON** |

**Balance Observation**: The Explorer objective is significantly easier than other objectives:
- **Explorer**: Purely self-directed, no interaction required, completed in 16 turns
- **Collector**: Requires trade interaction, was at 4/4 items but missing trade requirement
- **Trader**: Fully dependent on other players accepting trades, 0% progress
- **Enemy**: Requires Forbidden Items to appear and be collected, only 1/3 in play

---

## Critical Engine Bugs

### BUG #1: Forbidden Item Curse Enforcement Still Broken
**Evidence**: player-3 held Shadow Key (Forbidden Item 3/3) from turn 11 onward with zero restrictions applied.

**Expected Behavior**: 
```
Shadow Key: "Holder cannot use Hidden Path or Hidden Cave unless they are The Enemy."
```

**Actual Behavior**: player-3 successfully played Hidden Path on turn 11 while holding Shadow Key.

**Impact**: The entire social deduction mechanic fails if curses are not enforced. Forbidden Items create no detectable signals, making Enemy detection impossible.

**v0.6 Claim**: "FIX: Forbidden Item curse enforcement — New `forbidden-items` mechanic runs `onTurnStart` to check player hands."

**Reality**: The fix does not work. The mechanic agent noted the violation but did not prevent it:
```
"NOTE: player-3 holds Shadow Key which restricts Hidden Path usage unless they are The Enemy. 
If player-3 is not The Enemy, this card should have been blocked. Gamemaster should verify player-3's role."
```

**Root Cause**: Enforcement is passive (informational only), not active (blocking illegal plays).

### BUG #2: Event Card Targeting Completely Non-Functional
**Evidence**: 4 out of 4 event cards played had targeting failures:

1. **Theft (T7)**: player-3 targeted themselves (invalid - requires adjacent player)
2. **Town Crier (T9)**: player-1 targeted themselves (informational only, no mechanical effect)
3. **Hidden Path (T11)**: player-3 targeted themselves (informational only, violated Shadow Key restriction)
4. **Confiscate (T13)**: player-1 targeted themselves (invalid - requires adjacent player)

**Impact**: Event cards requiring targeting are useless. This removes significant strategic depth and anti-Enemy tools (Confiscate, Theft, Interrogate).

**Root Cause**: Player agents do not understand targeting requirements. The mechanic agent catches violations but only after the card is played.

---

## Mechanics Observed

### What Worked (Strengths)
1. **Victory Declaration System**: Flawless execution
   - player-4 declared victory with correct justification
   - Gamemaster verified and accepted within seconds
   - Clean game ending with no ambiguity

2. **Location Placement**: Players understood and used correctly
   - All 4 players placed locations in R1
   - player-4 placed Ancient Ruins to create exploration path
   - 5 unique locations placed total

3. **Movement Economy**: Efficient multi-move turns
   - player-4's T12 triple-move (Ancient Ruins → Forest Clearing → Mountain Pass) was strategically optimal
   - Players correctly managed AP costs

4. **Trade Offers**: Mechanically functional
   - 3 trade offers executed correctly
   - Offers properly expired after timeout
   - player-3 attempted to offload Shadow Key (curse signal recognized by player)

### What Failed (Critical Issues)
1. **Forbidden Item Curses**: Zero enforcement despite v0.6 "fix"
   - Shadow Key restriction violated (T11)
   - Cursed Amulet not yet drawn (still in deck)
   - Dark Tome not yet drawn (still in deck)

2. **Event Card Targeting**: 100% failure rate
   - All 4 event cards had invalid self-targeting
   - No successful targeted event in entire game
   - Critical anti-Enemy tools (Confiscate, Interrogate) unusable

3. **Suspicion System**: Completely unused
   - 0 accusations in 16 turns
   - Accuse cost is 1 AP (affordable)
   - No incentive to accuse without detectable signals

4. **Trading**: Socially stalled
   - 3 offers made, 0 completed
   - player-1 (The Enemy) deliberately refused trades to prevent Collector/Trader objectives
   - No reciprocal trading occurred

---

## Player Behavior Patterns

### player-1 (The Enemy) - "Chaotic" Persona
**Strategy**: Passive obstruction
- Drew 3 cards on T5 (filled hand)
- Refused all 3 trade offers (blocking Collector and Trader objectives)
- Played informational events (Town Crier, Confiscate) with no strategic value
- Made zero progress toward collecting Forbidden Items (0/3)

**Grade**: C- - The Enemy had no realistic path to victory. Only 1 Forbidden Item was in play (held by opponent). Default timeout win was the only path.

### player-2 (The Collector) - "Rule-Lawyer" Persona
**Strategy**: Attempted item accumulation
- Moved to Merchant Camp early (trade hub)
- Offered trade to player-1 (Map Fragment for Supplies) - rejected
- Achieved 4 unique items but none via trade (failed objective requirement)

**Grade**: B - Mechanically sound play but failed to secure the required trade. Needed to diversify trade partners.

### player-3 (The Trader) - "Chaotic" Persona
**Strategy**: Aggressive trading attempts
- Offered 3 trades (most of any player)
- Attempted to offload Shadow Key (curse awareness)
- All trades rejected by player-1

**Grade**: C+ - Identified the right strategy but all offers went to the same player (The Enemy). Should have targeted player-2 or player-4.

### player-4 (The Explorer) - "Cheater" Persona
**Strategy**: Hyper-focused exploration
- Spent 8/9 AP on movement (89% of total actions)
- Placed 1 location (Ancient Ruins) to create exploration path
- Zero interaction with other players (no trades, no events)

**Grade**: A - Perfectly executed objective completion. Recognized the Explorer goal is non-interactive and exploited it.

---

## Balance Findings

### Objective Completion Times (v0.5 vs v0.6)
| Objective | v0.5 Result | v0.6 Result | Assessment |
|-----------|-------------|-------------|------------|
| Collector | **WON at T23** (64% of 36) | 4/4 items but 0 trades (FAILED) | Trade requirement working as gate |
| Explorer | Not completed | **WON at T16** (50% of 32) | Too easy - non-interactive |
| Builder | Not completed | Not attempted | Untested |
| Trader | Not completed | 0/3 trades | Too dependent on others |

### Critical Balance Issue: The Explorer is Overtuned
**Evidence**: player-4 completed The Explorer in 16 turns (50% of max) with zero interaction.

**Design Problem**: The Explorer requires only movement and location placement - both self-directed actions. Other objectives require interaction:
- Collector: Needs 1 trade
- Trader: Needs 3 trades with 2+ partners
- Builder: Needs 4 location placements (comparable to Explorer's 6 visits)

**Recommendation**: Add interaction requirement to Explorer:
```diff
- Visit 6 different named locations
+ Visit 6 different named locations, with at least 2 visited by other players
```

This forces explorers to place locations strategically and creates indirect interaction.

### The Trader Objective is Broken
**Problem**: The Trader is fully dependent on other players accepting trades. In this game, The Enemy simply refused all trades, making completion impossible.

**v0.5 Playtest**: The Collector trade requirement worked because they only need 1 trade (achievable even if others resist).

**v0.6 Playtest**: The Trader needs 3 trades with 2+ partners. If any player refuses (especially The Enemy), the objective becomes impossible.

**Recommendation**: Add unilateral trade mechanic:
```
The Merchant player card ability: "Once per round, may force a 1-for-1 trade with any player 
(target chooses which item to give)."
```

If The Trader always has this ability (not just The Merchant card holder), they can complete trades even against resistance.

---

## Forbidden Item Deep Dive

### Current Forbidden Item State
| Item | Location | Status |
|------|----------|--------|
| Cursed Amulet | Deck (card #2) | Not yet drawn |
| Dark Tome | Deck (card #17) | Not yet drawn |
| Shadow Key | player-3's hand (T11-T16) | **CURSE NOT ENFORCED** |

### Why Curses Matter
The entire social deduction mechanic depends on Forbidden Items creating **observable penalties**:

**Design Intent**:
1. Regular players draw Forbidden Item → suffer penalty → detectable signal
2. Other players observe the penalty (or lack thereof)
3. If a player holds Forbidden Item with no penalty → they might be The Enemy
4. Suspicion System is triggered → accusations occur

**Current Reality**:
1. player-3 draws Shadow Key (Forbidden Item)
2. No penalty is enforced
3. No signal is created
4. Suspicion System remains dormant

### Why v0.6 Fix Failed
The v0.6 changelog claims:
```
FIX: Forbidden Item curse enforcement — New `forbidden-items` mechanic runs `onTurnStart` 
to check player hands. Non-Enemy holders of Cursed Amulet lose 1 AP/turn; Dark Tome holders 
get hand limit -1. Enemy is immune.
```

**Problem**: The mechanic runs `onTurnStart` to apply AP/hand limit modifiers, but it does not prevent illegal card plays (e.g., Hidden Path while holding Shadow Key).

**Solution Needed**: 
1. `onTurnStart`: Apply AP reduction (Cursed Amulet) and hand limit reduction (Dark Tome)
2. **`onCardPlay`**: Check if player holds Shadow Key and is attempting to play Hidden Path/Hidden Cave → **BLOCK the play** with error message

---

## Suspicion System Analysis (Still Unused)

### Usage Statistics
- **Accusations made**: 0
- **Accuse cost**: 1 AP (affordable)
- **Incentive to accuse**: None detected

### Why Players Didn't Accuse
1. **No detectable signals**: Forbidden Item curses not enforced → no way to identify The Enemy
2. **High cost of wrong accusation**: Accuser loses entire next turn
3. **Low benefit of correct accusation**: All regular players win collectively (no individual advantage)
4. **Short game**: Game ended at T16 before Enemy patterns emerged

### Recommendations
1. **Fix Forbidden Item enforcement** (prerequisite)
2. **Reduce wrong accusation penalty**: 
   ```diff
   - Wrong accusation: Accuser skips their next turn entirely
   + Wrong accusation: Accuser loses 2 AP next turn (still has 1 AP)
   ```
3. **Add information reward**:
   ```diff
   + Correct accusation: All players draw 1 card
   + Wrong accusation: Accused draws 2 cards, accuser draws 0 next turn
   ```

---

## Event Card Targeting (New Critical Issue)

### The Problem
Player agents do not understand targeting semantics for event cards. They consistently self-target, even when the card explicitly requires "adjacent player" or "target player."

### Evidence
| Card | Requirement | Player Action | Result |
|------|-------------|---------------|--------|
| Theft | "Steal random item from adjacent player" | player-3 targeted self | INVALID (skipped) |
| Town Crier | "Reveal one item to all players" | player-1 revealed to self | INFORMATIONAL (no effect) |
| Hidden Path | "Move without revealing destination" | player-3 moved self | INFORMATIONAL (but violated Shadow Key) |
| Confiscate | "Adjacent player must reveal all items" | player-1 targeted self | INVALID (skipped) |

### Impact on Game Balance
**Anti-Enemy tools are broken**:
- **Confiscate**: Should allow players to force-reveal Forbidden Items → unusable
- **Interrogate**: Should allow players to peek at objectives → untested but likely broken
- **Theft**: Should allow stealing Forbidden Items from The Enemy → unusable

**The Enemy is indirectly buffed** because the tools to detect/stop them don't work.

### Root Cause
Player agents likely receive event cards as options but do not receive structured prompts for target selection. When they play an event, they default to self-targeting or null targeting.

### Solution
The mechanic agent should:
1. **Pre-play validation**: When a player attempts to play an event requiring a target, check if a valid target is provided
2. **If no target**: Prompt the player agent to select a valid target (list eligible players)
3. **If invalid target**: Block the play with error message (do not discard card)

Alternatively, implement a two-phase action:
1. Phase 1: Player plays event card → card is moved to "pending" state
2. Phase 2: Mechanic agent requests target selection → player responds
3. Phase 3: Event resolves with valid target

---

## Recommendations for v0.7

### CRITICAL PRIORITY (Game-Breaking)
1. **FIX: Forbidden Item curse enforcement**
   - Implement `onCardPlay` hook to block Shadow Key violations
   - Verify `onTurnStart` correctly applies AP/hand limit penalties
   - Add unit tests for each Forbidden Item curse

2. **FIX: Event card targeting**
   - Implement structured target selection for event cards
   - Block invalid self-targeting with error messages
   - Add mechanic agent intervention for target selection

### HIGH PRIORITY (Balance)
3. **REBALANCE: The Explorer objective**
   ```diff
   - Visit 6 different named locations
   + Visit 6 different named locations, with at least 2 visited by other players after you
   ```

4. **REBALANCE: The Trader objective**
   - Add forced trade mechanic to The Trader role (similar to The Merchant ability)
   - OR reduce requirement to 2 trades with 1+ partner
   - OR add alternative completion path (e.g., "3 trades OR hold 3 different currency items")

5. **REDUCE: Wrong accusation penalty**
   ```diff
   - Accuser skips their next turn entirely
   + Accuser loses 2 AP next turn (has 1 AP remaining)
   ```

### MEDIUM PRIORITY (Polish)
6. **ADD: Information rewards for Suspicion System**
   - Correct accusation: All players draw 1 card
   - Wrong accusation: Accused draws 2 cards (unchanged)

7. **CLARIFY: Origin location tracking**
   - Engine should explicitly add "Origin" to `visitedLocations` array at game start
   - Currently relies on implicit "starting location counts" rule

8. **PLAYTEST: Builder objective**
   - No player attempted Builder in this game
   - v0.6 reduced requirement from "4 locations + 2 players standing on them" to "4 locations"
   - Need data on completion time

---

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | C | 16 turns (50% of 32-turn max) - too fast, Explorer completed without opposition |
| **Strategic Depth** | D | Non-interactive winner, 0 trades completed, 0 accusations, 100% event failure rate |
| **Balance** | D- | Explorer trivially easy, Trader impossible, Enemy has no realistic win path |
| **Engine Performance** | F | **CRITICAL BUGS**: Forbidden Item curses not enforced, event targeting broken |
| **Social Deduction** | F | Suspicion System unused, Forbidden Items create no signals, The Enemy undetectable |
| **Victory Declaration** | A | Mechanic worked perfectly - only bright spot in this playtest |

---

## Overall Assessment: v0.6 FAILED PLAYTEST

**v0.6 was supposed to fix Forbidden Item enforcement. It did not work.**

The game is currently **unplayable as a social deduction game** due to:
1. Forbidden Item curses not enforcing restrictions
2. Event card targeting completely broken
3. The Explorer objective being trivially completable without interaction

**Positive Notes**:
- Victory declaration mechanic is excellent
- Location placement works smoothly
- Movement economy is well-balanced

**Next Steps**:
1. Fix Forbidden Item curse enforcement (CRITICAL)
2. Fix event card targeting (CRITICAL)
3. Rebalance Explorer and Trader objectives
4. Playtest again with same players to compare results

---

## Appendix: Complete Turn Log

**R1 (World Building)**
- T1: player-1 places Forest Clearing
- T2: player-2 places Merchant Camp
- T3: player-3 places Mountain Pass
- T4: player-4 places Crossroads

**R2 (Early Game)**
- T5: player-1 draws 3 cards (hand full)
- T6: player-2 moves to Merchant Camp, offers trade (Map Fragment for Supplies), draws
- T7: player-3 offers trade (Rope for Supplies), moves to Mountain Pass, plays Theft (FAILED - self-targeted)
- T8: player-4 moves to Crossroads, places Ancient Ruins

**R3 (Mid Game)**
- T9: player-1 plays Town Crier (informational), moves to Forest Clearing, draws
- T10: player-2 moves to Ancient Ruins, draws, passes
- T11: player-3 moves to Ancient Ruins, draws, plays Hidden Path (CURSE VIOLATION - holds Shadow Key)
- T12: player-4 moves Ancient Ruins → Forest Clearing → Mountain Pass (3 moves)

**R4 (Endgame)**
- T13: player-1 moves to Ancient Ruins, plays Confiscate (FAILED - self-targeted), draws
- T14: player-2 draws, moves to Forest Clearing, passes
- T15: player-3 offers trade (Shadow Key for Supplies), moves to Forest Clearing, passes
- T16: player-4 moves to Merchant Camp, **declares victory (Explorer: 6/6 locations)**

**Result**: GM accepted victory claim. player-4 wins.
