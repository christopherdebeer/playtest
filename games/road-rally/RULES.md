---
name: "Road Rally"
version: "1.0"
players: 2-4
win_condition: "First player to reach the Finish Line"
max_rounds: 50

mechanics:
  # Point-to-point movement - the rally track
  point_to_point_movement:
    nodes:
      - { id: "Start", name: "Starting Line", type: "checkpoint" }
      - { id: "Pit1", name: "Pit Stop 1", type: "pit" }
      - { id: "Mountain", name: "Mountain Pass", type: "stage" }
      - { id: "Valley", name: "Valley Road", type: "stage" }
      - { id: "Pit2", name: "Pit Stop 2", type: "pit" }
      - { id: "Finish", name: "Finish Line", type: "finish" }
    routes:
      - { from: "Start", to: "Pit1", bidirectional: false, cost: 1 }
      - { from: "Pit1", to: "Mountain", bidirectional: false, cost: 1 }
      - { from: "Mountain", to: "Valley", bidirectional: false, cost: 1 }
      - { from: "Valley", to: "Pit2", bidirectional: false, cost: 1 }
      - { from: "Pit2", to: "Finish", bidirectional: false, cost: 1 }
    starting_node: "Start"

  # Trick-taking - card comparison for winning rounds
  trick_taking:
    points_per_trick: 0
    value_order: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"]
    card_values:
      "10": 10
      "9": 9
      "8": 8
      "7": 7
      "6": 6
      "5": 5
      "4": 4
      "3": 3
      "2": 2
      "1": 1

  # Ladder climbing - beat previous play or pass
  ladder_climbing:
    comparison: value
    higher_wins: true
    allow_combinations: true
    combination_types: ["single", "pair"]
    pass_eliminates: false
    auto_advance_winner: true  # Automatically advance winner one space

  # Race win condition - first to finish wins
  win_race:
    goal_state: "Finish"
    checkpoints: ["Pit1", "Mountain", "Valley", "Pit2"]

  # Cards configuration
  cards:
    starting_hand: 7
    deck:
      # Speed cards - higher = faster
      - { name: "Speed 1", count: 4, type: "speed", value: 1, suit: "speed" }
      - { name: "Speed 2", count: 4, type: "speed", value: 2, suit: "speed" }
      - { name: "Speed 3", count: 4, type: "speed", value: 3, suit: "speed" }
      - { name: "Speed 4", count: 4, type: "speed", value: 4, suit: "speed" }
      - { name: "Speed 5", count: 4, type: "speed", value: 5, suit: "speed" }
      - { name: "Speed 6", count: 4, type: "speed", value: 6, suit: "speed" }
      - { name: "Speed 7", count: 4, type: "speed", value: 7, suit: "speed" }
      - { name: "Speed 8", count: 4, type: "speed", value: 8, suit: "speed" }
      - { name: "Speed 9", count: 4, type: "speed", value: 9, suit: "speed" }
      - { name: "Speed 10", count: 4, type: "speed", value: 10, suit: "speed" }
      # Turbo cards - special high value cards
      - { name: "Turbo Boost", count: 2, type: "turbo", value: 11, suit: "turbo" }
      - { name: "Nitro Burst", count: 2, type: "turbo", value: 12, suit: "turbo" }
---

# Road Rally

A racing card game where players compete in speed battles to advance along a rally course. Play cards to beat your opponents, win rounds to move forward, and be the first to cross the finish line!

## Overview

In Road Rally, 2-4 players race their cars along a scenic rally route from the Starting Line to the Finish Line. Each round, players engage in a **speed battle** - playing cards in ladder-climbing fashion where each play must beat the previous one. When all other players pass, the winner of the speed battle advances their car one space forward on the track.

## Components

- **44 Speed Cards**: Numbers 1-10 (4 copies each), plus 2 Turbo Boost (11) and 2 Nitro Burst (12)
- **Rally Track**: 6 locations from Start to Finish
- **Player Tokens**: One per player to track position

## The Rally Track

```
[Starting Line] --> [Pit Stop 1] --> [Mountain Pass] --> [Valley Road] --> [Pit Stop 2] --> [Finish Line]
```

All players start at the **Starting Line**. The race follows a one-way route through 5 stages:

1. **Starting Line** - Where all racers begin
2. **Pit Stop 1** - First checkpoint
3. **Mountain Pass** - Challenging terrain
4. **Valley Road** - Open road
5. **Pit Stop 2** - Final checkpoint
6. **Finish Line** - Cross here to win!

## Setup

