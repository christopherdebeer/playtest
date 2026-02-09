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

# Battle Forge

A worker placement and market trading game where players compete to forge their way to victory.

## Overview

Players manage a team of workers, placing them at various locations to gather resources. Trade commodities at fluctuating market prices to maximize profit. Use action points wisely to outmaneuver opponents and be the first to reach 30 points.

## Setup

1. Each player starts with **10 gold** and **0 ore**
2. Each player receives **3 workers**
3. Deal **3 cards** to each player
4. Initialize market: **Ore** (10 supply, price 3), **Gems** (8 supply, price 5)
5. All worker placement spaces start empty
6. Randomly determine turn order

## Worker Placement Spaces

| Space | Capacity | Reward |
|-------|----------|--------|
| Mine | 2 workers | +2 ore |
| Market | 2 workers | +1 gold |
| Forge | 1 worker | +3 score |
| Barracks | 1 worker | +2 score |

## Card Types

| Card | Type | Count | Effect |
|------|------|-------|--------|
| Apprentice | Worker | 4 | +1 bonus worker |
| Forge Hammer | Tool | 3 | +2 score |
| Trade Route | Event | 3 | +3 gold |
| Ore Vein | Event | 3 | +2 ore |
| Master Smith | Worker | 2 | +5 score |

## Gameplay

### Action Points

Each turn you have **4 action points** to spend. Unspent points do NOT roll over.

| Action | Cost |
|--------|------|
| Place Worker | 1 AP |
| Retrieve Workers | 1 AP |
| Buy from Market | 1 AP |
| Sell to Market | 1 AP |
| Draw Card | 1 AP |
| Play Card | 1 AP |
| Pass | 0 AP |

### Actions Explained

**Place Worker**: Put one of your available workers on an empty slot at a location. Immediately gain that location's reward.

**Retrieve Workers**: Return ALL your placed workers to your available pool. (Workers are also automatically retrieved at the start of each round.)

**Buy from Market**: Spend gold to purchase a commodity. Price = current market price.

**Sell to Market**: Sell a commodity for gold. Price = current market price.

**Draw Card**: Take the top card from the deck into your hand.

**Play Card**: Play a card from your hand for its effect.

### Market Dynamics

Market prices fluctuate based on supply and demand:
- **Price volatility**: ±20% per transaction
- **Price floor**: 1 gold (minimum)
- **Price ceiling**: 20 gold (maximum)
- Buying increases price, selling decreases price

### Round Structure

1. All workers are retrieved (return to players)
2. Players take turns spending action points
3. Market prices may shift based on transactions

## Winning

**Victory Condition**: First player to reach **30 points** wins immediately.

## Strategy Tips

- The Forge (3 points) is highly contested with only 1 slot - get there early
- Buy low, sell high - market timing is crucial
- Master Smith cards are rare but worth 5 points each
- Balance resource gathering with scoring opportunities
- Watch opponent point totals - the game can end suddenly
