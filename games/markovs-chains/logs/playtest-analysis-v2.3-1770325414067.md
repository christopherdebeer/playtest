# Markov's Chains v2.3 - Playtest Analysis

**Game ID:** markovs-chains-1770325414067  
**Version:** 2.3  
**Winner:** player-1  
**Final Turn:** Turn 5, Round 3  
**Duration:** 5 turns (~6 minutes)  
**Date:** 2026-02-05

## Executive Summary

Player-1 achieved a swift victory by executing a near-perfect aggressive strategy, reaching Victory state in just 5 turns with an impressive 3-for-3 success rate on probabilistic moves (Start→A, A→Checkpoint-X, Checkpoint-X→Victory). Player-2 failed to advance beyond state A, playing defensively but never capitalizing on their card advantage.

## Game Flow Analysis

| Turn | Round | Player | Action | From | To | Outcome | Analysis |
|------|-------|--------|--------|------|----|---------| ---------|
| 1 | 1 | player-1 | Move | Start | A | Success | Strong opening - 55% base probability |
| 2 | 1 | player-2 | Move | Start | A | Success | Matched player-1's position |
| 3 | 2 | player-1 | Move | A | Checkpoint-X | Success | Beat 40% odds, entered checkpoint layer |
| 4 | 2 | player-2 | Play Card (Momentum) | A | A | - | Played +0.3 boost but didn't use it |
| 5 | 3 | player-1 | Move | Checkpoint-X | Victory | Success | **GAME WINNING** - Beat 25% base probability! |

## Key Observations

### What Worked Well

1. **Aggressive Path Strategy**: Player-1's direct path (Start→A→Checkpoint-X→Victory) proved optimal, minimizing turns needed
2. **Probability Luck**: Player-1 succeeded on all 3 critical moves without using boost cards:
   - Start→A: 55% (succeeded)
   - A→Checkpoint-X: 40% (succeeded)
   - Checkpoint-X→Victory: 25% (succeeded) ← **Most impressive!**
3. **New v2.3 Probability Tuning**: Reduced probabilities (55%/40%/25%) created dramatic tension - the final 25% Victory transition was a high-risk gamble that paid off

### What Didn't Work

1. **Player-2 Passivity**: Remained at state A for entire game, never attempted to advance to checkpoint layer
2. **Unused Card Advantage**: Player-2 played Momentum card (+0.3 boost) but never used it for a move
3. **No State Cards Used**: Neither player utilized new v2.3 state cards (Hazard, Safe Haven, Toll Gate)
4. **No Interference**: No defensive cards played to slow opponent despite player-1's clear lead
5. **Conservative Play Backfired**: Player-2's cautious approach resulted in zero territorial progress

### Strategic Analysis

**Player-1's Approach:**
- Pure aggression with immediate move attempts every turn
- No card usage - relied entirely on base probabilities
- Calculated risk on final 25% Victory move paid off spectacularly
- Strategy: "Move fast, win before opponent can react"

**Player-2's Approach:**
- Extremely conservative - only one move attempt (Turn 2)
- Played Momentum for future use but game ended before capitalizing
- No territorial advancement after reaching state A
- Strategy: "Build card advantage" - but didn't convert to board position

### Probability Statistics

**Player-1 Success Rate:** 3/3 moves (100%)
- Combined probability of this sequence: 0.55 × 0.40 × 0.25 = **5.5%**
- This was an exceptional lucky run!

**Player-2 Success Rate:** 1/1 moves (100%), but only attempted 1 move total

## Mechanics Observed

- ✅ **probability_movement**: Core mechanic worked perfectly - dice rolls determined success
- ✅ **victory_declaration**: Player-1 reached Victory and game ended immediately
- ✅ **board_state**: State transitions tracked correctly through 7-state graph
- ✅ **card_boosts**: Momentum card played but unused (game too short)
- ❌ **State Cards (v2.3)**: New placeable cards (Hazard/Safe Haven/Toll Gate) **NOT observed**
- ❌ **Interference Cards**: No Friction, Block, or Sabotage played
- ❌ **Contest System**: No disputes filed (clean game)

