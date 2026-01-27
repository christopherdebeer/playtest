# Markov's Chains - Playtest Analysis

## Playtest #1 Results

**Game ID**: markovs-chains-1738063532000
**Winner**: Player-3
**Turns**: 6
**Duration**: ~5 minutes

### Game Flow

1. **Turn 1**: Player-1 played Momentum (banked for future use)
2. **Turn 2**: Player-2 played Certainty + moved Start → A
3. **Turn 3**: Player-3 played State Swap (stole A from player-2)
4. **Turn 4**: Player-1 played Catalyst + used Momentum + moved Start → B
5. **Turn 5**: Player-2 played Catalyst + moved Start → C (rolled 0.753/0.9)
6. **Turn 6**: Player-3 played Momentum + moved A → Victory (rolled 0.304/0.9) - WIN!

### Cards Usage

**Played**:
- Momentum: 2 times
- Catalyst: 2 times
- Certainty: 1 time
- State Swap: 1 time

**Not Played**:
- Friction: 0 times (2 in hands)
- Block: 0 times (1 in hand)
- Redirect: 0 times (1 in hand)
- Probability Scan: 0 times (1 in hand)
- Reroll: 0 times (1 in hand)

### What Worked

✓ **Game Length**: 6 turns ideal - strategic depth without dragging
✓ **State Graph**: Two-stage progression created meaningful choices
✓ **Probability Management**: Base probabilities required card support
✓ **Card Synergy**: Momentum + Catalyst combo was satisfying
✓ **Counterplay**: State Swap vs Certainty showed rock-paper-scissors

### Issues Identified

⚠️ **Defensive Cards Underused**: Friction/Block never played - players prioritize advancing
⚠️ **Utility Cards Underused**: Probability Scan/Redirect/Reroll had no value
⚠️ **State Swap Too Strong**: Instantly won game by negating opponent's investment
⚠️ **Card Draw Unused**: No player drew - starting hand sufficient
⚠️ **100% Success Rate**: All 5 move attempts succeeded - may be too easy

### Card Tier List

**S-Tier** (Game-Winning):
- State Swap: Instant position steal, no counterplay
- Certainty: Guaranteed success

**A-Tier** (Very Strong):
- Momentum: +0.3 boost (near-guarantee with 0.6-0.7 base)
- Catalyst: +0.2 boost (safe 90%+ odds)

**B-Tier** (Situational):
- Reroll: Only useful after failure (no failures occurred)

**C-Tier** (Unused):
- Friction: Defensive, not aggressive enough
- Block: Defensive, not aggressive enough
- Redirect: Situational, no clear value

**D-Tier** (No Value):
- Probability Scan: Game state already clear to all players

## Proposed Changes for Playtest #2

### 1. Adjust Base Probabilities (Make Cards More Valuable)
```yaml
Current → Proposed:
- base_transition_prob: 0.7 → 0.65 (Start to Intermediate)
- Victory transitions: 0.6 → 0.55 (Intermediate to Victory)
```
**Rationale**: Lower base odds make boosts more essential, reducing "raw dogging" moves

### 2. Nerf State Swap (Too Powerful)
```yaml
Current: Instant swap, no restrictions
Proposed: Can only swap with players at same tier (Start, Intermediate, or Victory)
Alternative: Requires discarding 2 cards to use
```
**Rationale**: Prevent instant win-stealing from players who earned their position

### 3. Buff Defensive Cards (Incentivize Use)
```yaml
Friction: -0.2 → -0.25 (stronger deterrent)
Block: Blocks movement → Blocks movement + card play (stronger effect)
Block: Duration 1 turn → 1 turn (keep as is)
```
**Rationale**: Stronger defensive cards = more strategic interaction

### 4. Rework Utility Cards
```yaml
Probability Scan: Remove entirely (no value)
Add: "Sabotage" - Force opponent to discard 1 card
Redirect: Keep as is but clarify usage
Reroll: Keep as is (useful backup)
```
**Rationale**: Probability Scan had zero value, replace with interactive card

### 5. Adjust Card Distribution
```yaml
Current deck (30 cards):
- Boost: 12 (Catalyst x4, Momentum x4, Certainty x4)
- Interference: 10 (Friction x4, Block x3, Redirect x3)
- Utility: 8 (Scan x3, Swap x2, Reroll x3)

Proposed deck (30 cards):
- Boost: 10 (Catalyst x3, Momentum x3, Certainty x4)
- Interference: 12 (Friction x5, Block x4, Sabotage x3)
- Utility: 8 (Redirect x3, Swap x2, Reroll x3)
```
**Rationale**: Increase defensive card frequency, reduce boost prevalence

### 6. Optional: Add Turn Limit
```yaml
Add: max_turns: 15 (if no winner by turn 15, highest state wins)
```
**Rationale**: Prevent defensive stalemates if defensive play increases

## Expected Outcomes for Playtest #2

1. **More Failed Moves**: Lower base probabilities → more risk → more card usage
2. **Defensive Play**: Buffed Friction/Block → players interfere with leaders
3. **Strategic Depth**: State Swap nerf → less swingy, more tactical
4. **Card Variety**: Better distribution → see more card types in play
5. **Game Length**: Expect 8-10 turns (up from 6) due to interference

## Key Metrics to Track

- Game length (turns)
- Card types played (distribution)
- Success rate of move attempts
- Defensive card usage count
- State Swap impact (if nerfed version used)
- Did anyone use defensive cards strategically?
