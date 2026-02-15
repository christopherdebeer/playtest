---
name: "AAOTE: An Agent of the Enemy"
version: "0.6"
players: 3-5
win_condition: "objective_completed"
max_turns: 32  # Tightened from 36: v0.5 game ended at turn 23 (64%), reducing to 32 increases Enemy urgency

# Player Cards (dealt face-up, visible to all)
player_cards:
  - { name: "The Scholar", count: 1, ability: "Once per round, may look at the top 2 cards of the deck before drawing. Keep one, shuffle the other back." }
  - { name: "The Merchant", count: 1, ability: "Trades cost 0 AP. Once per round, may force a 1-for-1 trade with any player (target chooses which item to give)." }
  - { name: "The Scout", count: 1, ability: "May move 2 spaces for 1 AP. Once per game, may peek at any 2 tiles on the grid without moving." }
  - { name: "The Guardian", count: 1, ability: "May block one trade per round. Once per round, may inspect one item held by an adjacent player (see if it is Forbidden)." }
  - { name: "The Mystic", count: 1, ability: "Once per game, may peek at one player's objective. Once per round, may sense whether an adjacent player holds a Forbidden Item (yes/no only)." }

# Objective Cards (dealt face-down, hidden)
objectives:
  # Regular objectives — rebalanced from v0.4 (v0.4 was too hard, v0.3 was too easy)
  - { name: "The Collector", count: 1, type: "regular", condition: "Hold 4 different named items simultaneously, with at least 1 obtained via trade" }
  - { name: "The Explorer", count: 1, type: "regular", condition: "Visit 6 different named locations (Origin counts, duplicate tile names do not count separately)" }
  - { name: "The Builder", count: 1, type: "regular", condition: "Place 4 location cards on the grid" }
  - { name: "The Trader", count: 1, type: "regular", condition: "Complete 3 successful trades with at least 2 different players" }
  # The Enemy objective
  - { name: "The Enemy", count: 1, type: "enemy", condition: "Collect all 3 Forbidden Items OR get the game to reach max turns with no regular player winning" }

