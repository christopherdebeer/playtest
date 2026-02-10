---
name: "Spellbook Showdown"
version: "1.0"
players: 2-4
win_condition: "highest_score_across_rounds"
max_rounds: 15

mechanics:
  # Command cards with typed effects
  command_cards:
    commands:
      fire:
        name: "Fire Spell"
        effect: { type: "damage", amount: 3 }
        power: 3
      ice:
        name: "Ice Spell"
        effect: { type: "freeze", duration: 1 }
        power: 2
      heal:
        name: "Healing Spell"
        effect: { type: "heal", amount: 2 }
        power: 2
      shield:
        name: "Shield Spell"
        effect: { type: "block", amount: 3 }
        power: 1
      lightning:
        name: "Lightning Bolt"
        effect: { type: "damage", amount: 5 }
        power: 5
      drain:
        name: "Mana Drain"
        effect: { type: "steal_resource", resource: "mana", amount: 2 }
        power: 3

  # Multi-use cards: each card has multiple modes
  multi_use_cards:
    modes:
      - { id: "attack", name: "Attack Mode", description: "Use card for its combat effect" }
      - { id: "resource", name: "Resource Mode", description: "Discard for 2 mana" }
      - { id: "enchant", name: "Enchant Mode", description: "Place as ongoing effect" }

  # Melding and splaying card arrangements
  melding_and_splaying:
    meld_positions: ["left", "right", "up"]
    splay_directions: ["left", "right", "up"]
    splay_bonus:
      left: { type: "resource", resource: "mana", amount: 1 }
      right: { type: "score", amount: 1 }
      up: { type: "draw", amount: 1 }

  # Action queue: queue spells for later
  action_queue:
    max_queue_size: 3
    auto_process: false

  # Action retrieval: recover used spells
  action_retrieval:
    retrieve_cost: 2
    retrieve_from: "discard"
    max_retrieve: 1

  # Simultaneous spell selection each duel
  simultaneous_action_selection:
    actions_per_round: 1
    resolution_order: "simultaneous"
    reveal_before_resolve: true

  # Score and reset between rounds
  score_and_reset_game:
    rounds_per_game: 3
    reset_fields: ["hand", "effects", "meld"]
    keep_fields: ["score"]
    bonus_per_round_win: 5

  # Turn order is random each round
  turn_order_random:
    trigger: "round_start"
    method: "shuffle"

  # Resources
  resources:
    - { name: "mana", starting_amount: 5, max: 15 }
    - { name: "health", starting_amount: 10, max: 15 }

  # Cards
  cards:
    starting_hand: 6
    deck:
      # Fire spells
      - { name: "Fireball", count: 4, type: "command", subtype: "fire", value: 3, effect: { type: "damage", amount: 3 } }
      - { name: "Inferno", count: 2, type: "command", subtype: "fire", value: 5, effect: { type: "damage", amount: 5 } }
      # Ice spells
      - { name: "Frost Bolt", count: 4, type: "command", subtype: "ice", value: 2, effect: { type: "freeze", duration: 1 } }
      - { name: "Blizzard", count: 2, type: "command", subtype: "ice", value: 4, effect: { type: "freeze_all", duration: 1 } }
      # Healing
      - { name: "Heal", count: 4, type: "command", subtype: "heal", value: 2, effect: { type: "heal", amount: 2 } }
      - { name: "Greater Heal", count: 2, type: "command", subtype: "heal", value: 4, effect: { type: "heal", amount: 4 } }
      # Shield
      - { name: "Barrier", count: 4, type: "command", subtype: "shield", value: 1, effect: { type: "block", amount: 3 } }
      # Lightning
      - { name: "Lightning Bolt", count: 2, type: "command", subtype: "lightning", value: 5, effect: { type: "damage", amount: 5 } }
      # Utility
      - { name: "Mana Crystal", count: 3, type: "resource", value: 0, effect: { type: "gain_resource", resource: "mana", amount: 3 } }
      - { name: "Scroll of Recall", count: 2, type: "utility", value: 0, effect: { type: "retrieve", amount: 1 } }
      - { name: "Mirror Image", count: 2, type: "enchant", value: 0, effect: { type: "copy_last_spell" } }

  # Hand management
  hand_management: true

  # Action points
  action_points:
    points_per_turn: 3
    action_costs:
      play_command: 1
      play_card: 1
      queue_action: 1
      process_queue: 1
      select_action: 0
      draw: 1
      pass: 0
    rollover: false

  win_highest_lowest_scoring: { mode: "highest" }
---

# Spellbook Showdown

A wizard dueling game where spellcasters select spells simultaneously, queue powerful combos, and arrange their grimoire for maximum effect. Played across 3 scoring rounds with resets between them.

## Objective

Score the most points across **3 rounds** of magical dueling. Each round resets hands and effects but keeps accumulated scores.

## Setup

1. Each player starts with:
   - 6 spell cards in hand
   - 5 mana and 10 health
