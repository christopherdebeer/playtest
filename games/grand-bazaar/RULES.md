---
name: "Grand Bazaar"
version: "1.0"
players: 3-5
win_condition: "highest_score"
max_rounds: 10

mechanics:
  # English auction for premium lots
  auction_english:
    type: "english"
    currency: "gold"
    min_increment: 1
    items:
      - { id: "silk_bundle", name: "Silk Bundle", base_value: 8 }
      - { id: "spice_crate", name: "Spice Crate", base_value: 6 }
      - { id: "gem_pouch", name: "Gem Pouch", base_value: 12 }
      - { id: "exotic_rug", name: "Exotic Rug", base_value: 10 }
      - { id: "golden_idol", name: "Golden Idol", base_value: 15 }

  # Sealed bid for secret lots
  auction_sealed_bid:
    currency: "gold"
    allow_tie_winning: false
    reveal_all_bids: true

  # Once-around for quick sales
  auction_once_around:
    currency: "gold"
    min_increment: 1
    starting_bid: 1

  # Contract fulfillment
  contracts:
    max_active: 3
    available_count: 4
    refill: true
    contracts:
      - { id: "silk_order", name: "Silk Order", requirements: { silk: 3 }, rewards: { gold: 8 }, points: 5 }
      - { id: "spice_order", name: "Spice Order", requirements: { spice: 3 }, rewards: { gold: 6 }, points: 4 }
      - { id: "gem_order", name: "Gem Order", requirements: { gems: 2 }, rewards: { gold: 10 }, points: 6 }
      - { id: "mixed_order", name: "Mixed Goods Order", requirements: { silk: 1, spice: 1, gems: 1 }, rewards: { gold: 7 }, points: 5 }
      - { id: "luxury_order", name: "Luxury Order", requirements: { silk: 2, gems: 2 }, rewards: { gold: 15 }, points: 8 }
      - { id: "bulk_spice", name: "Bulk Spice Deal", requirements: { spice: 5 }, rewards: { gold: 12 }, points: 7 }

  # Stock holding in trading companies
  stock_holding:
    starting_cash: 0
    companies:
      - { id: "silk_guild", name: "Silk Guild", price: 5, dividend: 2, totalShares: 8 }
      - { id: "spice_caravan", name: "Spice Caravan", price: 3, dividend: 1, totalShares: 10 }
      - { id: "gem_exchange", name: "Gem Exchange", price: 8, dividend: 3, totalShares: 6 }

  # I-Cut-You-Choose for splitting contested goods
  i_cut_you_choose:
    num_groups: 2
    chooser_order: "reverse"
    cutter_gets_last: true

  # Turn order determined by bidding
  turn_order_auction:
    currency: "gold"
    when: "round_start"
    tie_breaker: "current_order"

  # Resources
  resources:
    - { name: "gold", starting_amount: 20, max: 99 }
    - { name: "silk", starting_amount: 0, max: 20 }
    - { name: "spice", starting_amount: 0, max: 20 }
    - { name: "gems", starting_amount: 0, max: 15 }

  # Action points
  action_points:
    points_per_turn: 3
    action_costs:
      bid: 0
      auction_pass: 0
      sealed_bid: 0
      once_around_bid: 0
      once_around_pass: 0
      take_contract: 1
      fulfill_contract: 1
      buy_stock: 1
      sell_stock: 1
      divide_items: 0
      choose_group: 0
      turn_order_bid: 0
      pass: 0
    rollover: false

  win_highest_lowest_scoring: { mode: "highest" }
---

# Grand Bazaar

An auction and trading game where merchants compete for exotic goods, fulfill lucrative contracts, and invest in powerful trading guilds.

## Objective

Earn the **highest score** over 10 rounds through auctions, contract fulfillment, and stock dividends.

## Setup

1. Each player starts with:
   - 20 gold coins
   - No goods or stocks
2. Shuffle contract cards and reveal 4 face-up
3. Set up the three trading company stock boards
4. Prepare auction lots for round 1

## Gameplay

## Round Structure

Each round has 4 phases:

### Phase 1: Turn Order Auction
All players secretly bid gold for turn position. Higher bids go earlier. Gold spent on turn order is gone! This creates a tension: spend gold for position, or save it for goods.

### Phase 2: Auctions
Three auction types rotate through the game:

