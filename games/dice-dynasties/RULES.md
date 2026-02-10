---
name: "Dice Dynasties"
version: "1.0"
players: 2-4
win_condition: "score >= 40"
max_rounds: 12

mechanics:
  # Dice rolling with re-roll and lock
  dice_rolling:
    dice_count: 3
    dice_sides: 6
    roll_action: true
    roll_purposes: ["production", "action"]
    modifiers:
      flat_bonus: 0
      per_die_bonus: 0
    track_last_roll: true

  re_rolling_and_locking:
    max_rerolls: 2
    dice_count: 3
    dice_sides: 6
    auto_lock_on_max: true

  # Die icons resolve into resources
  die_icon_resolution:
    dice_count: 3
    icons:
      gold:
        weight: 2
        effect: { type: "gain_resource", resource: "gold", amount: 2 }
        value: 1
      ore:
        weight: 2
        effect: { type: "gain_resource", resource: "ore", amount: 2 }
        value: 2
      gem:
        weight: 1
        effect: { type: "gain_resource", resource: "gems", amount: 1 }
        value: 3
      star:
        weight: 1
        effect: { type: "gain_resource", resource: "victory_points", amount: 1 }
        value: 6

  # Random production triggered each round
  random_production:
    dice_count: 1
    dice_sides: 6
    per_player: false
    production_table:
      "1": { gold: 1 }
      "2": { gold: 1 }
      "3": { ore: 1 }
      "4": { ore: 1 }
      "5": { gems: 1 }
      "6": { gold: 2, ore: 1 }

  # Economic: investments mature over time
  investment:
    maturity_rounds: 3
    return_multiplier: 2.0
    max_investments: 3

  # Loans for quick cash
  loans:
    max_loans: 2
    loan_amount: 5
    interest_rate: 0.5
    resource: "gold"
    repayment_deadline: 4
    penalty: { type: "score", amount: -5 }

  # Commodity speculation with fluctuating prices
  commodity_speculation:
    starting_cash: 10
    commodities:
      - { id: "silk", name: "Silk", price: 4, minPrice: 2, maxPrice: 10, volatility: 0.3 }
      - { id: "spice", name: "Spice", price: 3, minPrice: 1, maxPrice: 8, volatility: 0.4 }
      - { id: "jade", name: "Jade", price: 6, minPrice: 3, maxPrice: 12, volatility: 0.25 }

  # Turn order: richest player goes last (catch-up)
  turn_order_stat_based:
    stat: "score"
    descending: false
    trigger: "round_start"

  # Advantage token for first player each round
  advantage_token:
    tokens:
      - { id: "market_insider", name: "Market Insider", effect: { type: "peek_commodity", description: "See next price change" } }
      - { id: "royal_favor", name: "Royal Favor", effect: { type: "bonus_die", description: "Roll 1 extra die this turn" } }
    pass_on_use: true

  # Resources
  resources:
    - { name: "gold", starting_amount: 8, max: 50 }
    - { name: "ore", starting_amount: 3, max: 30 }
    - { name: "gems", starting_amount: 0, max: 20 }
    - { name: "victory_points", starting_amount: 0, max: 99 }

  # Action points for turn structure
  action_points:
    points_per_turn: 3
    action_costs:
      roll: 1
      invest: 1
      take_loan: 1
      repay_loan: 1
      buy_commodity: 1
      sell_commodity: 1
      use_advantage: 0
      pass: 0
    rollover: false

  win_score_threshold: { threshold: 40 }
---

# Dice Dynasties

A dice-driven economic game where merchant dynasties roll dice to produce goods, speculate on commodity markets, and invest for long-term returns.

## Objective

Be the first dynasty to reach **40 victory points** through commodity trading, investments, and resource conversion.

## Setup

1. Each player starts with:
   - 8 gold, 3 ore, 0 gems, 0 victory points
   - No active investments or loans
2. Place the commodity market board showing Silk (4g), Spice (3g), Jade (6g)
3. Shuffle advantage tokens and deal 1 to each player
4. Lowest-scoring player goes first (turn order updates each round)

