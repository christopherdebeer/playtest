/-
  Core/Abstract/Collection.lean — Abstract Collection mechanic pattern.

  The second fundamental pattern: typed items in named zones with
  transfer operations between zones.

  **Instances:**
  - CardMechanic — cards in deck/hand/discard/tableau/trash zones
  - WorkerMechanic — workers on board spaces vs player supply
  - CargoMechanic — goods at locations vs player inventory
  - TokenMechanic — generic tokens in named containers

  **Key insight:** All collection-like mechanics share zone-transfer
  semantics with conservation laws. An item exists in exactly one zone
  at a time. Transfers are the only way to move items between zones.
  The total count is invariant under transfers (conservation).
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Abstract Collection Mechanic -/

/-- CollectionMechanic: the abstract pattern for items in zones.

    `Item` is the type of things being collected (Card, Worker, Token, etc.).
    `ZoneId` is the type of zone identifiers (Zone, SpaceId, LocationId, etc.).

    Every collection supports querying zone contents, transferring items
    between zones, and satisfies conservation (no item duplication or loss)
    and frame conditions (transferring one item doesn't affect others). -/
class CollectionMechanic (G : Type) (Item : outParam Type) (ZoneId : outParam Type)
    [DecidableEq Item] [DecidableEq ZoneId] where
  /-- Get all items in a zone. -/
  getItems : G → ZoneId → List Item
  /-- Get the zone containing a specific item. -/
  getZone : G → Item → Option ZoneId
  /-- Transfer an item from one zone to another.
      Returns none if the item is not in the source zone. -/
  transfer : G → Item → ZoneId → ZoneId → Option G
  /-- Add a new item to a zone (creation). -/
  addItem : G → Item → ZoneId → G
  /-- Remove an item entirely (destruction). -/
  removeItem : G → Item → Option G
  /-- Count items in a zone. -/
  countInZone : G → ZoneId → Nat

  -- === Laws ===

  /-- After transfer, the item is in the target zone. -/
  transfer_moves : ∀ (g : G) (item : Item) (src tgt : ZoneId) (g' : G),
    transfer g item src tgt = some g' →
    getZone g' item = some tgt

  /-- Transfer requires item to be in the source zone. -/
  transfer_requires_source : ∀ (g : G) (item : Item) (src tgt : ZoneId),
    getZone g item ≠ some src →
    transfer g item src tgt = none

  /-- Transfer doesn't affect other items (frame condition). -/
  transfer_frame : ∀ (g : G) (item other : Item) (src tgt : ZoneId) (g' : G),
    item ≠ other →
    transfer g item src tgt = some g' →
    getZone g' other = getZone g other

  /-- Adding an item places it in the specified zone. -/
  add_places : ∀ (g : G) (item : Item) (zone : ZoneId),
    getZone (addItem g item zone) item = some zone

  /-- countInZone is consistent with getItems. -/
  count_consistent : ∀ (g : G) (zone : ZoneId),
    countInZone g zone = (getItems g zone).length

/-! ## Conservation Law -/

/-- A collection is *conservative* if transfers preserve total item count.
    This is the strongest invariant: items are never duplicated or lost,
    only moved between zones.

    Not all CollectionMechanics need to be conservative — some games
    allow card creation (e.g., deck-building supply) or destruction
    (e.g., trashing). But the conservation law is provably useful for
    detecting bugs where items are accidentally duplicated. -/
class ConservativeCollection (G : Type) (Item : outParam Type) (ZoneId : outParam Type)
    [DecidableEq Item] [DecidableEq ZoneId]
    extends CollectionMechanic G Item ZoneId where
  /-- All items in the game (fixed set). -/
  allItems : G → List Item

  /-- Transfer preserves total item count. -/
  transfer_conserves : ∀ (g : G) (item : Item) (src tgt : ZoneId) (g' : G),
    transfer g item src tgt = some g' →
    (allItems g').length = (allItems g).length

  /-- Every item is in exactly one zone. -/
  item_unique_zone : ∀ (g : G) (item : Item),
    item ∈ allItems g →
    ∃ (zone : ZoneId), getZone g item = some zone ∧
      ∀ (z2 : ZoneId), getZone g item = some z2 → z2 = zone

/-! ## Player-Owned Collection -/

/-- A collection where zones are partitioned by player ownership.
    Each player has their own set of zones (hand, tableau, personal deck),
    plus shared zones (deck, discard, supply).

    This is the pattern for card games, where each player has a hand
    but the deck is shared. -/
class PlayerCollection (G : Type) (Item : outParam Type) (ZoneId : outParam Type)
    [DecidableEq Item] [DecidableEq ZoneId]
    extends CollectionMechanic G Item ZoneId where
  /-- Get the zones owned by a specific player. -/
  playerZones : G → PlayerId → List ZoneId
  /-- Get the shared (unowned) zones. -/
  sharedZones : G → List ZoneId
  /-- Get all items owned by a player (across all their zones). -/
  getPlayerItems : G → PlayerId → List Item

  -- === Laws ===

  /-- Transferring between one player's zones doesn't affect another player's items. -/
  player_isolation : ∀ (g : G) (item : Item) (src tgt : ZoneId) (pid other : PlayerId) (g' : G),
    pid ≠ other →
    src ∈ playerZones g pid →
    tgt ∈ playerZones g pid →
    transfer g item src tgt = some g' →
    getPlayerItems g' other = getPlayerItems g other

/-! ## Zone Capacity -/

/-- Some zones have capacity limits (e.g., max hand size, worker slots).
    This extends the base collection with capacity constraints. -/
class BoundedCollection (G : Type) (Item : outParam Type) (ZoneId : outParam Type)
    [DecidableEq Item] [DecidableEq ZoneId]
    extends CollectionMechanic G Item ZoneId where
  /-- Get the capacity of a zone (none = unlimited). -/
  getCapacity : G → ZoneId → Option Nat

  /-- Transfer to a full zone fails. -/
  transfer_respects_capacity : ∀ (g : G) (item : Item) (src tgt : ZoneId) (cap : Nat),
    getCapacity g tgt = some cap →
    countInZone g tgt ≥ cap →
    transfer g item src tgt = none

end Playtest.Abstract
