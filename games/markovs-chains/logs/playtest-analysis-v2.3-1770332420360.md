# Markov's Chains v2.3 PLAYTEST ANALYSIS

**Game ID:** markovs-chains-1770332420360  
**Version:** v2.3  
**Winner:** player-1 (turn 5)  
**Duration:** 5 turns (3 rounds)  
**Date:** 2026-02-05

## Executive Summary

This playtest revealed a **critical balance issue** - player-1 achieved victory in only 5 turns (3 rounds) by successfully executing the minimum 3-move path with extremely lucky dice rolls. **Zero cards were played by either player**, indicating the game ended before strategic card play could develop. The combined probability of player-1's winning sequence was only **5.5%**, yet all three moves succeeded consecutively.

## Game Flow Analysis

| Turn | Player | Action | From State | To State | Base Prob | Result | Analysis |
|------|--------|--------|------------|----------|-----------|---------|----------|
| 1 | player-1 | move | Start | A | 55% | SUCCESS | First move succeeded |
| 2 | player-2 | move | Start | A | 55% | SUCCESS | Both players took same path |
| 3 | player-1 | move | A | Checkpoint-X | 40% | SUCCESS | Advanced to checkpoint |
| 4 | player-2 | move | A | Checkpoint-Y | 40% | SUCCESS | One turn behind |
| 5 | player-1 | move | Checkpoint-X | Victory | 25% | SUCCESS | **VICTORY** - 25% roll succeeded! |

### Path Analysis

**Player-1's Winning Path:**
- Start → A → Checkpoint-X → Victory
- Move sequence: 3 moves (optimal minimum path)
- Combined probability: 0.55 × 0.40 × 0.25 = **5.5% chance**
- Actual result: 3/3 successes (100% success rate)

**Player-2's Path:**
- Start → A → Checkpoint-Y → (game ended)
- 2 moves completed before elimination
- Was one turn behind at all times

## Key Observations

### What Worked

- **State graph structure**: The checkpoint layer successfully forced a minimum 3-move path
- **Turn order clarity**: Players alternated cleanly
- **Victory declaration**: The game ended immediately when player-1 reached Victory state
- **Engine performance**: No bugs or errors detected

### What Didn't Work

1. **Game length catastrophically short**: 5 turns vs expected 8-12 turns
   - Game ended before any strategic depth could emerge
   - No opportunity for comeback mechanics
   - No card economy developed

2. **Card system completely unused**: Zero cards played by either player
   - Players had no time to build hands or execute strategies
   - Boost cards (Catalyst, Momentum, Certainty) never used
   - Interference cards (Friction, Block, Sabotage) never deployed
   - New state cards (Hazard, Safe Haven, Toll Gate) never placed
   - The entire 30-card deck mechanic was irrelevant

3. **Luck overwhelmed strategy**: Player-1 won purely on improbable dice luck
   - 5.5% chance path succeeded without any boosts
   - The hardest move (25% to Victory) succeeded on first try
   - No risk mitigation through cards was necessary

4. **No defensive play opportunity**: Player-2 had no chance to interfere
   - Couldn't use Friction to reduce player-1's 25% final roll
   - Couldn't use Block to delay player-1's victory attempt
   - Game was over before defensive cards became relevant

5. **Probability reduction backfired**: v2.3 reduced probabilities to encourage card usage
   - Start→A/B/C: 65% → 55% (v2.3 change)
   - Intermediate→Checkpoint: 50% → 40% (v2.3 change)
   - Checkpoint→Victory: 35% → 25% (v2.3 change)
   - **Irony**: Lower probabilities should have made games longer, but RNG allowed instant win

### Balance Findings

**Probability Distribution:**
- 55% first layer: Too high given game ended immediately
- 40% second layer: Reasonable for mid-game
- 25% final layer: Theoretically good as hardest barrier, but failed to gate victory

**Expected vs Actual:**
- Expected moves per transition: ~2-3 attempts each
- Actual: 1 attempt per transition (100% success rate for winner)
- Expected game length: 8-12 turns
- Actual: 5 turns (58% shorter than minimum expectation)