## Turn Structure

Each turn you have **3 Action Points (AP)** to spend:

| Action | Cost | Description |
|--------|------|-------------|
| Roll Dice | 1 AP | Roll 3 dice and resolve icons for resources |
| Invest | 1 AP | Invest gold (returns 2x after 3 rounds) |
| Take Loan | 1 AP | Borrow 5 gold (repay 8 within 4 rounds) |
| Repay Loan | 1 AP | Pay off an outstanding loan |
| Buy Commodity | 1 AP | Purchase commodities at market price |
| Sell Commodity | 1 AP | Sell commodities at market price |
| Use Advantage | 0 AP | Play an advantage token for its effect |
| Pass | 0 AP | End your turn |

## Dice System

### Rolling
Roll **3 six-sided dice**. Each die face shows an icon:

| Icon | Frequency | Effect |
|------|-----------|--------|
| Gold | 2 faces | Gain 2 gold |
| Ore | 2 faces | Gain 2 ore |
| Gem | 1 face | Gain 1 gem |
| Star | 1 face | Gain 1 victory point |

### Re-rolling and Locking
After your initial roll, you may **re-roll up to 2 times**:
- **Lock** any dice you want to keep
- **Re-roll** the unlocked dice
- After 2 re-rolls, all remaining dice are locked automatically
- **Bank** your results to collect resources

## Commodity Market

Three commodities fluctuate in price each round:

| Commodity | Base Price | Min | Max | Volatility |
|-----------|-----------|-----|-----|------------|
| Silk | 4 gold | 2 | 10 | 30% |
| Spice | 3 gold | 1 | 8 | 40% |
| Jade | 6 gold | 3 | 12 | 25% |

- **Buy** at current price, hoping prices rise
- **Sell** at current price to lock in profits
- Prices shift randomly each round based on volatility
- Higher volatility = bigger swings = higher risk/reward

## Investments

Invest gold for guaranteed returns:
- **Cost**: Any amount of gold
- **Maturity**: 3 rounds after investing
- **Return**: 2x your investment (invest 5, get 10 back)
- **Limit**: Maximum 3 active investments at once
- Great for converting early gold into late-game wealth

## Loans

Need quick cash? Take a loan:
- **Borrow**: 5 gold immediately
- **Repay**: 8 gold (50% interest) within 4 rounds
- **Penalty**: -5 victory points if not repaid on time!
- **Limit**: Maximum 2 loans at once
- High risk, but can fund big commodity plays

## Random Production

At the start of each round, a **production die** is rolled:

| Roll | Bonus |
|------|-------|
| 1-2 | All players gain 1 gold |
| 3-4 | All players gain 1 ore |
| 5 | All players gain 1 gem |
| 6 | All players gain 2 gold + 1 ore |

## Advantage Tokens

Special one-use abilities that pass between players:

- **Market Insider**: See the next price change before buying/selling
- **Royal Favor**: Roll 1 extra die on your next roll

After using a token, it passes to the next player.

## Turn Order

Turn order is recalculated each round based on **score** (lowest score goes first). This creates a natural catch-up mechanism — trailing players get first pick of market opportunities.

## Scoring

Victory points are earned from:
1. **Star icons** on dice (1 VP each)
2. **Commodity profits** (sell higher than buy price → 1 VP per gold profit)
3. **Investment returns** (1 VP per 5 gold returned)
4. **Resource conversion**: Spend 5 ore + 2 gems = 3 VP

## Winning

First player to reach **40 victory points** wins immediately.

If no one reaches 40 by round 12, the player with the most VP wins. Ties broken by total gold + commodity value.

## Strategy Tips

1. **Early investments** pay off big in late rounds
2. **Spice** is volatile — high risk but can double your money
3. **Jade** is stable — safe but slower returns
4. **Loans** are dangerous but can fund a massive commodity play
5. **Watch turn order** — being last lets you see market moves first
6. **Lock Star dice** — direct VP is guaranteed value
7. **Convert ore + gems** late game for a VP burst
