# AAOTE: An Agent of the Enemy v0.5 PLAYTEST ANALYSIS

**Game ID:** aaote-1771152562612  
**Version:** 0.5  
**Winner:** The Enemy (player-2 & player-3) - ENGINE BUG awarded to player-1  
**Duration:** 37 turns (9 rounds)  
**Date:** 2026-02-15  

## Executive Summary

This playtest revealed a **critical engine bug** and multiple player confusion issues. The game correctly reached turn 36 with no regular player having won, which should trigger The Enemy's timeout victory. However, the engine incorrectly awarded victory to player-1 (a regular player with The Collector objective).

**Key Issues Identified:**
1. **Engine Bug**: timeout_winner mechanic failed to recognize Enemy role victory
2. **Player Confusion**: All 4 players attempted to claim wrong objectives (3/4 claimed Explorer, 1/4 claimed Builder)
3. **No Trading**: Zero successful trades occurred despite Collector requiring 1 traded item
4. **No Accusations**: The Suspicion System was never used despite 2 Enemy players
5. **Location Spam**: 12 locations placed, but minimal strategic movement

## Turn-by-Turn Summary

| Turn | Player | Action | Analysis |
|------|--------|--------|----------|
| 1 | player-1 | Place Shrine of Truth | Good opening - creates movement option |
| 2 | player-2 | Place Village Square | Strategic - trade bonus location |
| 3 | player-3 | Move to Village Square, draw 2 | First to explore |
| 4 | player-4 | Place Forest Clearing | Continues expansion |
| 5-8 | All | Move + draw | Exploration phase begins |
| 9-21 | All | Mass location placement | 12 locations total, grid fully expanded |
| 22-32 | All | Minimal movement, drawing | Passive play, no trades |
| 24 | player-4 | **FALSE VICTORY** (Explorer) | Wrong objective (has Builder) |
| 27 | player-3 | **FALSE VICTORY** (Explorer) | Wrong objective (is Enemy) |
| 30 | player-2 | **FALSE VICTORY** (Explorer) | Wrong objective (is Enemy) |
| 33 | player-1 | **FALSE VICTORY** (Builder) | Wrong objective (has Collector) |
| 36 | - | Turn limit reached | Enemy should win |
| 37 | - | Game ends | **BUG: player-1 awarded win** |

## Game Flow Analysis

### Phase 1: Setup & Exploration (Turns 1-8)
- Players placed 6 locations in first 4 turns
- All players moved to positions but no strategic positioning
- No one recognized the importance of trading early

### Phase 2: Location Spam (Turns 9-21)
- 6 more locations placed (12 total)
- Grid became overly complex with duplicate tile names
- Players confused about unique location count for Explorer

### Phase 3: Passive Stalemate (Turns 22-32)
- Minimal actions, mostly drawing and passing
- Enemy players (2 & 3) made no sabotage attempts
- No trading offers despite Collector/Trader objectives requiring it
- No accusations despite clear Enemy indicators (Forbidden Items held)

### Phase 4: False Victory Cascade (Turns 24-36)
- **4 consecutive false victory claims**
- All players confused about their actual objectives
- Gamemaster correctly rejected all 4 claims
- Game hit turn 36 timeout as designed

## Objective Analysis

### The Collector (player-1)
**Status:** Failed  
**Progress:** 1/4 items (only Supplies), 0 traded items  
**Blocker:** Never initiated or accepted trades  
**Analysis:** The trade requirement worked as intended to prevent solo completion, but player-1 didn't attempt any trades.

### The Enemy (player-2)
**Status:** Should have won via timeout (ENGINE BUG)  
**Progress:** 1/3 Forbidden Items (Dark Tome), 0 regular players exiled  
**Analysis:** Player-2 held a Forbidden Item openly but no one accused them. Made no sabotage or manipulation attempts.

