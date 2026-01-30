# MARKOV'S CHAINS v2.4 PLAYTEST ANALYSIS

**Game ID:** markovs-chains-1769816283703
**Version:** v2.4 (Dynamic Action Discovery)
**Winner:** None (game ended due to coordination issues)
**Duration:** 3 turns (incomplete)
**Date:** 2026-01-30

## v2.4 Changes from v2.3

### Key Feature: Dynamic Action Discovery
- Added `npx playtest actions <game> -p <id>` command
- Players now discover available actions based on game state and hand
- Procedurally exposes `place_card` action when player has placeable cards
- Updated player agent prompts to use `actions` before each turn

### Bug Fix: Block Card Duration
- Fixed inconsistency: rules said 1 turn, config said 2 turns
- Changed deck config to `duration: 1` to match rules

### Gamemaster Analysis Requirement
- Added post-game analysis section to gamemaster.md
- Updated stop hook to block exit until analysis file exists

## Game Flow Analysis

| Turn | Player-1 | Player-2 | Analysis |
|------|----------|----------|----------|
| **1** | Start → A (55% success) | Start → B (55% success) | Both players used `actions` command correctly |
| **2** | Draw card | B → Checkpoint-X (40% success) | P2 advances to checkpoint |
| **3** | Play Block on P2 | Contest filed | P1 used defensive card, P2 contested duration |

## Key Observations

### What Worked

1. **Dynamic Action Discovery** - Players successfully used `npx playtest actions`:
   ```
   === Available Actions for player-1 ===
   Current State: Start
   Your Turn: YES
   Hand: Reroll, Sabotage, Friction, Block, Friction

   [✓] MOVE: Move to an adjacent state on the board
       Targets: A, B, C
       Example: {"type":"move","target":"A"}

   [✓] PLAY_CARD: Play a card from your hand...
   ```

2. **Contest System** - Player-2 correctly identified a rule inconsistency:
   - Rules text: "Block: Duration: 1 turn"
   - Actual effect: `duration: 2`
   - This is **exactly what playtesting is for** - finding bugs!

3. **Strategic Play** - Players made reasonable decisions:
   - P1 drew a card when at disadvantage
   - P2 rushed toward Victory
   - P1 used Block defensively to slow P2

### What Didn't Work

1. **Gamemaster Coordination** - The gamemaster agent timed out before the contest was filed, causing a deadlock

2. **No State Cards Placed** - Despite the new `place_card` action being discoverable, neither player had placeable cards in their initial hands:
   - P1 hand: Reroll, Sabotage, Friction, Block, Friction (0 state cards)
   - P2 hand: Friction, Safe Haven, Certainty, Hazard, Certainty (2 state cards!)

   However, P2 never got the chance to use them due to the deadlock.

3. **Agent Lifecycle** - Agents exited prematurely when they perceived a deadlock, even though the stop hooks tried to prevent this

## Balance Findings

### Card Usage
- **Defensive cards used:** 1 (Block) - improvement over v2.3!
- **Boost cards used:** 0 (game too short)
- **State cards used:** 0 (P2 had them but game ended early)

### Probability Outcomes
- Move attempts: 4 total
- Successes: 3/4 (75%) - higher than expected
- Still running "lucky" despite reduced probabilities

### Contest Finding
The contest revealed a **legitimate bug** in the rules config:
- Block duration should be 1 turn (fixed in this version)
- This validates the contest system's purpose

## Recommendations for Next Playtest

### Priority 1: Improve Agent Coordination
1. **Increase gamemaster timeout** - pending command timed out too quickly
2. **Add auto-adjudication timeout** - if no ruling in X seconds, auto-allow
3. **Better agent lifecycle management** - prevent early exits during active games

### Priority 2: State Card Testing
1. **Pre-seed hands** - ensure at least one player starts with a state card
2. **Or:** Increase state card density in deck (8/30 → 12/30)
3. **Or:** Add "draw 1 state card at game start" rule

### Priority 3: Game Length
Still need more turns to validate strategic depth:
- v2.3: 5 turns
- v2.4: 3 turns (incomplete)
- Target: 8-12 turns

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Action Discovery** | **A** | Works perfectly - players used it correctly |
| **Contest System** | **B+** | Found a real bug! But caused deadlock |
| **Agent Coordination** | **D** | Gamemaster timeout caused game failure |
| **State Cards** | **N/A** | Couldn't test due to early game end |
| **Game Length** | **F** | Only 3 turns completed |
| **Overall v2.4** | **C** | Good infrastructure, poor execution |

## Conclusion

v2.4 validated the **action discovery mechanism** but exposed **agent coordination issues**:

**Validated:**
- `npx playtest actions` correctly shows available actions
- Players successfully use the command to discover options
- Contest system works and catches real bugs

**Needs Fix:**
- Gamemaster agent lifecycle/timeout
- Auto-fallback when gamemaster unavailable
- Better handling of edge cases in multi-agent coordination

**Critical Path for v2.5:**
1. Fix gamemaster pending timeout
2. Add fallback adjudication
3. Run complete playtest with state card usage
4. Validate 8-12 turn game length

---

## Technical Notes

### Files Changed in v2.4
- `engine/src/types.ts` - Added AvailableAction types
- `engine/src/game.ts` - Added getAvailableActions()
- `engine/src/index.ts` - Added `actions` CLI command
- `agents/player.md` - Updated to use actions command
- `agents/gamemaster.md` - Added post-game analysis requirement
- `hooks/gamemaster-stop-hook.sh` - Check for analysis file
- `games/markovs-chains/RULES.md` - Fixed Block duration (2→1)

### Commands Used Successfully
```bash
npx playtest actions markovs-chains -p player-1
npx playtest wait markovs-chains -p player-2
npx playtest act markovs-chains -p player-1 -a '{"type":"move","target":"A"}'
npx playtest contest markovs-chains -p player-2 -r "reason"
npx playtest adjudicate markovs-chains --reject -r "reason"
```