**Card Usage:**
- Expected: Multiple boost and interference cards per game
- Actual: Zero cards played
- New state cards: Never placed (0/8 available cards used)

**Starting cards:** Players received 5 cards each (v2.3 increase from 4) but never used them

## Recommendations for Next Version (v2.4)

### Priority 1: Prevent Instant Wins (CRITICAL)

**Option A - Add mandatory intermediate steps:**
- Require 2 moves at each checkpoint before advancing
- Forces minimum 5-move path instead of 3
- Example: Checkpoint-X needs two "charge counters" before enabling Checkpoint→Victory transition

**Option B - Multi-stage victory:**
- Add "Pre-Victory" state requiring resource collection
- Victory state requires spending cards/resources to enter
- Forces strategic card usage

**Option C - Reduce early-game probabilities drastically:**
- Start→A/B/C: 55% → 35% (forces ~3 attempts)
- A/B/C→Checkpoint: 40% → 25% (forces ~4 attempts)
- Checkpoint→Victory: 25% → 15% (forces ~7 attempts)
- **Trade-off:** May make unassisted moves feel too punishing

### Priority 2: Incentivize Card Play

1. **Mandatory card usage rule:**
   - "Before attempting move to Victory state, must have played at least 3 cards this game"
   - Ensures strategic interaction develops

2. **Card-gated transitions:**
   - Certain edges require card discard to attempt
   - Example: "Discard 1 card to roll for Checkpoint→Victory"

3. **Boost card requirement:**
   - Victory state can only be reached with probability ≥50%
   - Forces players to use Momentum (+0.3) or Certainty (auto-success)
   - Makes card economy critical

### Priority 3: Extend Game Length

1. **Increase minimum path:**
   - Add Layer 3 states between Checkpoints and Victory
   - Minimum path becomes 4-5 moves instead of 3

2. **Failed move penalty:**
   - Failed transition costs 1 card discard
   - Discourages brute-force spam of low-probability moves

3. **Turn-based gating:**
   - "Victory state unlocks at Round 5 or later"
   - Ensures minimum game duration for card play

### Priority 4: Enable Comeback Mechanics

1. **Interference cards should be stronger when behind:**
   - Friction gives -0.35 instead of -0.25 when target is ahead
   - Block duration increases to 2 turns when target is at Checkpoint layer

2. **Catch-up mechanics:**
   - Player furthest behind draws 2 cards per turn instead of 1
   - Enables defensive card stockpiling

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | **F** | 5 turns vs 8-12 target (58% below minimum) |
| Strategic Depth | **F** | Zero cards played, pure RNG determined outcome |
| Balance | **F** | Instant win through improbable luck, no comeback opportunity |
| Card Mechanics | **F** | Entire deck system unused, state cards never deployed |
| Probability Design | **D** | Probabilities too permissive despite v2.3 reductions |
| Engine Performance | **A** | No bugs, clean execution, victory detection worked |
| State Graph | **B** | Checkpoint layer functioned correctly, but insufficient |
| Player Engagement | **F** | Game ended before strategic decisions mattered |

**Overall Grade: F (Critical Balance Failure)**

## Additional Notes

### Variance Concerns

This game represents an **extreme outlier** - a 5.5% probability path succeeding perfectly. However, the design should prevent even outlier games from being this short. Recommendations above would ensure:
- Even with perfect RNG, minimum 7-10 turns
- Card usage becomes mandatory for victory
- Strategic interaction is unavoidable

### Positive Signals

Despite the critical balance issues:
- Engine handled probability rolls correctly
- State transitions worked cleanly
- Victory detection was immediate and accurate
- Game log provided clear audit trail

### Next Playtest Focus

For v2.4, test specifically:
1. Can a player win without playing any cards? (Should be NO)
2. Is minimum game length ≥10 turns even with best RNG? (Should be YES)
3. Do defensive cards get used? (Should be YES)
4. Do state cards (Hazard, Safe Haven, Toll Gate) see play? (Should be YES)

---

**Conclusion:** v2.3 requires major rebalancing before further playtesting. The core mechanics (state graph, probability movement, card system) are sound, but the probability values and path structure allow instant wins that bypass all strategic elements.