## Balance Findings

### Game Length
- **Target:** 8-12 turns (per v2.3 rules)
- **Actual:** 5 turns
- **Assessment:** Game ended prematurely due to exceptional luck sequence

### Probability Balance
- **Start→A (55%)**: Appropriate - both players succeeded
- **A→Checkpoint (40%)**: Player-1 succeeded first try - reasonable difficulty
- **Checkpoint→Victory (25%)**: **Critical finding** - Player-1 won on first 25% attempt
  - This low probability was intended to extend games
  - Lucky outcome suggests probability is reasonable but swingy

### Card Usage
- **Boost cards**: 1/6 played (Momentum), 0 actually used in moves
- **State cards**: 0/8 played - **NEW mechanic completely unused**
- **Interference cards**: 0/10 played
- **Game too short** for meaningful card economy to develop

### State Card Mechanic (v2.3)
**Major Issue:** New placeable cards (Hazard, Safe Haven, Toll Gate) saw ZERO usage despite being the flagship v2.3 feature. Possible reasons:
1. Game ended too quickly (5 turns) for tactical placement
2. Players prioritized direct movement over board control
3. Mechanic may need tutorial/prompting

## Recommendations for Future Versions

### High Priority

1. **State Card Adoption**: New v2.3 mechanic needs promotion
   - Consider starting each player with 1 state card in initial hand
   - Add rule reminder: "Hazard cards on Checkpoint states slow opponents"
   - Increase count: 8→12 state cards in deck

2. **Extend Minimum Game Length**: 5-turn games too short for strategic depth
   - Option A: Lower Victory probability further (25%→20%)
   - Option B: Add mandatory 4th state layer before Victory
   - Option C: Increase starting cards (5→6) to encourage more card play

3. **Encourage Defensive Play**: Player-2's passivity suggests players need incentive to interfere
   - Consider "comeback mechanic": Players behind in progress get +10% boost
   - Or: Players ahead trigger "leader tax" (-10% penalty)

### Medium Priority

4. **Balance Testing Needed**: 5.5% combined probability win needs more samples
   - Run 10+ games to see if v2.3 probabilities (55%/40%/25%) achieve target game length
   - Track: Do most games end 8-12 turns, or was this an outlier?

5. **Card Draw Economy**: Players had full hands (5 cards) but didn't use them
   - Consider: Mandatory card play each turn? Or "use it or lose it" hand limit?

6. **Tutorial Scenario**: First-time players may not understand state card placement
   - Add example in rules: "Place Hazard on Checkpoint-X to slow opponents 20%"

### Low Priority

7. **Lateral Movement**: A↔B↔C and Checkpoint-X↔Y edges unused
   - Players preferred direct forward paths
   - Could increase lateral probabilities (35%→45%) to make them viable alternatives

8. **Win Probability Transparency**: Should players know exact %? Or hidden info?
   - Current: Rules list all probabilities openly
   - Consider: Hidden probabilities for more "feel" gameplay

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | C | 5 turns vs 8-12 target (too short, but due to luck) |
| **Strategic Depth** | D | Minimal strategy - aggression beat caution, no cards used |
| **Balance** | B- | Probabilities seem reasonable but need more data |
| **Mechanic Variety** | F | State cards (v2.3 flagship) completely unused |
| **Engine Performance** | A | No bugs, state tracking perfect, victory detection instant |
| **Player Experience** | B | Fast-paced, exciting finale, but over too quickly |

## Conclusion

This playtest revealed a **highly variant outcome** where exceptional luck (5.5% combined probability) led to a 5-turn steamroll. The core engine performed flawlessly, but the new v2.3 state card mechanic saw zero adoption. 

**Primary concern:** Games may be too short for strategic card play to matter. Consider extending path length or reducing Victory probability to 20%.

**Secondary concern:** State cards need better onboarding or more copies in deck to see actual usage.

**Next steps:** Run additional playtests with same settings to determine if 5-turn wins are common or outliers.

---

*Analysis completed by gamemaster agent*  
*Playtest session: https://claude.ai/code/session_013S95UHGcQKRi52jxxrTrgN*
