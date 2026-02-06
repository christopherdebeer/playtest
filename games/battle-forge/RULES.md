---
name: "Battle Forge"
version: "1.0"
players: 2-4
win_condition: "score >= 30"
max_rounds: 20

mechanics:
  action_points:
    points_per_turn: 4
    action_costs:
      place_worker: 1
      retrieve_workers: 1
      buy_market: 1
      sell_market: 1
      draw: 1
      play_card: 1
      pass: 0
    rollover: false

  worker_placement:
    spaces:
      - { id: "mine", name: "Mine", capacity: 2, reward: { resource: "ore", amount: 2 } }
      - { id: "market", name: "Market", capacity: 2, reward: { resource: "gold", amount: 1 } }
      - { id: "forge", name: "Forge", capacity: 1, reward: { resource: "score", amount: 3 } }
      - { id: "barracks", name: "Barracks", capacity: 1, reward: { resource: "score", amount: 2 } }
    workers_per_player: 3
    retrieve_on: "round_start"

  market:
    commodities:
      - { id: "ore", name: "Ore", base_price: 3, supply: 10 }
      - { id: "gems", name: "Gems", base_price: 5, supply: 8 }
    currency: "gold"
    price_volatility: 0.2
    price_floor: 1
    price_ceiling: 20

  resources:
    - { name: "gold", starting_amount: 10, max: 50 }
    - { name: "ore", starting_amount: 0, max: 30 }

  cards:
    starting_hand: 3
    deck:
      - { name: "Apprentice", count: 4, type: "worker", effect: { type: "bonus_worker", value: 1 } }
      - { name: "Forge Hammer", count: 3, type: "tool", effect: { type: "score", value: 2 } }
      - { name: "Trade Route", count: 3, type: "event", effect: { type: "resource", resource: "gold", value: 3 } }
      - { name: "Ore Vein", count: 3, type: "event", effect: { type: "resource", resource: "ore", value: 2 } }
      - { name: "Master Smith", count: 2, type: "worker", effect: { type: "score", value: 5 } }

  hand_management: true
---

# Rules
Players manage workers, gather resources, and trade at the market to score points.
Place workers at locations to gain rewards. Buy and sell commodities at fluctuating prices.
First to 30 points wins.