#### English Auction (Rounds 1, 4, 7, 10)
An item is revealed. Players bid openly, each bid must exceed the previous by at least 1 gold. Last bidder standing wins the item.

#### Sealed Bid (Rounds 2, 5, 8)
An item is revealed. All players simultaneously submit secret bids. Highest bid wins. All bids are revealed afterward — information is power!

#### Once-Around (Rounds 3, 6, 9)
An item is revealed. Starting from the first player, each player gets exactly one chance to bid or pass. Must beat the current highest bid. Once passed, you're out.

### Phase 3: Actions (3 AP each)
Players take turns spending their 3 action points:

| Action | Cost | Description |
|--------|------|-------------|
| Take Contract | 1 AP | Claim a face-up contract (max 3 active) |
| Fulfill Contract | 1 AP | Deliver required goods, earn rewards + VP |
| Buy Stock | 1 AP | Purchase shares in a trading company |
| Sell Stock | 1 AP | Sell shares back at current price |
| Pass | 0 AP | End your turn |

### Phase 4: Dividends & Upkeep
- Trading companies pay **dividends** to shareholders
- New contracts are revealed to refill the display
- Commodity prices may shift

## Auction Lots

Premium goods available at auction:

| Lot | Contains | Base Value |
|-----|----------|-----------|
| Silk Bundle | 3 silk | 8 gold |
| Spice Crate | 3 spice | 6 gold |
| Gem Pouch | 2 gems | 12 gold |
| Exotic Rug | (2 silk + 1 spice) | 10 gold |
| Golden Idol | (trophy item) | 15 gold |

## Contracts

Fulfill contracts by delivering required goods:

| Contract | Requires | Reward | VP |
|----------|----------|--------|----|
| Silk Order | 3 silk | 8 gold | 5 |
| Spice Order | 3 spice | 6 gold | 4 |
| Gem Order | 2 gems | 10 gold | 6 |
| Mixed Goods | 1 silk + 1 spice + 1 gem | 7 gold | 5 |
| Luxury Order | 2 silk + 2 gems | 15 gold | 8 |
| Bulk Spice | 5 spice | 12 gold | 7 |

- Maximum 3 active contracts per player
- When a contract is fulfilled, new ones are drawn

## Trading Companies (Stocks)

Invest in trading guilds for ongoing income:

| Company | Share Price | Dividend | Total Shares |
|---------|-----------|----------|--------------|
| Silk Guild | 5 gold | 2 gold/round | 8 |
| Spice Caravan | 3 gold | 1 gold/round | 10 |
| Gem Exchange | 8 gold | 3 gold/round | 6 |

- Dividends pay out each round to all shareholders
- Share prices adjust based on demand
- Sell shares at current price to cash out

## I-Cut-You-Choose

When two players want the same auction lot, the **cutter** divides the contested goods into 2 groups. The other player **chooses** which group they want. The cutter gets what's left.

This ensures fair division — the cutter is incentivized to divide evenly!

## Scoring

| Source | Points |
|--------|--------|
| Fulfilled Contracts | 4-8 VP each |
| Gold remaining (end game) | 1 VP per 5 gold |
| Stock portfolio value | 1 VP per 5 gold value |
| Auction trophies (Golden Idol) | 5 VP |
| Most fulfilled contracts | 3 VP bonus |

## Winning

After 10 rounds, the player with the **highest score** wins.

Ties broken by: most gold remaining, then most goods, then most stocks.

## Strategy Tips

1. **Turn order matters** — being first in auctions is huge, but costs gold
2. **Sealed bids** reveal information — watch what others are willing to pay
3. **Stocks compound** — early stock purchases pay dividends for many rounds
4. **Contract chains** — buy goods at auction specifically to fulfill contracts
5. **Don't overbid** — the winner's curse is real; overpaying kills your economy
6. **I-Cut-You-Choose** — use this to ensure fair splits when competing for lots
7. **Balance income vs VP** — stocks give gold, contracts give VP

## Mechanic Interplay

This game showcases how auction types create different strategic textures:
- **English**: Information-rich (you see all bids) but can escalate
- **Sealed**: Information-poor (commit without knowing) but prevents runaway bidding
- **Once-around**: Quick but forces commitment — pass and you're done

The contract system gives purpose to auction purchases, while stocks provide an alternative investment path. Turn order auctions add a meta-layer: how much is going first worth?
