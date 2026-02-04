---
name: Parallel Race
players: 2-4
starting_state: Start
starting_cards: 3
deck:
  - name: Sprint
    count: 8
    effect:
      type: move_forward
      value: 2
  - name: Dash
    count: 6
    effect:
      type: move_forward
      value: 3
  - name: Burst
    count: 4
    effect:
      type: move_forward
      value: 4
  - name: Stumble
    count: 4
    effect:
      type: move_backward
      value: 1
  - name: Block
    count: 4
    type: interference
    effect:
      type: block_turn
      duration: 1
board:
  states:
    - Start
    - Mile 1
    - Mile 2
    - Mile 3
    - Mile 4
    - Mile 5
    - Finish
  edges:
    - from: Start
      to: Mile 1
    - from: Mile 1
      to: Mile 2
    - from: Mile 2
      to: Mile 3
    - from: Mile 3
      to: Mile 4
    - from: Mile 4
      to: Mile 5
    - from: Mile 5
      to: Finish
engine_mechanics:
  freeplay:
    actions_per_round: 8
    interaction_timeout: 30
    interaction_actions:
      - trade_offer
      - trade_respond
  win_condition:
    type: reach_state
    target_state: Finish
---

# Parallel Race

A fast-paced race game where all players move simultaneously! No waiting for turns - play as fast as you can!

## Overview

Race from Start to Finish by playing movement cards. Unlike traditional turn-based games, **all players can act at the same time**. The first player to reach the Finish line wins!

## Setup

1. Each player starts at the **Start** position
2. Each player draws 3 cards
3. When the game begins, ALL players can immediately start playing

## Gameplay

### Freeplay Mode

This game uses **freeplay mode** - there are no turns! You can:
- Play cards as fast as you want
- Draw cards when you need them
- Move along the track independently

The only time you need to wait is for **interaction actions** (like trading or blocking).

### Cards

| Card | Effect |
|------|--------|
| Sprint | Move forward 2 spaces |
| Dash | Move forward 3 spaces |
| Burst | Move forward 4 spaces |
| Stumble | Move backward 1 space (play on self or opponent) |
| Block | Target opponent skips their next action |

### Movement

The race track has 7 positions:
```
Start → Mile 1 → Mile 2 → Mile 3 → Mile 4 → Mile 5 → Finish
```

Play movement cards to advance along the track.

### Rounds

A round ends after **8 total actions** across all players. At round end:
- All players draw 1 card
- The race continues!

## Winning

The first player to reach the **Finish** position wins the race!

## Strategy Tips

- Play fast! Speed matters in freeplay mode
- Save Block cards for when opponents are close to winning
- Balance speed cards with hand management
- Watch what cards opponents are playing
