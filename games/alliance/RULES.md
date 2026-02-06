---
name: "Alliance"
version: "1.0"
players: 2-4
win_condition: "score >= 25"
max_rounds: 15

mechanics:
  cooperative:
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
---

# Rules
Players work together and independently to build tableaus while managing a shared resource pool.
Contribute resources to the shared pool to reduce threat. Build cards into your tableau for points.
If threat reaches maximum, everyone loses. First to 25 points wins.
