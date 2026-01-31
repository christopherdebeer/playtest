---
name: "AAOTE: An Agent of the Enemy"
version: "0.1"
players: 3-5
starting_cards: 5
win_condition: "objective_completed"
max_turns: 40

# Reference mechanics from library
mechanics:
  - traitor-game
  - hidden-roles
  - grid-movement
  - tile-placement
  - trading
  - hand-management

# Engine mechanics configuration
engine_mechanics:
  # Action points system
  action_points:
    points_per_turn: 3
    action_costs:
      move: 1
      place_location: 1
      play_event: 1
      trade_offer: 1
      draw: 1
      pass: 0
    rollover: false

  # Grid/board system - starts with single origin tile
  grid:
    type: "infinite"
    starting_tile: "origin"
    adjacency: "orthogonal"  # 4 directions (N/S/E/W)

  # Trading system
  trading:
    items_only: true
    require_adjacency: false  # Can trade from anywhere? Or must be on same/adjacent tile?
    mutual_consent: true

  # Hidden objectives system
  hidden_objectives:
    deal_at_start: true
    reveal_on_completion: true

  # Victory declaration - GM must verify objective completion
  victory_declaration: true

# Player Cards (dealt face-up, visible to all)
player_cards:
  - { name: "The Scholar", count: 1, ability: "May look at top card of deck before drawing" }
  - { name: "The Merchant", count: 1, ability: "Trades cost 0 AP" }
  - { name: "The Scout", count: 1, ability: "May move 2 spaces for 1 AP" }
  - { name: "The Guardian", count: 1, ability: "May block one trade per round" }
  - { name: "The Mystic", count: 1, ability: "May peek at one player's objective once per game" }

# Objective Cards (dealt face-down, hidden)
objectives:
  # Regular objectives
  - { name: "The Collector", count: 1, type: "regular", condition: "Hold 4 different items simultaneously" }
  - { name: "The Explorer", count: 1, type: "regular", condition: "Visit 6 different locations" }
  - { name: "The Builder", count: 1, type: "regular", condition: "Place 5 location cards" }
  - { name: "The Trader", count: 1, type: "regular", condition: "Complete 4 trades" }
  # The Enemy objective
  - { name: "The Enemy", count: 1, type: "enemy", condition: "Prevent all other players from completing objectives OR collect the 3 Forbidden Items" }

# Main Deck - Locations, Items, Events
deck:
  # === LOCATIONS (placed on grid) ===
  # Basic locations
  - { name: "Forest Clearing", count: 3, type: "location", terrain: "forest", effect: { type: "safe" } }
  - { name: "Mountain Pass", count: 2, type: "location", terrain: "mountain", effect: { type: "safe" } }
  - { name: "River Crossing", count: 2, type: "location", terrain: "water", effect: { type: "safe" } }
  - { name: "Village Square", count: 2, type: "location", terrain: "settlement", effect: { type: "trade_bonus" } }
  - { name: "Ancient Ruins", count: 2, type: "location", terrain: "ruins", effect: { type: "draw_on_enter", value: 1 } }
  - { name: "Crossroads", count: 2, type: "location", terrain: "road", connections: 4, effect: { type: "safe" } }

  # Special locations
  - { name: "Hidden Cave", count: 1, type: "location", terrain: "cave", effect: { type: "hide", description: "Avatar cannot be seen by others" } }
  - { name: "Watchtower", count: 1, type: "location", terrain: "tower", effect: { type: "reveal", description: "See all player positions" } }
  - { name: "Forbidden Temple", count: 1, type: "location", terrain: "temple", effect: { type: "enemy_only", description: "Only The Enemy may enter" } }

  # === ITEMS (held in hand, tradeable) ===
  # Common items
  - { name: "Lantern", count: 3, type: "item", effect: { type: "utility", description: "Required for cave locations" } }
  - { name: "Rope", count: 3, type: "item", effect: { type: "utility", description: "Required for mountain locations" } }
  - { name: "Compass", count: 2, type: "item", effect: { type: "movement_bonus", description: "Move costs 0 AP once per turn" } }
  - { name: "Map Fragment", count: 4, type: "item", effect: { type: "collectible", description: "Collect 3 to peek at any objective" } }
  - { name: "Supplies", count: 3, type: "item", effect: { type: "currency", description: "Used for certain events" } }

  # Forbidden items (Enemy objective)
  - { name: "Cursed Amulet", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 1/3" } }
  - { name: "Dark Tome", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 2/3" } }
  - { name: "Shadow Key", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 3/3" } }

  # === EVENTS (played during turn) ===
  # Movement events
  - { name: "Swift Journey", count: 2, type: "event", effect: { type: "extra_movement", value: 2 } }
  - { name: "Shortcut", count: 2, type: "event", effect: { type: "teleport_adjacent", description: "Move to any tile adjacent to any player" } }

  # Information events
  - { name: "Spy", count: 2, type: "event", effect: { type: "peek_hand", description: "Look at target player's hand" } }
  - { name: "Interrogate", count: 1, type: "event", requires: ["Supplies"], effect: { type: "peek_objective", description: "Peek at target's objective" } }

  # Interference events
  - { name: "Roadblock", count: 2, type: "event", effect: { type: "block_tile", duration: 1, description: "Block a location for 1 round" } }
  - { name: "Theft", count: 2, type: "event", requires: ["adjacency"], effect: { type: "steal_item", description: "Steal random item from adjacent player" } }
  - { name: "Sabotage", count: 1, type: "event", effect: { type: "destroy_location", description: "Remove a non-occupied location from grid" } }

  # Defensive events
  - { name: "Evasion", count: 2, type: "event", effect: { type: "counter", description: "Cancel an event targeting you" } }
  - { name: "Hidden Path", count: 2, type: "event", effect: { type: "secret_move", description: "Move without revealing destination" } }
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

3. **Starting Location**: Place the "Origin" tile in the center. All player tokens start here.

4. **Starting Hand**: Deal 5 cards from the main deck to each player.

## Card Types

### Locations (Blue Border)
- **Placed on the grid** to expand the world
- Must connect orthogonally (N/S/E/W) to existing tiles
- Some have special effects when entered
- Some require items to enter (Lantern for caves, Rope for mountains)

### Items (Green Border)
- **Held in hand** until used or traded
- Can be traded with other players
- Some required for event cards or location entry
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
| Draw | 1 AP | Draw 1 card from the deck |
| Pass | 0 AP | End your turn |

### Movement Rules
- You may only move to orthogonally adjacent tiles
- Some locations require items to enter
- Some player abilities modify movement

### Placing Locations
- Must connect to at least one existing tile
- Cannot overlap existing tiles
- You may place and immediately move to a new location (2 AP total)

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

---

## Design Notes (Remove before finalizing)

### Open Questions
1. **Grid visibility**: Can players see the whole grid or only explored areas?
2. **Hand limits**: Should there be a maximum hand size?
3. **Item dropping**: Can items be dropped on locations for others to pick up?
4. **Multiple enemies**: Scale to 2 enemies for 5+ players?
5. **Forbidden Item distribution**: How do they enter the game? Shuffled in deck or placed on specific locations?
6. **Trade distance**: Must players be adjacent to trade, or anywhere?

### Playtest Goals
- Is 3 AP per turn enough? Too much?
- Are regular objectives achievable in 40 turns?
- Is The Enemy too powerful/weak?
- Do the special locations create interesting choices?
- Is trading meaningful or ignored?
