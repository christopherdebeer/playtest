# Treasure Hunters v1.0 Playtest Analysis

**Game ID:** treasure-hunters-1770216145396
**Version:** 1.0
**Winner:** player-1 (60 points)
**Final Scores:** player-1: 60 | player-2: 30
**Duration:** 10 rounds (19 turns)
**Date:** 2026-02-04

## Executive Summary

Player-1 achieved a decisive victory, collecting 4 sets for 60 points while player-2 managed only 2 sets for 30 points. The game ended in round 10 when player-1 collected their fourth Type Set, triggering the win condition (score >= 50). Both players focused heavily on card draw in early game, with player-1 executing a more efficient set collection strategy.

## Game Flow Analysis

| Turn | Player-1 Action | Player-2 Action | Key Events |
|------|----------------|-----------------|------------|
| 1 | Draw x2, Pass | - | Early hand building |
| 2 | - | Draw x2, Pass | Both players building hands |
| 3 | Draw x2, Pass | - | Continued accumulation |
| 4 | - | Draw x3 | player-2 draws aggressively |
| 5 | **Collect Type Set** (Sapphire/Ruby/Emerald Crowns) | - | **First set: player-1 scores 15 points** |
| 6 | - | Failed collect, Pass | player-2's first attempt fails |
| 7 | **Collect Color Set** (Ruby Ring/Crown/Goblet) | - | **player-1 scores 30 total** |
| 8 | - | **Collect Type Set** (Emerald/Sapphire/Ruby Rings) | **player-2 scores 15 points** |
| 9 | Draw x2, Pass | Draw x3 | Race for final sets begins |
| 10 | - | Draw x3 | player-2 still accumulating |
| 11 | Draw x3 | - | player-1 searches for third set |
| 12 | - | Draw x2, Pass | player-2 struggles to complete sets |
| 13 | Draw x3 | - | Massive card advantage for player-1 |
| 14 | - | Failed collect, Draw x1 | player-2's second failure wastes AP |
| 15 | **Collect Color Set** (Emerald Ring/Goblet/Crown) | - | **player-1 scores 45 total** |
| 16 | - | Draw x3 | player-2 behind in scoring |
| 17 | Draw x3 | - | player-1 searching for victory set |
| 18 | - | **Collect Type Set** (Emerald/Sapphire/Diamond Rings) | **player-2 scores 30 total** |
| 19 | **Collect Type Set** (Sapphire/Ruby/Emerald Rings) | - | **GAME OVER: player-1 wins with 60 points** |

## Key Observations

### What Worked Well

1. **Set Collection Mechanics** - The 15-point reward for sets created clear goals and satisfying moments when achieved
2. **Action Point Economy** - 3 AP per turn with varied costs (1 AP draw, 2 AP collect) created meaningful decisions
3. **Dual Set Types** - Having both Color Sets and Type Sets gave players strategic flexibility
4. **Win Condition Clarity** - The 50-point threshold was clear and achievable within reasonable timeframe
5. **Game Length** - 10 rounds felt appropriate for a playtest; not too long, not rushed

### What Didn't Work

1. **Failed Set Collection Attempts** - player-2 wasted action points on 2 failed set collection attempts (turns 6 and 14). This suggests:
   - Players may not have clear visibility into valid sets
   - The engine should provide better validation feedback before committing 2 AP
   - Consider adding a "preview set" action (0 AP) to validate before committing

2. **Draw Imbalance** - Both players drew heavily in early game, but the optimal strategy appears to be "draw aggressively until you have multiple sets, then collect rapidly." This reduces strategic diversity.

3. **No Action Card Usage** - Despite having Treasure Maps, Merchants, Gem Finders, and Thieves in hand, neither player used ANY action cards during the entire game. This indicates:
   - Action cards may be undervalued
   - The 1 AP cost to play them may be too high compared to drawing
   - Card effects may not be impactful enough

4. **Resource Caps Hit Early** - Both players reached 20 gold cap quickly due to +2 gold/turn income with no spending. Gold appeared irrelevant in this game.

5. **Gems Never Used** - Both players finished with 0 gems, suggesting gem mechanics were not engaged

### Balance Findings

#### Scoring Rate
- Winner averaged 6 points/round (excluding setup)
- Win achieved in round 10 of max 30 rounds (33% of max)
- Target appears achievable but not too fast

#### Set Collection Efficiency
- player-1: 4 sets in 9 turns of play (collected on turns 5, 7, 15, 19)
- player-2: 2 sets in 9 turns of play (collected on turns 8, 18)
- Success ratio: player-1 had 4/4 successes, player-2 had 2/4 attempts (2 failures)

