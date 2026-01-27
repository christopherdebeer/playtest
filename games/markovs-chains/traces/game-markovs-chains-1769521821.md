# Markov's Chains v2.0 - Game Trace
## Game ID: markovs-chains-1769521821

**Winner:** Player-1  
**Total Turns:** 7  
**Version:** 2.0 (Lower probabilities, stronger defensive cards)

---

## Turn-by-Turn Trace

### Turn 1: Player-1
**State:** Start → A  
**Actions:**
1. Played **Catalyst** (+0.3 boost)
2. Attempted move to A with 95% probability (0.65 base + 0.3 boost)
3. **Roll:** 0.367 < 0.95 → **SUCCESS**

**Analysis:** Strong opening. Player-1 maximized early advancement by using their boost card immediately.

**State after turn:**
- Player-1: A (3 cards)
- Player-2: Start (4 cards)
- Player-3: Start (4 cards)

---

### Turn 2: Player-2
**State:** Start → B  
**Actions:**
1. Played **Momentum** (+0.2 boost)
2. Attempted move to B with 85% probability (0.65 base + 0.2 boost)
3. **Roll:** 0.489 < 0.85 → **SUCCESS**

**Analysis:** Player-2 followed the same strategy as Player-1, successfully catching up. Both players now one move from victory.

**State after turn:**
- Player-1: A (3 cards)
- Player-2: B (3 cards)
- Player-3: Start (4 cards)

---

### Turn 3: Player-3
**State:** Start → C  
**Actions:**
1. Played **Block** on Player-1 (defensive maneuver)
2. Played **Momentum** (+0.2 boost)
3. Attempted move to C with 85% probability (0.65 base + 0.2 boost)
4. **Roll:** 0.551 < 0.85 → **SUCCESS**

**Analysis:** Brilliant tactical play! Player-3 blocked the leader (Player-1) to prevent their victory attempt next turn, then caught up. The new v2.0 Block is powerful - prevents both movement AND card play.

**State after turn:**
- Player-1: A (3 cards, **BLOCKED**)
- Player-2: B (3 cards)
- Player-3: C (3 cards)

---

### Turn 4: Player-1
**State:** A (no change)  
**Actions:**
1. **PASS** (blocked, cannot move or play cards)

**Analysis:** Block effect in action. Player-1 loses their turn entirely, demonstrating the power of v2.0's strengthened Block card.

**State after turn:**
- Player-1: A (3 cards, block expires)
- Player-2: B (3 cards)
- Player-3: C (3 cards)

---

### Turn 5: Player-2
**State:** B (no change)  
**Actions:**
1. Played **Certainty** (+0.15 boost)
2. Attempted move to Victory with 70% probability (0.55 base + 0.15 boost)
3. **Roll:** 0.610 > 0.70 → **FAILED**

**Analysis:** First victory attempt fails! This is a key moment showing v2.0's lower probabilities in action. Even with a boost to 70%, Player-2 couldn't succeed. In v1.0, the base probability to Victory was 60%, so this attempt might have succeeded.

**State after turn:**
- Player-1: A (3 cards)
- Player-2: B (2 cards)
- Player-3: C (3 cards)

---

### Turn 6: Player-3
**State:** C (no change)  
**Actions:**
1. Attempted move to Victory with 55% probability (base, no boost)
2. **Roll:** 0.785 > 0.55 → **FAILED**
3. Played **Reroll**
4. **Re-roll:** 0.880 > 0.55 → **FAILED AGAIN**

**Analysis:** Dramatic double-failure! Player-3 attempts victory twice and fails both times. The 0.785 roll was particularly unlucky, and even the Reroll didn't save them with 0.880. This demonstrates that v2.0's 55% victory probability (down from 60% in v1.0) significantly increases failure rates.

**Statistical note:** At 55% probability, the chance of failing twice in a row is (0.45)² = 20.25%

**State after turn:**
- Player-1: A (3 cards)
- Player-2: B (2 cards)
- Player-3: C (1 card)

---

### Turn 7: Player-1
**State:** A → Victory  
**Actions:**
1. Attempted move to Victory with 55% probability (base, no boost)
2. **Roll:** 0.546 < 0.55 → **SUCCESS**

**Analysis:** GAME WINNING MOVE! Player-1 wins by the narrowest margin - their roll of 0.546 just barely beat the 0.55 threshold. This clutch victory came after watching both opponents fail their attempts. The suspense was real!

**Final State:**
- Player-1: **VICTORY** (Winner!)
- Player-2: B
- Player-3: C

---

## Key Statistics

### Move Success Rates by Probability
- **95% (boosted):** 1/1 attempts (100%)
- **85% (boosted):** 2/2 attempts (100%)
- **70% (boosted):** 0/1 attempts (0%)
- **55% (base):** 1/3 attempts (33%)

### Cards Played
**Boost Cards (3):**
- Catalyst x1
- Momentum x2
- Certainty x1

**Interference Cards (1):**
- Block x1

**Utility Cards (1):**
- Reroll x1

**Not Used:**
- Friction
- Redirect
- Sabotage
- State Swap

---

## v2.0 Balance Analysis

### What Worked Well

1. **Lower Probabilities (65%/55%)**
   - Created genuine tension and uncertainty
   - 3 failed victory attempts kept the game competitive
   - Success rate at 55%: only 33% (1/3) vs expected 55%
   - Game took 7 turns vs v1.0's typical 6 turns

2. **Stronger Block**
   - Preventing both movement AND card play made it a powerful defensive tool
   - Player-3 used it strategically to slow down Player-1
   - Created interesting tactical decisions

3. **Competitive Balance**
   - All 3 players reached intermediate states by turn 3
   - Multiple players had victory chances
   - Winner was decided by narrow margin (0.546 < 0.55)

### What Needs More Testing

1. **Sabotage Card**
   - Not used in this game
   - Players preferred boost cards over forced discard
   - May need multiple games to evaluate its strategic value

2. **State Swap with Tier Restriction**
   - Not used in this game
   - Same-tier restriction may have reduced its appeal
   - Consider allowing cross-tier swaps with limitations (e.g., can't swap into Victory state)

3. **Utility Card Balance**
   - Only Reroll was used (and it failed to help)
   - Redirect and State Swap saw no action
   - Players heavily favored boost cards

### Recommendations

1. **Probabilities:** Keep at 65%/55% - working well
2. **Block:** Keep strengthened version - creates good tactical play
3. **State Swap:** Consider removing tier restriction or allowing "swap to same or worse tier"
4. **Deck Composition:** Test with 11 boost, 11 interference, 8 utility
5. **Sabotage:** Increase quantity to 4 to encourage more use

---

## Conclusion

Markov's Chains v2.0 successfully addressed v1.0's concerns about games being too quick and deterministic. The lower probabilities created multiple dramatic moments:

- Player-2's failed 70% attempt (Turn 5)
- Player-3's double-failure with Reroll (Turn 6)
- Player-1's clutch 0.546 victory roll (Turn 7)

The game took 7 turns instead of 6, but remained engaging throughout. The strengthened Block card saw strategic use, and all three players remained competitive until the end.

**Overall Assessment:** v2.0 is a significant improvement over v1.0, with better balance and more suspenseful gameplay. Minor tweaks to utility cards recommended, but core mechanics are solid.
