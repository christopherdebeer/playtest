---
name: "UNO"
players: 2-4
cards_per_player: 7
deck_composition:
  number_cards: 76  # 0-9 in four colors (Red, Yellow, Green, Blue)
  action_cards: 24  # Skip, Reverse, Draw Two (2 each per color)
  wild_cards: 8     # Wild (4) and Wild Draw Four (4)
deck_size: 108
colors:
  - Red
  - Yellow
  - Green
  - Blue
special_mechanics:
  - skip
  - reverse
  - draw_two
  - wild
  - wild_draw_four
win_condition: "First player to empty their hand wins the round"
scoring: true
target_score: 500
turn_structure:
  - draw_or_play
  - match_color_or_number
  - declare_uno
---

# UNO Game Rules

## Objective

Be the first player to get rid of all cards in your hand. In tournament play, the first player to reach 500 points wins.

## Setup

1. Each player is dealt **7 cards**
2. Remaining cards form the **draw pile** (face down)
3. Top card from draw pile is flipped to start the **discard pile**
4. If the first card is a special card, apply its effect immediately

## Card Types

### Number Cards (0-9)
- Four colors: Red, Yellow, Green, Blue
- Can be played if they match the color OR number of the top discard card

### Action Cards

**Skip**
- Skips the next player's turn
- Can be played if it matches the color of the top discard card

**Reverse**
- Reverses the direction of play (clockwise ↔ counter-clockwise)
- In a 2-player game, acts like a Skip
- Can be played if it matches the color of the top discard card

**Draw Two**
- Next player draws 2 cards and loses their turn
- Can be played if it matches the color of the top discard card
- Cards drawn cannot be played immediately

### Wild Cards

**Wild**
- Can be played on any card
- Player declares the new color to match
- Cannot be played if player has a playable card matching the current color

**Wild Draw Four**
- Next player draws 4 cards and loses their turn
- Player declares the new color to match
- **Rule**: Can only be played if player has NO cards matching the current color
- If challenged and player is caught cheating, they draw 4 instead
- Cards drawn cannot be played immediately

## Gameplay

### Turn Sequence

1. **Check for playable cards**:
   - Match color of top discard card
   - Match number/symbol of top discard card
   - Wild cards (if no other playable cards for Wild Draw Four)

2. **Play a card OR draw**:
   - If you have a playable card, you MAY play it
   - If you have no playable cards, you MUST draw one card
   - If the drawn card is playable, you MAY play it immediately

3. **Declare UNO**:
   - When you play your second-to-last card, you must declare "UNO"
   - If you forget and another player catches you before the next player starts, you must draw 2 penalty cards

4. **Win condition**:
   - Play your last card to win the round
   - Your last card can be any valid card, including action/wild cards

### Special Rules

**Stacking**: Draw Two cards **cannot** be stacked (house rule variations exist but not in official rules)

**Jump-in**: Players **cannot** jump in out of turn, even with an identical card (house rule variations exist)

**Challenge**: When a Wild Draw Four is played, the next player may challenge if they suspect the player had a playable color card. If correct, the player who played it draws 4; if wrong, the challenger draws 6.

**No cards playable**: If you draw a card and still cannot play, your turn ends.

## Scoring

When a player wins a round, they score points based on cards remaining in opponents' hands:

- **Number cards (0-9)**: Face value
- **Skip, Reverse, Draw Two**: 20 points each
- **Wild, Wild Draw Four**: 50 points each

First player to reach **500 points** wins the game.

## Strategy Considerations

- Hold Wild cards for critical moments
- Use action cards to disrupt opponents close to winning
- Track which colors have been played frequently
- Declare UNO at the right time to avoid penalties
- Watch opponents' card counts to anticipate threats

## Edge Cases

1. **First card is action card**: Apply effect immediately (skip first player, reverse order, etc.)
2. **Draw pile depleted**: Shuffle discard pile (except top card) to create new draw pile
3. **Last card is Draw Two/Wild Draw Four**: Valid play; next player draws and you win
4. **Reverse with 2 players**: Acts as Skip
5. **Wild Draw Four challenge**: Challenging player must declare before drawing cards
