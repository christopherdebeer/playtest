---
name: "Markov's Chains"
version: "1.0"
players: 3
states: 6
starting_cards: 4
cards_to_draw: 1
base_transition_prob: 0.7
card_boost_strength: 0.2
block_duration: 1
win_condition: "First player to reach the Victory state"
estimated_turns: 15-25
---

# Markov's Chains - Game Rules

A strategic board game inspired by Markov chains where players navigate probabilistic state transitions to reach victory.

## Game Concept

Players race through a network of connected states, making strategic decisions about movement paths and probability manipulation. Each turn involves both deterministic choices and probabilistic outcomes, requiring players to balance risk and reward.

## Game Setup

### State Graph

The game board consists of 6 states arranged as follows:

```
    [Start]
    /  |  \
  [A] [B] [C]
    \  |  /
   [Victory]
```

**State Descriptions:**
- **Start**: All players begin here
- **A, B, C**: Intermediate states (3 different paths)
- **Victory**: The goal state - first player to reach wins

### Edge Weights (Transition Probabilities)

Each connection between states has a base probability of success:

- Start → A: 0.7
- Start → B: 0.7
- Start → C: 0.7
- A → Victory: 0.6
- B → Victory: 0.6
- C → Victory: 0.6

Additional connections (shortcuts):
- A → B: 0.4
- B → C: 0.4
- C → A: 0.4
- B → A: 0.4
- C → B: 0.4
- A → C: 0.4

### Card Deck

The deck contains 30 action cards:

**Boost Cards (12 cards):**
- **Catalyst**: +0.2 to your next transition probability (4 cards)
- **Momentum**: +0.3 to your next transition probability (4 cards)
- **Certainty**: Your next move succeeds automatically (4 cards)

**Interference Cards (10 cards):**
- **Friction**: -0.2 to target opponent's next transition (4 cards)
- **Block**: Target opponent cannot move for 1 turn (3 cards)
- **Redirect**: Force opponent to attempt a different transition (3 cards)

**Utility Cards (8 cards):**
- **Probability Scan**: See all current edge weights (3 cards)
- **State Swap**: Swap positions with another player (2 cards)
- **Reroll**: Reroll a failed transition attempt (3 cards)

### Initial Setup

1. All players start at the **Start** state
2. Shuffle the deck and deal 4 cards to each player
3. Place remaining cards face-down as the draw pile
4. Randomly determine turn order
5. Set all edge weights to their base values

## Turn Structure

On your turn, perform these phases in order:

### Phase 1: Draw (Optional)
- Draw 1 card from the deck
- Maximum hand size: 7 cards
- If deck is empty, shuffle discard pile to create new deck

### Phase 2: Action
Choose ONE of the following:

**Option A: Move**
1. Declare your target state (must be connected to current state)
2. Calculate transition probability:
   - Base probability (from edge weight)
   - Plus any active card effects
   - Minus any opponent interference
3. Roll for success:
   - Generate random number 0.0 - 1.0
   - If number ≤ probability: Move succeeds, advance to target state
   - If number > probability: Move fails, stay in current state
4. Discard any single-use cards that were applied

**Option B: Play Card**
- Play 1 card from your hand
- Apply its effect immediately
- Card goes to discard pile
- Some cards trigger on your next move (mark as "pending")

**Option C: Pass**
- Do nothing this turn
- Useful if waiting for strategic moment

### Phase 3: Cleanup
- Remove expired effects (blocks, temporary modifiers)
- Check win condition
- Pass turn to next player

## Card Details

### Boost Cards
- **Catalyst**: Add +0.2 to your transition probability on next move
  - Stacks with other effects
  - Expires after 1 move attempt (success or fail)

- **Momentum**: Add +0.3 to your transition probability on next move
  - Stacks with other effects
  - Expires after 1 move attempt

- **Certainty**: Your next move automatically succeeds
  - Bypass probability check entirely
  - Expires after 1 move attempt

### Interference Cards
- **Friction**: Target opponent gets -0.2 on their next transition
  - Declare target when playing
  - Effect applies to their next move attempt

- **Block**: Target opponent cannot move for 1 turn
  - They skip their Action phase (but can still draw cards)
  - Duration: 1 turn

- **Redirect**: When opponent declares a move, force them to target a different connected state
  - Must be a valid connection from their current state
  - They still roll for that forced transition

### Utility Cards
- **Probability Scan**: Reveal all current edge weights and pending effects
  - Provides perfect information about board state
  - Instant effect, no duration

- **State Swap**: Choose another player and swap positions with them
  - Both players move to each other's states instantly
  - Cannot swap with someone at Victory state

- **Reroll**: After failing a move, immediately reroll the probability check
  - Can only be played immediately after failed move
  - Uses same probability as original attempt

## Winning

**Win Condition**: First player to reach the Victory state wins immediately.

## Strategy Notes

### Path Analysis
- **Direct path**: Start → (A/B/C) → Victory
  - Expected: 2 moves
  - Combined probability: 0.7 × 0.6 = 0.42 (42% per direct path attempt)

- **Shortcut path**: Start → X → Y → Victory
  - Expected: 3 moves
  - More moves but potentially strategic if opponents are ahead

### Card Economy
- Boost cards increase your success odds significantly
- Interference cards can delay opponents when they're close to winning
- Utility cards provide information or disruption

### Probability Management
- Base 0.7 probability = 70% success rate
- With Catalyst: 0.9 = 90% success rate
- With Momentum: 1.0 = 100% success rate (capped at 1.0)
- Under Friction: 0.5 = 50% success rate

### Risk vs. Reward
- Direct paths are riskier but faster
- Multiple attempts may be needed (expect 2-3 turns per transition)
- Saving "Certainty" cards for final move to Victory can guarantee win

## Hyperparameters (Tunable)

These values can be adjusted for game balance:

- **players**: 3 (supports 2-4)
- **starting_cards**: 4 (range: 3-5)
- **cards_to_draw**: 1 (range: 0-2)
- **base_transition_prob**: 0.7 (range: 0.5-0.9)
- **card_boost_strength**: 0.2 for Catalyst (range: 0.1-0.3)
- **block_duration**: 1 turn (range: 1-2)
- **states**: 6 (current: Start + 3 intermediate + Victory + 1 unused)

## Expected Game Length

With current parameters:
- Average 2-3 transitions needed per player
- ~40-60% success rate per transition
- Expected: 15-25 total turns (5-8 turns per player)
- Duration: 10-15 minutes with AI agents

## Design Goals

1. **Strategic depth**: Players must decide when to boost, when to interfere, when to risk moves
2. **Comeback potential**: Players behind can use interference cards to slow leaders
3. **Luck mitigation**: Multiple paths and card effects reduce pure randomness
4. **Clear win condition**: Race to goal state creates urgency
5. **Tunable difficulty**: Hyperparameters allow balance adjustment

## Gamemaster Notes

### Random Number Generation
Use uniform random distribution [0.0, 1.0] for transition rolls.

### State Tracking
Maintain:
- Each player's current state
- Each player's hand (hidden from opponents)
- Active effects on each player (boosts, penalties, blocks)
- Current edge weights (if modified by cards)

### Logging Requirements
Log every:
- Card play with reasoning
- Move attempt with probability and roll result
- State changes
- Effect applications/expirations

### Balance Considerations
After playtesting, consider adjusting:
- If games too short: Decrease base_transition_prob or increase states
- If games too long: Increase base_transition_prob or reduce interference cards
- If too luck-dependent: Increase card_boost_strength or starting_cards
- If too deterministic: Decrease base_transition_prob or card effects
