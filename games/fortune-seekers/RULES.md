---
name: "Fortune Seekers"
version: "1.0"
players: 2-4
win_condition: "score >= 100"
max_rounds: 20

mechanics:
  # Push your luck - roll dice for points, but risk busting
  push_your_luck:
    dice_sides: 6
    bust_threshold: 1      # Roll 1 = bust, lose accumulated points
    points_per_success: 10
    max_rolls: 5           # Max 5 rolls per turn

  # Open drafting - select from visible cards
  open_drafting:
    display_size: 5
    picks_per_turn: 1
    refill: immediate      # Refill display right after pick

  # Variable player powers - each player has a unique ability
  variable_powers:
    assignment: random
    powers:
      - id: "lucky"
        name: "Lucky Charm"
        description: "Bust threshold is 0 instead of 1 (never bust on 1)"
        effect: { type: "immunity", condition: "bust" }
      - id: "greedy"
        name: "Greedy"
        description: "Earn 15 points per successful roll instead of 10"
        effect: { type: "bonus_income", value: 5 }
      - id: "collector"
        name: "Collector"
        description: "Score double points from drafted cards"
        effect: { type: "bonus_draw", value: 2 }
      - id: "cautious"
        name: "Cautious"
        description: "Can bank after every roll (even before first)"
        effect: { type: "extra_cards", value: 1 }

  # Fortune cards
  cards:
    starting_hand: 0
    deck:
      # Point value cards
      - { name: "Gold Coin", count: 8, type: "treasure", effect: { type: "points", value: 5 } }
      - { name: "Silver Bar", count: 6, type: "treasure", effect: { type: "points", value: 10 } }
      - { name: "Diamond", count: 4, type: "treasure", effect: { type: "points", value: 20 } }
      - { name: "Crown Jewel", count: 2, type: "treasure", effect: { type: "points", value: 30 } }

      # Modifier cards
      - { name: "Lucky Dice", count: 3, type: "modifier", effect: { type: "reroll", value: 1 } }
      - { name: "Extra Roll", count: 3, type: "modifier", effect: { type: "bonus_rolls", value: 1 } }
      - { name: "Double Down", count: 2, type: "modifier", effect: { type: "multiplier", value: 2 } }

      # Risk cards
      - { name: "Gambler's Ruin", count: 2, type: "risk", effect: { type: "penalty", value: -15 } }

  win_score_threshold: { threshold: 100 }
---

# Fortune Seekers

A push-your-luck drafting game where fortune favors the bold!

## Objective

Be the first player to reach **100 points** through a combination of drafting valuable cards and pushing your luck with dice rolls.

## Setup

1. Shuffle the Fortune deck
2. Deal 5 cards face-up to form the **Draft Display**
3. Each player receives a random **Power** card
4. Players start with 0 points

## Player Powers

Each player has a unique ability:

- **Lucky Charm** - You never bust on rolling a 1
- **Greedy** - Earn 15 points per successful roll (instead of 10)
- **Collector** - Score double points from drafted cards
- **Cautious** - Can bank at any time (even with 0 accumulated)

## Turn Structure

On your turn, you may take actions in any order:

### 1. Draft Phase
Pick one card from the Draft Display:
- **Treasure cards** give instant points
- **Modifier cards** affect your dice rolling
- **Risk cards** have negative effects

After drafting, the display refills from the deck.

### 2. Roll Phase
Push your luck with dice rolls:
- Roll a d6
- **2-6**: Success! Gain 10 points to your accumulator
- **1**: BUST! Lose all accumulated points this turn

After each successful roll, choose:
- **Roll again** - Risk it for more points!
- **Bank** - Add accumulated points to your score

You can roll up to 5 times per turn.

## Card Types

### Treasure Cards
| Card | Value | Count |
|------|-------|-------|
| Gold Coin | 5 pts | 8 |
| Silver Bar | 10 pts | 6 |
| Diamond | 20 pts | 4 |
| Crown Jewel | 30 pts | 2 |

### Modifier Cards
- **Lucky Dice** - Reroll one die this turn
- **Extra Roll** - Get +1 maximum roll this turn
- **Double Down** - Next successful roll worth double

### Risk Cards
- **Gambler's Ruin** - Lose 15 points immediately

## Strategy Tips

1. **Know when to bank** - A bust at 40 accumulated hurts!
2. **Draft strategically** - High-value cards vs modifiers
3. **Use your power** - Each power changes optimal strategy
4. **Count the odds** - 1/6 chance of bust per roll
5. **Watch opponents** - If they're close to 100, take risks!

## Winning

First player to reach **100 points** wins immediately!

If the deck runs out, the player with the highest score wins.

## Example Turn

1. Draft "Silver Bar" from display (+10 points)
2. Roll dice: 4 - Success! (10 accumulated)
3. Roll again: 5 - Success! (20 accumulated)
4. Roll again: 1 - BUST! (lose 20 accumulated)
5. End turn with just the 10 points from Silver Bar
