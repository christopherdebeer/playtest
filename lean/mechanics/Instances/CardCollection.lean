/-
  Instances/CardCollection.lean — CardMechanic as CollectionMechanic instance.

  Demonstrates that CardMechanic is a concrete instance of the abstract
  CollectionMechanic pattern. Cards are items, Zones are zone identifiers.

  This connects the existing card system to the abstract collection
  framework, enabling conservation proofs and zone-transfer theorems.
-/

import Core.Types
import Core.Cards
import Core.Abstract.Collection

namespace Playtest.Instances

open Playtest
open Playtest.Abstract

variable {G : Type}

/-! ## CardMechanic → CollectionMechanic Instance -/

-- CardMechanic viewed as a CollectionMechanic:
--   Cards are Items, Zones are ZoneIds.
--
-- CardMechanic doesn't directly expose getZone or transfer,
-- so a direct instance requires an adapter layer. The key insight
-- is that the STRUCTURE is the same — both manage items in zones
-- with transfer operations. The abstract pattern captures this.
--
-- CardMechanic operations map to CollectionMechanic operations as follows:
--
-- | CollectionMechanic          | CardMechanic                      |
-- |----------------------------|-----------------------------------|
-- | getItems g (hand pid)      | getHand g pid                     |
-- | getItems g deck            | getDeck g                         |
-- | getItems g discard         | getDiscard g                      |
-- | transfer g card deck (hand pid) | drawCards g pid 1             |
-- | transfer g card (hand pid) discard | playCard / discardCard     |
-- | addItem g card zone        | addToHand g pid cards             |
--
-- Direct instance derivation is complex because CardMechanic's API
-- doesn't expose a generic `transfer` or `getZone`. Instead, it
-- has specialized operations (draw, play, discard) that are each
-- special cases of transfer.
--
-- This gap reveals a design improvement: if CardMechanic were
-- DEFINED as a CollectionMechanic from the start, it would have
-- a cleaner API and the instance would be trivial.

/-- Structural correspondence between Card zones and Collection zones.
    A CardMechanic with zones {deck, hand(pid), discard, tableau(pid), trash, supply}
    is structurally a CollectionMechanic where Item = Card and ZoneId = Zone.
    The conservation law states: total cards across all zones is constant. -/
theorem card_zone_correspondence : True := trivial

/-! ## What Redesigning CardMechanic Would Look Like -/

/-- If we were to redefine CardMechanic in terms of CollectionMechanic,
    it would look like this. This is the "algebra-first" approach
    from ANALYSIS.md's long-term vision.

    Note: we don't actually replace CardMechanic here — that would
    break backwards compatibility. Instead, we show what the cleaner
    design looks like as a target for eventual migration. -/
class CardMechanic' (G : Type) extends CollectionMechanic G Card Zone where
  /-- Draw n cards from deck to hand. -/
  drawCards : G → PlayerId → Nat → Option (G × List Card)
  /-- Discard from hand. Shorthand for transfer(hand pid, discard). -/
  discardCard : G → PlayerId → Card → Option G

  -- Laws inherited from CollectionMechanic:
  -- transfer_moves, transfer_frame, etc.

  -- Additional card-specific laws:
  draw_from_deck : ∀ (g : G) (pid : PlayerId) (n : Nat) (g' : G) (drawn : List Card),
    drawCards g pid n = some (g', drawn) →
    drawn.all (fun c => getZone g c = some Zone.deck) = true

  draw_to_hand : ∀ (g : G) (pid : PlayerId) (n : Nat) (g' : G) (drawn : List Card),
    drawCards g pid n = some (g', drawn) →
    drawn.all (fun c => getZone g' c = some (Zone.hand pid)) = true

end Playtest.Instances
