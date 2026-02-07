---
name: "Rondel Express"
version: "1.0"
players: 2-4
win_condition: "highest_score"
max_rounds: 12

mechanics:
  # Rondel wheel for action selection
  rondel:
    free_steps: 3
    cost_per_extra_step: 1
    segments:
      - { id: "load", name: "Loading Dock", action: "pickup_cargo" }
      - { id: "market", name: "Market", action: "sell_commodity" }
      - { id: "depot", name: "Supply Depot", action: "gain_resource" }
      - { id: "upgrade", name: "Upgrade Station", action: "research" }
      - { id: "express", name: "Express Lane", action: "advance_track" }
      - { id: "contract", name: "Contract Office", action: "take_contract" }
      - { id: "dock", name: "Delivery Dock", action: "deliver_cargo" }
      - { id: "rest", name: "Rest Stop", action: "draw" }

  # Track movement along the delivery route
  track_movement:
    track_length: 10
    points_per_space: 1
    loop: true

  # Pick up and deliver contracts
  pick_up_and_deliver:
    cargo_capacity: 3
    contracts:
      - { id: "c1", cargo: "electronics", pickup: "factory", delivery: "downtown", reward: { gold: 5 } }
      - { id: "c2", cargo: "produce", pickup: "farm", delivery: "market_district", reward: { gold: 3 } }
      - { id: "c3", cargo: "luxury_goods", pickup: "port", delivery: "uptown", reward: { gold: 8 } }
      - { id: "c4", cargo: "building_materials", pickup: "quarry", delivery: "construction_site", reward: { gold: 4 } }
      - { id: "c5", cargo: "medical_supplies", pickup: "warehouse", delivery: "hospital", reward: { gold: 6 } }
      - { id: "c6", cargo: "fuel", pickup: "refinery", delivery: "airport", reward: { gold: 7 } }

  # Contracts system for deliveries
  contracts:
    max_active: 2
    available_count: 3
    refill: true
    contracts:
      - { id: "express_delivery", name: "Express Delivery", requirements: { fuel: 2 }, rewards: { gold: 6 }, points: 4 }
      - { id: "bulk_shipment", name: "Bulk Shipment", requirements: { fuel: 1, cargo_delivered: 2 }, rewards: { gold: 8 }, points: 5 }
      - { id: "priority_mail", name: "Priority Mail", requirements: { fuel: 3 }, rewards: { gold: 10 }, points: 7 }
      - { id: "regular_route", name: "Regular Route", requirements: { fuel: 1 }, rewards: { gold: 3 }, points: 2 }

  # Ownership of delivery zones
  ownership:
    properties:
      - { id: "downtown", name: "Downtown Hub", price: 8, income: 2 }
      - { id: "market_district", name: "Market District", price: 5, income: 1 }
      - { id: "uptown", name: "Uptown Depot", price: 10, income: 3 }
      - { id: "industrial_park", name: "Industrial Park", price: 6, income: 2 }
    income_trigger: "round_start"
    income_resource: "gold"

  # Turn order based on who passed first
  turn_order_pass_order:
    first_passer_first: true
    track_within_round: true
    compensation:
      type: "resource"
      resource: "gold"
      base_amount: 1
      per_position: 1

  # Board for delivery locations
  board:
    states: ["factory", "farm", "port", "quarry", "warehouse", "refinery", "downtown", "market_district", "uptown", "construction_site", "hospital", "airport", "industrial_park"]
    start: "factory"
    edges:
      - { from: "factory", to: ["downtown", "warehouse"] }
      - { from: "farm", to: ["market_district", "warehouse"] }
      - { from: "port", to: ["uptown", "downtown"] }
      - { from: "quarry", to: ["construction_site", "industrial_park"] }
      - { from: "warehouse", to: ["hospital", "factory", "farm"] }
      - { from: "refinery", to: ["airport", "industrial_park"] }
      - { from: "downtown", to: ["market_district", "uptown"] }
      - { from: "market_district", to: ["downtown", "construction_site"] }

  # Resources
  resources:
    - { name: "gold", starting_amount: 10, max: 50 }
    - { name: "fuel", starting_amount: 3, max: 10 }

  # Action points
  action_points:
    points_per_turn: 2
    action_costs:
      rondel_move: 0
      pickup_cargo: 1
      deliver_cargo: 1
      take_contract: 1
      fulfill_contract: 1
      advance_track: 1
      buy_stock: 1
      sell_stock: 1
      pass: 0
    rollover: false

  # Cards for event/bonus draws
  cards:
    starting_hand: 3
    deck:
      - { name: "Shortcut", count: 3, type: "event", effect: { type: "bonus_movement", value: 2 } }
      - { name: "Tip-Off", count: 3, type: "event", effect: { type: "peek_contracts", value: 2 } }
      - { name: "Fuel Tank", count: 4, type: "resource", effect: { type: "gain_resource", resource: "fuel", value: 2 } }
      - { name: "Warehouse Pass", count: 3, type: "event", effect: { type: "extra_cargo", value: 1 } }
      - { name: "Speed Boost", count: 2, type: "event", effect: { type: "free_rondel_steps", value: 2 } }
      - { name: "Insurance", count: 2, type: "event", effect: { type: "protect_cargo" } }
---

# Rondel Express

A logistics game where delivery drivers navigate a circular action rondel, pick up cargo, deliver goods along routes, and invest in delivery hubs. The rondel constrains your choices — you can only do what you can reach!

## Objective

Earn the **highest score** over 12 rounds through cargo deliveries, contract fulfillment, property ownership, and track advancement.

## Setup