2. Shuffle the spell deck
3. Randomly determine first-round turn order

## Gameplay

## Round Structure (3 rounds)

Each round plays out over approximately 5 turns. At the end of each round, score, reset, and begin anew.

### Turn Flow

Each turn you have **3 Action Points (AP)**:

| Action | Cost | Description |
|--------|------|-------------|
| Play Command | 1 AP | Cast a command spell immediately |
| Play Card | 1 AP | Play a non-command card for its effect |
| Queue Spell | 1 AP | Add a spell to your queue (up to 3) |
| Process Queue | 1 AP | Execute the next queued spell |
| Draw | 1 AP | Draw 1 card from the deck |
| Pass | 0 AP | End your turn |

## Spell Types

### Command Spells (Primary attacks/defense)
| Spell | Mana | Effect | Power |
|-------|------|--------|-------|
| Fireball | 1 | Deal 3 damage | 3 |
| Inferno | 3 | Deal 5 damage | 5 |
| Frost Bolt | 1 | Freeze target for 1 turn | 2 |
| Blizzard | 2 | Freeze all opponents for 1 turn | 4 |
| Heal | 1 | Restore 2 health | 2 |
| Greater Heal | 2 | Restore 4 health | 4 |
| Barrier | 1 | Block next 3 damage | 1 |
| Lightning Bolt | 3 | Deal 5 damage | 5 |

### Multi-Use Cards
Every command spell can be used in **3 different modes**:

1. **Attack Mode**: Cast normally for its spell effect
2. **Resource Mode**: Discard to gain 2 mana (any spell)
3. **Enchant Mode**: Place face-up as an ongoing effect (weaker but persistent)

This means every card is useful — even weak spells can fuel mana or create enchantments!

### Utility Cards
| Card | Effect |
|------|--------|
| Mana Crystal | Gain 3 mana immediately |
| Scroll of Recall | Retrieve 1 spell from your discard pile |
| Mirror Image | Copy the last spell you cast |

## Simultaneous Selection

At the start of each turn, all players **simultaneously select** their primary action:
- Choices are revealed at the same time
- This creates prediction and counter-play
- Fire beats Ice (unfreezes), Ice beats Fire (freezes attacker), Shield blocks all

## Action Queue (Spell Combos)

Build devastating combos by queuing up to 3 spells:
- **Queue a spell** (1 AP): Add it to your queue face-down
- **Process queue** (1 AP): Execute the next spell in queue
- Queued spells execute in order (FIFO)
- Opponents don't know what's queued!
- Example combo: Queue Barrier → Fireball → Lightning Bolt for a shielded double-strike

## Action Retrieval

Recover spent spells:
- **Cost**: 2 mana to retrieve 1 spell from your discard pile
- **Limit**: 1 retrieval per turn
- Great for recycling your best spells across a round

## Melding and Splaying

Arrange your played spells in formations for bonuses:
- **Meld**: Stack spells to activate their combined effects
- **Splay Left**: Reveal left edges → gain 1 mana per visible icon
- **Splay Right**: Reveal right edges → gain 1 VP per visible icon
- **Splay Up**: Reveal top edges → draw 1 card per visible icon

Your "grimoire layout" becomes a strategic resource!

## Score and Reset

After each round (~5 turns):
1. **Score**: VP from damage dealt, spells cast, and surviving health
2. **Round winner**: +5 bonus VP
3. **Reset**: Hands, effects, and melds reset; draw new hand of 6
4. **Keep**: Score carries over to next round

3 rounds total. Highest cumulative score wins!

## Scoring per Round

| Source | Points |
|--------|--------|
| Damage dealt to opponents | 1 VP per damage |
| Health remaining | 1 VP per 2 health |
| Command spells cast | Power value as VP |
| Splay bonuses | Varies by layout |
| Round winner bonus | 5 VP |

## Winning

After 3 rounds, the player with the **highest total score** wins.

Ties broken by: total damage dealt, then total health remaining.

## Strategy Tips

1. **Multi-use is key** — bad hand? Convert spells to mana
2. **Queue combos** — Barrier + double damage is devastating
3. **Splay for value** — right-splay generates passive VP
4. **Save Lightning Bolts** — highest damage in the game
5. **Retrieve wisely** — getting back your best spell is worth 2 mana
6. **Read the table** — simultaneous selection rewards prediction
7. **Round resets mean each round is a fresh start** — go all-in!

## Mechanic Interplay

This game showcases card combo mechanics:
- **Command Cards + Multi-Use**: Every card has 3 modes, eliminating dead draws
- **Action Queue + Simultaneous Selection**: Queue in secret, reveal together
- **Melding + Splaying**: Spatial card arrangement creates passive bonuses
- **Action Retrieval + Queue**: Retrieve spent spells to rebuild combos
- **Score and Reset**: Fresh starts create 3 distinct strategic arcs
