/-
  Leaf/DeckBuilding.lean — Deck-building mechanic formalization.

  Mirrors src/mechanics/deck-building.ts.
  `requires: ['cards']` — expressed as `[CardMechanic G]`.

  Deck-building adds personal decks per player on top of the card system.
  Players acquire cards from a shared supply into their personal deck,
  play cards from hand (drawn from personal deck), and reshuffle their
  personal discard into their deck when it runs out.
-/

import Core.Cards
import Core.Resources

namespace Playtest.DeckBuilding

open Playtest

/-! ## Supply Pile -/

/-- A supply pile: a card type with a count and cost. -/
structure SupplyPile where
  card : Card
  count : Nat       -- remaining copies
  cost : Nat        -- resource cost to acquire
  deriving Repr

/-- A supply is a collection of piles. -/
abbrev Supply := List SupplyPile

/-- Check if a supply pile has cards remaining. -/
def SupplyPile.available (pile : SupplyPile) : Bool :=
  pile.count > 0

/-- Remove one card from a supply pile. -/
def SupplyPile.take (pile : SupplyPile) (h : pile.count > 0) : SupplyPile :=
  { pile with count := pile.count - 1 }

/-! ## Personal Deck State -/

/-- Per-player deck-building state. -/
structure DeckState where
  /-- Personal deck (draw pile). -/
  deck : List Card
  /-- Personal discard pile. -/
  discard : List Card
  /-- Cards acquired this game (for tracking). -/
  acquired : Nat
  deriving Repr

/-- Total cards owned by this player (deck + discard + hand).
    Hand is tracked externally by CardMechanic. -/
def DeckState.ownedCards (ds : DeckState) (handSize : Nat) : Nat :=
  ds.deck.length + ds.discard.length + handSize

/-- Reshuffle: move all discard into deck.
    In a real implementation this would be randomized,
    but we model it as a list permutation. -/
def reshuffle (ds : DeckState) : DeckState :=
  { ds with deck := ds.deck ++ ds.discard, discard := [] }

/-- Draw from personal deck. If empty, reshuffle first. -/
def drawFromPersonal (ds : DeckState) : Option (DeckState × Card) :=
  match ds.deck with
  | card :: rest => some ({ ds with deck := rest }, card)
  | [] =>
    match ds.discard with
    | [] => none  -- both empty, can't draw
    | _ =>
      let reshuffled := reshuffle ds
      match reshuffled.deck with
      | card :: rest => some ({ reshuffled with deck := rest }, card)
      | [] => none  -- shouldn't happen after reshuffle with non-empty discard

/-- Acquire a card: add to personal discard (standard) or deck (variant). -/
def acquire (ds : DeckState) (card : Card) (toDiscard : Bool := true) : DeckState :=
  if toDiscard then
    { ds with discard := ds.discard ++ [card], acquired := ds.acquired + 1 }
  else
    { ds with deck := ds.deck ++ [card], acquired := ds.acquired + 1 }

/-- Trash a card from personal discard. -/
def trashFromDiscard (ds : DeckState) (card : Card)
    (h : card ∈ ds.discard) : DeckState :=
  { ds with discard := ds.discard.filter (· != card) }

/-! ## Laws -/

/-- Reshuffling preserves total card count (deck + discard). -/
theorem reshuffle_preserves_count (ds : DeckState) :
    (reshuffle ds).deck.length + (reshuffle ds).discard.length =
    ds.deck.length + ds.discard.length := by
  simp [reshuffle, List.length_append]

/-- Drawing reduces deck size by 1 (when deck is non-empty). -/
theorem draw_reduces_deck (ds : DeckState) (card : Card) (ds' : DeckState)
    (rest : List Card) (h : ds.deck = card :: rest)
    (hd : drawFromPersonal ds = some (ds', card)) :
    ds'.deck.length = ds.deck.length - 1 := by
  unfold drawFromPersonal at hd
  rw [h] at hd
  simp at hd
  subst hd
  rw [h]
  simp

/-- Acquiring increases total owned cards by 1. -/
theorem acquire_increases (ds : DeckState) (card : Card) (handSize : Nat)
    (toDiscard : Bool) :
    (acquire ds card toDiscard).ownedCards handSize =
    ds.ownedCards handSize + 1 := by
  simp [acquire, DeckState.ownedCards]
  split <;> simp [List.length_append] <;> omega

/-- Drawing from non-empty deck always succeeds. -/
theorem draw_nonempty_succeeds (ds : DeckState) (h : ds.deck ≠ []) :
    (drawFromPersonal ds).isSome = true := by
  simp [drawFromPersonal]
  match ds.deck, h with
  | _ :: _, _ => simp

end Playtest.DeckBuilding

/-! ## Deck-Building Mechanic Typeclass -/

namespace Playtest

/-- The DeckBuildingMechanic typeclass.
    `requires: ['cards']` is expressed as `[CardMechanic G]`.
    Optionally requires `[ResourceMechanic G]` for purchasing. -/
class DeckBuildingMechanic (G : Type) [CardMechanic G] where
  /-- Get a player's personal deck state. -/
  getPersonalDeck : G → PlayerId → DeckBuilding.DeckState
  /-- Get the shared supply. -/
  getSupply : G → DeckBuilding.Supply
  /-- Draw from personal deck to hand. -/
  drawPersonal : G → PlayerId → Nat → Option G
  /-- Acquire a card from the supply. -/
  acquireCard : G → PlayerId → Card → Option G
  /-- Trash a card (permanently remove). -/
  trashCard : G → PlayerId → Card → Option G

  -- Laws

  /-- Acquiring adds to personal collection. -/
  acquire_adds : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    acquireCard g pid card = some g' →
    let before := getPersonalDeck g pid
    let after := getPersonalDeck g' pid
    after.acquired = before.acquired + 1

  /-- Acquiring removes from supply. -/
  acquire_from_supply : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    acquireCard g pid card = some g' →
    ∃ (pile : DeckBuilding.SupplyPile), pile ∈ (getSupply g) ∧ pile.card = card ∧ pile.count > 0

  /-- Trashing permanently removes the card. -/
  trash_removes : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    trashCard g pid card = some g' →
    card ∉ (getPersonalDeck g' pid).deck ∧
    card ∉ (getPersonalDeck g' pid).discard

end Playtest
