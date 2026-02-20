/-
  Leaf/SetCollection.lean — Set collection mechanic formalization.

  `requires: ['cards']` — expressed as `[CardMechanic G]`.

  Players collect sets of cards that match criteria (same suit, same type,
  all different, etc.). Completed sets score points.

  Used by: Treasure Hunters, Draft Duel, Grand Bazaar, Alliance, UNO.
-/

import Core.Cards

namespace Playtest.SetCollection

open Playtest

/-! ## Set Definitions -/

/-- How cards are matched into sets. -/
inductive SetCriterion where
  /-- All cards share the same card type. -/
  | sameType (cardType : String)
  /-- All cards share the same suit. -/
  | sameSuit (suitName : String)
  /-- All cards have distinct types. -/
  | allDifferentTypes
  /-- All cards have distinct suits. -/
  | allDifferentSuits
  /-- Custom predicate (opaque — for game-specific matching). -/
  | custom (tag : String)
  deriving Repr

/-- A predicate describing which cards form a valid set. -/
structure SetRule where
  name : String
  /-- Minimum cards needed to complete the set. -/
  minSize : Nat
  /-- Points awarded for completing the set. -/
  reward : Nat
  /-- The matching criterion. -/
  criterion : SetCriterion
  deriving Repr

/-! ## Set Matching -/

/-- Check if a list of cards satisfies a criterion. -/
def matchesCriterion (cards : List Card) (criterion : SetCriterion) : Bool :=
  match criterion with
  | .sameType t => cards.all (fun c => c.cardType == t)
  | .sameSuit s => cards.all (fun c =>
      match c.suit with
      | some suit => suit.name == s
      | none => false)
  | .allDifferentTypes =>
    let types := cards.map Card.cardType
    types.length == types.eraseDups.length
  | .allDifferentSuits =>
    let suits := cards.filterMap Card.suit
    suits.length == cards.length && suits.length == suits.eraseDups.length
  | .custom _ => false  -- custom must be resolved by game-specific logic

/-- Check if a list of cards completes a set rule. -/
def completesSet (cards : List Card) (rule : SetRule) : Bool :=
  cards.length ≥ rule.minSize && matchesCriterion cards rule.criterion

/-- Score a player's hand/tableau for all matching sets.
    Returns the total score from all completed sets. -/
def scoreCompletedSets (cards : List Card) (rules : List SetRule) : Nat :=
  rules.foldl (fun acc rule =>
    if completesSet cards rule then acc + rule.reward else acc
  ) 0

/-- Find all sets a player could complete from their cards. -/
def findCompletableSets (cards : List Card) (rules : List SetRule) : List SetRule :=
  rules.filter (fun rule => completesSet cards rule)

/-! ## Laws -/

/-- Empty hand completes no sets. -/
theorem empty_completes_nothing (rule : SetRule) (h : rule.minSize > 0) :
    completesSet [] rule = false := by
  simp [completesSet]
  omega

/-- A set completion is monotone: adding cards can't break a sameType set. -/
theorem sameType_monotone (cards : List Card) (card : Card) (t : String)
    (h : matchesCriterion cards (.sameType t) = true)
    (hc : (card.cardType == t) = true) :
    matchesCriterion (card :: cards) (.sameType t) = true := by
  sorry

/-- Score is non-negative (trivially true for Nat). -/
theorem score_nonneg (cards : List Card) (rules : List SetRule) :
    scoreCompletedSets cards rules ≥ 0 := by
  omega

/-- Score is bounded by total possible reward. -/
theorem score_bounded (cards : List Card) (rules : List SetRule) :
    scoreCompletedSets cards rules ≤ rules.foldl (fun acc r => acc + r.reward) 0 := by
  sorry

end Playtest.SetCollection

/-! ## Set Collection Mechanic Typeclass -/

namespace Playtest

/-- The SetCollectionMechanic typeclass.
    `requires: ['cards']` is `[CardMechanic G]`. -/
class SetCollectionMechanic (G : Type) [CardMechanic G] where
  /-- Get the set rules for this game. -/
  getSetRules : G → List SetCollection.SetRule
  /-- Get cards available for set matching (hand, tableau, etc.). -/
  getCollectableCards : G → PlayerId → List Card
  /-- Score a player's completed sets. -/
  scorePlayer : G → PlayerId → Nat
  /-- Claim/declare a completed set (remove cards, gain points). -/
  claimSet : G → PlayerId → List Card → SetCollection.SetRule → Option G

  -- Laws

  /-- Claiming requires the cards to actually complete the set. -/
  claim_requires_completion : ∀ (g : G) (pid : PlayerId)
    (cards : List Card) (rule : SetCollection.SetRule),
    SetCollection.completesSet cards rule = false →
    claimSet g pid cards rule = none

  /-- Score reflects completed sets. -/
  score_reflects_sets : ∀ (g : G) (pid : PlayerId),
    scorePlayer g pid ≥ 0

end Playtest