1. Each player starts with:
   - 10 gold and 3 fuel
   - 3 cards in hand
   - Position on rondel segment 0 (Loading Dock)
   - Empty cargo hold (capacity: 3)
2. Reveal 3 delivery contracts face-up
3. Set up the delivery map with pickup/delivery locations
4. Place property cards near the board

## Gameplay

## The Rondel

The action rondel is a circular wheel with 8 segments:

```
        [Loading Dock]
       /              \
  [Rest Stop]      [Market]
     |                  |
  [Delivery Dock]  [Supply Depot]
     |                  |
  [Contract Office] [Upgrade Station]
       \              /
        [Express Lane]
```

### Moving on the Rondel
- Each turn, move your token **clockwise** on the rondel
- **First 3 steps are free**
- Each additional step costs **1 gold**
- You **must** perform the action of the segment you land on (or pass)
- Strategy: sometimes it's worth paying extra to reach a key action

### Rondel Actions

| Segment | Action | Description |
|---------|--------|-------------|
| Loading Dock | Pick Up Cargo | Load cargo into your hold |
| Market | Sell | Sell commodities at current prices |
| Supply Depot | Gain Resources | Receive 2 fuel |
| Upgrade Station | Research/Upgrade | Buy property or upgrade your truck |
| Express Lane | Advance Track | Move forward on the delivery track |
| Contract Office | Take Contract | Claim a delivery contract |
| Delivery Dock | Deliver Cargo | Complete a delivery for reward |
| Rest Stop | Draw Cards | Draw 2 cards |

## Cargo System

### Pick Up and Deliver
1. **Pick up** cargo at source locations (costs 1 AP)
2. **Carry** up to 3 cargo items at once
3. **Deliver** to destination locations (costs 1 AP, earns gold)

Available deliveries:

| Cargo | From | To | Reward |
|-------|------|----|--------|
| Electronics | Factory | Downtown | 5 gold |
| Produce | Farm | Market District | 3 gold |
| Luxury Goods | Port | Uptown | 8 gold |
| Building Materials | Quarry | Construction Site | 4 gold |
| Medical Supplies | Warehouse | Hospital | 6 gold |
| Fuel | Refinery | Airport | 7 gold |

### Delivery Map

```
[Factory] ── [Downtown] ── [Uptown]
    |             |            |
[Warehouse] ── [Market Dist] ── [Port]
    |             |
[Hospital]  [Construction Site] ── [Industrial Park]
                                      |
                              [Refinery] ── [Airport]
```

## Track Movement

A linear track (10 spaces, looping) measures your overall progress:
- Advance by visiting the Express Lane or completing deliveries
- Each space = 1 VP at game end
- Track position determines tie-breakers
- Complete a full loop for bonus 5 VP

## Contracts

Formal delivery agreements for bonus rewards:

| Contract | Requires | Reward | VP |
|----------|----------|--------|----|
| Regular Route | 1 fuel | 3 gold | 2 |
| Express Delivery | 2 fuel | 6 gold | 4 |
| Bulk Shipment | 1 fuel + 2 deliveries | 8 gold | 5 |
| Priority Mail | 3 fuel | 10 gold | 7 |

- Maximum 2 active contracts
- Fulfill by spending required resources

## Property Ownership

Buy delivery hubs for ongoing income:

| Property | Price | Income/Round |
|----------|-------|-------------|
| Market District | 5 gold | 1 gold |
| Downtown Hub | 8 gold | 2 gold |
| Industrial Park | 6 gold | 2 gold |
| Uptown Depot | 10 gold | 3 gold |

Properties pay income at the start of each round. The earlier you buy, the more you earn!

## Turn Order

Determined by **pass order** from the previous round:
- First player to pass gets to go **first** next round
- But passing early means giving up actions this round!
- **Compensation**: Later positions get gold (1 base + 1 per position)
- Creates a tension: pass early for position, or act more this round

## Cards

Draw cards at the Rest Stop:

| Card | Effect |
|------|--------|
| Shortcut | +2 bonus movement on delivery map |
| Tip-Off | Peek at top 2 unrevealed contracts |
| Fuel Tank | Gain 2 fuel |
| Warehouse Pass | +1 cargo capacity this turn |
| Speed Boost | +2 free rondel steps this turn |
| Insurance | Protect cargo from events |

## Scoring

| Source | Points |
|--------|--------|
| Track position | 1 VP per space |
| Completed deliveries | 2 VP each |
| Fulfilled contracts | 2-7 VP each |
| Gold remaining | 1 VP per 5 gold |
| Properties owned | 3 VP each |
| Full track loop | 5 VP bonus |

## Winning

After 12 rounds, the player with the **highest score** wins.

Ties broken by: track position, then gold remaining.

## Strategy Tips

1. **Plan your rondel path** — you can't go backwards!
2. **3 free steps** usually reach what you need; spend gold only for critical actions
3. **Luxury Goods** (8 gold reward) are the most lucrative delivery
4. **Buy properties early** — they compound over 12 rounds
5. **Fuel management** is critical — contracts consume fuel
6. **Pass order tension** — going first is powerful, but costs you a turn
7. **Cards from Rest Stop** can create surprising plays

## Mechanic Interplay

This game showcases movement and logistics mechanics:
- **Rondel + Action Selection**: The wheel constrains your options each turn
- **Pick-up-and-Deliver + Track Movement**: Deliveries advance your track position
- **Contracts + Ownership**: Short-term vs long-term income strategies
- **Turn Order (Pass Order)**: Passing creates a timing tension unique to this game
- **Looping Track**: Creates a "lap bonus" race within the economic game
