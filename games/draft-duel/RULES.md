---
name: "Draft Duel"
version: "1.0"
players: 2-4
win_condition: "Most points after 3 drafting rounds"
max_rounds: 15

mechanics:
  # Closed Drafting: 7 Wonders style simultaneous drafting
  closed_drafting:
    pool_size: 7
    pass_direction: left
    alternate_direction: true
    final_pool_keep: 1

  # Catch The Leader: Trailing players get catch-up bonuses
  catch_the_leader:
    leader_metric: score
    lead_threshold: 5
    leader_penalties:
      income_reduction: 0.25
    trailing_bonuses:
      gap_threshold: 5
      extra_draw: 1
      score_bonus: 1

  # Once Per Game Abilities: Strategic one-time powers
  once_per_game_abilities:
    assignment: all
    abilities:
      - id: "double_score"
        name: "Double Down"
        description: "Gain 5 bonus points immediately"
        effect:
          type: score
          amount: 5
      - id: "card_surge"
        name: "Card Surge"
        description: "Draw 2 extra cards from the deck"
        effect:
          type: draw
          count: 2
      - id: "comeback_boost"
        name: "Comeback"
        description: "Gain 3 bonus points (only usable when losing)"
        effect:
          type: score
          amount: 3
        condition:
          type: losing
      - id: "emergency_draw"
        name: "Deep Pockets"
        description: "Draw 3 extra cards from the deck into your collection"
        effect:
          type: draw
          count: 3

  # Set Collection for scoring
  set_collection:
    sets:
      - { name: "Element Set", match_field: "element", size: 3, unique: false }
      - { name: "Type Set", match_field: "type", size: 3, unique: true }
    scoring: per_set
    points_per_set: 5

  hand_management: true

  cards:
    starting_hand: 0
    deck:
      # Element cards - core of the game
      - { name: "Fire", count: 8, type: "element", element: "fire", points: 1 }
      - { name: "Water", count: 8, type: "element", element: "water", points: 1 }
      - { name: "Earth", count: 8, type: "element", element: "earth", points: 1 }
      - { name: "Air", count: 8, type: "element", element: "air", points: 1 }

      # Power cards - harder to collect but valuable
      - { name: "Power", count: 6, type: "special", element: "power", points: 2 }

      # Wild cards - can substitute in sets
      - { name: "Wild", count: 4, type: "wild", element: "wild", points: 0 }

      # Bonus cards - valuable for type sets
      - { name: "Swift", count: 4, type: "bonus", element: "bonus", points: 1 }
      - { name: "Insight", count: 4, type: "bonus", element: "bonus", points: 1 }

      # Action cards - for variety
      - { name: "Trade", count: 3, type: "action", element: "action", points: 0 }
      - { name: "Block", count: 3, type: "action", element: "action", points: 0 }

  win_highest_lowest_scoring: { mode: "highest" }
---

# Draft Duel

A fast-paced competitive drafting game where players simultaneously select cards from rotating hands, build valuable sets, and use special powers to gain the edge. Trailing players receive catch-up bonuses to keep every game close and exciting!

## Overview

Draft Duel combines three key mechanics:
- **Closed Drafting**: All players simultaneously pick cards from their draft pools, then pass the remaining cards to the next player
- **Catch-The-Leader**: Players behind in score receive bonus cards and points to stay competitive
- **Once-Per-Game Abilities**: Each player has four powerful abilities they can use once per game at critical moments

## Components

- **48 Draft Cards**:
  - 32 Element Cards (8 each of Fire, Water, Earth, Air)
  - 6 Power Cards
  - 4 Wild Cards
  - 8 Bonus Cards (4 Swift, 4 Insight)
  - 6 Action Cards (3 Trade, 3 Block)

- **4 Ability Cards per Player** (each usable once per game):
  - Double Down, Card Surge, Comeback, Deep Pockets

## Setup

1. Shuffle all 48 draft cards together
2. Each player starts with 4 once-per-game abilities (all available)
3. Determine player count and seating order
4. The game consists of 3 drafting rounds

### Round Setup
At the start of each round:
1. Deal 7 cards face-down to each player as their draft pool
2. Determine pass direction:
   - Round 1: Pass LEFT
   - Round 2: Pass RIGHT
   - Round 3: Pass LEFT

## Gameplay

### Drafting Phase (Simultaneous)

All players act simultaneously during drafting:

1. **PICK**: Look at your draft pool and secretly select ONE card
2. **REVEAL**: Once all players have selected, reveal choices simultaneously
3. **COLLECT**: Add your selected card to your hand (kept hidden from opponents)
4. **PASS**: Pass your remaining draft pool cards to the next player (based on direction)
5. **RECEIVE**: Take the draft pool passed to you
6. **REPEAT**: Continue until draft pools are exhausted

