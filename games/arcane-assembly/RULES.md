---
name: "Arcane Assembly"
version: "1.0"
players: 2-4
win_condition: "highest_score"
max_rounds: 10

mechanics:
  # Pattern building on a personal grid
  pattern_building:
    grid_size: 5
    points_per_placement: 1
    patterns:
      - { id: "tower", name: "Wizard Tower", shape: [[1,0],[1,0],[1,1]], points: 8 }
      - { id: "hall", name: "Great Hall", shape: [[1,1,1],[1,0,1]], points: 10 }
      - { id: "garden", name: "Arcane Garden", shape: [[0,1,0],[1,1,1],[0,1,0]], points: 12 }
      - { id: "wall", name: "Defensive Wall", shape: [[1,1,1,1]], points: 6 }
      - { id: "corner", name: "Corner Turret", shape: [[1,1],[1,0]], points: 4 }

  # Network and route building between nodes
  network_and_route_building:
    resource: "stone"
    allow_parallel: false
    longest_network_bonus: 5
    segments:
      - { id: "r1", from: "tower_site", to: "library", cost: 2, points: 3 }
      - { id: "r2", from: "library", to: "garden_site", cost: 2, points: 3 }
      - { id: "r3", from: "garden_site", to: "workshop", cost: 3, points: 4 }
      - { id: "r4", from: "workshop", to: "tower_site", cost: 3, points: 4 }
      - { id: "r5", from: "tower_site", to: "sanctum", cost: 4, points: 5 }
      - { id: "r6", from: "library", to: "sanctum", cost: 4, points: 5 }
      - { id: "r7", from: "garden_site", to: "sanctum", cost: 5, points: 6 }
      - { id: "r8", from: "workshop", to: "sanctum", cost: 5, points: 6 }
    route_cards:
      - { id: "rc1", from: "tower_site", to: "sanctum", points: 8 }
      - { id: "rc2", from: "library", to: "workshop", points: 6 }
      - { id: "rc3", from: "garden_site", to: "tower_site", points: 5 }
    starting_route_cards: 2

  # Action programming: plan your spell sequence
  action_programming:
    program_size: 3
    simultaneous: true
    reveal_order: "simultaneous"
    allowed_actions: ["gather", "build", "research", "place_pattern_piece", "claim_route"]

  # Tech tree for magical research
  tech_trees_tech_tracks:
    max_researched: 6
    techs:
      - { id: "basic_construction", name: "Basic Construction", cost: { mana: 2 }, bonuses: { build_discount: 1 }, points: 1 }
      - { id: "advanced_masonry", name: "Advanced Masonry", cost: { mana: 3, stone: 1 }, prerequisites: ["basic_construction"], bonuses: { build_discount: 2 }, points: 2 }
      - { id: "arcane_focus", name: "Arcane Focus", cost: { mana: 4 }, bonuses: { mana_gain: 1 }, points: 2 }
      - { id: "greater_arcana", name: "Greater Arcana", cost: { mana: 5, crystal: 1 }, prerequisites: ["arcane_focus"], bonuses: { mana_gain: 2 }, points: 3 }
      - { id: "earth_magic", name: "Earth Magic", cost: { mana: 3 }, bonuses: { stone_gain: 1 }, points: 2 }
      - { id: "crystal_synthesis", name: "Crystal Synthesis", cost: { mana: 4, stone: 2 }, prerequisites: ["earth_magic"], bonuses: { crystal_gain: 1 }, points: 3 }
      - { id: "master_architect", name: "Master Architect", cost: { mana: 6, crystal: 2 }, prerequisites: ["advanced_masonry", "greater_arcana"], bonuses: { pattern_bonus: 3 }, points: 5 }
    tracks:
      - { id: "construction", name: "Construction Track", techs: ["basic_construction", "advanced_masonry", "master_architect"] }
      - { id: "arcane", name: "Arcane Track", techs: ["arcane_focus", "greater_arcana", "master_architect"] }
      - { id: "earth", name: "Earth Track", techs: ["earth_magic", "crystal_synthesis"] }

  # Worker placement with different worker types
  worker_placement_different_worker_types:
    worker_types:
      - { id: "apprentice", name: "Apprentice", count: 2, strength: 1 }
      - { id: "journeyman", name: "Journeyman", count: 1, strength: 2 }
    spaces:
      - { id: "quarry", name: "Quarry", capacity: 2, reward: { resource: "stone", amount: 2 }, min_strength: 1 }
      - { id: "crystal_cave", name: "Crystal Cave", capacity: 1, reward: { resource: "crystal", amount: 1 }, min_strength: 2 }
      - { id: "mana_well", name: "Mana Well", capacity: 2, reward: { resource: "mana", amount: 2 }, min_strength: 1 }
      - { id: "arcane_library", name: "Arcane Library", capacity: 1, reward: { resource: "mana", amount: 3 }, min_strength: 1 }
      - { id: "builders_guild", name: "Builders Guild", capacity: 1, reward: { type: "build_action" }, min_strength: 1 }
    retrieve_on: "round_start"

  # Turn order: progressive (last place goes first)
  turn_order_progressive:
    reverse_score_order: true
    trigger: "round_start"

  # Location effects on the board
  location_effects:
    locations:
      - { id: "quarry", effect: { type: "bonus_resource", resource: "stone", amount: 1 }, trigger: "on_visit" }
      - { id: "crystal_cave", effect: { type: "bonus_resource", resource: "crystal", amount: 1 }, trigger: "on_visit" }

  # Building core for construction hooks
  building: true

  # Resources
  resources:
    - { name: "stone", starting_amount: 3, max: 15 }
    - { name: "mana", starting_amount: 5, max: 20 }
    - { name: "crystal", starting_amount: 0, max: 10 }

  # Action points
  action_points:
    points_per_turn: 3
    action_costs:
      place_worker: 1
      place_pattern_piece: 1
      claim_route: 1
      research: 1
      program_action: 0
      execute_program: 1
      pass: 0
    rollover: false

  win_highest_lowest_scoring: { mode: "highest" }
