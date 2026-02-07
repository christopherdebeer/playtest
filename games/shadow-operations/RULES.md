---
name: "Shadow Operations"
version: "1.0"
players: 2-4
win_condition: "elimination_or_majority"
max_rounds: 15

mechanics:
  # Area movement between regions
  area_movement:
    starting_area: "HQ"
    use_movement_points: false
    default_cost: 1
    allow_passing: true
    allow_stacking: true
    areas:
      - { id: "HQ", name: "Headquarters", adjacent: ["north_district", "east_district", "port"] }
      - { id: "north_district", name: "North District", adjacent: ["HQ", "east_district", "industrial_zone", "old_town"] }
      - { id: "east_district", name: "East District", adjacent: ["HQ", "north_district", "port", "financial_center"] }
      - { id: "port", name: "Port District", adjacent: ["HQ", "east_district", "warehouse_row"] }
      - { id: "industrial_zone", name: "Industrial Zone", adjacent: ["north_district", "old_town", "financial_center"], capacity: 3 }
      - { id: "old_town", name: "Old Town", adjacent: ["north_district", "industrial_zone"] }
      - { id: "financial_center", name: "Financial Center", adjacent: ["east_district", "industrial_zone", "warehouse_row"] }
      - { id: "warehouse_row", name: "Warehouse Row", adjacent: ["port", "financial_center"] }

  # Area majority for controlling regions
  area_majority_influence:
    influence_resource: "agents"
    areas:
      - { id: "north_district", name: "North District", points: [5, 2], max_influence: 6 }
      - { id: "east_district", name: "East District", points: [4, 2], max_influence: 6 }
      - { id: "port", name: "Port District", points: [6, 3], max_influence: 5 }
      - { id: "industrial_zone", name: "Industrial Zone", points: [4, 1], max_influence: 4 }
      - { id: "old_town", name: "Old Town", points: [3, 1], max_influence: 4 }
      - { id: "financial_center", name: "Financial Center", points: [7, 3], max_influence: 5 }
      - { id: "warehouse_row", name: "Warehouse Row", points: [5, 2], max_influence: 4 }

  # Zone of control blocks enemy movement
  zone_of_control:
    zoc_range: 1
    blocks_movement: false
    must_stop: true
    must_attack: false

  # Force commitment for battles
  force_commitment:
    simultaneous: true
    revealed_after_commit: true
    commitment_binding: true

  # Critical hits and failures in combat
  critical_hits:
    critical_hit_roll: 6
    critical_fail_roll: 1
    critical_hit_multiplier: 2
    critical_fail_penalty: -1

  # Tug of war for contested areas
  tug_of_war:
    track_length: 5
    push_strength: 1

  # Hidden movement for covert operations
  hidden_movement:
    hidden_players: []
    hidden_roles: []
    reveal_frequency: 3
    reveal_radius: 1
    clue_system: true
    fog_of_war: true

  # Secret unit deployment
  secret_deployment:
    reveal_on_combat: true
    reveal_on_adjacent: false
    allow_bluffing: true
    reveal_cost: 0

  # Deduction to uncover enemy plans
  deduction:
    hidden_info_types: ["agent_location", "mission_target", "force_strength"]
    clue_action_cost: 1
    max_guesses: 3

  # Team-based play
  team_based_game:
    assignment: "sequential"
    team_victory: "shared_score"
    teams:
      - { id: "alpha", name: "Alpha Agency" }
      - { id: "bravo", name: "Bravo Bureau" }

  # Events that change the situation
  events:
    deck:
      - { id: "intel_leak", name: "Intel Leak", effect: { type: "reveal_all_positions" }, frequency: 2 }
      - { id: "reinforcements", name: "Reinforcements", effect: { type: "gain_resource", resource: "agents", amount: 2 }, frequency: 3 }
      - { id: "blackout", name: "Blackout", effect: { type: "hide_all_positions" }, frequency: 2 }
      - { id: "crackdown", name: "Crackdown", effect: { type: "remove_influence", amount: 1 }, frequency: 2 }
      - { id: "double_agent", name: "Double Agent", effect: { type: "steal_influence", amount: 1 }, frequency: 1 }

  # Turn order based on claiming initiative
  turn_order_claim_action:
    claim_cost: 0
    claim_phase: "round_start"

  # Resources
  resources:
    - { name: "agents", starting_amount: 5, max: 12 }
    - { name: "intel", starting_amount: 2, max: 10 }

  # Board for area definitions
  board:
    states: ["HQ", "north_district", "east_district", "port", "industrial_zone", "old_town", "financial_center", "warehouse_row"]
    start: "HQ"
    edges:
      - { from: "HQ", to: ["north_district", "east_district", "port"] }
      - { from: "north_district", to: ["east_district", "industrial_zone", "old_town"] }
      - { from: "east_district", to: ["port", "financial_center"] }
      - { from: "port", to: ["warehouse_row"] }
      - { from: "industrial_zone", to: ["old_town", "financial_center"] }
      - { from: "financial_center", to: ["warehouse_row"] }

  # Action points
  action_points:
    points_per_turn: 4
    action_costs:
      move: 1
      place_influence: 1
      deploy_secret: 1
      reveal_unit: 0
      commit_forces: 1
      tug_push: 1
      investigate: 1
      pass: 0
    rollover: false