**Draft Pool Ending**: When pools have only 1 card remaining, keep that final card (don't pass).

### Using Once-Per-Game Abilities

At any time during the game, you may activate ONE unused ability by taking the `use_ability` action:

| Ability | Effect | Condition |
|---------|--------|-----------|
| **Double Down** | Gain 5 bonus points immediately | None |
| **Card Surge** | Draw 2 extra cards from the deck | None |
| **Comeback** | Gain 3 bonus points | Must be losing |
| **Deep Pockets** | Draw 3 cards from the deck | None |

Each ability can only be used once per game!

### Collecting Sets

You can claim sets from your hand using the `collect_set` action:

- **Element Set**: 3 cards with the same element (e.g., 3 Fire cards) = 5 points
- **Type Set**: 3 cards with different types (e.g., element + special + bonus) = 5 points

Sets are scored immediately when claimed.

### Catch-Up Mechanic

At the start of each turn, the game checks scores:

**If a player is 5+ points behind the leader**:
- Draw 1 extra card from the deck
- Gain 1 bonus point immediately

**If a player is in the lead by 5+ points**:
- Any resource/card gains are reduced by 25%

This keeps games competitive and gives trailing players hope!

## Scoring

Score points throughout the game:

### Base Card Points (when collected)
- Each Element card: 1 point
- Each Power card: 2 points
- Each Wild card: 0 points
- Each Bonus card: 1 point
- Each Action card: 0 points

### Set Bonuses
| Set | Requirements | Bonus Points |
|-----|--------------|--------------|
| **Element Set** | 3 cards with same element | 5 points |
| **Type Set** | 3 cards with different types | 5 points |

Sets can be collected multiple times!

### Catch-Up Bonuses
- Trailing players (5+ behind) gain 1 point per turn

## Winning

After 3 complete drafting rounds (when deck is exhausted), the player with the **highest total score wins**!

**Tiebreaker**: Most complete sets, then most cards in hand.

## Strategy

### Drafting Strategy
- **Read the table**: Pay attention to what others are collecting
- **Hate-draft**: Sometimes deny an opponent a key card
- **Flexibility**: Don't commit too early to a single strategy
- **Power cards**: Higher point value, aim to collect these

### Ability Timing
- **Double Down**: Use when you need a quick point boost
- **Card Surge**: Use early to have more options
- **Comeback**: Only works when losing - save it for emergencies
- **Deep Pockets**: Good mid-game to boost hand size

### Catch-Up Awareness
- If you're ahead: Don't over-extend; opponents get bonuses
- If you're behind: Play aggressive; you're getting free points!

## Game Length

- **Players**: 2-4 (best with 3-4)
- **Duration**: 15-25 minutes
- **Complexity**: Light-Medium

## Variant Rules

### Quick Game
Play only 2 drafting rounds instead of 3.

### Expert Mode
- Remove catch-up bonuses
- Each player only gets 2 abilities (choose at game start)

### Team Draft (4 players)
- Players across from each other are teammates
- Combined team score wins
- Can strategically pass cards to partner

## Gamemaster Notes

### Turn Structure
The game uses **simultaneous selection** - all players pick at the same time:
1. GM announces "Pick phase - select one card from your draft pool"
2. Players use `draft_select` action to choose their card
3. Once all players have selected, cards are revealed
4. Selected cards are added to hands
5. Remaining pools are passed to next player
6. Repeat until pools empty

### Actions Available
- `draft_select card:"CardName"` - Select a card from draft pool
- `collect_set cards:["Card1","Card2","Card3"] setType:"Element Set"` - Claim a set
- `use_ability ability:"double_score"` - Use a once-per-game ability

### Catch-Up Tracking
- Track scores after each action
- The `catch_the_leader` mechanic automatically triggers at turn start
- Announce when catch-up bonuses are applied

### Ability Validation
- **Comeback** requires player to be behind current leader
- Track which abilities each player has used via `usedAbilities` state

### Set Counting
- Element Set requires 3 cards with matching `element` field
- Type Set requires 3 cards with different `type` fields
- Same cards cannot be part of multiple sets

## Design Notes

Draft Duel demonstrates three interlocking engine mechanics:

1. **closed_drafting** - Simultaneous card selection with hand passing (7 Wonders style)
   - `pool_size: 7` - Each player gets 7 cards to draft from
   - `pass_direction: left` - Cards pass to the left
   - `alternate_direction: true` - Direction alternates each round

2. **catch_the_leader** - Balancing mechanic for competitive games
   - `leader_metric: score` - Leader determined by score
   - `lead_threshold: 5` - Penalties kick in at 5+ point lead
   - `trailing_bonuses` - Behind players get extra draws and points

3. **once_per_game_abilities** - Special one-time powers
   - `assignment: all` - Every player gets all abilities
   - Four abilities with different effects and conditions

The combination creates a game where skill matters but comebacks are always possible through the catch-up mechanic and strategic ability use!