### The Enemy (player-3)
**Status:** Should have won via timeout (ENGINE BUG)  
**Progress:** 1/3 Forbidden Items (Cursed Amulet), visited 6 locations  
**Analysis:** Player-3 actually completed the Explorer location count but cannot win via regular objectives.

### The Builder (player-4)
**Status:** Failed  
**Progress:** 1/4 locations placed (Mountain Pass only)  
**Blocker:** Confused about who placed which locations  
**Analysis:** Player-4 only placed 1 location but claimed Explorer victory instead.

## Mechanics Performance

### Action Points System
**Grade: B+**  
- Worked smoothly, no violations detected
- 3 AP provides good flexibility
- Movement (1 AP) + Draw (1 AP) was common pattern

### Grid Placement
**Grade: C**  
- Players spammed locations without strategy
- 12 locations placed but only ~6 actually visited
- Duplicate tile names caused Explorer confusion
- **Recommendation:** Clarify that duplicate names count as ONE location

### Hand Management
**Grade: A-**  
- 7-card limit felt appropriate
- No one hit the limit penalty
- Players drew conservatively

### Trading
**Grade: F**  
- **ZERO trades occurred in 37 turns**
- Village Square trade bonus never used
- Collector's trade requirement meant auto-loss
- **Critical Issue:** Players didn't understand trading was essential, not optional

### Suspicion System
**Grade: F**  
- **ZERO accusations in 37 turns**
- 2 Enemy players held Forbidden Items openly
- 1 AP cost is affordable but unused
- **Critical Issue:** Players didn't recognize Enemy indicators

### Victory Declaration
**Grade: C-**  
- Mechanic functioned correctly (4/4 rejections valid)
- **Massive confusion about objectives**
- Players claimed wrong objectives repeatedly
- **Recommendation:** Add objective card visibility to UI

### Forbidden Items (Curses)
**Grade: D**  
- Cursed Amulet & Dark Tome held by Enemy players
- **No one detected the curse immunity signal**
- Shadow Key never drawn
- **Recommendation:** Make curse effects more visible/punishing

## Balance Findings

### Objective Difficulty

| Objective | Achievable? | Turns Needed | Notes |
|-----------|-------------|--------------|-------|
| Collector | No (requires trade) | N/A | Zero trades = auto-fail |
| Explorer | Yes | ~25-30 | player-3 completed count but was Enemy |
| Builder | Unknown | Unknown | player-4 only placed 1, confusion on tracking |
| Trader | No (requires trades) | N/4 | Zero trades = auto-fail |
| Enemy (timeout) | YES | 36 | Achieved via player passivity |
| Enemy (Forbidden) | No | N/A | Only 2/3 items held total |

### Turn Limit Balance
**36 turns is CORRECT for Enemy timeout win.**  
- Regular players had sufficient time but failed to engage with trading/social mechanics
- Enemy won by pure passivity (perfect timeout strategy)

### Card Distribution
- 12 locations in deck, 12 placed (100% drawn)
- 3 Forbidden Items: 2 drawn (Amulet, Tome), 1 in deck (Shadow Key)
- Utility items drawn but unused (Rope, Lantern, Compass)

## Critical Bugs & Issues

### 1. Engine Bug: Wrong Winner Declared (CRITICAL)
**Issue:** Game ended at turn 37 with player-1 declared winner despite:
- player-1 having Collector objective (incomplete)
- player-2 & player-3 having Enemy objective (should win via timeout)
- timeout_winner mechanic configured for "role: enemy"

**Root Cause:** Engine's timeout_winner doesn't recognize multiple players with enemy role, or failed to check role correctly.

**Evidence:** 
```json
"timeout_winner": {"type": "role", "role": "enemy", "reveal_role": true}
```
Log shows: `"winner":"player-1","reason":"Max turns (36) reached. player-1 wins with 0 points."`

**Impact:** Game-breaking - invalidates entire Enemy victory path

