---
name: "Parallel Race"
version: "1.0"
players: 2-4
win_condition: "First player to reach the Finish Line"
max_rounds: 20

mechanics:
  point_to_point_movement:
    nodes:
      - { id: "Start", name: "Starting Line", type: "checkpoint" }
      - { id: "Mile1", name: "Mile 1", type: "stage" }
      - { id: "Mile2", name: "Mile 2", type: "stage" }
      - { id: "Mile3", name: "Mile 3", type: "stage" }
      - { id: "Mile4", name: "Mile 4", type: "stage" }
      - { id: "Mile5", name: "Mile 5", type: "stage" }
      - { id: "Finish", name: "Finish Line", type: "finish" }
    routes:
      - { from: "Start", to: "Mile1", bidirectional: false, cost: 1 }
      - { from: "Mile1", to: "Mile2", bidirectional: false, cost: 1 }
      - { from: "Mile2", to: "Mile3", bidirectional: false, cost: 1 }
      - { from: "Mile3", to: "Mile4", bidirectional: false, cost: 1 }
      - { from: "Mile4", to: "Mile5", bidirectional: false, cost: 1 }
      - { from: "Mile5", to: "Finish", bidirectional: false, cost: 1 }
    starting_node: "Start"

  freeplay:
    actions_per_round: 8
    interaction_timeout: 30
    interaction_actions:
      - trade_offer
      - trade_respond

  win_race:
    goal_state: "Finish"

  cards:
    starting_hand: 3
    deck:
      - name: Sprint
        count: 8
        type: movement
        value: 2
        effect:
          type: move_forward
          value: 2
      - name: Dash
        count: 6
        type: movement
        value: 3
        effect:
          type: move_forward
          value: 3
      - name: Burst
        count: 4
        type: movement
        value: 4
        effect:
          type: move_forward
          value: 4
      - name: Stumble
        count: 4
        type: interference
        targetMode: "opponents"
        value: -1
        effect:
          type: move_backward
          value: 1
      - name: Block
        count: 4
        type: interference
        targetMode: "opponents"
        effect:
          type: block_turn
          duration: 1
          blocks_turn: true
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

The race track has 7 nodes along a linear path:
```
[Starting Line] → [Mile 1] → [Mile 2] → [Mile 3] → [Mile 4] → [Mile 5] → [Finish Line]
```

Use `move target:"Mile1"` style commands to advance along the track, or play movement cards that advance you forward.

### Rounds

A round ends after **8 total actions** across all players. At round end:
- All players draw 1 card
- The race continues!

## Winning

The first player to reach the **Finish** position wins the race!

## Strategy

- Play fast! Speed matters in freeplay mode
- Save Block cards for when opponents are close to winning
- Balance speed cards with hand management
- Watch what cards opponents are playing

## Gamemaster Notes

### Freeplay Mode
This game uses experimental freeplay mode where all players can act simultaneously. The gamemaster should:
- Allow any player to act at any time (no turn blocking)
- Track total actions across all players per round
- Trigger round advancement after 8 total actions
- Only block for interaction actions (trade_offer, trade_respond)

### Movement Tracking
Players move along a linear track from Start to Finish. Movement is handled via:
- Direct `move target:"Mile1"` commands
- Playing movement cards that advance forward

### Win Condition
First player to reach the "Finish" node wins immediately.

## Design Notes

This game was designed to test the experimental **freeplay mechanic** which enables parallel play without turn-based blocking. Key design decisions:

1. **Linear track** - Simple point-to-point movement makes it easy to visualize progress
2. **Card-based movement** - Players compete for movement resources through their hands
3. **Interference cards** - Block and Stumble cards add interaction without requiring synchronization
4. **Round-based structure** - Actions per round (8) creates natural pacing even without turns
5. **No trading in base game** - Keeps interactions minimal for testing freeplay flow
