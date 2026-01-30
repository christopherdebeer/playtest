# MARKOV'S CHAINS v2.1 BALANCE PLAYTEST ANALYSIS

**Game ID:** markovs-chains-1769802054779
**Version:** v2.1 (balanced)
**Winner:** player-2 (turn 3)
**Duration:** 3 turns (~2.5 minutes)

## Balance Changes Applied
- Victory probability: 0.55 → **0.35**
- Certainty cards: 4 → **2**
- Block duration: 1 → **2 turns**

## Game Flow
| Turn | Player-1 | Player-2 |
|------|----------|----------|
| 1 | Move Start→A | Move Start→B |
| 2 | Move A→B | Play Momentum (+30%) |
| 3 | Play Certainty (wasted!) | Move B→Victory (65%) ✓ |

## Balance Change Evaluation

| Change | Status | Notes |
|--------|--------|-------|
| Victory 0.35 | ✅ Effective | Boost cards now critical |
| Certainty ×2 | ⚠️ Mixed | Created hoarding behavior |
| Block 2 turns | ❌ Untested | Still no defensive play |

## Key Findings

### Improvements
- Boost cards are now strategically necessary
- More variance in winning strategy (Momentum instead of Certainty)
- P1's "wasted Certainty" shows timing matters more

### Remaining Issues
- **Game still 3 turns** (target: 8-12)
- **Zero defensive cards used**
- **2-move path too short** - structural problem, not parameter problem

## Critical Insight
> Parameter tuning alone cannot solve this. The game needs **structural changes** (longer paths, intermediate objectives) rather than just probability adjustments.

## Recommendations

### Structural (Priority 1)
1. Add Checkpoint states: Start → [A/B/C] → [Checkpoint] → Victory
2. Or add "collect 3 keys" mechanic before Victory attempt

### Card Design (Priority 2)
1. Redesign Certainty as instant-use (play + move in one action)
2. Buff defensive cards significantly if no structural changes

### Engine (Priority 3)
1. Add roll visibility in action response
2. Add `npx playtest effects` command
3. Add `npx playtest simulate` for previewing actions

## Grades
- Balance Changes: **C+** (right direction, insufficient)
- Game Design: **D** (fundamental path issue)
- Engine: **A** (flawless operation)

## Next Steps
1. Implement Checkpoint state (3-move minimum path)
2. Redesign Certainty as instant-move card
3. Retest with 3-4 players
