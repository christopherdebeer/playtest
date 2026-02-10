---
name: "Alliance"
version: "1.0"
players: 2-4
win_condition: "score >= 25"
max_rounds: 15

mechanics:
  cooperative_actions:
    shared_pool:
      supplies: 10
      morale: 5
    threat_per_round: 1
    max_threat: 10

  tableau_building:
    max_size: 6
    placement_cost: {}
    synergy_bonuses:
      - { card_types: ["building", "unit"], bonus_type: "score", amount: 2 }
    score_per_card: 3

  resources:
    - { name: "gold", starting_amount: 5, max: 20 }
    - { name: "food", starting_amount: 3, max: 15 }

  cards:
    starting_hand: 4
    deck:
      - { name: "Watchtower", count: 3, type: "building", effect: { type: "score", value: 3 } }
      - { name: "Farm", count: 3, type: "building", effect: { type: "resource", resource: "food", value: 2 } }
      - { name: "Barracks", count: 3, type: "building", effect: { type: "score", value: 2 } }
      - { name: "Scout", count: 4, type: "unit", effect: { type: "score", value: 2 } }
      - { name: "Healer", count: 3, type: "unit", effect: { type: "resource", resource: "food", value: 1 } }
      - { name: "Trader", count: 3, type: "unit", effect: { type: "resource", resource: "gold", value: 2 } }

  hand_management: true

  win_score_threshold: { threshold: 25 }
---

# Alliance

A semi-cooperative tableau-building game where players balance individual success with collective survival.

## Overview

Players work together to manage shared resources while competing to build the highest-scoring tableau. A rising threat endangers everyone - if it reaches maximum, all players lose. But only one player can win by reaching 25 points first.

## Setup

1. Each player starts with **5 gold** and **3 food**
2. Deal **4 cards** to each player from the shuffled deck
3. Initialize the shared pool: **10 supplies**, **5 morale**
4. Set threat level to **0** (max: 10)
5. Randomly determine turn order

## Card Types

| Card | Type | Count | Effect |
|------|------|-------|--------|
| Watchtower | Building | 3 | +3 score |
| Farm | Building | 3 | +2 food |
| Barracks | Building | 3 | +2 score |
| Scout | Unit | 4 | +2 score |
| Healer | Unit | 3 | +1 food |
| Trader | Unit | 3 | +2 gold |

**Synergy Bonus**: Building + Unit in your tableau = +2 score

## Gameplay

### Turn Structure

On your turn, choose ONE action:

**1. Build a Card**
- Play a card from your hand to your tableau (max 6 cards)
- Gain the card's effect immediately
- Score +3 points per card in tableau

**2. Contribute to Shared Pool**
- Spend your resources to add to supplies or morale
- Reduces threat by 1 for every 2 resources contributed

**3. Draw a Card**
- Draw 1 card from the deck

**4. Pass**
- Do nothing this turn

### Threat Phase (End of Each Round)

After all players have taken a turn:
- Threat increases by **1**
- If shared supplies < 3, threat increases by an additional **1**
- If shared morale = 0, threat increases by an additional **2**

## Winning

**Victory Condition**: First player to reach **25 points** wins.

**Loss Condition**: If threat reaches **10**, ALL players lose (cooperative failure).

## Strategy Tips

- Balance personal tableau building with shared pool maintenance
- Building + Unit synergies are worth pursuing (+2 bonus each)
- Don't let morale hit 0 - the threat acceleration is devastating
- Watch opponents' scores - if someone is close to 25, you may need to focus on your own points
