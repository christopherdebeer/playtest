/-
  Leaf/CardMatching.lean — Card matching mechanic formalization.

  `requires: ['cards']` — expressed as `[CardMechanic G]`.

  Players must match cards to a condition (color, number, type) when playing.
  The match predicate determines legal plays.

  Used by: UNO, Road Rally.
-/

import Core.Cards

namespace Playtest.CardMatching

open Playtest

/-! ## Match Predicates -/

/-- How two cards can match. -/
inductive MatchRule where
  /-- Same card type (e.g., same color in UNO). -/
  | sameType
  /-- Same suit. -/
  | sameSuit
  /-- Same value/number. -/
  | sameValue
  /-- Card is a wildcard (always matches). -/
  | wild (wildType : String)
  /-- Disjunction: any of these rules matches. -/
  | anyOf (rules : List MatchRule)
  deriving Repr

/-- Check if a card matches a target card under a single rule. -/
def cardMatchesSingle (played : Card) (target : Card) (rule : MatchRule) : Bool :=
  match rule with
  | .sameType => played.cardType == target.cardType
  | .sameSuit =>
    match played.suit, target.suit with
    | some s1, some s2 => s1 == s2
    | _, _ => false
  | .sameValue =>
    match played.value, target.value with
    | some v1, some v2 => v1 == v2
    | _, _ => false
  | .wild wt => played.cardType == wt
  | .anyOf _ => false  -- resolved by cardMatches below

/-- Check if a card matches a target card under a rule (with anyOf support). -/
def cardMatches (played : Card) (target : Card) (rule : MatchRule) : Bool :=
  match rule with
  | .anyOf rules => rules.any (cardMatchesSingle played target)
  | r => cardMatchesSingle played target r

/-- Check if a hand has any legal play against a target card. -/
def hasLegalPlay (hand : List Card) (target : Card) (rules : List MatchRule) : Bool :=
  hand.any (fun card => rules.any (cardMatches card target))

/-- Get all legal plays from a hand. -/
def getLegalPlays (hand : List Card) (target : Card) (rules : List MatchRule) : List Card :=
  hand.filter (fun card => rules.any (cardMatches card target))

/-! ## Turn Manipulation (UNO-style) -/

/-- Turn direction for reversible games. -/
inductive Direction where
  | forward
  | backward
  deriving Repr, DecidableEq, BEq

/-- Reverse the turn direction. -/
def Direction.reverse : Direction → Direction
  | .forward => .backward
  | .backward => .forward

/-- Turn manipulation effects. -/
inductive TurnEffect where
  /-- Skip the next player's turn. -/
  | skip (count : Nat := 1)
  /-- Reverse the turn direction. -/
  | reverse
  /-- Force next player to draw cards. -/
  | forceDraw (count : Nat)
  /-- No turn effect. -/
  | none
  deriving Repr, DecidableEq, BEq

/-! ## Laws -/

/-- Wild cards always match. -/
theorem wild_always_matches (played : Card) (target : Card) (wt : String)
    (h : (played.cardType == wt) = true) :
    cardMatches played target (.wild wt) = true := by
  sorry

/-- Same card matches itself on type. -/
theorem self_matches_type (card : Card) :
    cardMatches card card .sameType = true := by
  sorry

/-- Same card matches itself on value (if it has one). -/
theorem self_matches_value (card : Card) (v : Nat) (h : card.value = some v) :
    cardMatches card card .sameValue = true := by
  sorry

/-- If a hand has a legal play, getLegalPlays is non-empty. -/
theorem legal_plays_nonempty (hand : List Card) (target : Card)
    (rules : List MatchRule)
    (h : hasLegalPlay hand target rules = true) :
    (getLegalPlays hand target rules).length > 0 := by
  sorry

/-- Reverse is an involution. -/
theorem reverse_involution (d : Direction) :
    d.reverse.reverse = d := by
  cases d <;> rfl

end Playtest.CardMatching

/-! ## Card Matching Mechanic Typeclass -/

namespace Playtest

/-- The CardMatchingMechanic typeclass.
    `requires: ['cards']` is `[CardMechanic G]`. -/
class CardMatchingMechanic (G : Type) [CardMechanic G] where
  /-- Get the match rules for this game. -/
  getMatchRules : G → List CardMatching.MatchRule
  /-- Get the current target card to match against (e.g., top of discard). -/
  getTargetCard : G → Option Card
  /-- Get the current turn direction. -/
  getDirection : G → CardMatching.Direction
  /-- Check if a specific card is a legal play. -/
  isLegalPlay : G → PlayerId → Card → Bool
  /-- Play a matching card (validates match + applies turn effects). -/
  playMatchingCard : G → PlayerId → Card → Option G
  /-- Get the turn effect of a card. -/
  getTurnEffect : G → Card → CardMatching.TurnEffect

  -- Laws

  /-- Playing requires the card to match. -/
  play_requires_match : ∀ (g : G) (pid : PlayerId) (card : Card),
    isLegalPlay g pid card = false →
    playMatchingCard g pid card = none

  /-- Wild cards are always legal (if the game has a wild rule). -/
  wild_always_legal : ∀ (g : G) (pid : PlayerId) (card : Card) (wt : String),
    (getMatchRules g).any (fun r => match r with | .wild w => w == wt | _ => false) = true →
    (card.cardType == wt) = true →
    isLegalPlay g pid card = true

end Playtest
