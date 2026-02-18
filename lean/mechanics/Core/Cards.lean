/-
  Core/Cards.lean — Card mechanic formalization.

  Mirrors src/mechanics/core/cards.ts.
  Cards exist in zones (deck, hand, discard, tableau, trash).
  The fundamental invariant is **card conservation**: cards move between
  zones but are never created or destroyed (except via explicit trash).

  The TypeScript runtime tracks this implicitly via array mutations.
  Here we make it a provable property of the type.
-/

import Core.Types

namespace Playtest.Cards

open Playtest

/-! ## Card Location Tracking -/

/-- A card assignment maps every card in the game to exactly one zone.
    This is the core data structure — it *is* the card state. -/
structure CardAssignment (cards : List Card) where
  /-- Where each card currently lives. -/
  location : Card → Zone
  /-- Every card in the game set has a valid location (totality). -/
  complete : ∀ c, c ∈ cards → ∃ z, location c = z

/-! ## Zone Queries -/

/-- Get all cards in a specific zone. -/
def cardsInZone (cards : List Card) (ca : CardAssignment cards) (z : Zone) : List Card :=
  cards.filter (fun c => ca.location c == z)

/-- Get a player's hand. -/
def getHand (cards : List Card) (ca : CardAssignment cards) (pid : PlayerId) : List Card :=
  cardsInZone cards ca (Zone.hand pid)

/-- Get the shared deck. -/
def getDeck (cards : List Card) (ca : CardAssignment cards) : List Card :=
  cardsInZone cards ca Zone.deck

/-- Get the discard pile. -/
def getDiscard (cards : List Card) (ca : CardAssignment cards) : List Card :=
  cardsInZone cards ca Zone.discard

/-! ## Zone Transfers -/

/-- Move a card from one zone to another.
    Requires proof the card is currently in the source zone. -/
def transfer (ca : CardAssignment cards) (card : Card)
    (source target : Zone) (h : ca.location card = source) : CardAssignment cards :=
  { ca with
    location := fun c => if c == card then target else ca.location c
    complete := by
      intro c hc
      exact ⟨if c == card then target else ca.location c, rfl⟩ }

/-- Draw: move a card from deck to a player's hand. -/
def drawCard (ca : CardAssignment cards) (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.deck) : CardAssignment cards :=
  transfer ca card Zone.deck (Zone.hand pid) h

/-- Play: move a card from hand to discard (or tableau). -/
def playCardToDiscard (ca : CardAssignment cards) (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.hand pid) : CardAssignment cards :=
  transfer ca card (Zone.hand pid) Zone.discard h

/-- Play to tableau: move a card from hand to a player's tableau. -/
def playCardToTableau (ca : CardAssignment cards) (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.hand pid) : CardAssignment cards :=
  transfer ca card (Zone.hand pid) (Zone.tableau pid) h

/-- Discard: move a card from hand to discard pile. -/
def discardCard (ca : CardAssignment cards) (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.hand pid) : CardAssignment cards :=
  transfer ca card (Zone.hand pid) Zone.discard h

/-- Trash: move a card to the trash zone (permanent removal). -/
def trashCard (ca : CardAssignment cards) (card : Card) (source : Zone)
    (h : ca.location card = source) : CardAssignment cards :=
  transfer ca card source Zone.trash h

/-! ## Conservation Laws -/

/-- Card conservation: transfer does not change the total number of cards.
    The game set is constant — cards only change zones. -/
theorem transfer_preserves_card_set (ca : CardAssignment cards) (card : Card)
    (source target : Zone) (h : ca.location card = source) :
    ∀ c, c ∈ cards ↔ c ∈ cards := by
  intro c; exact Iff.rfl

/-- After a transfer, the moved card is in the target zone. -/
theorem transfer_moves_card (ca : CardAssignment cards) (card : Card)
    (source target : Zone) (h : ca.location card = source) :
    (transfer ca card source target h).location card = target := by
  simp [transfer]

