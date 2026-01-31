# Markov's Chains - Game Analysis

## Summary

A swift 4-turn game where **player-2** achieved victory through aggressive movement strategy, reaching the Victory state despite player-1's defensive Hazard placement.

## Winner

**player-2** - Reached Victory state in 4 turns

## Win Condition

First player to reach the Victory state (probability-based movement game).

## Key Moments

| Turn | Player | Action | Significance |
|------|--------|--------|--------------|
| 1 | player-1 | Placed Hazard on Victory | Defensive trap, -20% for opponents entering Victory |
| 1 | player-2 | Moved to A | First movement, started racing |
| 2 | player-2 | Moved to Checkpoint-X | Bypassed intermediate states efficiently |
| 3 | player-1 | Played Friction on player-2 | -25% penalty attempt to slow leader |
| 3 | player-2 | Played Catalyst | +20% boost to counter Friction |
| 4 | player-2 | Moved to Victory | Won despite Hazard (-20%) - luck + strategy |

## Mechanics Observed

- **probability_movement**: Core mechanic - all moves succeeded despite reduced probabilities
- **card_boosts**: Catalyst (+20%) used effectively by player-2
- **state_cards**: Hazard placed on Victory by player-1 (defensive)
- **interference**: Friction used by player-1 to slow player-2
- **victory_declaration**: Auto-detected by engine when player-2 reached Victory

## Player Strategies

### player-1 (Lost - stayed at Start)
- Defensive strategy: Placed Hazard and Safe Haven cards
- Used Friction to slow opponent
- Drew cards instead of moving early - fell behind
- Never attempted movement, over-invested in defense

### player-2 (Won - reached Victory)
- Aggressive movement strategy
- Successfully moved every turn (Start → A → Checkpoint-X → Victory)
- Used Catalyst to offset Friction penalty
- Won despite facing Hazard on Victory state

## Recommendations

1. **Player-1's strategy was too passive** - drawing cards while opponent races ahead is losing strategy
2. **Hazard on Victory is good** but insufficient alone - need to also move
3. **Card timing matters** - player-2's Catalyst perfectly countered Friction
4. **4 turns is fast** - game balance may need review if wins this quick are common

## Statistics

- **Duration**: ~3 minutes (15:45:26 to 15:49:04)
- **Total Events**: 11
- **Successful Moves**: 3 (all by player-2)
- **Cards Played**: 4 (Hazard, Safe Haven, Friction, Catalyst)
