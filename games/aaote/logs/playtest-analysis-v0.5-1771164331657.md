# AAOTE: An Agent of the Enemy - v0.5 Playtest Analysis

**Game ID:** aaote-1771164331657
**Version:** 0.5
**Winner:** player-1 (The Collector)
**Duration:** 6 rounds, 23 turns
**Date:** 2026-02-15
**End Reason:** Victory declaration - Collector objective completed

## Executive Summary

Player-1 (The Collector) achieved victory in round 6 by collecting 4 different items with one obtained via trade. The game demonstrated successful rebalancing from v0.4, with the Collector's trade requirement forcing meaningful player interaction. The Enemy (player-3) held 1/3 Forbidden Items but did not have enough time to collect all three before player-1 won.

## Player Roles & Objectives

| Player | Role | Objective | Status |
|--------|------|-----------|--------|
| player-1 | The Collector | Hold 4 different items, 1 from trade | **WON** |
| player-2 | The Builder | Place 4 locations | 1/4 complete |
| player-3 | The Enemy | Collect 3 Forbidden Items OR timeout | 1/3 Forbidden Items |
| player-4 | The Trader | 3 trades with 2+ partners | 1/3 trades |

## Game Flow Analysis

### Round 1-2: Setup & Exploration (Turns 1-8)
- **Turn 1**: Player-1 played Town Crier (public reveal event) - attempted Forbidden Item detection
- **Turns 1-4**: All players placed locations to expand the grid (Forest Clearing x3, Crossroads, Village Square, Watchtower)
- **Turn 3**: Player-3 (Enemy) drew to hand limit, then placed location
- **Turn 5**: Player-1 moved to Village Square, drew 2 cards
- **Turn 7**: Player-3 played Interrogate to peek at objectives (information gathering)
- **Turn 8**: Player-4 moved to Village Square and offered trade to player-1

**Key Observation**: Village Square became the central hub early, incentivizing trade with 0 AP cost and card draw bonus.

### Round 3-4: Critical Trade & Item Accumulation (Turns 9-16)
- **Turn 9**: **CRITICAL TRADE** - Player-1 traded Compass to player-4 for Supplies, completing the "1 from trade" requirement
- **Turn 11**: Player-3 played Roadblock (sabotage attempt) and moved to Village Square
- **Turn 12**: Player-4 placed Watchtower
- **Turn 15**: Player-3 played Theft (steal attempt) - mechanic skipped due to targeting error
- **Turn 16**: Player-4 scouted Watchtower (location reveal ability)

**Key Observation**: The trade in turn 9 was essential for player-1's victory. Without the trade requirement, player-1 could have won by turn 13 (when they drew their 4th item).

### Round 5-6: Final Sprint to Victory (Turns 17-23)
- **Turn 17**: Player-1 placed Ancient Ruins
- **Turn 18**: Player-2 moved to Village Square
- **Turn 19**: Player-3 placed Merchant Camp
- **Turn 21**: Player-1 drew final card, then **declared victory**
- **Turn 23**: Gamemaster verified and accepted victory

**Key Observation**: Player-1 held Cursed Amulet and Dark Tome (2/3 Forbidden Items) without penalty, suggesting they ARE The Enemy. However, their role was actually The Collector (regular). **This reveals a balance issue**: regular players can hold Forbidden Items without immediate detection if curses aren't enforced by the engine.

## Forbidden Items Distribution

| Item | Holder | Expected Penalty | Observed Effect |
|------|--------|------------------|-----------------|
| Cursed Amulet | player-1 | -1 AP per turn | NOT ENFORCED |
| Dark Tome | player-1 | Hand limit -1 (max 6) | NOT ENFORCED (player-1 held 6 cards) |
| Shadow Key | player-3 (Enemy) | None (immune) | None (correct) |

**CRITICAL FINDING**: The engine does NOT enforce Forbidden Item curses automatically. Player-1 held 2 Forbidden Items with no penalties applied, removing the curse detection mechanic entirely.

## Mechanics Analysis

### Trade System (WORKING WELL)
- 1 trade completed (player-1 ↔ player-4)
- Trade occurred at Village Square (0 AP cost + bonus cards)
- **The Collector's trade requirement successfully forced interaction**
- Trade was essential for victory (prevented turn-1 win scenarios from v0.3)

### Action Point Economy
- 3 AP per turn was sufficient
- Most players used 1-2 AP for drawing cards
- Player-1 managed AP efficiently: 1 draw + 1 trade respond = 2 AP

### Victory Declaration Mechanic
- Player-1 declared victory on turn 21
- Gamemaster verified 4 items (Cursed Amulet, Lantern, Supplies, Dark Tome)
- Trade history confirmed Supplies came from player-4
- **System worked perfectly** - prevented premature claims

### Suspicion System (UNUSED)
- **0 accusations** made during 23 turns
- 1 AP cost was low enough to be accessible
- Players did not use social deduction mechanics
- **Possible reasons**: Short game (23 turns), no obvious Enemy tells, focus on objective completion

### Location Placement
- 8 locations placed total (Forest Clearing x3, Crossroads, Village Square, Watchtower, Ancient Ruins, Merchant Camp)
- Village Square became central hub
- Players expanded grid but did not utilize unique location effects much
- **Builder objective (4 placements) was achievable** but player-2 only placed 1

## Balance Findings

