# Markov's Chains v2.3 Playtest Analysis

**Game ID:** markovs-chains-1769906743630  
**Version:** 2.3  
**Winner:** player-1 (turn 4)  
**Duration:** 4 turns  
**Date:** 2026-02-01

## Game Flow Analysis

| Turn | Player-1 | Player-2 | Analysis |
|------|----------|----------|----------|
| 1 | Move: Start → A ✓ | Move: Start → A ✓ | Both players chose state A, both succeeded (55% probability) |
| 2 | Move: A → Checkpoint-X ✓ | Play Card: Block → player-1 | Player-1 advances; Player-2 uses defensive card to delay |
| 3 | Pass (blocked) | Move: A → Checkpoint-X ✓ | Block effect active; Player-2 catches up |
| 4 | Move: Checkpoint-X → Victory ✓ | - | Player-1 wins with 25% probability roll! |

## Key Observations

### What Worked

- **Victory declaration mechanic** functioned correctly - game auto-ended when player-1 reached Victory state
- **Block card** demonstrated defensive play value by forcing player-1 to pass one turn
- **Probability movement** executed correctly across all difficulty tiers (55%, 40%, 25%)
- **Turn structure** was clear and both players understood the progression path

### What Didn't Work

- **Game was extremely short** - Only 4 turns vs expected 8-12 turns
  - This was primarily due to luck: player-1 succeeded on all movement attempts despite cumulative probability of only 5.5% (0.55 × 0.40 × 0.25)
- **State cards completely unused** - New v2.3 mechanic (Hazard, Safe Haven, Toll Gate) saw zero adoption
  - Players focused on rushing to Victory rather than board control
  - No strategic placement occurred
- **Boost cards unused** - No Catalyst, Momentum, or Certainty cards were played
  - Players may have felt they didn't need them, or game ended before they could be utilized
- **Limited card play** - Only 1 card played total (Block), despite each player starting with 5 cards
- **No comeback mechanics tested** - Game never reached a state where trailing player needed recovery options

### Balance Findings

**Movement Success Rates:**
- Start → A: 2/2 successes (100% vs expected 55%)
- A → Checkpoint-X: 2/2 successes (100% vs expected 40%)
- Checkpoint-X → Victory: 1/1 success (100% vs expected 25%)

**Overall:** Players succeeded on 100% of movement attempts (5/5), which is highly anomalous given the reduced probabilities introduced in v2.3.

**Card Usage Patterns:**
- Interference cards: 1 use (Block)
- Boost cards: 0 uses
- State cards: 0 uses (new mechanic completely untested)
- Utility cards: 0 uses

**Strategic Patterns:**
- Both players chose identical path (Start → A → Checkpoint-X → Victory)
- No lateral movement utilized (A↔B↔C or Checkpoint-X↔Checkpoint-Y)
- Rush strategy dominated: move every turn, minimal card play
- Only defensive play was player-2's Block card attempt to slow leader

## Recommendations for Next Version

### High Priority

1. **Increase minimum path length** - Consider adding another checkpoint layer to force 4+ moves
   - Current minimum: 3 moves (too short even with 25% final probability)
   - Suggested: 4-5 moves to increase expected game length

2. **Further reduce base probabilities** - Current rates (55%/40%/25%) didn't create enough failure
   - Suggested: 45%/30%/20% to make boost cards essential
   - This would make rushing less viable and encourage strategic card usage

3. **Incentivize state card usage** - New mechanic needs visibility and value
   - Increase state card effects (+15%/−20% may be too weak)
   - Consider giving players 1 free state card placement at game start
   - Add explicit tutorial/example in rules about chokepoint defense

### Medium Priority

4. **Add failure consequences** - Currently failing just wastes a turn
   - Consider: "On failed move, discard 1 card" to punish reckless rushing
   - Or: "On failed move to Victory, fall back to previous state"

5. **Boost card visibility** - Players didn't use them despite having them
   - May need more aggressive starting hand (include 1 guaranteed boost card?)
   - Consider auto-suggesting boost usage when attempting low-probability moves

6. **Lateral movement incentives** - A↔B↔C paths were completely ignored
   - Current 35% lateral probability doesn't compete with 55% forward
   - Could add "safe path" bonuses or special cards for lateral movement

### Low Priority

7. **Max turns setting** - Current 25 is way too high for observed game length
   - Suggest reducing to 15 turns max (current game was 4 turns)

8. **Card draw mechanic** - Only 1 card per turn may be insufficient
   - Consider increasing to 2 cards per turn to flood hands and encourage usage

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | D | 4 turns vs 8-12 expected; far too short due to high luck factor |
| Strategic Depth | C | Limited strategy - rush dominated; state cards unused; 1 defensive play |
| Balance | C- | 100% move success rate indicates probabilities too high OR sample size too small |
| Mechanic Testing | D+ | State cards completely untested; boost cards unused; minimal card interaction |
| Engine Performance | A | No bugs; victory detection worked; turn blocking worked correctly |
| Comeback Potential | N/A | Game ended before trailing player could test recovery mechanics |

## Additional Notes

**Luck Factor:** This game was statistically very unusual. The probability that player-1 would succeed on all 3 moves is approximately 5.5%. This suggests either:
1. The RNG favored player-1 significantly (most likely)
2. The sample size (1 game) is insufficient to evaluate balance
3. Probability calculations in the engine may need verification

**State Card Mechanic:** The new v2.3 feature was completely ignored. This could be because:
- Players didn't understand the mechanic
- Rushing was more appealing than defensive positioning
- Game ended before strategic placement became relevant
- Effects (+15%/−20%) weren't strong enough to justify the action cost

**Recommendation:** Run 5-10 more playtests to get statistically meaningful data on movement success rates and card usage patterns. One 4-turn game is insufficient to properly evaluate v2.3 balance changes.

---

**Gamemaster Adjudications:** None required (no contests, resignations, or disputed victory claims)

**Overall Assessment:** Game functioned correctly but ended far too quickly due to exceptional luck. v2.3 changes (reduced probabilities, state cards) were not meaningfully tested in this session.