1. Shuffle all 44 cards to form the draw deck
2. Deal **7 cards** to each player
3. Place all player tokens on the **Starting Line**
4. Randomly determine who leads the first speed battle

## Gameplay

Road Rally is played in a series of **speed battles**. Each battle follows these steps:

### 1. Lead Play

The **battle leader** plays first:
- Play a **single card** (any value)
- OR play a **pair** (two cards of the same value)

This sets the **combination type** for the battle - everyone must match it (singles or pairs).

### 2. Follow or Pass

Going clockwise, each player must either:

**BEAT IT** - Play a card or pair that is **higher value** than the current play
- For singles: play a higher single card
- For pairs: play a higher pair (comparing the value)

**PASS** - Decline to play. You may still play later if the battle continues.

### 3. Resolution

The battle continues around the table. When **all players pass in succession** (no one can or wants to beat the current play):

- The **last player who played** wins the battle
- The winner **advances one space** on the track
- All played cards go to the discard pile
- The winner becomes the **new battle leader**

### 4. Draw Phase

After each battle:
- All players draw back up to **7 cards** (if fewer)
- If the deck runs out, shuffle the discard pile to form a new deck

## Card Values

| Card | Value | Copies |
|------|-------|--------|
| Speed 1 | 1 | 4 |
| Speed 2 | 2 | 4 |
| Speed 3 | 3 | 4 |
| Speed 4 | 4 | 4 |
| Speed 5 | 5 | 4 |
| Speed 6 | 6 | 4 |
| Speed 7 | 7 | 4 |
| Speed 8 | 8 | 4 |
| Speed 9 | 9 | 4 |
| Speed 10 | 10 | 4 |
| Turbo Boost | 11 | 2 |
| Nitro Burst | 12 | 2 |

Higher values beat lower values. Turbo Boost and Nitro Burst are the most powerful cards in the game!

## Winning

**First player to reach the Finish Line wins the race!**

The winner must have passed through all checkpoints (Pit Stop 1, Mountain Pass, Valley Road, Pit Stop 2) before reaching the Finish Line.

## Strategy

### Battle Management
- **Save high cards** for crucial battles when you're close to the finish
- **Pairs are powerful** - having pairs gives you options others might not match
- **Strategic passing** - sometimes it's better to pass early and save cards

### Position Awareness
- Track everyone's position - be more aggressive when behind
- The leader becomes a target - others will team up to stop you

### Card Counting
- Remember the Turbo Boost and Nitro Burst cards - only 2 each!
- If you've seen both 12s played, your 11 is unbeatable

### When to Lead Low
- Leading with a low card forces others to spend good cards
- This can be a smart move when you have backup high cards

## Example Round

**Starting positions**: Alice (Mountain), Bob (Pit 1), Carol (Start)
**Battle leader**: Alice

1. Alice leads with **Speed 5** (single)
2. Bob plays **Speed 7** (beats 5)
3. Carol plays **Speed 9** (beats 7)
4. Alice **passes** (saving cards)
5. Bob plays **Turbo Boost (11)** (beats 9)
6. Carol **passes**
7. Alice **passes**

**Result**: Bob wins! Bob advances from Pit Stop 1 to Mountain Pass. Bob leads the next battle.

## Advanced Rules (Optional)

### Pit Stop Bonus
When advancing TO a Pit Stop (Pit Stop 1 or Pit Stop 2), draw 1 extra card.

### Drafting
Players at the same location can form "drafting partnerships" - they don't have to beat each other's plays but can build on them together against players ahead.

## Design Notes

Road Rally combines four classic game mechanics:

1. **Point-to-Point Movement** - The linear rally track creates clear positional racing
2. **Trick-Taking** - Each battle is won by the highest play
3. **Ladder Climbing** - Each play must beat the previous, creating escalating tension
4. **Race Win Condition** - First to finish wins, creating urgency and risk/reward decisions

The game creates interesting decisions around when to compete hard for a battle versus conserving cards for future rounds. Players who fall behind can team up to stop the leader, while the leader must carefully manage their hand to stay ahead.

## Gamemaster Notes

### State Tracking
- Current track position for each player (node ID)
- Cards in each player's hand
- Current battle state (leader, current highest play, who has passed)
- Draw pile and discard pile

### Round Flow
1. Battle leader plays opening card(s)
2. Cycle through players for beat/pass decisions
3. When all pass consecutively, winner advances
4. Refill hands, winner becomes new leader
5. Check win condition (anyone at Finish?)
6. Repeat

### Victory Check
Player wins when:
- Current position is "Finish"
- Has visited all checkpoints (tracked in visitedCheckpoints array)
