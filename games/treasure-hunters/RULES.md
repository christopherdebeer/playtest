---
name: "Treasure Hunters"
version: "1.0"
players: 2-4
starting_cards: 5
win_condition: "score >= 50"
max_rounds: 30

# Reference mechanics from library
mechanics:
  - action-points
  - set-collection
  - income
  - hand-management

# Engine mechanics configuration
engine_mechanics:
  # Action points system - 3 actions per turn
  action_points:
    points_per_turn: 3
    action_costs:
      draw: 1
      play_card: 1
      collect_set: 2
      spend: 1
      pass: 0
    rollover: false

  # Resource tracking
  resources:
    - { name: "gold", starting_amount: 5, max: 20 }
    - { name: "gems", starting_amount: 0, max: 10 }

  # Income generation
  income:
    per_turn: { "gold": 2 }

  # Set collection scoring
  set_collection:
    sets:
      - { name: "Color Set", match_field: "effect.color", size: 3, unique: true }
      - { name: "Type Set", match_field: "type", size: 3, unique: true }
    scoring: per_set
    points_per_set: 15

# Treasure deck
deck:
  # Ruby treasures (Red)
  - { name: "Ruby Ring", count: 3, type: "jewelry", effect: { type: "treasure", color: "Red", value: 3 } }
  - { name: "Ruby Crown", count: 2, type: "royalty", effect: { type: "treasure", color: "Red", value: 5 } }
  - { name: "Ruby Goblet", count: 2, type: "artifact", effect: { type: "treasure", color: "Red", value: 4 } }

  # Sapphire treasures (Blue)
  - { name: "Sapphire Ring", count: 3, type: "jewelry", effect: { type: "treasure", color: "Blue", value: 3 } }
  - { name: "Sapphire Crown", count: 2, type: "royalty", effect: { type: "treasure", color: "Blue", value: 5 } }
  - { name: "Sapphire Goblet", count: 2, type: "artifact", effect: { type: "treasure", color: "Blue", value: 4 } }

  # Emerald treasures (Green)
  - { name: "Emerald Ring", count: 3, type: "jewelry", effect: { type: "treasure", color: "Green", value: 3 } }
  - { name: "Emerald Crown", count: 2, type: "royalty", effect: { type: "treasure", color: "Green", value: 5 } }
  - { name: "Emerald Goblet", count: 2, type: "artifact", effect: { type: "treasure", color: "Green", value: 4 } }

  # Diamond treasures (White)
  - { name: "Diamond Ring", count: 3, type: "jewelry", effect: { type: "treasure", color: "White", value: 3 } }
  - { name: "Diamond Crown", count: 2, type: "royalty", effect: { type: "treasure", color: "White", value: 5 } }
  - { name: "Diamond Goblet", count: 2, type: "artifact", effect: { type: "treasure", color: "White", value: 4 } }

  # Special action cards
  - { name: "Treasure Map", count: 3, type: "action", effect: { type: "draw", value: 2 } }
  - { name: "Merchant", count: 2, type: "action", effect: { type: "gold_gain", value: 3 } }
  - { name: "Gem Finder", count: 2, type: "action", effect: { type: "gem_gain", value: 2 } }
  - { name: "Thief", count: 2, type: "interference", effect: { type: "force_discard", value: 1, duration: 1 } }
---

# Treasure Hunters

A set collection game where treasure hunters compete to assemble the most valuable collections.

## Objective

Be the first player to reach **50 points** by collecting sets of matching treasures.

## Setup

1. Each player starts with:
   - 5 treasure cards in hand
   - 5 gold coins
   - 0 gems

2. Shuffle the treasure deck and place it face down

## Resources

### Gold
- Used for purchasing and special actions
- Gain 2 gold at the start of each turn (income)
- Maximum: 20 gold

### Gems
- Rare currency for powerful effects
- Gained through special cards
- Maximum: 10 gems

## Action Points

Each turn you have **3 Action Points (AP)** to spend:

| Action | Cost | Description |
|--------|------|-------------|
| Draw | 1 AP | Draw 1 card from the deck |
| Play Card | 1 AP | Play an action card for its effect |
| Collect Set | 2 AP | Claim a set of 3 matching cards |
| Spend | 1 AP | Spend resources for effects |
| Pass | 0 AP | End your turn early |

## Treasure Cards

Treasures come in 4 colors (Ruby/Red, Sapphire/Blue, Emerald/Green, Diamond/White) and 3 types (Ring, Crown, Goblet):

- **Rings** - Common jewelry (value: 3)
- **Crowns** - Royal treasures (value: 5)
- **Goblets** - Ancient artifacts (value: 4)

## Sets and Scoring

Collect matching sets of 3 cards to score points:

### Color Set (15 points)
Collect 3 different treasure types of the same color:
- Example: Ruby Ring + Ruby Crown + Ruby Goblet

### Type Set (15 points)
Collect 3 different colors of the same treasure type:
- Example: Ruby Ring + Sapphire Ring + Emerald Ring

## Action Cards

Special cards that provide advantages:

- **Treasure Map** - Draw 2 additional cards
- **Merchant** - Gain 3 gold
- **Gem Finder** - Gain 2 gems
- **Thief** - Force an opponent to discard 1 card

## Turn Structure

1. **Income Phase**: Gain 2 gold automatically
2. **Action Phase**: Spend your 3 action points
3. **End Turn**: Pass to next player

## Strategy Tips

1. **Balance drawing and collecting** - More cards = more set options
2. **Watch opponents' collections** - Block their sets with Thief
3. **Color vs Type sets** - Choose based on your hand
4. **Save action points** - Sometimes 2 actions is enough
5. **Use Treasure Maps** - Card advantage wins games

## Winning

First player to reach **50 points** wins immediately.

If no one reaches 50 points by turn 30, the player with the highest score wins.