### What Worked Well ✓
1. **Collector trade requirement** - Prevented turn-1 wins, forced interaction
2. **36-turn limit** - Provided sufficient time for objectives (game ended turn 23)
3. **Victory declaration system** - Prevented false claims, required verification
4. **Village Square trade bonus** - Incentivized gathering at central location
5. **Hand limit of 7** - Allowed enough room for item collection

### What Didn't Work ✗
1. **Forbidden Item curses NOT ENFORCED** - Engine bug removes entire detection mechanic
2. **Cursed Amulet** should have reduced player-1's AP to 2/turn → Didn't happen
3. **Dark Tome** should have reduced hand limit to 6 → Player-1 held 6 cards (should have been limited to 5)
4. **Suspicion system unused** - No accusations despite Enemy presence
5. **Event card targeting issues** - Theft and Roadblock required manual GM intervention

### Timing Analysis
- Game ended at turn 23 (64% of 36-turn max)
- This is within the **target 60-80% completion window** from design goals
- Enemy had no realistic path to collect 3 Forbidden Items in time
- **Timeout victory would have required 13 more turns** - achievable but difficult

## Strategic Patterns

### Player-1 (Collector - Winner)
- **Early detection attempt**: Used Town Crier to reveal items (looking for Forbidden Items)
- **Efficient AP use**: Minimal movement, focused on drawing and trading
- **Risk-taking**: Held 2 Forbidden Items without fear (curses not enforced)
- **Trade timing**: Completed trade early (turn 9) to unlock victory path

### Player-2 (Builder)
- **Passive play**: Only placed 1 location despite needing 4
- **Card draw focus**: Drew to hand limit frequently
- **Missed opportunity**: Could have pursued objective more aggressively

### Player-3 (Enemy)
- **Information gathering**: Used Interrogate to peek objectives
- **Sabotage attempts**: Played Roadblock and Theft (both ineffective due to mechanic issues)
- **Forbidden Items**: Held Shadow Key (1/3) but did not aggressively pursue others
- **Missed strategy**: Could have accused innocents to waste turns

### Player-4 (Trader)
- **Trade initiation**: Offered trade to player-1 (helped opponent win)
- **Exploration**: Scouted Watchtower for information
- **1/3 trades**: On pace for objective but ran out of time

## Engine Issues Discovered

1. **Forbidden Item curses not auto-applied** - Major mechanical failure
2. **Event targeting requires manual GM intervention** - Theft, Roadblock, Interrogate all "skipped"
3. **Location effects not automatically triggered** - Ancient Ruins should draw card on enter
4. **Forbidden Items dealt in starting hands** - Rules state "bottom half of deck only"
5. **Player abilities not tracked** - No scholar, merchant, scout, guardian, or mystic abilities applied

## Recommendations for v0.6

### HIGH PRIORITY
1. **FIX: Implement Forbidden Item curse enforcement**
   - Cursed Amulet → Reduce AP to 2
   - Dark Tome → Reduce hand limit to 6
   - Shadow Key → Block Hidden Path/Hidden Cave usage
2. **FIX: Event card targeting system**
   - Add structured prompts for Theft, Roadblock, Interrogate, etc.
3. **FIX: Forbidden Item deck placement**
   - Ensure these cards are shuffled into bottom half only

### MEDIUM PRIORITY
4. **Increase Enemy urgency** - Shorten max turns to 30-32 to pressure Enemy
5. **Add Forbidden Item scarcity** - Only spawn 2/3 in bottom deck (force searching)
6. **Builder objective tuning** - 4 locations may be achievable but wasn't pursued (need more data)

### LOW PRIORITY
7. **Suspicion system incentives** - Consider adding "Accuse to peek hand" or other rewards
8. **Location effect automation** - Ancient Ruins auto-draw, Watchtower auto-reveal

## Playtest Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Game completes before turn 36 | Yes | Turn 23 (64%) | ✓ PASS |
| Collector forces trade | Yes | 1 trade completed | ✓ PASS |
| Forbidden Items create signals | Yes | Curses not enforced | ✗ FAIL |
| Suspicion system used | 1+ accusation | 0 accusations | ✗ FAIL |
| Builder achievable | 4 locations | 1/4 (insufficient data) | ? UNCLEAR |

## Overall Grade: C+

| Category | Grade | Rationale |
|----------|-------|-----------|
| Game Length | A | Ended at 64% of max turns - perfect pacing |
| Collector Balance | A | Trade requirement worked perfectly |
| Strategic Depth | B- | Limited use of special abilities and locations |
| Suspicion Mechanic | F | Not used at all despite Enemy presence |
| Engine Stability | D | Multiple critical bugs (curses, targeting, deck) |
| Social Deduction | F | No accusations, no Enemy detection attempts |

## Conclusion

v0.5 successfully fixed the Collector objective through the trade requirement, preventing instant wins while forcing player interaction. However, **critical engine bugs** removed the Forbidden Item curse mechanic entirely, breaking the Enemy detection system. The game was stable and completable, but lacked the tension of social deduction due to unused Suspicion mechanics.

**Next Steps**:
1. Fix Forbidden Item curse enforcement (blocking issue)
2. Test with 5 players to see if Suspicion system scales
3. Gather more data on Builder objective completion rates
4. Consider shortening max turns to increase Enemy pressure

**Playtester Verdict**: Mechanically sound with good pacing, but needs engine fixes to fully realize the social deduction vision.
