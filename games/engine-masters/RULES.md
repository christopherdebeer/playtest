---
name: "Engine Masters"
version: "1.0"
players: 2-4
starting_cards: 3
win_condition: "First player to reach 50 victory points"
max_rounds: 30

# Mechanics from BGG taxonomy
mechanics:
  - deck-bag-and-pool-building
  - automatic-resource-growth
  - chaining

# Engine mechanics configuration
engine_mechanics:
  # Deck Building: Personal deck acquisition
  deck_building:
    starting_deck:
      - { name: "Copper Generator", type: "generator", effect: { type: "resource", resource: "power", value: 1 } }
      - { name: "Copper Generator", type: "generator", effect: { type: "resource", resource: "power", value: 1 } }
      - { name: "Copper Generator", type: "generator", effect: { type: "resource", resource: "power", value: 1 } }
      - { name: "Basic Assembler", type: "action", effect: { type: "draw", value: 1 } }
      - { name: "Basic Assembler", type: "action", effect: { type: "draw", value: 1 } }
    supply:
      # Tier 1 - Basic cards
      - card: { name: "Bronze Generator", type: "generator", effect: { type: "resource", resource: "power", value: 2 } }
        count: 8
        cost: 3
      - card: { name: "Workshop", type: "action", effect: { type: "draw", value: 2 } }
        count: 6
        cost: 4
      - card: { name: "Recycler", type: "action", effect: { type: "trash_for_points", value: 2 } }
        count: 4
        cost: 3
      # Tier 2 - Advanced cards
      - card: { name: "Silver Generator", type: "generator", effect: { type: "resource", resource: "power", value: 3 } }
        count: 6
        cost: 6
      - card: { name: "Factory", type: "action", effect: { type: "draw", value: 3 } }
        count: 4
        cost: 7
      - card: { name: "Chain Reactor", type: "combo", effect: { type: "chain_trigger", value: 1 } }
        count: 4
        cost: 5
      - card: { name: "Engine Upgrade", type: "upgrade", effect: { type: "engine_level_up", value: 1 } }
        count: 6
        cost: 5
      # Tier 3 - Power cards
      - card: { name: "Gold Generator", type: "generator", effect: { type: "resource", resource: "power", value: 5 } }
        count: 4
        cost: 10
      - card: { name: "Mega Factory", type: "action", effect: { type: "draw", value: 4 } }
        count: 3
        cost: 11
      - card: { name: "Victory Engine", type: "victory", effect: { type: "score", value: 6 } }
        count: 4
        cost: 12
      - card: { name: "Combo Master", type: "combo", effect: { type: "double_chain", value: 2 } }
        count: 3
        cost: 9
      # Special cards
      - card: { name: "Catalyst Core", type: "catalyst", effect: { type: "growth_boost", value: 0.1 } }
        count: 4
        cost: 8
    currency: "power"
    draw_count: 5
    acquire_to: "discard"
    allow_trash: true
    trash_pile: "junkyard"

  # Automatic Resource Growth: Engine power accumulates
  automatic_resource_growth:
    rules:
      - resource: "power"
        rate: 0.1
        timing: "turn"
        min: 0
        max: 50
        rounding: "floor"
      - resource: "engine_bonus"
        fixed_per: 1
        threshold: 1
        timing: "turn"
        min: 0

  # Chaining: Card combos trigger follow-up effects
  chaining:
    rules:
      # Playing generator cards triggers power bonus
      - id: "generator_chain"
        name: "Generator Synergy"
        trigger:
          type: "card_type"
          match: "generator"
        effect:
          type: "resource"
          resource: "power"
          amount: 1
        max_per_turn: 3

      # Playing combo cards triggers extra draw
      - id: "combo_chain"
        name: "Combo Draw"
        trigger:
          type: "card_type"
          match: "combo"
        effect:
          type: "draw"
          count: 1
        max_per_turn: 2

      # Playing action cards after a combo card scores points
      - id: "action_after_combo"
        name: "Action Combo"
        trigger:
          type: "card_type"
          match: "action"
        effect:
          type: "score"
          amount: 1
        condition:
          type: "has_resource"
          match: "combo_active"
          value: 1
          comparison: ">="
        max_per_turn: 2

      # Acquiring cards chains into score bonus at high engine level
      - id: "acquisition_bonus"
        name: "Acquisition Mastery"
        trigger:
          type: "action"
          action_type: "acquire"
        effect:
          type: "score"
          amount: 2
        condition:
          type: "has_resource"
          match: "engine_level"
          value: 3
          comparison: ">="
        max_per_turn: 2

      # Playing upgrade cards triggers resource boost
      - id: "upgrade_chain"
        name: "Upgrade Synergy"
        trigger:
          type: "card_type"
          match: "upgrade"
        effect:
          type: "resource"
          resource: "power"
          amount: 3
        max_per_turn: 1

      # Victory cards trigger extra actions when chained
      - id: "victory_momentum"
        name: "Victory Momentum"
        trigger:
          type: "card_type"
          match: "victory"
        effect:
          type: "extra_action"
          count: 1
        max_per_game: 3

    max_chain_depth: 3

  # Win condition
  win_score_threshold:
    threshold: 50
    resource: "score"

