---
name: "Markov's Chains"
version: "2.3"
players: 2-4
win_condition: "First player to reach the Victory state"
max_rounds: 25

mechanics:
  board_state: true
  probability_movement: true
  card_boosts: true
  victory_declaration: true

  board:
    states: ["Start", "A", "B", "C", "Checkpoint-X", "Checkpoint-Y", "Victory"]
    start: "Start"
    edges:
      # Layer 1: Start to intermediate states (55% - reduced from 65%)
      - { from: "Start", to: ["A", "B", "C"], probability: 0.55 }
      # Layer 2: Intermediate to checkpoints (40% - reduced from 50%)
      - { from: ["A", "B", "C"], to: ["Checkpoint-X", "Checkpoint-Y"], probability: 0.40 }
      # Layer 3: Checkpoints to Victory (25% - reduced from 35%)
      - { from: ["Checkpoint-X", "Checkpoint-Y"], to: "Victory", probability: 0.25 }
      # Lateral movement between intermediates (35%)
      - { from: "A", to: ["B", "C"], probability: 0.35 }
      - { from: "B", to: ["A", "C"], probability: 0.35 }
      - { from: "C", to: ["A", "B"], probability: 0.35 }
      # Lateral movement between checkpoints (40%)
      - { from: "Checkpoint-X", to: "Checkpoint-Y", probability: 0.40 }
      - { from: "Checkpoint-Y", to: "Checkpoint-X", probability: 0.40 }

  cards:
    starting_hand: 5
    deck:
      # Boost cards (6 total - reduced from 8)
      - { name: "Catalyst", count: 2, type: "boost", effect: { type: "probability_boost", value: 0.2 } }
      - { name: "Momentum", count: 2, type: "boost", effect: { type: "probability_boost", value: 0.3 } }
      - { name: "Certainty", count: 2, type: "boost", effect: { type: "auto_success" } }
      # Interference cards (10 total)
      - { name: "Friction", count: 4, type: "interference", effect: { type: "probability_penalty", value: -0.25 } }
      - { name: "Block", count: 3, type: "interference", effect: { type: "block_turn", duration: 1 } }
      - { name: "Sabotage", count: 3, type: "interference", effect: { type: "force_discard", value: 1 } }
      # State Cards - NEW in v2.3! (8 total) - Placeable on board states
      - { name: "Hazard", count: 3, type: "trap", placeable: true, targetMode: "opponents", effect: { type: "probability_penalty", value: -0.20 } }
      - { name: "Safe Haven", count: 3, type: "buff", placeable: true, targetMode: "owner", effect: { type: "probability_boost", value: 0.15 } }
      - { name: "Toll Gate", count: 2, type: "trap", placeable: true, targetMode: "opponents", effect: { type: "force_discard", value: 1 } }
      # Utility cards (6 total - reduced from 8)
      - { name: "Redirect", count: 2, type: "utility", effect: { type: "force_retarget" } }
      - { name: "State Swap", count: 2, type: "utility", effect: { type: "swap_positions" } }
      - { name: "Reroll", count: 2, type: "utility", effect: { type: "reroll_failed" } }

  win_reach_state: { target_state: "Victory" }
---

# Markov's Chains - Game Rules

A strategic board game inspired by Markov chains where players navigate probabilistic state transitions to reach victory.

## Game Concept

Players race through a network of connected states, making strategic decisions about movement paths and probability manipulation. Each turn involves both deterministic choices and probabilistic outcomes, requiring players to balance risk and reward.

## Game Setup

### State Graph (v2.2 - Extended Path)

The game board consists of 7 states arranged in 4 layers:

```
         [Start]           Layer 0: Starting point
         /  |  \
       [A] [B] [C]         Layer 1: Intermediate states (65%)
         \  |  /
   [Checkpoint-X]──[Checkpoint-Y]   Layer 2: Checkpoints (50%)
            \    /
          [Victory]        Layer 3: Goal state (35%)
```

**State Descriptions:**
- **Start**: All players begin here
- **A, B, C**: First intermediate layer (3 different paths)
- **Checkpoint-X, Checkpoint-Y**: Second intermediate layer (mandatory!)
- **Victory**: The goal state - first player to reach wins

**Minimum Path to Victory:** 3 moves (Start → A/B/C → Checkpoint → Victory)

### Edge Weights (Transition Probabilities)

**Layer Transitions (v2.3 - reduced probabilities):**
- Start → A/B/C: **0.55** (55% success - reduced from 65%)
- A/B/C → Checkpoint-X/Y: **0.40** (40% success - reduced from 50%)
- Checkpoint-X/Y → Victory: **0.25** (25% success - hardest! reduced from 35%)