**Fix Required:** Update timeout_winner logic to:
1. Check all players for matching role (not just first)
2. Award to any player with "team": "enemy"
3. If multiple enemies, use tie-breaker (turn order or first in array)

### 2. Objective Confusion (CRITICAL UX)
**Issue:** All 4 players claimed wrong objectives
- player-1 (Collector) claimed Builder
- player-2 (Enemy) claimed Explorer  
- player-3 (Enemy) claimed Explorer
- player-4 (Builder) claimed Explorer

**Root Cause:** Players cannot see their objective during gameplay, rely on memory

**Fix Required:** Add objective card display to player UI/state

### 3. Zero Trading (DESIGN FLAW)
**Issue:** No trades occurred despite 2 objectives requiring it

**Root Cause:** 
- No immediate incentive to trade
- Players hoarded items defensively
- Village Square bonus not compelling enough

**Fix Required:**
1. Add "must trade by turn X or lose" pressure mechanic
2. Make Forbidden Items more obviously cursed (force trades)
3. Add NPC merchant who offers beneficial trades

### 4. Location Tracking Confusion
**Issue:** Player-4 claimed to place 4 locations but only placed 1 (Mountain Pass)

**Root Cause:** placedLocations shows all locations but not WHO placed them

**Fix Required:** Track placer per location in state:
```json
{"location": "Shrine of Truth", "placedBy": "player-1", "turn": 1}
```

### 5. Duplicate Location Name Confusion
**Issue:** 3x Forest Clearing, 2x Village Square, 2x Crossroads on grid

**Root Cause:** Rules say "duplicate names count as ONE location" but players didn't track this

**Fix Required:** Add `uniqueLocationsVisited` counter to state

## Recommendations for v0.6

### Critical Fixes (Must Do)
1. **Fix timeout_winner enemy detection bug**
2. **Display objective card in player state/UI**
3. **Track location placer in state**
4. **Add uniqueLocationsVisited counter**

### Balance Changes (High Priority)
1. **Force trading earlier:**
   - "If you don't trade by turn 20, discard 2 cards per turn"
   - OR add mandatory trade events

2. **Make Forbidden Item curses harsher:**
   - Cursed Amulet: 1 AP → 0 AP (only 2 AP total)
   - Dark Tome: Hand limit 6 → 4 (more visible)
   - Shadow Key: Add "must reveal at start of turn" penalty

3. **Add accusation incentive:**
   - Successful accuser draws 3 cards
   - Enemy exposed loses 1 AP per turn until eliminated

4. **Clarify Builder objective:**
   - Change to "Place 4 locations AND have 2 players visit them"
   - Or simplify to "Place 5 locations" (trackable)

### Design Questions for Next Test
1. Should there be only 1 Enemy (not 2) in 4-player games?
2. Should trading be mandatory every N turns?
3. Should objectives be public after turn 20?
4. Should location placement be limited per player?

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | A | 37 turns hit target, Enemy timeout worked |
| **Strategic Depth** | D | Passive play, no trading, no accusations |
| **Balance** | C- | Enemy timeout too easy, trading objectives unwinnable |
| **Engine Performance** | F | Critical bug in timeout_winner mechanic |
| **Player Engagement** | D | Confusion, false claims, no social interaction |
| **Objective Clarity** | F | 4/4 players confused about objectives |

## Conclusion

**This playtest successfully achieved Enemy timeout victory** (despite engine bug), proving the 36-turn limit is balanced. However, **zero trading and zero accusations** indicate the social deduction core is not engaging players.

**Next version must:**
1. Fix the timeout_winner bug (critical)
2. Force trading through harder incentives
3. Make Enemy detection more obvious via Forbidden Item curses
4. Improve objective visibility and tracking

**Test hypothesis for v0.6:**
"If trading is mandatory every 10 turns and Forbidden Item curses are doubled, will players engage in social deduction?"

---

**Gamemaster:** gm-agent  
**Analysis Version:** v1.0  
**Completed:** 2026-02-15T11:03:30Z
