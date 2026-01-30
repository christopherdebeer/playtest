# MARKOV'S CHAINS v2.3 STATE CARDS PLAYTEST ANALYSIS

**Game ID:** markovs-chains-1769804195915
**Version:** v2.3 (State Cards mechanic)
**Winner:** player-1 (turn 5)
**Duration:** 5 turns (~4 minutes)
**Date:** 2026-01-30

## v2.3 Changes from v2.2

### New Mechanic: State Cards (Headline Feature)
- **Hazard** (3 cards): Place on state, opponents entering get -20% probability
- **Safe Haven** (3 cards): Place on state, owner gets +15% probability when there
- **Toll Gate** (2 cards): Place on state, opponents must discard 1 card when entering

### Balance Changes
- **Probabilities reduced** (10-15 points across the board):
  - Start → A/B/C: 65% → **55%**
  - A/B/C → Checkpoint: 50% → **40%**
  - Checkpoint → Victory: 35% → **25%**
- **Starting cards increased**: 4 → **5** (to enable state card usage)
- **Max turns increased**: 20 → **25** (anticipating longer games)
- **Deck rebalanced**: +8 state cards, -2 boosts, -2 utility (30 total cards)

## Version Comparison

| Metric | v2.1 | v2.2 | v2.3 | Target |
|--------|------|------|------|--------|
| Total Turns | 3 | 4 | **5** | 8-12 |
| Path Length | 2 moves | 3 moves | 3 moves | - |
| Defensive Cards Used | 0 | 1 (Friction) | 0 | Multiple |
| **State Cards Used** | - | - | **0** | 3+ |
| Certainty Wasted | Yes | Yes | **Yes** | No |
| Victory Roll | 100% (Certain) | 35% (lucky) | **25% (very lucky!)** | - |

## Game Flow Analysis

| Turn | Player-1 | Player-2 | Analysis |
|------|----------|----------|----------|
| **1** | Start → A | Start → B | Both succeed on 55% rolls |
| **2** | Draw card | Play Catalyst (+20%) | P2 preparing boost |
| **3** | Play Catalyst (+20%) | B → Checkpoint-X (60% boosted) ✓ | P2 reaches checkpoint first |
| **4** | A → Checkpoint-X (40% base) ✓ | **Play Certainty** | P1 catches up, P2 wastes Certainty |
| **5** | **Checkpoint-X → Victory** | - | P1 wins with **25% roll!** |

## Critical Finding: Zero State Card Usage

### The Problem
Despite being the headline feature of v2.3, **no state cards were placed** during the entire game:
- Engine correctly tracked `placedCardEffects: []` in all move actions
- Both players had 5 starting cards (25% chance of starting with state card)
- 8/30 cards in deck are state cards (26.7% of deck)

### Why Weren't State Cards Used?

#### Hypothesis 1: Discoverability Issue
**Likely.** State cards require a new action type (`place_card`) that agents may not be aware of:
- Rules explain state cards in detail (lines 104-109, 221-241)
- Turn structure includes "Option C: Place Card" (lines 155-160)
- BUT: No explicit prompting to gamemaster/agents about this new mechanic
- Agents default to familiar patterns: move, play boost, play interference

**Evidence:**
- Game log shows only `move`, `draw`, and `play_card` actions
- No `place_card` actions attempted (would show in logs)
- Agents likely didn't "discover" this action in their available options

#### Hypothesis 2: Insufficient Incentive
**Possible.** State cards may not seem worth the action economy:
- Playing a state card uses your entire turn (no move that turn)
- Effects are delayed until someone enters that state
- Immediate boosts (Catalyst, Momentum) provide instant value
- In a 5-turn game, delayed effects may never trigger

