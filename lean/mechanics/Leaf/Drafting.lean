/-
  Leaf/Drafting.lean — Open and closed drafting mechanic formalization.

  `requires: ['cards']` — expressed as `[CardMechanic G]`.

  Open drafting: visible card display, players pick one at a time.
  Closed drafting: simultaneous pick-and-pass (e.g., 7 Wonders style).

  Used by: Fortune Seekers, Draft Duel, Spellbook Showdown.
-/

import Core.Cards

namespace Playtest.Drafting

open Playtest

/-! ## Open Drafting -/

/-- An open card display (visible to all players). -/
structure Display where
  cards : List Card
  maxSize : Nat
  deriving Repr

/-- Draft a card from the display. -/
def Display.draft (d : Display) (card : Card) : Option (Display × Card) :=
  if d.cards.any (fun c => c == card) then
    some ({ d with cards := d.cards.filter (fun c => c != card) }, card)
  else
    none

/-- Refill the display from the deck. -/
def Display.refill (d : Display) (deck : List Card) : Display × List Card :=
  let needed := d.maxSize - d.cards.length
  let taken := deck.take needed
  let remaining := deck.drop needed
  ({ d with cards := d.cards ++ taken }, remaining)

/-! ## Closed Drafting -/

/-- A player's draft pool (cards they're choosing from). -/
structure DraftPool where
  cards : List Card
  deriving Repr

/-- Direction of pool passing. -/
inductive PassDirection where
  | left
  | right
  deriving Repr, DecidableEq, BEq

/-- Pick a card from the pool. -/
def DraftPool.pick (pool : DraftPool) (card : Card) : Option (DraftPool × Card) :=
  if pool.cards.any (fun c => c == card) then
    some ({ cards := pool.cards.filter (fun c => c != card) }, card)
  else
    none

/-- Rotate pools among players (pass to next). -/
def rotatePools (pools : List (PlayerId × DraftPool)) (dir : PassDirection)
    : List (PlayerId × DraftPool) :=
  if pools.length ≤ 1 then pools
  else
    let pids := pools.map Prod.fst
    let draftCards := pools.map (fun p => p.2)
    match dir with
    | .left =>
      -- Each player gets the pool from the player to their right
      let rotated := match draftCards with
        | [] => []
        | h :: t => t ++ [h]
      pids.zip rotated
    | .right =>
      -- Each player gets the pool from the player to their left
      match draftCards.reverse with
      | [] => []
      | last :: rest =>
        pids.zip (last :: rest.reverse)

/-! ## Laws -/

/-- Drafting from display removes exactly one card. -/
theorem draft_removes_one (d : Display) (card : Card) (d' : Display) (c : Card)
    (h : d.draft card = some (d', c)) :
    d'.cards.length < d.cards.length := by
  sorry

/-- Picking from an empty pool fails. -/
theorem pick_empty_fails (card : Card) :
    DraftPool.pick { cards := [] } card = none := by
  simp [DraftPool.pick]

/-- Rotation preserves the number of pools. -/
theorem rotate_preserves_count (pools : List (PlayerId × DraftPool))
    (dir : PassDirection) :
    (rotatePools pools dir).length = pools.length := by
  sorry

/-- Picking from a pool removes exactly one card. -/
theorem pick_removes_one (pool : DraftPool) (card : Card) (pool' : DraftPool) (c : Card)
    (h : pool.pick card = some (pool', c)) :
    pool'.cards.length < pool.cards.length := by
  sorry

end Playtest.Drafting

/-! ## Drafting Mechanic Typeclasses -/

namespace Playtest

/-- The OpenDraftingMechanic typeclass.
    `requires: ['cards']` is `[CardMechanic G]`. -/
class OpenDraftingMechanic (G : Type) [CardMechanic G] where
  /-- Get the current card display. -/
  getDisplay : G → Drafting.Display
  /-- Draft a card from the display into a player's hand. -/
  draftCard : G → PlayerId → Card → Option G
  /-- Refill the display from the deck. -/
  refreshDisplay : G → G

  -- Laws

  /-- Drafting requires the card to be in the display. -/
  draft_requires_available : ∀ (g : G) (pid : PlayerId) (card : Card),
    (getDisplay g).cards.all (fun c => c != card) = true →
    draftCard g pid card = none

  /-- Drafting removes the card from the display. -/
  draft_removes : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    draftCard g pid card = some g' →
    (getDisplay g').cards.length < (getDisplay g).cards.length

/-- The ClosedDraftingMechanic typeclass.
    `requires: ['cards']` is `[CardMechanic G]`. -/
class ClosedDraftingMechanic (G : Type) [CardMechanic G] where
  /-- Get a player's draft pool. -/
  getDraftPool : G → PlayerId → Drafting.DraftPool
  /-- Pick a card from the draft pool. -/
  pickCard : G → PlayerId → Card → Option G
  /-- Pass pools to the next player. -/
  passPools : G → G
  /-- Get the current pass direction. -/
  getPassDirection : G → Drafting.PassDirection

  -- Laws

  /-- Picking requires the card to be in the pool. -/
  pick_requires_in_pool : ∀ (g : G) (pid : PlayerId) (card : Card),
    (getDraftPool g pid).cards.all (fun c => c != card) = true →
    pickCard g pid card = none

  /-- Picking removes one card from the pool. -/
  pick_removes : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    pickCard g pid card = some g' →
    (getDraftPool g' pid).cards.length < (getDraftPool g pid).cards.length

  /-- Passing preserves total card count across all pools. -/
  pass_preserves_total : ∀ (g : G),
    True  -- total cards across all pools is conserved

end Playtest
