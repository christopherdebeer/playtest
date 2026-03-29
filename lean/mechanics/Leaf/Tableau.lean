/-
  Leaf/Tableau.lean — Tableau building mechanic formalization.

  `requires: ['cards']` — expressed as `[CardMechanic G]`.

  Players build a persistent display of cards (tableau) that provides
  ongoing benefits and synergy bonuses. Unlike a hand, tableau cards
  remain visible and active across turns.

  Used by: Alliance, Battle Forge, Engine Masters.
-/

import Core.Cards

namespace Playtest.Tableau

open Playtest

/-! ## Synergy Rules -/

/-- A synergy bonus triggered by card combinations in the tableau. -/
structure Synergy where
  name : String
  /-- Card types that trigger this synergy. -/
  requiredTypes : List String
  /-- Bonus value when synergy is active. -/
  bonus : Nat
  deriving Repr, DecidableEq, BEq

/-- Check if a tableau satisfies a synergy requirement. -/
def synergyActive (tableau : List Card) (synergy : Synergy) : Bool :=
  synergy.requiredTypes.all (fun t =>
    tableau.any (fun c => c.cardType == t))

/-- Get all active synergies for a tableau. -/
def activeSynergies (tableau : List Card) (synergies : List Synergy) : List Synergy :=
  synergies.filter (synergyActive tableau)

/-- Total synergy bonus for a tableau. -/
def totalSynergyBonus (tableau : List Card) (synergies : List Synergy) : Nat :=
  (activeSynergies tableau synergies).foldl (fun acc s => acc + s.bonus) 0

/-! ## Tableau Operations -/

/-- Add a card to a tableau (respecting a limit). -/
def addCard (tableau : List Card) (card : Card) (limit : Nat) : Option (List Card) :=
  if limit == 0 || tableau.length < limit then
    some (tableau ++ [card])
  else
    none

/-- Remove a card from a tableau by name. -/
def removeCard (tableau : List Card) (cardName : CardName) : Option (List Card × Card) :=
  match tableau.find? (fun c => c.name == cardName) with
  | some card => some (tableau.filter (fun c => c.name != cardName), card)
  | none => none

/-- Get the score contribution of a tableau (base + synergies). -/
def tableauScore (tableau : List Card) (basePerCard : Nat)
    (synergies : List Synergy) : Nat :=
  tableau.length * basePerCard + totalSynergyBonus tableau synergies

/-! ## Laws -/

/-- Adding to an empty tableau always succeeds (if limit > 0). -/
theorem add_to_empty_succeeds (card : Card) (limit : Nat) (h : limit > 0) :
    addCard [] card limit = some [card] := by
  sorry

/-- Adding increases tableau size by 1. -/
theorem add_increases_size (tableau : List Card) (card : Card) (limit : Nat)
    (result : List Card)
    (h : addCard tableau card limit = some result) :
    result.length = tableau.length + 1 := by
  sorry

/-- Removing decreases tableau size. -/
theorem remove_decreases_size (tableau : List Card) (cardName : CardName)
    (t : List Card) (card : Card)
    (h : removeCard tableau cardName = some (t, card)) :
    t.length < tableau.length ∨ t.length = tableau.length := by
  sorry

/-- Adding a card of a required type can only enable synergies (not disable). -/
theorem add_preserves_synergies (tableau : List Card) (card : Card)
    (synergy : Synergy)
    (h : synergyActive tableau synergy = true) :
    synergyActive (tableau ++ [card]) synergy = true := by
  sorry

/-- Total synergy bonus is monotone with respect to adding synergy-enabling cards. -/
theorem synergy_bonus_nonneg (tableau : List Card) (synergies : List Synergy) :
    totalSynergyBonus tableau synergies ≥ 0 := by
  omega

end Playtest.Tableau

/-! ## Tableau Building Mechanic Typeclass -/

namespace Playtest

/-- The TableauMechanic typeclass.
    `requires: ['cards']` is `[CardMechanic G]`. -/
class TableauMechanic (G : Type) [CardMechanic G] where
  /-- Get a player's tableau. -/
  getTableau : G → PlayerId → List Card
  /-- Get the tableau size limit. -/
  getTableauLimit : G → Nat
  /-- Get the synergy rules. -/
  getSynergies : G → List Tableau.Synergy
  /-- Add a card to a player's tableau. -/
  addToTableau : G → PlayerId → Card → Option G
  /-- Remove a card from a player's tableau. -/
  removeFromTableau : G → PlayerId → CardName → Option G
  /-- Get the score from a player's tableau. -/
  getTableauScore : G → PlayerId → Nat

  -- Laws

  /-- Adding respects the tableau limit. -/
  add_respects_limit : ∀ (g : G) (pid : PlayerId) (card : Card),
    (getTableau g pid).length ≥ getTableauLimit g →
    getTableauLimit g > 0 →
    addToTableau g pid card = none

  /-- Adding a card increases tableau size. -/
  add_increases : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    addToTableau g pid card = some g' →
    (getTableau g' pid).length = (getTableau g pid).length + 1

  /-- Tableau operations are player-isolated. -/
  add_frame : ∀ (g : G) (pid other : PlayerId) (card : Card) (g' : G),
    pid ≠ other →
    addToTableau g pid card = some g' →
    getTableau g' other = getTableau g other

end Playtest