# Player starting state
starting_state:
  resources:
    power: 3
    engine_level: 1
    engine_bonus: 0
    combo_active: 0
  score: 0
---

# Engine Masters

A competitive engine-building card game where players construct powerful production chains, grow their resource engines, and chain actions together for devastating combos. Build your personal deck, optimize your engine, and race to 50 victory points!

## Game Concept

In Engine Masters, you are an industrial tycoon competing to build the most efficient production engine. Each turn your power grows based on your engine level, you draw cards from your personal deck, play cards to generate resources and trigger combos, and acquire new cards to strengthen your engine for future turns.

The three core mechanics work together:
- **Deck Building**: Acquire powerful cards into your personal deck
- **Automatic Resource Growth**: Your power resource grows each turn based on your engine
- **Chaining**: Card combos trigger follow-up effects for explosive turns

## Game Setup

### Starting Resources
Each player begins with:
- **3 Power** - Used to acquire new cards
- **Engine Level 1** - Determines automatic power growth
- **0 Victory Points** - First to 50 wins!

### Starting Deck
Each player starts with a personal deck of 5 cards:
- 3x **Copper Generator** - Generates 1 power when played
- 2x **Basic Assembler** - Draws 1 card when played

Shuffle your starting deck and draw 5 cards to form your starting hand.

### Supply Piles
The central supply contains cards available for purchase:

**Tier 1 - Basic (3-4 Power)**
| Card | Cost | Type | Effect |
|------|------|------|--------|
| Bronze Generator | 3 | Generator | Gain 2 power |
| Workshop | 4 | Action | Draw 2 cards |
| Recycler | 3 | Action | Trash a card for 2 points |

**Tier 2 - Advanced (5-7 Power)**
| Card | Cost | Type | Effect |
|------|------|------|--------|
| Silver Generator | 6 | Generator | Gain 3 power |
| Factory | 7 | Action | Draw 3 cards |
| Chain Reactor | 5 | Combo | Trigger combo chains |
| Engine Upgrade | 5 | Upgrade | +1 engine level |

**Tier 3 - Power (9-12 Power)**
| Card | Cost | Type | Effect |
|------|------|------|--------|
| Gold Generator | 10 | Generator | Gain 5 power |
| Mega Factory | 11 | Action | Draw 4 cards |
| Victory Engine | 12 | Victory | Score 6 points |
| Combo Master | 9 | Combo | Double chain effects |

**Special**
| Card | Cost | Type | Effect |
|------|------|------|--------|
| Catalyst Core | 8 | Catalyst | +10% power growth rate |

## Turn Structure

### Phase 1: Engine Growth (Automatic)
At the start of your turn:
1. Your **power grows by 10%** (rounded down)
2. You gain **+1 power per engine level** from engine_bonus

Example: With 10 power and Engine Level 2, you gain 1 (10% of 10) + 2 (engine bonus) = 3 power.