**Lateral Movement:**
- Between A, B, C: **0.35** (35% success)
- Between Checkpoints: **0.40** (40% success)

### Card Deck

The deck contains 30 action cards:

**Boost Cards (6 cards):**
- **Catalyst**: +0.2 to your next transition probability (2 cards)
- **Momentum**: +0.3 to your next transition probability (2 cards)
- **Certainty**: Your next move succeeds automatically (2 cards) ⚠️ *Rare!*

**Interference Cards (10 cards):**
- **Friction**: -0.25 to target opponent's next transition (4 cards)
- **Block**: Target opponent cannot move OR play cards for 2 turns (3 cards) 🔒 *Powerful!*
- **Sabotage**: Force target opponent to discard 1 card (3 cards)

**State Cards - NEW in v2.3! (8 cards):**
Place these cards on board states to create traps or buffs!
- **Hazard**: Place on a state - opponents entering get -20% probability (3 cards) 🚧 *Trap!*
- **Safe Haven**: Place on a state - you get +15% probability when at this state (3 cards) 🏠 *Defensive!*
- **Toll Gate**: Place on a state - opponents must discard 1 card when entering (2 cards) 💰 *Tax!*

**Utility Cards (6 cards):**
- **Redirect**: Force opponent to attempt a different transition (2 cards)
- **State Swap**: Swap positions with another player at same tier only (2 cards)
- **Reroll**: Reroll a failed transition attempt (2 cards)

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
   - **Plus/minus any placed card effects at destination** (NEW in v2.3!)
3. Roll for success:
   - Generate random number 0.0 - 1.0
   - If number ≤ probability: Move succeeds, advance to target state
   - If number > probability: Move fails, stay in current state
4. When entering a state with placed cards, their effects trigger automatically
5. Discard any single-use cards that were applied

**Option B: Play Card**
- Play 1 card from your hand
- Apply its effect immediately
- Card goes to discard pile
- Some cards trigger on your next move (mark as "pending")

**Option C: Place Card** (NEW in v2.3!)
- Play a state card (Hazard, Safe Haven, or Toll Gate) from your hand
- Choose a board state to place it on
- The card remains on that state until triggered or the game ends
- Multiple cards can be placed on the same state
- Effects trigger when any player enters that state

**Option D: Pass**
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

### State Cards (NEW in v2.3!)
State cards are placed on board states and trigger when players interact with those states.

- **Hazard**: Place on any state to create a trap
  - Opponents entering the state get -20% to their next probability roll
  - Does NOT affect the player who placed it (targetMode: opponents)
  - Great for placing on Checkpoint states to slow down leaders
  - Example: Place on Checkpoint-X, opponent entering has -20% penalty

- **Safe Haven**: Place on any state to create a defensive buff
  - When you are on this state, you get +15% probability
  - Only affects the player who placed it (targetMode: owner)
  - Great for creating a "safe path" through the board
  - Example: Place on state B, you get +15% when moving from B

- **Toll Gate**: Place on any state to tax opponents
  - Opponents entering the state must discard 1 card
  - Does NOT affect the player who placed it
  - Powerful for controlling key chokepoints
  - Example: Place on Checkpoint-Y, opponent loses a card when entering

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

**v2.3 Changes from v2.2**:
- Added **State Cards** mechanic: Hazard, Safe Haven, Toll Gate (placeable on board states)
- Reduced all transition probabilities by 10-15 points (55%/40%/25%)
- Increased starting cards (4→5) to support state card usage
- Increased max turns (20→25) to accommodate longer games
- Rebalanced deck: Added 8 state cards, reduced boosts (8→6), reduced utility (8→6)

**v2.2 Changes from v2.1**:
- Added Checkpoint states for mandatory 3-move minimum path
- First defensive card usage observed (Friction)

**v2.0 Changes from v1.0**:
- Reduced base probabilities (0.7→0.65, 0.6→0.55) to increase card importance
- Strengthened Friction (-0.2→-0.25) to incentivize defensive play
- Strengthened Block (now blocks card play too) for stronger disruption
- Nerfed State Swap (same-tier only) to prevent game-stealing
- Removed Probability Scan (no value), added Sabotage (interaction)

**Future adjustments to consider**:
- If games too short: Decrease base probabilities further or add more intermediate states
- If games too long: Increase base probabilities or reduce max_rounds
- If state cards unused: Increase their power or add more copies
- If too luck-dependent: Increase card_boost_strength or starting_cards