---

# Arcane Assembly

A construction and programming game where wizards build a magical academy, research arcane technologies, and program spell sequences. Workers gather resources, pattern pieces form buildings, and routes connect sacred sites.

## Objective

Earn the **highest score** over 10 rounds through building construction, route claiming, tech research, and pattern completion.

## Setup

1. Each player starts with:
   - 3 stone, 5 mana, 0 crystals
   - 2 Apprentice workers (strength 1) and 1 Journeyman worker (strength 2)
   - A 5x5 empty building grid
   - 2 secret route cards (bonus VP for connecting sites)
2. Place the central board with 5 worker placement spaces
3. Lay out the tech tree with 3 research tracks

## Components

### Building Grid (5x5)
Each player has a personal 5x5 grid where they place pattern pieces to construct buildings:

| Pattern | Shape | Points |
|---------|-------|--------|
| Corner Turret | 2x2 L-shape | 4 |
| Defensive Wall | 1x4 line | 6 |
| Wizard Tower | 2x3 column + base | 8 |
| Great Hall | 3x2 with gap | 10 |
| Arcane Garden | Cross shape | 12 |

### Route Network
Sacred sites connected by magical ley lines:

```
[Tower Site] ---2--- [Library]
     |    \            |
     3     4---[Sanctum]---4
     |    /            |
[Workshop] ---3--- [Garden Site]
```

Claim routes by spending stone. Bonus for longest connected network!

### Tech Tree
Three research tracks that unlock permanent bonuses:

```
Construction: Basic Construction → Advanced Masonry ──┐
                                                      ├→ Master Architect (5 VP)
Arcane:       Arcane Focus → Greater Arcana ──────────┘
Earth:        Earth Magic → Crystal Synthesis
```

## Gameplay

## Round Structure

### Phase 1: Action Programming
All players simultaneously program a sequence of **3 actions** for the round:
- **Gather**: Collect resources from a source
- **Build**: Place a pattern piece on your grid
- **Research**: Advance on the tech tree
- **Claim Route**: Claim a ley line segment

All programs are revealed at once! Then they execute in turn order.

### Phase 2: Worker Placement
Place your workers on shared spaces:

| Space | Capacity | Reward | Min Strength |
|-------|----------|--------|-------------|
| Quarry | 2 | 2 stone | 1 (any worker) |
| Crystal Cave | 1 | 1 crystal | 2 (Journeyman only) |
| Mana Well | 2 | 2 mana | 1 (any worker) |
| Arcane Library | 1 | 3 mana | 1 (any worker) |
| Builders Guild | 1 | Free build action | 1 (any worker) |

- The **Crystal Cave** requires a Journeyman (strength 2)
- Workers are retrieved at the start of each round

### Phase 3: Execute Programs
Resolve each player's programmed actions in order:
1. Actions resolve in turn order (lowest score first)
2. Each action in your program executes sequentially
3. If an action becomes impossible (no resources), it's skipped

### Phase 4: Tech Research (if programmed)
Spend mana and materials to research technologies:
- Each tech has **prerequisites** — must research lower techs first
- Technologies provide **permanent bonuses** (discounts, extra resources)
- **Master Architect** (top of tree) grants +3 VP per completed pattern

## Worker Types

| Worker | Strength | Count | Special |
|--------|----------|-------|---------|
| Apprentice | 1 | 2 per player | Can work most spaces |
| Journeyman | 2 | 1 per player | Can access Crystal Cave |

The Journeyman is your most valuable worker — plan carefully where to send them!

## Pattern Building Details

Place pieces on your 5x5 grid:
- Each filled square = 1 VP base
- Completing a named pattern = bonus VP (4-12)
- Pieces cannot overlap
- Plan your layout to fit multiple patterns!

## Route Network Details

Claim ley line segments by spending stone:
- Each segment costs 2-5 stone
- Claimed segments award 3-6 VP
- **Longest network bonus**: +5 VP for the player with the most connected segments
- **Route cards**: Secret bonus objectives for connecting specific sites

## Scoring

| Source | Points |
|--------|--------|
| Pattern pieces placed | 1 VP each |
| Completed patterns | 4-12 VP each |
| Claimed route segments | 3-6 VP each |
| Longest network bonus | 5 VP |
| Route card completion | 5-8 VP each |
| Researched techs | 1-5 VP each |
| Master Architect bonus | +3 VP per completed pattern |

## Winning

After 10 rounds, the player with the **highest score** wins.

Ties broken by: most completed patterns, then most researched techs.

## Strategy Tips

1. **Plan your grid** — preview where patterns will fit before placing
2. **Crystal Cave** is critical — only Journeymen can access it
3. **Tech tree investment** pays off late — Master Architect is powerful but expensive
4. **Program wisely** — your actions are locked in before you see opponents' plans
5. **Route cards** are secret — opponents don't know what you're building toward
6. **Balance building vs research** — too much of either leaves you behind
7. **Stone is scarce** — Quarry competition is fierce

## Mechanic Interplay

This game showcases construction and planning mechanics:
- **Pattern Building + Tech Tree**: Master Architect makes patterns worth more
- **Worker Placement + Different Workers**: Crystal Cave creates worker-type tension
- **Action Programming + Simultaneous Reveal**: Players commit before seeing plans
- **Network Building + Route Cards**: Public network, secret objectives
- **Progressive Turn Order**: Last place acts first, creating catch-up dynamics