---

# Shadow Operations

A covert warfare game of hidden movement, area control, and tactical combat. Two teams of intelligence agencies deploy agents across a city, competing for influence while concealing their true positions and strength.

## Objective

Control the most valuable districts by the end of 15 rounds, or eliminate the opposing team's agents entirely.

## Setup

1. Players are divided into two teams: **Alpha Agency** and **Bravo Bureau**
2. Each player starts with:
   - 5 agents (influence tokens) and 2 intel
   - Position at Headquarters (HQ)
3. Place the city map showing 8 districts
4. Shuffle the event deck

## The City Map

```
                [Old Town]
                    |
[HQ] --- [North District] --- [Industrial Zone]
  |           |                      |
  |      [East District] --- [Financial Center]
  |           |                      |
  +------ [Port District] --- [Warehouse Row]
```

### District Values (1st place / 2nd place points)

| District | 1st Place | 2nd Place | Max Influence |
|----------|-----------|-----------|---------------|
| Financial Center | 7 | 3 | 5 |
| Port District | 6 | 3 | 5 |
| North District | 5 | 2 | 6 |
| Warehouse Row | 5 | 2 | 4 |
| East District | 4 | 2 | 6 |
| Industrial Zone | 4 | 1 | 4 |
| Old Town | 3 | 1 | 4 |

## Turn Structure

Each turn you have **4 Action Points (AP)** to spend:

| Action | Cost | Description |
|--------|------|-------------|
| Move | 1 AP | Move to an adjacent district |
| Place Influence | 1 AP | Deploy 1 agent to your current district |
| Deploy Secret Unit | 1 AP | Place a hidden agent (opponent doesn't see it) |
| Commit Forces | 1 AP | Engage in combat for a contested district |
| Push (Tug of War) | 1 AP | Push the control marker in a contested area |
| Investigate | 1 AP | Spend intel to learn enemy secrets |
| Pass | 0 AP | End your turn |

## Hidden Movement

Your position is **hidden** from opponents by default:
- Opponents cannot see where you are unless within **1 district** of you
- Every **3 rounds**, all positions are briefly revealed (intel sweep)
- **Fog of war** — you only see nearby enemy agents
- Use this to set up surprise attacks and infiltrations

## Secret Unit Deployment

Deploy agents face-down to conceal your true strength:
- **Hidden agents** are revealed when combat occurs
- You may deploy **decoys** (bluffs) — fake agents that fool opponents
- Revealed agents become normal influence tokens
- This creates mind games: is that a real agent or a bluff?

## Combat

When two teams contest the same district:

### Force Commitment
Both sides simultaneously commit forces (agents) to the battle. Commitments are binding — you can't pull back once committed.

### Resolution
Each committed agent rolls 1d6:
- **Roll 6**: Critical Hit! Deals double damage
- **Roll 2-5**: Normal hit (1 damage)
- **Roll 1**: Critical Failure! Agent is lost with no effect

The side that deals more total damage wins. Losing agents are removed.

### Tug of War
For prolonged contests, a **tug-of-war** track (length 5) shows control:
- Push the marker toward your side each turn
- If the marker reaches your end, you gain full control
- Creates back-and-forth battles over key districts

## Deduction & Investigation

Spend intel to uncover enemy secrets:
- **Investigate Agent Location**: Learn where a specific enemy agent is
- **Investigate Mission Target**: Discover which district the enemy is targeting
- **Investigate Force Strength**: Learn how many agents an enemy has in a district
- Maximum 3 wrong guesses before you lose investigation access

## Events

Each round, draw an event card:

| Event | Effect |
|-------|--------|
| Intel Leak | All positions revealed this round |
| Reinforcements | Each team gains 2 agents |
| Blackout | All positions hidden (overrides reveal) |
| Crackdown | Remove 1 influence from every contested district |
| Double Agent | Steal 1 influence from an adjacent enemy district |

## Zone of Control

Districts with your agents project a **zone of control**:
- Enemy agents entering an adjacent controlled district must **stop** (can't pass through)
- This lets you create defensive perimeters around key areas
- Plan your agent placement to create chokepoints

## Area Majority Scoring

At game end (or when scored), each district awards points:
- **1st place** (most influence): Full points
- **2nd place**: Reduced points
- Ties split points between tied players

## Winning

The game ends after 15 rounds or when one team has no agents left.

**Final scoring**:
1. Area majority points for each district
2. +2 VP per enemy agent eliminated during the game
3. +3 VP for controlling Financial Center (most valuable)

Team with the highest combined score wins.

## Strategy Tips

1. **Don't reveal too early** — hidden movement is your greatest weapon
2. **Deploy decoys** to make enemies waste resources investigating bluffs
3. **Financial Center** is the biggest prize — but heavily contested
4. **Old Town** is low value but can serve as a staging area
5. **Zone of control** can lock down entire sectors of the city
6. **Save forces** for decisive battles — attrition is expensive
7. **Investigate** before attacking — know what you're up against
8. **Events change everything** — adapt to Intel Leaks and Blackouts
