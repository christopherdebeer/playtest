---
name: "AAOTE: An Agent of the Enemy"
version: "0.3"
players: 3-5
win_condition: "objective_completed"
max_turns: 40  # Proposal 012: Turn-based limit (40 turns, not rounds)

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

mechanics:
  # Lean 4 execution engine — Lean computes ALL state transitions
  # No TS mechanics active; Lean handles AP, grid, cards, trading, win conditions
  lean_executor: true
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

---

## Design Notes (Remove before finalizing)

### Resolved in v0.2
- **Hand limits**: Maximum 7 cards (cannot draw at limit)
- **Trade distance**: Can trade from anywhere
- **Card types**: Items held/traded only, cannot be "played"
- **Timeout winner**: The Enemy wins by default at turn 40

### Open Questions
1. **Grid visibility**: Can players see the whole grid or only explored areas?
2. **Item dropping**: Can items be dropped on locations for others to pick up?
3. **Multiple enemies**: Scale to 2 enemies for 5+ players?
4. **Forbidden Item distribution**: How do they enter the game? Shuffled in deck or placed on specific locations?

### Playtest Goals
- Is 3 AP per turn enough? Too much?
- Are regular objectives achievable in 40 turns with 7-card hand limit?
- Is The Enemy too powerful/weak?
- Do the special locations create interesting choices?
- Is trading meaningful or ignored?
