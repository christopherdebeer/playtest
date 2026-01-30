---
name: "Markov's Chains"
version: "2.0"
players: 2-4
starting_cards: 4
win_condition: "First player to reach the Victory state"
max_turns: 15

# Engine mechanics - enable/disable engine capabilities for this game
engine_mechanics:
  probability_movement: true   # Moves use edge probabilities
  card_boosts: true            # Cards can modify move probability
  victory_declaration: true    # Players must declare victory for GM adjudication

# Structured config for engine
board:
  states: ["Start", "A", "B", "C", "Victory"]
  start: "Start"
  edges:
    - { from: "Start", to: ["A", "B", "C"], probability: 0.65 }
    - { from: ["A", "B", "C"], to: "Victory", probability: 0.55 }
    - { from: "A", to: ["B", "C"], probability: 0.4 }
    - { from: "B", to: ["A", "C"], probability: 0.4 }
    - { from: "C", to: ["A", "B"], probability: 0.4 }

deck:
  # Boost cards (10 total)
  - { name: "Catalyst", count: 3, type: "boost", effect: { type: "probability_boost", value: 0.2 } }
  - { name: "Momentum", count: 3, type: "boost", effect: { type: "probability_boost", value: 0.3 } }
  - { name: "Certainty", count: 4, type: "boost", effect: { type: "auto_success" } }
  # Interference cards (12 total)
  - { name: "Friction", count: 5, type: "interference", effect: { type: "probability_penalty", value: -0.25 } }
  - { name: "Block", count: 4, type: "interference", effect: { type: "block_turn", duration: 1 } }
  - { name: "Sabotage", count: 3, type: "interference", effect: { type: "force_discard", value: 1 } }
  # Utility cards (8 total)
  - { name: "Redirect", count: 3, type: "utility", effect: { type: "force_retarget" } }
  - { name: "State Swap", count: 2, type: "utility", effect: { type: "swap_positions" } }
  - { name: "Reroll", count: 3, type: "utility", effect: { type: "reroll_failed" } }
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

- Start → A: 0.65
- Start → B: 0.65
- Start → C: 0.65
- A → Victory: 0.55
- B → Victory: 0.55
- C → Victory: 0.55

Additional connections (shortcuts):
- A → B: 0.4
- B → C: 0.4
- C → A: 0.4
- B → A: 0.4
- C → B: 0.4
- A → C: 0.4

### Card Deck

The deck contains 30 action cards:

**Boost Cards (10 cards):**
- **Catalyst**: +0.2 to your next transition probability (3 cards)
- **Momentum**: +0.3 to your next transition probability (3 cards)
- **Certainty**: Your next move succeeds automatically (4 cards)

**Interference Cards (12 cards):**
- **Friction**: -0.25 to target opponent's next transition (5 cards)
- **Block**: Target opponent cannot move OR play cards for 1 turn (4 cards)
- **Sabotage**: Force target opponent to discard 1 card (3 cards)

**Utility Cards (8 cards):**
- **Redirect**: Force opponent to attempt a different transition (3 cards)
- **State Swap**: Swap positions with another player at same tier only (2 cards)
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
- **Friction**: Target opponent gets -0.25 on their next transition
  - Declare target when playing
  - Effect applies to their next move attempt
  - Stronger than v1.0 (-0.25 vs -0.2)

- **Block**: Target opponent cannot move OR play cards for 1 turn
  - They skip their entire Action phase
  - Can still draw cards
  - Duration: 1 turn
  - Stronger than v1.0 (blocks cards too)

- **Sabotage**: Force target opponent to discard 1 card of their choice
  - Instant effect
  - Reduces opponent's options
  - New in v2.0 (replaces Probability Scan)

### Utility Cards
- **Redirect**: When opponent declares a move, force them to target a different connected state
  - Must be a valid connection from their current state
  - They still roll for that forced transition
  - Play as reaction to opponent's move declaration

- **State Swap**: Choose another player at the same tier and swap positions
  - **Tier restrictions (v2.0)**: Can only swap within same tier
    - Start tier: Only swap with players at Start
    - Intermediate tier: Only swap with players at A, B, or C
    - Victory tier: Cannot swap (game ends)
  - Both players move to each other's states instantly
  - Prevents stealing Victory position

- **Reroll**: After failing a move, immediately reroll the probability check
  - Can only be played immediately after failed move
  - Uses same probability as original attempt

## Winning

**Win Condition**: First player to reach the Victory state wins immediately.

## Strategy Notes

### Path Analysis (v2.0)
- **Direct path**: Start → (A/B/C) → Victory
  - Expected: 2 moves
  - Combined probability without boosts: 0.65 × 0.55 = 0.36 (36% per direct path)
  - Combined probability with Catalyst on each: 0.85 × 0.75 = 0.64 (64%)
  - Combined probability with Momentum on each: 0.95 × 0.85 = 0.81 (81%)

- **Shortcut path**: Start → X → Y → Victory
  - Expected: 3 moves
  - More moves but potentially strategic if opponents are ahead

### Card Economy
- Boost cards increase your success odds significantly
- Interference cards can delay opponents when they're close to winning
- Utility cards provide information or disruption

### Probability Management (v2.0)
- Base 0.65 probability = 65% success rate
- With Catalyst: 0.85 = 85% success rate
- With Momentum: 0.95 = 95% success rate
- With Catalyst + Momentum: 1.0 = 100% (capped at 1.0)
- Under Friction: 0.40 = 40% success rate
- Victory base 0.55 probability = 55% success rate
- Victory with Momentum: 0.85 = 85% success rate

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

## Expected Game Length (v2.0)

With current parameters:
- Average 2-3 transitions needed per player
- ~35-55% base success rate per transition (lower than v1.0)
- More failed attempts expected → more card usage
- Expected: 8-12 total turns (3-4 turns per player)
- Duration: 8-12 minutes with AI agents
- Defensive cards should see more play

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

**v2.0 Changes from v1.0**:
- Reduced base probabilities (0.7→0.65, 0.6→0.55) to increase card importance
- Strengthened Friction (-0.2→-0.25) to incentivize defensive play
- Strengthened Block (now blocks card play too) for stronger disruption
- Nerfed State Swap (same-tier only) to prevent game-stealing
- Removed Probability Scan (no value), added Sabotage (interaction)
- Rebalanced deck: More interference (10→12), fewer boosts (12→10)
- Added max turn limit (15 turns) to prevent stalemates

**Future adjustments to consider**:
- If games too short: Decrease base probabilities further
- If games too long: Increase base probabilities or reduce max_turns
- If defensive cards still unused: Strengthen further or add incentives
- If too luck-dependent: Increase card_boost_strength or starting_cards