**Math:**
- Hazard: -20% penalty (vs Friction's -25% immediate)
- Safe Haven: +15% boost (vs Catalyst's +20% immediate)
- Toll Gate: discard 1 card (vs Sabotage's discard 1 immediate)

State cards are **weaker than their instant counterparts** AND require waiting.

#### Hypothesis 3: Path Predictability
**Moderate.** With only 7 states and forced convergence at Checkpoints:
- Players know opponents MUST pass through Checkpoint-X or Checkpoint-Y
- Placing Hazard on checkpoint seems obvious... but costs a turn
- In a fast game (5 turns), opportunity cost is too high

#### Hypothesis 4: Agent Prompting Gap
**Very likely.** Gamemaster and player prompts may not mention:
- The new `place_card` action type
- Examples of when to use state cards
- Strategic value of board control

### Engine Performance
The engine handled state cards **perfectly**:
- `placedCardEffects: []` tracked in every move action
- Ready to apply effects when cards are placed
- No bugs detected in state card infrastructure

**Grade: A+** (infrastructure ready, just unused)

## Certainty Wasted (Third Consecutive Playtest)

### The Pattern
Player-2 played Certainty on **turn 4** when already at Checkpoint-X:
- Current position: Checkpoint-X
- Target: Victory (25% base probability)
- Certainty effect: auto-success on next move
- Result: **Player-1 won before Player-2's next turn**

### Why This Keeps Happening
**Root Cause: Turn Order Timing**

When you play Certainty as a separate action:
1. You spend your current turn playing the card
2. Effect applies to your NEXT turn
3. If opponent acts before your next turn, they can win first

**Optimal Certainty usage:**
- Save it until you're at Checkpoint
- Play it ONLY when you'll get next turn before opponent
- Or: Redesign Certainty as instant-use (play + move in one action)

### Historical Pattern

| Version | Certainty Used | Outcome | Issue |
|---------|----------------|---------|-------|
| v2.1 | Turn 3 by P1 | P2 won turn 3 | Wasted (opponent won first) |
| v2.2 | Turn 4 by P1 | P2 won turn 4 | Wasted (opponent won first) |
| v2.3 | Turn 4 by P2 | P1 won turn 5 | **Wasted (opponent won first)** |

**This is a systemic design flaw, not a player error.**

## Game Length Progress

### Improvement Trajectory
- v2.1: 3 turns
- v2.2: 4 turns (+33%)
- v2.3: 5 turns (+25%)

### Still Short of Target
- Target: 8-12 turns
- Actual: 5 turns
- **Gap: -40% to -58%**

### What Worked
The **probability reductions** (55%/40%/25%) did extend the game:
- More failed move attempts expected
- Victory at 25% is genuinely difficult (P1 got lucky!)
- Turn 4: P1 succeeded on 40% base roll
- Turn 5: P1 succeeded on **25% base roll** (1 in 4 chance!)

### What Didn't Work
- State cards unused → no additional turns spent placing them
- If both players had placed 1-2 state cards, game would be 7-9 turns
- **Missing 2-4 turns of potential state card placement**

## Strategic Observations

### Boost Card Economy (Working)
Both players used Catalyst cards strategically:
- Turn 2: P2 played Catalyst, moved on Turn 3 with 60% probability
- Turn 3: P1 played Catalyst (but didn't note for which move)
- Boost cards are clearly valuable and used correctly

### Defensive Play (Regressed)
- v2.2 had 1 Friction card played
- v2.3 had **0 defensive cards played**
- Regression from v2.2!
- No Friction, no Block, no Sabotage

### Risk-Taking Behavior
Player-1 showed **aggressive risk-taking**:
- Turn 4: Attempted 40% move (succeeded)
- Turn 5: Attempted **25% move** (succeeded)
- Combined probability: 0.40 × 0.25 = **0.10 (10%)**
- P1 won by hitting a **1-in-10 outcome**

This suggests:
- Probabilities may still be too high
- Or: Boost cards are too accessible
- Or: Pure luck swing (statistical outlier)

## Card Distribution Analysis

Looking at the deck composition:
- **Boost cards**: 6/30 (20%) - used frequently
- **Interference cards**: 10/30 (33%) - **unused this game**
- **State cards**: 8/30 (27%) - **unused this game**
- **Utility cards**: 6/30 (20%) - unused this game

**Only 20% of card types were used (boost cards only).**

This indicates:
1. Game too short for complex card strategies
2. Boost cards dominate (simple, effective)
3. Defensive/state cards require longer game to have value

## Recommendations for v2.4

### Priority 1: Fix State Card Discoverability
**Make state cards usable by agents:**

1. **Update gamemaster/player prompts** to explicitly mention:
   - "You can PLACE state cards (Hazard, Safe Haven, Toll Gate) on board states"
   - "Use `place_card` action type with `state` and `card` parameters"
   - Example: `{"type": "place_card", "card": "Hazard", "state": "Checkpoint-X"}`

2. **Add strategic guidance**:
   - "Place Hazard on checkpoints to slow opponents"
   - "Place Safe Haven on states you plan to pass through"
   - "Place Toll Gate on forced chokepoints"

3. **Increase state card power** to justify the turn cost:
   - Hazard: -20% → **-30%**
   - Safe Haven: +15% → **+25%**
   - Toll Gate: discard 1 → **discard 2** or **skip turn**

4. **Add "free placement" option**:
   - When you draw a state card, you MAY place it for free
   - Doesn't use your action for the turn
   - Enables faster board control buildup

### Priority 2: Fix Certainty Timing Issue
**Make Certainty instant-use:**

Change from:
```yaml
# Current: Delayed effect
- Play Certainty (uses turn)
- Next turn: Move with auto-success
```

To:
```yaml
# New: Instant effect
- Play Certainty + declare move target (single action)
- Move succeeds automatically
- Turn ends
```

This prevents the "opponent wins before you move" problem.

### Priority 3: Further Reduce Probabilities
**Even with 25% Victory, P1 still got lucky:**

Suggested probabilities for v2.4:
- Start → A/B/C: 55% → **45%**
- A/B/C → Checkpoint: 40% → **30%**
- Checkpoint → Victory: 25% → **15%**

This would:
- Make boost cards nearly mandatory
- Force players to use state cards for defensive advantage
- Extend game to 8-12 turns

### Priority 4: Add Layer 1.5 (Optional)
**If probability nerfs insufficient, add more states:**

```
         [Start]
         /  |  \
       [A] [B] [C]         Layer 1 (45%)
         \  |  /
       [D] [E] [F]         Layer 1.5 (35%) - NEW
         \  |  /
   [Checkpoint-X]──[Checkpoint-Y]   Layer 2 (30%)
            \    /
          [Victory]        Layer 3 (15%)
```

Minimum path: 4 moves (Start → A → D → Checkpoint → Victory)

### Priority 5: Agent Improvements
**Help agents play better:**

1. Add `npx playtest suggest` command showing:
   - Available actions (including place_card!)
   - Probability calculations with current effects
   - Strategic recommendations

2. Add visibility to gamemaster logs:
   - When agents waste Certainty, log warning
   - When state cards are available but unused, log suggestion

3. Increase player count to 3-4:
   - More interaction
   - More turns
   - More defensive play opportunities

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **State Card Mechanic** | **F** | 0% usage rate - complete failure to launch |
| **Probability Reductions** | **B** | Worked (+1 turn), but still short |
| **Starting Cards Increase** | **C** | Good idea, but state cards still unused |
| **Game Length** | **D+** | 5 turns (40% short of target) |
| **Strategic Depth** | **D** | Only boost cards used, no variety |
| **Engine Performance** | **A+** | Flawless state card infrastructure |
| **Overall v2.3** | **D** | Headline feature completely unused |

## Conclusion

v2.3 represents a **mechanical success but practical failure**:

**What Worked:**
- ✅ Engine correctly implemented state cards
- ✅ Probability reductions extended game by +1 turn
- ✅ Infrastructure ready for board control mechanics

**What Failed:**
- ❌ **State cards had 0% usage** (headline feature DOA)
- ❌ **Certainty wasted again** (third consecutive playtest)
- ❌ **No defensive play** (regression from v2.2)
- ❌ **Still 40% short of target length**

**Root Causes:**
1. **Discoverability**: Agents don't know `place_card` action exists
2. **Incentive**: State cards are weaker + delayed vs instant cards
3. **Prompting**: Gamemaster/player prompts don't mention new mechanic
4. **Speed**: Game too fast to justify delayed effects

**Critical Path Forward:**
1. Fix agent prompting to enable state card discovery
2. Buff state cards significantly (+50% to all effects)
3. Make Certainty instant-use (play + move in one action)
4. Reduce probabilities further (45%/30%/15%)
5. Re-playtest with explicit state card instructions

**The state card mechanic has potential, but it needs aggressive intervention to become viable.**

---

## Next Playtest Goals (v2.4)

- [ ] State cards used at least 3 times
- [ ] Certainty used correctly (not wasted)
- [ ] Game length 8-12 turns
- [ ] At least 2 different card types used per player
- [ ] Defensive cards see play (Friction, Block, Hazard)

**Success Metric:** If v2.4 has 3+ state cards placed and reaches 8+ turns, the mechanic is validated.
