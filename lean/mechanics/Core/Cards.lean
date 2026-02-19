/-
  Core/Cards.lean — Card mechanic formalization.

  Mirrors src/mechanics/core/cards.ts.
  Cards exist in zones (deck, hand, discard, tableau, trash).
  The fundamental invariant is **card conservation**: cards move between
  zones but are never created or destroyed (except via explicit trash).
-/

import Core.Types

namespace Playtest.Cards

open Playtest

/-! ## Card Location Tracking -/

/-- A card assignment maps every card in the game to exactly one zone. -/
structure CardAssignment (cards : List Card) where
  /-- Where each card currently lives. -/
  location : Card → Zone

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
def transfer {cards : List Card} (ca : CardAssignment cards) (card : Card)
    (_source target : Zone) (_h : ca.location card = _source) : CardAssignment cards :=
  { location := fun c => if c = card then target else ca.location c }

/-- Draw: move a card from deck to a player's hand. -/
def drawCard {cards : List Card} (ca : CardAssignment cards) (card : Card)
    (pid : PlayerId) (h : ca.location card = Zone.deck) : CardAssignment cards :=
  transfer ca card Zone.deck (Zone.hand pid) h

/-- Play to discard: move a card from hand to discard. -/
def playCardToDiscard {cards : List Card} (ca : CardAssignment cards)
    (card : Card) (pid : PlayerId)
    (h : ca.location card = Zone.hand pid) : CardAssignment cards :=
  transfer ca card (Zone.hand pid) Zone.discard h

/-- Trash: move a card to the trash zone (permanent removal). -/
def trashCard {cards : List Card} (ca : CardAssignment cards) (card : Card)
    (source : Zone) (h : ca.location card = source) : CardAssignment cards :=
  transfer ca card source Zone.trash h

/-! ## Conservation Laws -/

/-- After a transfer, the moved card is in the target zone. -/
theorem transfer_moves_card {cards : List Card} (ca : CardAssignment cards)
    (card : Card) (source target : Zone) (h : ca.location card = source) :
    (transfer ca card source target h).location card = target := by
  simp [transfer]

/-- After a transfer, other cards are unaffected (frame condition). -/
theorem transfer_frame {cards : List Card} (ca : CardAssignment cards)
    (card other : Card) (source target : Zone) (h : ca.location card = source)
    (hne : other ≠ card) :
    (transfer ca card source target h).location other = ca.location other := by
  simp [transfer, hne]

/-- Drawing puts the card in the player's hand. -/
theorem draw_into_hand {cards : List Card} (ca : CardAssignment cards)
    (card : Card) (pid : PlayerId) (h : ca.location card = Zone.deck) :
    (drawCard ca card pid h).location card = Zone.hand pid :=
  transfer_moves_card ca card Zone.deck (Zone.hand pid) h

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

/-- The CardMechanic typeclass — what core/cards.ts provides. -/
class CardMechanic (G : Type) where
  /-- Get a player's hand. -/
  getHand : G → PlayerId → List Card
  /-- Get the shared deck. -/
  getDeck : G → List Card
  /-- Get the discard pile. -/
  getDiscard : G → List Card
  /-- Draw cards from deck to hand. -/
  drawCards : G → PlayerId → Nat → Option (G × List Card)
  /-- Play a card from hand. -/
  playCard : G → PlayerId → Card → Option G
  /-- Discard a card from hand. -/
  discardCard : G → PlayerId → Card → Option G
  /-- Add cards directly to a player's hand. -/
  addToHand : G → PlayerId → List Card → G

  -- Laws

  /-- Drawing removes from deck and adds to hand. -/
  draw_moves : ∀ (g : G) (pid : PlayerId) (n : Nat) (g' : G) (drawn : List Card),
    drawCards g pid n = some (g', drawn) →
    (∀ (c : Card), c ∈ drawn → c ∈ getDeck g ∧ c ∈ getHand g' pid ∧ c ∉ getDeck g')

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

/-- Hook interface for mechanics that depend on cards. -/
class CardDependent (G : Type) [CardMechanic G] where
  onCardDrawn : G → PlayerId → List Card → G
  onCardPlayed : G → PlayerId → Card → G
  onCardDiscarded : G → PlayerId → Card → G

end Playtest
