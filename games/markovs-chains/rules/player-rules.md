# Markov's Chains - Player Rules

## Objective

Be the first to reach the **Victory** state!

## The Board

```
     [Start]  ← Everyone starts here
     /  |  \
   [A] [B] [C]  ← Intermediate states
     \  |  /
    [Victory]  ← Win condition!
```

## Movement

Moving is probabilistic - you declare where you want to go, then roll:

| Move | Success Rate |
|------|--------------|
| Start → A/B/C | 65% |
| A/B/C → Victory | 55% |
| Between A/B/C | 40% |

If you fail, you stay where you are.

## Your Cards

**Boost Cards** - Improve YOUR odds:
- **Catalyst**: +20% to your next move
- **Momentum**: +30% to your next move
- **Certainty**: Your next move auto-succeeds (100%!)

**Interference Cards** - Hurt opponents:
- **Friction**: -25% to target's next move
- **Block**: Target skips their next turn entirely
- **Sabotage**: Target discards a random card

**Utility Cards**:
- **Redirect**: Force opponent to target different state
- **State Swap**: Trade positions with opponent (same tier only)
- **Reroll**: Get another chance if you fail a move

## Turn Actions

Choose ONE per turn:

1. **move** - Try to advance toward Victory
2. **play_card** - Use a card from your hand
3. **draw** - Get a new card (max 7 in hand)
4. **pass** - Do nothing

## Strategy Tips

### Early Game (At Start)
- Use Catalyst/Momentum to boost your first move (65% → 85-95%)
- Don't waste Certainty here - save it for Victory push

### Mid Game (At A/B/C)
- Watch opponents closely
- If opponent has Certainty and is at A/B/C, they'll likely win next turn
- Use Block/Friction defensively when opponents threaten Victory

### End Game (Racing to Victory)
- **Certainty** guarantees Victory if you're at A/B/C
- Without Certainty, 55% is a gamble - consider boosting
- Block opponents who are one move from winning

### Card Priority
1. **SAVE**: Certainty (game-winning)
2. **USE EARLY**: Catalyst, Momentum (diminishing value late game)
3. **USE DEFENSIVELY**: Block, Friction (stop leaders)
4. **SITUATIONAL**: Sabotage, Redirect, State Swap