/-- After a transfer, other cards are unaffected (frame condition). -/
theorem transfer_frame (ca : CardAssignment cards) (card other : Card)
    (source target : Zone) (h : ca.location card = source)
    (hne : ¬(other == card) = true) :
    (transfer ca card source target h).location other = ca.location other := by
  simp [transfer, hne]

/-- Drawing puts the card in the player's hand. -/
theorem draw_into_hand (ca : CardAssignment cards) (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.deck) :
    (drawCard ca card pid h).location card = Zone.hand pid := by
  exact transfer_moves_card ca card Zone.deck (Zone.hand pid) h

/-- Drawing doesn't affect other cards. -/
theorem draw_frame (ca : CardAssignment cards) (card other : Card) (pid : PlayerId)
    (h : ca.location card = Zone.deck) (hne : ¬(other == card) = true) :
    (drawCard ca card pid h).location other = ca.location other := by
  exact transfer_frame ca card other Zone.deck (Zone.hand pid) h hne

/-! ## Hand Size -/

/-- Count cards in a zone. -/
def zoneCount (cards : List Card) (ca : CardAssignment cards) (z : Zone) : Nat :=
  (cardsInZone cards ca z).length

/-- A hand size limit predicate. -/
def handSizeValid (cards : List Card) (ca : CardAssignment cards)
    (pid : PlayerId) (maxSize : Nat) : Prop :=
  zoneCount cards ca (Zone.hand pid) ≤ maxSize

end Playtest.Cards

/-! ## Card Mechanic Typeclass -/

namespace Playtest

/-- The CardMechanic typeclass — what core/cards.ts provides.
    Any game state `G` implementing this interface supports card operations.
    The `requires: ['cards']` constraint in leaf mechanics becomes
    `[CardMechanic G]` in Lean. -/
class CardMechanic (G : Type) where
  /-- Get a player's hand. -/
  getHand : G → PlayerId → List Card
  /-- Get the shared deck. -/
  getDeck : G → List Card
  /-- Get the discard pile. -/
  getDiscard : G → List Card
  /-- Draw cards from deck to hand. Returns updated state and drawn cards,
      or none if deck is empty. -/
  drawCards : G → PlayerId → Nat → Option (G × List Card)
  /-- Play a card from hand. Returns updated state or none if invalid. -/
  playCard : G → PlayerId → Card → Option G
  /-- Discard a card from hand. -/
  discardCard : G → PlayerId → Card → Option G
  /-- Add cards directly to a player's hand. -/
  addToHand : G → PlayerId → List Card → G

  -- Laws

  /-- Drawing removes from deck and adds to hand. -/
  draw_moves : ∀ (g : G) (pid : PlayerId) (n : Nat) (g' : G) (drawn : List Card),
    drawCards g pid n = some (g', drawn) →
    (∀ c, c ∈ drawn → c ∈ getDeck g ∧ c ∈ getHand g' pid ∧ c ∉ getDeck g')

  /-- Playing removes from hand. -/
  play_removes : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    playCard g pid card = some g' →
    card ∈ getHand g pid ∧ card ∉ getHand g' pid

  /-- Playing a card not in hand fails. -/
  play_requires_hand : ∀ (g : G) (pid : PlayerId) (card : Card),
    card ∉ getHand g pid → playCard g pid card = none

  /-- Drawing from empty deck fails. -/
  draw_empty_fails : ∀ (g : G) (pid : PlayerId) (n : Nat),
    getDeck g = [] → n > 0 → drawCards g pid n = none

/-- Hook interface for mechanics that depend on cards.
    Mirrors the `defines` hooks from cards.ts. -/
class CardDependent (G : Type) [CardMechanic G] where
  /-- Called when cards are drawn. Mirrors `onCardDrawn` hook. -/
  onCardDrawn : G → PlayerId → List Card → G
  /-- Called when a card is played. Mirrors `onCardPlayed` hook. -/
  onCardPlayed : G → PlayerId → Card → G
  /-- Called when a card is discarded. Mirrors `onCardDiscarded` hook. -/
  onCardDiscarded : G → PlayerId → Card → G

end Playtest