### Phase 2: Draw Phase
Draw 5 cards from your personal deck into your hand.
- If your deck is empty, shuffle your discard pile to form a new deck
- If both are empty, you draw nothing

### Phase 3: Action Phase
You may take multiple actions:

**Play a Card**
- Play a card from your hand to activate its effect
- Cards go to your personal discard pile after playing
- Chain effects may trigger additional bonuses!

**Acquire a Card**
- Pay the power cost to acquire a card from the supply
- Acquired cards go to your personal discard pile
- You may acquire multiple cards per turn

**Trash a Card**
- Remove a card from your hand permanently
- Useful for thinning your deck of weak cards

**End Turn**
- Declare end of turn when done with actions

### Phase 4: Cleanup
- Discard remaining hand cards to your personal discard pile
- Reset any per-turn chain counters
- Check win condition (50+ victory points)

## Chain Effects

Playing certain cards triggers powerful chain combos:

### Generator Synergy
When you play a **Generator** card, gain +1 power (max 3x per turn)

### Combo Draw
When you play a **Combo** card, draw 1 card (max 2x per turn)

### Action Combo
When you play an **Action** card while combo_active >= 1, score 1 point (max 2x per turn)

### Acquisition Mastery
When you **acquire** a card at Engine Level 3+, score 2 points (max 2x per turn)

### Upgrade Synergy
When you play an **Upgrade** card, gain +3 power (max 1x per turn)

### Victory Momentum
When you play a **Victory** card, gain 1 extra action (max 3x per game)

## Winning

**Victory Condition**: First player to reach **50 victory points** wins immediately.

Points are scored by:
- Playing **Victory Engine** cards (6 points each)
- Triggering **chain combos** (1-2 points per combo)
- Using **Recycler** to trash cards for points (2 points per trash)
- Reaching **Acquisition Mastery** chains (2 points per acquire at high engine level)

## Strategy Guide

### Early Game (Turns 1-5)
- Focus on acquiring **Bronze Generators** and **Workshops**
- Build your power generation foundation
- Don't buy expensive cards yet - grow your engine first

### Mid Game (Turns 6-15)
- Acquire **Engine Upgrades** to increase automatic power growth
- Buy **Chain Reactors** to enable combo scoring
- Start acquiring **Silver Generators** for bigger power turns
- Consider **Recycler** to trash your Copper Generators

### Late Game (Turns 16+)
- Buy **Victory Engines** for big point swings
- Chain combos together for explosive scoring turns
- Use **Combo Master** to double chain effects
- Race to 50 points!

### Card Synergies

**Engine Build**: Engine Upgrade + Catalyst Core
- Maximize automatic power growth for long-term advantage

**Combo Build**: Chain Reactor + Action cards + Victory cards
- Score points through chain triggers rather than direct Victory cards

**Efficiency Build**: Recycler + Generators
- Trash weak cards to thin deck, maintain lean efficient engine

### Power Economy

| Engine Level | Base Growth | Engine Bonus | Total/Turn |
|--------------|-------------|--------------|------------|
| 1 | 10% of power | +1 | ~1-2 |
| 2 | 10% of power | +2 | ~2-4 |
| 3 | 10% of power | +3 | ~4-6 |
| 4 | 10% of power | +4 | ~6-9 |
| 5 | 10% of power | +5 | ~9-12 |

Higher engine levels create exponential growth - invest early!

## Expected Game Length

- **Duration**: 15-25 turns total (5-8 turns per player in 3-player game)
- **Time**: 15-25 minutes with AI agents
- **Arc**: Slow start, accelerating mid-game, explosive finish

## Gamemaster Notes

### Turn Order
1. Apply automatic resource growth
2. Player draws 5 cards from personal deck
3. Player takes actions (play, acquire, trash)
4. Handle chain effects as they trigger
5. Cleanup and check win condition

### State Tracking
Maintain for each player:
- Personal deck (hidden)
- Personal discard pile
- Hand (hidden from opponents)
- Resources: power, engine_level, engine_bonus, combo_active, score
- Chain counters (reset each turn)

