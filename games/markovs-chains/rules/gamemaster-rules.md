# Markov's Chains - Gamemaster Rules

## State Graph

```
     [Start]
     /  |  \
   [A] [B] [C]
     \  |  /
    [Victory]
```

## Transition Probabilities

| From | To | Base Probability |
|------|-----|-----------------|
| Start | A, B, or C | 0.65 (65%) |
| A, B, C | Victory | 0.55 (55%) |
| A ↔ B ↔ C | Shortcuts | 0.40 (40%) |

## Card Deck (30 cards)

**Boost Cards (10)**:
- Catalyst ×3: +0.20 to next transition
- Momentum ×3: +0.30 to next transition
- Certainty ×4: Auto-success on next move

**Interference Cards (12)**:
- Friction ×5: -0.25 to target's next transition
- Block ×4: Target skips next turn
- Sabotage ×3: Target discards 1 random card

**Utility Cards (8)**:
- Redirect ×3: Change target's destination
- State Swap ×2: Swap positions (same tier)
- Reroll ×3: Reroll a failed transition

## Probability Calculation

```
final_prob = base_prob + boosts - penalties
final_prob = clamp(final_prob, 0.0, 1.0)

roll = random(0.0, 1.0)
success = (roll <= final_prob)
```

## Processing Actions

### move
1. Validate target is reachable
2. Calculate probability with active effects
3. Roll: `awk 'BEGIN{srand(); print rand()}'`
4. If success: update player state
5. Clear one-time effects (Catalyst, Momentum, Friction)

### play_card
1. Validate card in hand
2. Apply effect:
   - Boost cards: Add to activeEffects
   - Certainty: Set autoSuccess flag
   - Interference: Add to target's activeEffects
   - Sabotage: Remove random card from target
3. Move card to discard pile

### draw
1. Validate hand < 7
2. Move top card from deck to hand
3. If deck empty, shuffle discard into deck

### pass
No state change.

## Turn Order

Round-robin through turnOrder array. After processing action:
```
next_index = (current_index + 1) % num_players
next_player = turnOrder[next_index]
```

## Win Conditions

1. **Victory State**: First player to reach "Victory" wins
2. **Turn Limit**: After 15 turns, player closest to Victory wins
   - Victory > A/B/C > Start
   - Tie: Player with more cards wins
