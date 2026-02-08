# Council of Whispers v1.0 - Playtest Analysis

**Game ID:** council-of-whispers-1770546831175  
**Version:** 1.0  
**Winner:** player-2 (6 points)  
**Loser:** player-1 (5 points, eliminated)  
**Duration:** 8 rounds, 33 turns  
**Date:** 2026-02-08

## Executive Summary

This playtest revealed **critical engine failures** that prevented Council of Whispers from functioning as designed. The game ran to completion but only 3 of 14 mechanics were minimally exercised. Most significantly, all players were incorrectly assigned the same role (Loyalist), eliminating the core social deduction element.

## Final Scores

| Player | Score | Gold | Role | Status |
|--------|-------|------|------|--------|
| player-3 | **15** | 12 | Loyalist | Survivor (Highest) |
| player-2 | **6** | 12 | Loyalist | **WINNER** |
| player-4 | **6** | 12 | Loyalist | Survivor (Tied) |
| player-1 | **5** | 12 | Loyalist | **ELIMINATED** (Lowest) |

**Treasury:** 21 gold (started at 20, +1 from player-1 contribution)

## Critical Engine Issues

### 1. Hidden Role Assignment Failure (CRITICAL)
**Status:** All 4 players assigned "Loyalist" role  
**Expected:** Mix of Loyalists, Conspirators, and Opportunist based on player count  
**Impact:** Eliminated the game's core social deduction mechanic

This is a **showstopper bug** in the hidden-roles mechanic. Without role diversity, the entire premise of the game (identifying conspirators, hidden agendas, conflicting objectives) collapses.

### 2. Phase Management Missing (CRITICAL)
**Status:** No structured phase progression  
**Expected:** 5 distinct phases per round (Action Selection → Negotiation → Prisoner's Dilemma → Voting → Treasury)  
**Impact:** Players had no framework for when to negotiate, vote, or make dilemma choices

The engine's flat turn-based model cannot represent the rules' round structure. This is a known architectural limitation documented in council-of-whispers-issues.md.

### 3. Prisoner's Dilemma Incomplete (HIGH)
**Status:** Only 1 of 3 expected rounds completed  
**Observed:** Round 1 choices recorded (player-3 defected, others cooperated), but rounds 2-3 never resolved  
**Impact:** player-3's score of 15 came entirely from one defection payoff, creating massive imbalance

The PD state shows `round: 2, resolved: false` with incomplete choices, suggesting the mechanic stalled mid-execution.

## Mechanics Exercised

| Mechanic | Usage | Grade | Notes |
|----------|-------|-------|-------|
| **prisoners-dilemma** | Partial | D | Only 1/3 rounds completed; granted player-3 insurmountable lead |
| **alliances** | Minimal | C- | 1 alliance formed (player-1 ↔ player-2), no strategic impact |
| **semi-cooperative-game** | Minimal | D | 1 contribution (player-1), treasury irrelevant without role diversity |
| **simultaneous-action-selection** | Broken | F | All players selected "Scheme" but no resolution visible |
| **voting** | **Not Used** | F | No votes initiated despite being Phase 4 of every round |
| **negotiation** | **Not Used** | F | No agreements proposed or accepted |
| **bribery** | **Not Used** | F | No bribes offered |
| **betting-and-bluffing** | **Not Used** | F | No betting or bluff challenges |
| **communication-limits** | **Not Used** | F | No communication actions tracked |
| **hidden-roles** | **Failed** | F | All players same role |
| **resources** | Basic | C | Gold/influence tracked but not meaningfully used |
| **action-points** | Basic | C | AP consumed (e.g., propose_alliance cost 1 AP) but no strategic depth |

**Mechanics Utilization:** 3 of 14 (21%)

## Key Moments

| Turn | Round | Player | Action | Significance |
|------|-------|--------|--------|--------------|
| 8 | 2 | all | dilemma_choice | **Only PD round**: player-3 defected, gained 15-point lead |
| 13 | 4 | player-1 | propose_alliance | Alliance with player-2 formed (expired unused) |
| 17 | 5 | player-1 | contribute | Only treasury contribution (+1 gold) |
| 21-32 | 6-8 | player-1 | pass (×12) | Final rounds: continuous passing, no meaningful actions |

## What Went Wrong

### Game Did Not Start Properly
The lack of role diversity suggests the `hidden-roles` mechanic failed during setup. All players received the same role, making the game cooperative instead of adversarial.

### No Phase Orchestration
Players never entered distinct phases. The rules specify:
1. **Phase 1:** Simultaneous action selection (saw selection but no resolution)
2. **Phase 2:** Negotiation (never triggered)
3. **Phase 3:** Prisoner's Dilemma (started but incomplete)
4. **Phase 4:** Voting (never triggered)
5. **Phase 5:** Treasury contribution (1 occurrence, not phase-locked)

### Prisoner's Dilemma Became Win Condition
Because PD was the only mechanic that granted points, player-3's single defection created an unassailable 9-point lead (15 vs. 6). The other mechanics (voting, bribery, negotiation) that should have provided counterplay never activated.

### Player Behavior Collapsed
After turn 13, player-1 took 12 consecutive "pass" actions across rounds 6-8, suggesting the agent detected there were no valid strategic options.

## Balance Findings

**Cannot assess balance** due to engine failures. The game as designed requires:
- Role-based scoring differences (Loyalist vs. Conspirator formulas)
- Multiple gold acquisition paths (Scheme, bribes, PD, votes)
- Social dynamics from hidden information

None of these existed in this playtest.

## Recommendations for Next Version

### Must Fix Before Next Playtest

1. **Fix hidden-roles mechanic** to properly distribute roles based on player count
2. **Implement phase management** or redesign rules to work with flat turn model
3. **Complete Prisoner's Dilemma** - all 3 rounds must resolve with proper pairings
4. **Add phase triggers** for voting, negotiation, and betting mechanics

### Design Considerations

5. **Reduce mechanic count**: 14 mechanics is too complex for initial implementation. Focus on 4-5 core mechanics:
   - Hidden roles
   - Voting
   - Prisoner's Dilemma
   - Alliances
   - Resources

6. **Simplify scoring**: Current role-based formulas require working hidden-roles and treasury mechanics. Consider simpler victory condition for early testing.

7. **Add player guidance**: Agents need explicit prompts for when to vote, negotiate, or make dilemma choices

### Testing Protocol

8. **Unit test each mechanic** in isolation before integration
9. **Validate role distribution** before game start
10. **Add phase transition logging** to confirm progression

## Overall Grade: F

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Completeness | F | 21% mechanic utilization |
| Role Assignment | F | Showstopper bug (all same role) |
| Strategic Depth | F | One action (PD defection) determined outcome |
| Engine Performance | D | Game completed but most features non-functional |
| Playability | F | Not representative of designed experience |

## Conclusion

This playtest did not evaluate Council of Whispers as designed. The engine's inability to handle the game's phase structure, combined with the hidden-roles bug, means players experienced a degenerate version where:
- Everyone knew everyone's role (all Loyalists)
- One Prisoner's Dilemma choice determined the winner
- 11 of 14 mechanics never activated

**Next Steps:**
1. Fix hidden-roles assignment in `src/mechanics/hidden-roles.ts`
2. Either implement phase management or redesign rules to eliminate phases
3. Debug Prisoner's Dilemma completion (why only 1 of 3 rounds?)
4. Reduce scope to 5 core mechanics and retest

This game requires **major engine work** before it can be meaningfully playtested.