### Chain Resolution
- Process chains depth-first
- Maximum chain depth: 3
- Track per-turn and per-game limits
- Log all triggered chains

### Supply Management
- Track remaining card counts
- Remove empty piles from available actions
- Game continues even if supply empties

## Design Philosophy

Engine Masters demonstrates three complementary mechanics:

1. **Deck Building** creates the strategic arc - your engine literally grows as you acquire cards
2. **Automatic Resource Growth** rewards long-term planning - invest in engine level early
3. **Chaining** creates exciting combo turns - multiple triggers can score many points at once

The mechanics synergize: better cards in your deck generate more resources, higher engine level grows those resources faster, and playing cards in the right order triggers chains for bonus effects.

## Card Types

### Generator Cards
Cards that produce power resources when played. Core to building your economic engine.
- **Copper Generator** (Starting): +1 power
- **Bronze Generator** (Tier 1): +2 power
- **Silver Generator** (Tier 2): +3 power
- **Gold Generator** (Tier 3): +5 power

Generators trigger the "Generator Synergy" chain effect (+1 bonus power, max 3x/turn).

### Action Cards
Cards that manipulate your deck or provide utility effects.
- **Basic Assembler** (Starting): Draw 1 card
- **Workshop** (Tier 1): Draw 2 cards
- **Recycler** (Tier 1): Trash a card for 2 victory points
- **Factory** (Tier 2): Draw 3 cards
- **Mega Factory** (Tier 3): Draw 4 cards

Action cards can trigger the "Action Combo" chain when combo_active is set.

### Combo Cards
Cards that enable and enhance chain effects.
- **Chain Reactor** (Tier 2): Activates combo mode, triggers extra draws
- **Combo Master** (Tier 3): Doubles chain effect values

Combo cards trigger the "Combo Draw" chain effect (draw 1 card, max 2x/turn).

### Upgrade Cards
Cards that permanently improve your engine.
- **Engine Upgrade** (Tier 2): +1 engine level (increases automatic power growth)
- **Catalyst Core** (Special): +10% power growth rate

Upgrade cards trigger the "Upgrade Synergy" chain effect (+3 power).

### Victory Cards
Cards that directly score victory points.
- **Victory Engine** (Tier 3): Score 6 victory points immediately

Victory cards trigger the "Victory Momentum" chain effect (extra action, max 3x/game).

## Strategy

### Resource Management
- **Power** is your currency - balance spending vs. saving for bigger purchases
- **Engine Level** provides exponential returns - upgrade early for compound growth
- **Deck Size** matters - more cards mean less consistent draws

### Deck Thinning
- Use **Recycler** to remove weak Copper Generators
- Smaller decks cycle faster, drawing your best cards more often
- Each trashed card also scores 2 victory points

### Timing Your Combos
- Build up **Chain Reactors** before playing action-heavy turns
- Save **Victory Engines** for when you have combo chains ready
- Watch opponents' scores - pivot to victory cards when the race is close

### Reading the Game State
- Track opponents' engine levels to predict their growth rate
- Monitor supply pile counts - popular cards may run out
- Observe opponents' deck sizes and recent acquisitions

## Design Notes

### Balance Considerations
- Starting power (3) allows immediate Tier 1 purchases
- Engine growth rate (10%) prevents runaway leaders in early game
- Chain limits prevent infinite combos while allowing satisfying turns

### Playtest Adjustments
- If games end too quickly: Increase victory threshold to 60 points
- If games drag: Reduce threshold to 40 or increase starting power
- If one strategy dominates: Adjust card costs or chain limits

### Mechanic Integration
This game demonstrates how three BGG mechanics work together:
1. **Deck Building** (deck-bag-and-pool-building) - Personal deck acquisition
2. **Automatic Resource Growth** (automatic-resource-growth) - Engine power accumulation
3. **Chaining** (chaining) - Combo triggers and follow-up effects

The design intentionally creates tension between:
- Buying cards (short-term power) vs. upgrading engine (long-term growth)
- Building combos (setup time) vs. rushing victory cards (immediate points)
- Deck expansion (more options) vs. deck thinning (consistency)
