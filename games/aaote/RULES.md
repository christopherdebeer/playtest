---
name: "AAOTE: An Agent of the Enemy"
version: "0.2"
players: 3-5
win_condition: "objective_completed"
max_rounds: 40

# Reference mechanics from library (informational only)
mechanics:
  - traitor-game
  - hidden-roles
  - grid-movement
  - tile-placement
  - trading
  - hand-management

# Engine mechanics configuration
# Key = mechanic slug, value = config passed to mechanic's parseConfig()
engine_mechanics:
  # Cards mechanic - deck management
  cards:
    startingCards: 5
    handLimit: 7
    handLimitPolicy: "cannot_draw"
    reshuffleDiscard: true
    deck:
      # === LOCATIONS (placed on grid) ===
      - { name: "Forest Clearing", count: 3, type: "location", terrain: "forest", effect: { type: "safe" } }
      - { name: "Mountain Pass", count: 2, type: "location", terrain: "mountain", effect: { type: "safe" } }
      - { name: "River Crossing", count: 2, type: "location", terrain: "water", effect: { type: "safe" } }
      - { name: "Village Square", count: 2, type: "location", terrain: "settlement", effect: { type: "trade_bonus" } }
      - { name: "Ancient Ruins", count: 2, type: "location", terrain: "ruins", effect: { type: "draw_on_enter", value: 1 } }
      - { name: "Crossroads", count: 2, type: "location", terrain: "road", connections: 4, effect: { type: "safe" } }
      - { name: "Hidden Cave", count: 1, type: "location", terrain: "cave", effect: { type: "hide", description: "Avatar cannot be seen by others" } }
      - { name: "Watchtower", count: 1, type: "location", terrain: "tower", effect: { type: "reveal", description: "See all player positions" } }
      - { name: "Forbidden Temple", count: 1, type: "location", terrain: "temple", effect: { type: "enemy_only", description: "Only The Enemy may enter" } }
      # === ITEMS (held in hand, tradeable) ===
      - { name: "Lantern", count: 3, type: "item", effect: { type: "utility", description: "Required for cave locations" } }
      - { name: "Rope", count: 3, type: "item", effect: { type: "utility", description: "Required for mountain locations" } }
      - { name: "Compass", count: 2, type: "item", effect: { type: "movement_bonus", description: "Move costs 0 AP once per turn" } }
      - { name: "Map Fragment", count: 4, type: "item", effect: { type: "collectible", description: "Collect 3 to peek at any objective" } }
      - { name: "Supplies", count: 3, type: "item", effect: { type: "currency", description: "Used for certain events" } }
      - { name: "Cursed Amulet", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 1/3" } }
      - { name: "Dark Tome", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 2/3" } }
      - { name: "Shadow Key", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 3/3" } }
      # === EVENTS (played during turn) ===
      - { name: "Swift Journey", count: 2, type: "event", effect: { type: "extra_movement", value: 2 } }
      - { name: "Shortcut", count: 2, type: "event", effect: { type: "teleport_adjacent", description: "Move to any tile adjacent to any player" } }
      - { name: "Spy", count: 2, type: "event", effect: { type: "peek_hand", description: "Look at target player's hand" } }
      - { name: "Interrogate", count: 1, type: "event", requires: ["Supplies"], effect: { type: "peek_objective", description: "Peek at target's objective" } }
      - { name: "Roadblock", count: 2, type: "event", effect: { type: "block_tile", duration: 1, description: "Block a location for 1 round" } }
      - { name: "Theft", count: 2, type: "event", requires: ["adjacency"], effect: { type: "steal_item", description: "Steal random item from adjacent player" } }
      - { name: "Sabotage", count: 1, type: "event", effect: { type: "destroy_location", description: "Remove a non-occupied location from grid" } }
      - { name: "Evasion", count: 2, type: "event", effect: { type: "counter", description: "Cancel an event targeting you" } }
      - { name: "Hidden Path", count: 2, type: "event", effect: { type: "secret_move", description: "Move without revealing destination" } }

  # Action points mechanic
  action-points:
    pointsPerTurn: 3
    actionCosts:
      # Grid mechanic actions
      move_grid: 1
      place_tile: 1
      # Cards mechanic actions
      play_card: 1
      draw: 1
      discard: 0
      # Trading mechanic actions
      propose_trade: 1
      respond_trade: 0
      cancel_trade: 0
      # Action-points mechanic actions
      end_turn: 0
    rollover: false

  # Grid mechanic - infinite tile-based board
  grid:
    type: "infinite"
    startingTile: "origin"
    adjacency: "orthogonal"

  # Trading mechanic
  trading:
    enabled: true
    itemTypesOnly: true
    requireSameLocation: false
    requireAdjacent: false
    allowGifts: true
    maxCardsPerTrade: 3

  # Hidden roles mechanic
  hidden-roles:
    dealAtStart: true
    revealOnCompletion: true
    roles:
      - { id: "the-collector", name: "The Collector", type: "regular", count: 1, winCondition: "Hold 4 different items simultaneously" }
      - { id: "the-explorer", name: "The Explorer", type: "regular", count: 1, winCondition: "Visit 6 different locations" }
      - { id: "the-builder", name: "The Builder", type: "regular", count: 1, winCondition: "Place 5 location cards" }
      - { id: "the-trader", name: "The Trader", type: "regular", count: 1, winCondition: "Complete 4 trades" }
      - { id: "the-enemy", name: "The Enemy", type: "traitor", count: 1, winCondition: "Prevent all other players from completing objectives OR collect the 3 Forbidden Items" }

# Player Cards (dealt face-up, visible to all) - informational
player_cards:
  - { name: "The Scholar", count: 1, ability: "May look at top card of deck before drawing" }
  - { name: "The Merchant", count: 1, ability: "Trades cost 0 AP" }
  - { name: "The Scout", count: 1, ability: "May move 2 spaces for 1 AP" }
  - { name: "The Guardian", count: 1, ability: "May block one trade per round" }
  - { name: "The Mystic", count: 1, ability: "May peek at one player's objective once per game" }
---

# AAOTE: An Agent of the Enemy

A social deduction game of hidden objectives, expanding territories, and uncertain allegiances.

## Overview

Players explore an ever-expanding world, placing locations, collecting items, and completing secret objectives. But one among you is **The Enemy** — working to sabotage everyone's plans.

## Components

- **Player Cards** (5): Public identity with special ability
- **Objective Cards** (5): Secret win condition (one is The Enemy)
- **Main Deck**: Locations, Items, and Events

## Setup

1. **Player Cards**: Deal one face-up to each player. These abilities are public knowledge.

2. **Objectives**: Shuffle and deal one face-down to each player. Look at your objective secretly.

3. **Starting Location**: Place the "Origin" tile in the center. All player tokens start here. **This is the ONLY tile on the grid initially — you must place location cards to create new destinations!**

4. **Starting Hand**: Deal 5 cards from the main deck to each player.

## Card Types

### Locations (Blue Border)
- **Placed on the grid** to expand the world
- Must connect orthogonally (N/S/E/W) to existing tiles
- Some have special effects when entered
- Some require items to enter (Lantern for caves, Rope for mountains)

### Items (Green Border)
- **Held in hand** — cannot be "played" like events
- Can be traded with other players
- Some required for event cards or location entry
- Items stay in your hand until traded or discarded
- **Forbidden Items**: Special items for The Enemy's objective

### Events (Red Border)
- **Played for immediate effect**
- Some require items or conditions (adjacency to target)
- Discarded after use

## Turn Structure

Each turn you have **3 Action Points (AP)** to spend:

| Action | Cost | Description |
|--------|------|-------------|
| Move | 1 AP | Move your token to an adjacent location |
| Place Location | 1 AP | Add a location card to the grid |
| Play Event | 1 AP | Play an event card for its effect |
| Trade | 1 AP | Offer an item trade to another player |
| Draw | 1 AP per card | Draw cards from the deck (max hand size: 7) |
| Pass | 0 AP | End your turn |

**Hand Limit**: You may hold a maximum of 7 cards. You cannot draw if at the limit.

### Movement Rules
- **CRITICAL**: At game start, only "Origin" exists. You CANNOT move until locations are placed!
- Use `place_location` to add tiles to the grid, creating destinations
- You may only move to orthogonally adjacent tiles
- **Tip**: Place a location (1 AP) then move to it (1 AP) = expand and explore for 2 AP
- Some locations require items to enter (Lantern for caves, Rope for mountains)
- Some player abilities modify movement

### Placing Locations
- **This is how you expand the world** — essential for movement and exploration!
- Must connect orthogonally (N/S/E/W) to at least one existing tile
- Cannot overlap existing tiles
- You may place and immediately move to a new location (2 AP total)
- The Builder objective requires placing 5 locations
- Strategic placement can block or enable other players

### Trading
- Propose a trade to any player (items only)
- Target player may accept or decline
- Both players must agree for trade to complete
- **The Guardian** may block one trade per round

## Objectives

### Regular Objectives
Each regular player has a unique goal:
- **The Collector**: Hold 4 different items simultaneously
- **The Explorer**: Visit 6 different locations
- **The Builder**: Place 5 location cards
- **The Trader**: Complete 4 successful trades

### The Enemy
The Enemy wins by either:
1. **Sabotage**: Prevent all other players from completing their objectives (game reaches max turns with no winner)
2. **Forbidden Collection**: Collect all 3 Forbidden Items (Cursed Amulet, Dark Tome, Shadow Key)

## Winning

- **Declare Victory**: When you believe you've completed your objective, declare it. The Gamemaster verifies.
- **Enemy Reveal**: The Enemy may reveal at any time to claim victory via Forbidden Collection.
- **Time Limit**: If turn 40 is reached with no winner, The Enemy wins by default.

## Special Locations

| Location | Effect |
|----------|--------|
| Village Square | Trades here cost 0 AP |
| Ancient Ruins | Draw 1 card when entering |
| Hidden Cave | Your position is hidden from others |
| Watchtower | See all player positions |
| Forbidden Temple | Only The Enemy may enter (reveals them!) |

## Strategy Notes

### For Regular Players
- Complete your objective quickly before The Enemy can sabotage
- Watch for suspicious behavior — who's blocking progress?
- Trading can help you AND reveal information
- The Forbidden Items appearing in trades is suspicious...

### For The Enemy
- Subtle sabotage is better than obvious blocking
- Collect Forbidden Items discreetly
- The Forbidden Temple reveals you — only use if necessary
- Time is on your side

## Gamemaster Notes

### Adjudicating Victory Claims
- Verify objective conditions are met
- Track visited locations for Explorer
- Track completed trades for Trader
- Count held items for Collector
- Count placed locations for Builder

### The Enemy Reveal
- If The Enemy enters Forbidden Temple, they are revealed
- If The Enemy claims victory via Forbidden Collection, verify all 3 items
- If The Enemy is revealed but hasn't won, game continues (they can still collect items)

### Contested Actions
- Location requirements are strict (need Lantern for cave)
- Trade consent must be mutual
- Event requirements must be met (adjacency, items)