mechanics:
  # Action points system
  action_points:
    points_per_turn: 3
    action_costs:
      move: 1
      place_location: 1
      play_card: 1      # Events cost 1 AP each
      trade_offer: 1
      draw: 1           # Each card drawn costs 1 AP
      accuse: 1         # Reduced from 2 AP — v0.4 showed 2 AP was too expensive, nobody accused
      pass: 0
    rollover: false

  # Grid/board system
  grid:
    type: "infinite"
    starting_tile: "origin"
    adjacency: "orthogonal"  # 4 directions (N/S/E/W)

  # Hand limits
  hand_limit: 7  # Restored to 7 — 6 was too restrictive for Collector objective
  hand_limit_policy: "cannot_draw"

  # Card type restrictions
  card_type_rules:
    item:
      playable: false
      tradeable: true
      holdable: true
    event:
      playable: true
      tradeable: false
      holdable: true
    location:
      playable: false
      placeable: true
      holdable: true

  # Default winner on timeout
  timeout_winner:
    type: "role"
    role: "enemy"
    reveal_role: true

  # Trading system — now requires same location or adjacency
  trade:
    enabled: true
    item_types_only: true
    require_same_location: false
    require_adjacent_location: false   # Reverted: adjacency requirement killed trading in v0.4 since players spread out
    allow_gifts: false                # Keep: no free gifts prevents accidental Forbidden Item handoffs
    max_cards_per_trade: 2

  # Hidden objectives system
  hidden_objectives:
    deal_at_start: true
    reveal_on_completion: true

  # Victory declaration
  victory_declaration: true
  hidden_roles: true
  traitor_game: true
  place_location: true
  trading: true
  hand_management: true

  # NEW: Suspicion system — social deduction mechanic
  suspicion:
    enabled: true
    accuse_cost: 1          # Reduced from 2: v0.4 showed 2 AP was too expensive for anyone to accuse
    vote_threshold: "majority"  # Majority of remaining players must agree
    correct_exile: true     # If accused is The Enemy, they are exiled (regular players win)
    wrong_exile: true       # If accused is NOT The Enemy, accuser loses 1 turn (skip next turn)
    max_accusations_per_round: 1

  cards:
    starting_hand: 5  # Restored: 4 was too few. Turn-1 wins fixed by trade requirement on Collector
    deck:
      # === LOCATIONS (placed on grid) ===
      # Basic locations
      - { name: "Forest Clearing", count: 3, type: "location", terrain: "forest", effect: { type: "safe" } }
      - { name: "Mountain Pass", count: 2, type: "location", terrain: "mountain", requires: ["Rope"], effect: { type: "safe" } }
      - { name: "River Crossing", count: 2, type: "location", terrain: "water", effect: { type: "safe" } }
      - { name: "Village Square", count: 2, type: "location", terrain: "settlement", effect: { type: "trade_bonus", description: "Trades here cost 0 AP and both players draw 1 card" } }
      - { name: "Ancient Ruins", count: 2, type: "location", terrain: "ruins", effect: { type: "draw_on_enter", value: 1 } }
      - { name: "Crossroads", count: 2, type: "location", terrain: "road", connections: 4, effect: { type: "safe" } }
      - { name: "Merchant Camp", count: 1, type: "location", terrain: "camp", effect: { type: "forced_trade", description: "When entering, you must offer a trade to any player or discard 1 card" } }
      - { name: "Shrine of Truth", count: 1, type: "location", terrain: "shrine", effect: { type: "reveal_hint", description: "Draw and reveal the top card of the deck. If it is an item, you may take it; otherwise discard it." } }

      # Special locations
      - { name: "Hidden Cave", count: 1, type: "location", terrain: "cave", requires: ["Lantern"], effect: { type: "hide", description: "Your position is hidden from others until you move" } }
      - { name: "Watchtower", count: 1, type: "location", terrain: "tower", effect: { type: "reveal", description: "See all player positions and hand sizes" } }
      - { name: "Forbidden Temple", count: 1, type: "location", terrain: "temple", effect: { type: "enemy_only", description: "Only The Enemy may enter — reveals them but they draw 2 cards" } }

      # === ITEMS (held in hand, tradeable) ===
      # Common items — balanced for Collector needing 4 unique via trade
      - { name: "Lantern", count: 3, type: "item", effect: { type: "utility", description: "Required for cave locations" } }
      - { name: "Rope", count: 3, type: "item", effect: { type: "utility", description: "Required for mountain locations" } }
      - { name: "Compass", count: 2, type: "item", effect: { type: "movement_bonus", description: "Move costs 0 AP once per turn" } }
      - { name: "Map Fragment", count: 3, type: "item", effect: { type: "collectible", description: "Collect 3 to peek at any player's objective" } }
      - { name: "Supplies", count: 3, type: "item", effect: { type: "currency", description: "Required for certain events" } }
      - { name: "Seal of Authority", count: 1, type: "item", effect: { type: "accusation_bonus", description: "Holder's accusations only cost 1 AP instead of 2" } }
      - { name: "Protective Ward", count: 1, type: "item", effect: { type: "defense", description: "Discard to cancel a Theft or Sabotage targeting you" } }

      # Forbidden items (Enemy objective) — placed deeper in deck, never in starting hands
      - { name: "Cursed Amulet", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 1/3. Holder loses 1 AP per turn unless they are The Enemy." } }
      - { name: "Dark Tome", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 2/3. Holder's hand limit reduced by 1 unless they are The Enemy." } }
      - { name: "Shadow Key", count: 1, type: "item", subtype: "forbidden", effect: { type: "enemy_item", description: "Forbidden Item 3/3. Holder cannot use Hidden Path or Hidden Cave unless they are The Enemy." } }

      # === EVENTS (played during turn) ===
      # Movement events
      - { name: "Swift Journey", count: 2, type: "event", effect: { type: "extra_movement", value: 2 } }
      - { name: "Shortcut", count: 2, type: "event", effect: { type: "teleport_adjacent", description: "Move to any tile adjacent to any player" } }

      # Information events
      - { name: "Spy", count: 2, type: "event", effect: { type: "peek_hand", description: "Look at target player's hand" } }
      - { name: "Interrogate", count: 1, type: "event", requires: ["Supplies"], effect: { type: "peek_objective", description: "Peek at target's objective card" } }
      - { name: "Town Crier", count: 2, type: "event", effect: { type: "public_reveal", description: "Reveal one item from your hand to all players. If it is a Forbidden Item, all players learn this." } }

      # Interference events
      - { name: "Roadblock", count: 2, type: "event", effect: { type: "block_tile", duration: 1, description: "Block a location for 1 round" } }
      - { name: "Theft", count: 2, type: "event", requires: ["adjacency"], effect: { type: "steal_item", description: "Steal random item from adjacent player" } }
      - { name: "Sabotage", count: 1, type: "event", effect: { type: "destroy_location", description: "Remove a non-occupied location from grid" } }
      - { name: "Confiscate", count: 1, type: "event", requires: ["adjacency"], effect: { type: "force_reveal", description: "Adjacent player must reveal all items in hand. You may take one Forbidden Item if revealed." } }

      # Defensive events
      - { name: "Evasion", count: 2, type: "event", effect: { type: "counter", description: "Cancel an event targeting you" } }
      - { name: "Hidden Path", count: 2, type: "event", effect: { type: "secret_move", description: "Move without revealing destination" } }
---

# AAOTE: An Agent of the Enemy

A social deduction game of hidden objectives, expanding territories, and uncertain allegiances.

## Overview

Players explore an ever-expanding world, placing locations, collecting items, and completing secret objectives. But one among you is **The Enemy** — working to sabotage everyone's plans. Use the **Suspicion System** to accuse and exile players you believe are The Enemy, but be careful — a wrong accusation costs you dearly.

## Components

- **Player Cards** (5): Public identity with special ability
- **Objective Cards** (5): Secret win condition (one is The Enemy)
- **Main Deck**: Locations, Items, and Events

## Setup

1. **Player Cards**: Deal one face-up to each player. These abilities are public knowledge.

2. **Objectives**: Shuffle and deal one face-down to each player. Look at your objective secretly.

3. **Starting Location**: Place the "Origin" tile in the center. All player tokens start here. **This is the ONLY tile on the grid initially — you must place location cards to create new destinations!**

4. **Starting Hand**: Deal 5 cards from the main deck to each player. **Forbidden Items are never dealt in starting hands** — the engine shuffles them into the bottom half of the deck automatically.

5. **Origin counts** as a visited location for objective purposes.

## Card Types

### Locations (Blue Border)
- **Placed on the grid** to expand the world
- Must connect orthogonally (N/S/E/W) to existing tiles
- Some have special effects when entered
- Some require items to enter (Lantern for caves, Rope for mountains)
- **Multiple tiles with the same name count as ONE named location** for Explorer objectives

### Items (Green Border)
- **Held in hand** — cannot be "played" like events
- Can be traded with adjacent or co-located players
- Some required for event cards or location entry
- Items stay in your hand until traded or discarded
- **Forbidden Items**: Cursed items that penalize regular players who hold them but empower The Enemy

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
| Trade | 1 AP | Offer an item trade to an adjacent/co-located player |
| Draw | 1 AP per card | Draw cards from the deck (max hand size: 7) |
| Accuse | 1 AP | Accuse a player of being The Enemy (triggers vote) |
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
- The Builder objective requires placing 5 locations AND having others use them
- Strategic placement can block or enable other players

### Trading
- Propose a trade to any player (items only, no distance requirement)
- Target player may accept or decline
- Both players must agree for trade to complete
- **No gifts allowed** — every trade must be a reciprocal exchange
- **The Guardian** may block one trade per round
- **The Merchant** trades cost 0 AP; once per round, may force a 1-for-1 trade (target picks what to give)
- **Village Square bonus**: Trades at Village Square cost 0 AP and both players draw 1 card
- **The Collector needs at least 1 traded item** — this makes trading essential, not optional

### The Suspicion System (NEW)
When you suspect a player is The Enemy, you may **accuse** them:

1. **Accuse** (1 AP): Name a player and state your evidence
2. **Vote**: All other players vote yes/no. Majority required to exile.
3. **Resolution**:
   - **Correct** (accused IS The Enemy): The Enemy is exiled, all regular players win collectively
   - **Wrong** (accused is NOT The Enemy): Accuser skips their next turn entirely. Accused draws 2 cards as compensation.
4. **Limit**: Maximum 1 accusation per round
5. **The Enemy can also accuse** to frame innocent players and cause them to lose turns

## Objectives

### Regular Objectives
Each regular player has a unique goal:
- **The Collector**: Hold 4 different named items simultaneously, with at least 1 obtained via trade
- **The Explorer**: Visit 6 different named locations (Origin counts; duplicate tile names do not count separately)
- **The Builder**: Place 4 location cards on the grid
- **The Trader**: Complete 3 successful trades with at least 2 different players

### The Enemy
The Enemy wins by either:
1. **Sabotage**: Prevent all other players from completing their objectives (game reaches turn 36 with no winner)
2. **Forbidden Collection**: Collect all 3 Forbidden Items (Cursed Amulet, Dark Tome, Shadow Key)
3. **Manipulation**: Get 2 regular players exiled through false accusations (The Enemy can accuse others, and if other players wrongly exile regulars, it counts)

## Forbidden Items — The Curse Mechanic (NEW)

Forbidden Items are powerful but **cursed for regular players**:

| Item | Regular Player Penalty | Enemy Benefit |
|------|----------------------|---------------|
| Cursed Amulet | Lose 1 AP per turn (only 2 AP available) | No penalty |
| Dark Tome | Hand limit reduced by 1 (max 5 cards) | No penalty |
| Shadow Key | Cannot use Hidden Path or Hidden Cave | No penalty |

- Forbidden Items are shuffled into the **bottom half** of the deck (never in starting hands)
- Regular players will want to **get rid of** Forbidden Items — but trading them away might help The Enemy
- Use **Confiscate** or **Theft** to take Forbidden Items from The Enemy
- Holding a Forbidden Item is a strong signal — but it could be an innocent player stuck with a cursed card

## Winning

- **Declare Victory**: When you believe you've completed your objective, declare it. The Gamemaster verifies.
- **Collective Victory via Accusation**: If The Enemy is correctly accused and exiled, ALL regular players win.
- **Enemy Reveal**: The Enemy may reveal at any time to claim victory via Forbidden Collection.
- **Time Limit**: If turn 36 is reached with no winner, The Enemy wins by default.
- **Tiebreaker**: If multiple players complete objectives on the same turn, the player earlier in turn order wins.

## Special Locations

| Location | Effect |
|----------|--------|
| Village Square | Trades here cost 0 AP and both players draw 1 card |
| Ancient Ruins | Draw 1 card when entering |
| Hidden Cave | Your position is hidden (requires Lantern to enter) |
| Watchtower | See all player positions and hand sizes |
| Forbidden Temple | Only The Enemy may enter (reveals them, but they draw 2 cards) |
| Merchant Camp | Must offer a trade or discard 1 card when entering |
| Shrine of Truth | Reveal top deck card; take it if item, discard if not |

## Strategy Notes

### For Regular Players
- Complete your objective before turn 36 or The Enemy wins
- Watch for Forbidden Item cursed effects on other players — if someone isn't affected, they might be The Enemy
- Trading creates information: refusing trades or demanding Forbidden Items is suspicious
- The Suspicion System is your weapon — but wrong accusations hurt you
- Coordinate with other players through trades and shared information

### For The Enemy
- Subtle sabotage is better than obvious blocking
- Collect Forbidden Items discreetly — the curse doesn't affect you, which is itself suspicious
- Use accusations to frame innocent players and waste their turns
- The Forbidden Temple gives cards but reveals you — only use in desperation
- Time is on your side, but the Suspicion System means you can be caught

## Gamemaster Notes

### Adjudicating Victory Claims
- **Collector**: Verify 4 unique named items AND at least 1 obtained via trade (track trade history)
- **Explorer**: Count unique named locations visited (Origin counts, duplicates don't)
- **Builder**: Count placed locations (need 4)
- **Trader**: Count completed trades AND verify 2+ different trade partners

### The Enemy Reveal
- If The Enemy enters Forbidden Temple, they are revealed to all
- If The Enemy claims victory via Forbidden Collection, verify all 3 items
- If The Enemy is revealed but hasn't won, game continues
- Track exile count for Enemy's manipulation victory path

### Suspicion Votes
- All players except the accused vote
- The accuser automatically votes "yes"
- Majority (>50%) required to exile
- Exiled player reveals objective card

### Contested Actions
- Location requirements are strict (need Lantern for cave, Rope for mountain)
- Trade requires adjacency or co-location
- Event requirements must be met (adjacency, items)
- No gift trades — all trades must be reciprocal exchanges

---

## Design Notes (v0.6 Changes)

### v0.3→v0.4 Changes (overcorrected)
- Collector 4→5 items + 3-source requirement = too hard (nobody completed)
- Explorer 6→8 locations = too hard (not enough unique names in deck)
- Builder required 2 players standing on your tiles = impossible coordination
- Accuse cost 2 AP = nobody accused
- Hand limit 7→6 = too restrictive
- Starting hand 5→4 = too slow
- Trade adjacency requirement = killed trading since players spread out
- Max turns 40→30 = Enemy won trivially by timeout

### v0.5 Rebalancing (finding the sweet spot)
- **Collector**: 4 unique items, but 1 must come from trade (prevents turn-1 win, forces interaction)
- **Explorer**: 6 named locations (Origin counts, duplicates don't) — achievable with 11 unique names
- **Builder**: Place 4 locations (removed player-standing requirement — too hard to coordinate)
- **Trader**: 3 trades with 2+ partners (unchanged from v0.4)
- **Accuse cost**: 2→1 AP (make social deduction accessible)
- **Hand limit**: 6→7 (restored — Collector needs room)
- **Starting hand**: 4→5 (restored — turn-1 win blocked by trade requirement)
- **Trade adjacency**: Removed (killed trading in v0.4)
- **Max turns**: 30→36 (30 was too short for objectives)
- **Gifts**: Still disabled (prevents Forbidden Item accidents)

### v0.5 Playtest Results (Playtest 3)
- **Winner**: Player-1 (Collector) in 23 turns (64% of 36-turn max)
- **Grade**: C+ — mechanics sound but critical engine gaps
- **What Worked**: Collector trade requirement, victory declaration, game pacing, Village Square hub
- **What Failed**:
  - Forbidden Item curses NOT enforced — Player-1 held Cursed Amulet + Dark Tome with zero penalties
  - Suspicion system completely unused — 0 accusations in 23 turns
  - Event card targeting broken — Theft, Roadblock, Interrogate all skipped
  - Forbidden Items dealt in starting hands — rules say bottom half only

### v0.6 Engine Fixes
1. **FIX: Forbidden Item deck placement** — Engine now separates forbidden items (effect.type="enemy_item") and shuffles them into bottom half of deck only. Starting hands guaranteed clean.
2. **FIX: Forbidden Item curse enforcement** — New `forbidden-items` mechanic runs `onTurnStart` to check player hands. Non-Enemy holders of Cursed Amulet lose 1 AP/turn; Dark Tome holders get hand limit -1. Enemy is immune.
3. **FIX: Max turns 36→32** — Increases Enemy urgency (v0.5 ended at turn 23 of 36, Enemy had no realistic path to collect 3 Forbidden Items)
4. **FIX: Starting hand text** — Setup section now correctly says 5 cards (matching config)

### Key Design Principles Discovered
1. **Every objective needs at least 1 interaction gate** — prevents solo-completion
2. **The sweet spot is ~60-80% of max turns** for objective completion
3. **Social deduction needs to be cheap** — expensive accusations go unused
4. **Trading needs incentive AND opportunity** — Collector trade requirement provides both
5. **Forbidden Item curses create observable signals** for Enemy detection
6. **Engine enforcement is critical** — GM-only adjudication of curses doesn't work; agents don't self-penalize

### Still Open
1. **Player abilities not tracked by engine** — GM must adjudicate manually (Scholar, Merchant, Scout, Guardian, Mystic)
2. **Multiple enemies for 5+ players** — untested
3. **Suspicion system needs incentivization** — 0 accusations in v0.5; may need information rewards for accusing
4. **Event card targeting** — Complex events (Theft, Roadblock, Interrogate) need mechanic agent intervention for target selection

### Playtest Goals for v0.6
- Do Forbidden Item curses now create detectable signals?
- Does 32-turn limit increase Enemy urgency without being too tight for regular objectives?
- Does the Suspicion system see any use with functioning curses?
- Is the forbidden-items mechanic correctly applying AP and hand limit penalties?