#### Card Draw Patterns
- Total draws by player-1: ~18 cards (2+2+2+3+3+3+3 draws)
- Total draws by player-2: ~17 cards (2+3+3+2+1+3+3 draws)
- Similar draw volumes but player-1 converted better to sets

#### Action Card Usage
- Treasure Maps: 0 played (despite 3 in deck)
- Merchants: 0 played (despite 2 in deck)
- Gem Finders: 0 played (despite 2 in deck)
- Thieves: 0 played (despite 2 in deck)
- **CRITICAL ISSUE: 0% action card engagement**

### Strategic Depth

**player-1 Strategy (Rule-Lawyer Persona)**
- Early draw accumulation (turns 1-4)
- Aggressive set collection when opportunities emerged
- Efficient AP usage with minimal wasted actions
- Victory through faster set completion

**player-2 Strategy (Strategic Persona)**
- Similar early draw focus
- Multiple failed set collection attempts wasted 4 AP total
- More cautious, less decisive
- Fell behind due to inefficiency

**Strategic Options Observed:**
- Heavy draw → Collect when ready (dominant strategy)
- Action cards ignored entirely
- No interference play (Thief never used)
- No resource management (gold/gems irrelevant)

**Missing Strategic Elements:**
- No reason to play action cards
- No resource scarcity decisions
- No meaningful interference between players
- Limited variety in valid approaches

## Recommendations for v1.1

### High Priority

1. **Make Action Cards Worth Playing**
   - Reduce Treasure Map cost to 0 AP (currently 1 AP for +2 cards is worse than just drawing)
   - Increase Merchant gold gain to 5 (currently 3 gold is useless when capped at 20)
   - Make Thief more impactful: discard 2 cards or steal a card
   - Add "free action" tags to some action cards

2. **Add Set Validation Preview**
   - Implement a 0 AP "check_set" action that validates without committing
   - Provide clear error messages when sets fail
   - Show valid set opportunities in player's hand

3. **Fix Resource Economy**
   - Lower starting gold to 3 (currently 5)
   - Reduce gold income to 1/turn (currently 2)
   - Add meaningful gold spending: "Buy extra AP" (3 gold = 1 AP)
   - Add gem economy: "Spend 2 gems to draw 3 cards" or similar

4. **Increase Strategic Variety**
   - Add "Spend" action examples in rules
   - Make interference cards more attractive
   - Consider asymmetric player powers or starting hands

### Medium Priority

5. **Balance Set Difficulty**
   - Consider making some sets worth more points but harder to achieve
   - Add "wild" treasures that can substitute in sets
   - Vary set sizes: 3-card sets (15 pts) vs 4-card sets (25 pts)

6. **Improve Pacing**
   - First set collected on turn 5; consider ways to enable turn 3-4 sets
   - Add "starting combo" cards that give early set options

### Low Priority

7. **Add Player Interaction**
   - Currently minimal interaction; consider "steal card" or "block" actions
   - Add shared objectives or competitive incentives

8. **Polish Rules**
   - Clarify "unique" requirement in set collection
   - Add examples of valid/invalid sets
   - Explain what happens to collected cards

## Grades

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Game Length** | A- | 10 rounds is ideal; ended before turn 30 max |
| **Strategic Depth** | C | Dominant strategy emerged (draw → collect); action cards unused |
| **Balance** | B | Winner won 60-30 but both players had similar opportunities |
| **Mechanical Function** | B+ | Core loop worked well; some validation issues |
| **Player Engagement** | B- | Set collection engaging but too one-dimensional |
| **Resource Economy** | D | Gold/gems irrelevant; no scarcity or meaningful choices |
| **Overall** | B- | Solid foundation but needs action card rebalancing and resource fixes |

## Conclusion

Treasure Hunters v1.0 demonstrates a functional core set-collection mechanic with clear win conditions and appropriate game length. However, the playtesting revealed critical issues with action card usage (0% engagement) and resource economy (gold/gems unused). The dominant strategy of "draw aggressively until sets appear, then collect" limits strategic variety.

**Must-Fix for v1.1:**
- Rebalance action cards to make them worth playing
- Fix resource economy to create meaningful spending decisions
- Add set validation to prevent wasted AP on failed collections

With these changes, Treasure Hunters could achieve its intended strategic depth and replayability.

---

*Analysis completed by gamemaster gm-agent*
*Playtest Engine v1.0*
