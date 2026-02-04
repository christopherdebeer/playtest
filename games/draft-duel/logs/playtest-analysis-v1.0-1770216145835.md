# Draft Duel v1.0 PLAYTEST ANALYSIS

**Game ID:** draft-duel-1770216145835  
**Version:** 1.0  
**Winner:** player-1 (by resignation)  
**Duration:** 14 rounds, 28 turns  
**Date:** 2026-02-04  
**End Reason:** player-2 resigned due to game implementation failure

## Executive Summary

**CRITICAL IMPLEMENTATION FAILURE**: The closed drafting mechanic completely failed to execute. The game was designed for 3 drafting rounds with simultaneous card selection from rotating pools, but instead players could only draw individual cards and pass turn. This made it impossible to reach the natural win condition.

## Game Flow Analysis

| Round | Player-1 Action | Player-2 Action | Analysis |
|-------|----------------|-----------------|----------|
| 1 | draw + pass | draw + pass | No draft pools initialized |
| 2 | draw + pass | draw + pass | Continued individual draws |
| 3 | draw + pass | draw + pass | Should have ended after this round |
| 4 | collect_set (failed) + pass | collect_set (Element Set) +5pts | First set collected |
| 5-7 | draw + pass repeatedly | draw + pass | Pattern continues |
| 8 | draw + pass | collect_set (Element Set) +5pts | Second set for player-2 |
| 9-10 | draw + pass | draw + pass | - |
| 10 | collect_set (Element Set) +5pts | draw + pass | First set for player-1 |
| 11-13 | draw + pass repeatedly | draw + pass | Players attempting to progress |
| 14 | draw + pass | RESIGNED | Rightful resignation |

### Final Scores
- **player-1**: 8 points (1 Element Set)
- **player-2**: 10 points (2 Element Sets) - should have won if game ended naturally

## Critical Implementation Bugs

### 1. Closed Drafting Never Initialized
**Expected**: At game start and each round:
- Deal 7 cards to each player as draft pool
- Players simultaneously select from pool
- Pass remaining pool left/right alternating

**Actual**: 
- No draft pools created
- Players could only `draw` (1 card from deck) and `pass` turn
- No `draft_select` action was available or functional

### 2. Round Structure Broken
**Expected**: Game ends after 3 complete drafting rounds (approximately 21 picks per player)

**Actual**: Game continued indefinitely through 14 rounds with no end trigger

### 3. Win Condition Never Evaluated
**Expected**: After 3 rounds when deck exhausted, compare scores and declare winner

**Actual**: No automatic win condition check occurred despite rules stating "After 3 complete drafting rounds (when deck is exhausted), the player with the highest total score wins"

## What Worked

### Set Collection Mechanic (Partial)
- Players successfully collected Element Sets:
  - player-2: Round 4 (Fire/Wild/Air) - questionable validity with Wild card
  - player-2: Round 8 (Water/Water/Block) - questionable validity with Action card
  - player-1: Round 10 (Air/Air/Air) - valid
- Points awarded correctly (+5 per set)

### Basic Turn Structure
- Turn alternation worked properly
- Pass action functioned
- Draw action from deck worked

### Set Validation
- Several invalid set attempts were correctly rejected:
  - Round 4, Turn 7: player-1 Type Set rejected
  - Round 7, Turn 13: player-1 Type Set rejected  
  - Round 12, Turn 24: player-2 Type Set rejected

## What Didn't Work

### Closed Drafting (COMPLETE FAILURE)
- No draft pool initialization
- No simultaneous selection phase
- No pool passing mechanism
- Direction alternation not implemented
- Players forced into ineffective draw-pass loop

### Catch-The-Leader Mechanic (NOT OBSERVED)
- No evidence of trailing player bonuses
- No evidence of leader penalties
- Mechanic may not have triggered or was non-functional

### Once-Per-Game Abilities (NOT USED)
- Neither player used any abilities:
  - Double Down, Card Surge, Comeback, Deep Pockets
- Unclear if abilities were accessible to players
- No errors logged attempting to use abilities

### Game End Conditions
- Round limit not enforced (3 rounds expected, 14 occurred)
- Deck depletion didn't trigger end
- Manual end condition evaluation failed

## Mechanics Grading

| Mechanic | Grade | Rationale |
|----------|-------|-----------|
| **closed-drafting** | F | Completely non-functional; core mechanic missing |
| **catch-the-leader** | N/A | Never observed in gameplay |
| **once-per-game-abilities** | N/A | Unused; availability unclear |
| **set-collection** | C+ | Worked but validation questionable |
| **hand-management** | D | Only draw available; no actual management |

## Player Strategies

### player-1 (cheater persona)
- Drew cards when possible
- Attempted to collect sets (3 attempts, 1 success)
- Adaptive but limited by broken mechanics
- Final: 8 points, 11 cards in hand

### player-2 (casual persona)  
- Drew cards consistently
- Successfully collected 2 sets early
- Recognized implementation failure and resigned appropriately
- Final: 10 points, 4 cards in hand

## Recommendations for Next Version

### CRITICAL FIXES REQUIRED

1. **Implement Closed Drafting Core Mechanic**
   - Create draft pool initialization on round start
   - Implement `draft_select` action for simultaneous card picking
   - Add pool passing logic with direction tracking
   - Ensure pools deplete properly (7→6→5...→1 cards)

2. **Fix Round Structure**
   - Enforce 3-round game limit
   - Track drafting rounds separately from engine rounds
   - Trigger win condition after round 3 completion

3. **Implement Win Condition Check**
   - Evaluate scores after round 3
   - Auto-declare winner when condition met
   - Handle tiebreaker logic (most sets → most cards)

4. **Test Catch-The-Leader Mechanic**
   - Verify trailing bonus (+1 card, +1 point) triggers at 5+ point gap
   - Verify leader penalty (25% income reduction) applies
   - Add logging for mechanic activation

5. **Verify Abilities System**
   - Ensure all 4 abilities are available to players
   - Test each ability effect (score boost, extra draws)
   - Validate condition checking (Comeback requires losing)

### Set Collection Issues

- Clarify Element Set rules: Can Wild cards substitute for elements?
- Clarify Element Set rules: Can Action/Bonus cards count if matching element field?
- Add better validation logging for set attempts
- Consider showing example valid sets to players

### Engine Architecture

- The closed drafting mechanic appears to require special engine support for:
  - Simultaneous action resolution
  - Hidden pool state per player
  - Pool rotation/passing between players
- May need dedicated `DraftPhase` state machine separate from normal turn flow

## Playtest Validity

**This playtest is INVALID for game balance assessment** due to complete failure of core mechanic. 

The test successfully identified a critical implementation gap: the closed drafting system was not implemented despite being specified in game rules.

## Next Steps

1. Implement working draft pool system in engine
2. Add comprehensive drafting mechanic unit tests
3. Re-run playtest with functional implementation
4. Only then assess balance, strategy, and tuning

---

**Gamemaster Notes**: This was a legitimate resignation. player-2 correctly identified that the game could not reach its designed conclusion due to missing core mechanics. The engine requires significant development work before Draft Duel can be properly playtested.
