/-
  Leaf/TrickTaking.lean — Trick-taking mechanic formalization.

  Mirrors src/mechanics/trick-taking.ts.
  `requires: ['cards']` — this is expressed as `[CardMechanic G]`.

  Trick-taking adds structure on top of the card mechanic:
  - A "lead suit" is established by the first card played in a trick
  - Players must follow suit if able
  - A trick is resolved by comparing cards (possibly with trumps)
  - The trick winner collects points or cards
-/

import Core.Cards
import Core.Resources

namespace Playtest.TrickTaking

open Playtest

/-! ## Trick State -/

/-- A played card in a trick. -/
structure TrickCard where
  player : PlayerId
  card : Card
  deriving Repr, DecidableEq, BEq

/-- State of the current trick. -/
structure TrickState where
  /-- Cards played in the current trick, in order. -/
  played : List TrickCard
  /-- The lead suit (set by first card). -/
  leadSuit : Option Suit
  /-- Trump suit for the game. -/
  trumpSuit : Option Suit
  deriving Repr

/-- Empty trick (start of a new trick). -/
def TrickState.empty (trump : Option Suit := none) : TrickState :=
  { played := [], leadSuit := none, trumpSuit := trump }

/-! ## Follow Suit Rule -/

/-- Check if a player has any cards of a given suit in hand. -/
def hasSuitInHand (hand : List Card) (suit : Suit) : Bool :=
  hand.any (fun c => c.suit == some suit)

/-- Cards of a specific suit in a hand. -/
def cardsOfSuit (hand : List Card) (suit : Suit) : List Card :=
  hand.filter (fun c => c.suit == some suit)

/-- A card play is legal if:
    1. It's the lead card (no lead suit set), OR
    2. It follows the lead suit, OR
    3. The player has no cards of the lead suit (void). -/
def isLegalPlay (hand : List Card) (card : Card) (leadSuit : Option Suit) : Bool :=
  match leadSuit with
  | none => true  -- leading the trick, any card is fine
  | some suit =>
    card.suit == some suit ||     -- follows suit
    !hasSuitInHand hand suit      -- void in suit

/-- Helper: if List.any returns true, there exists a witness. -/
private theorem exists_of_any {α : Type} {p : α → Bool} {l : List α}
    (h : l.any p = true) : ∃ a ∈ l, p a = true := by
  induction l with
  | nil => simp at h
  | cons x xs ih =>
    simp only [List.any_cons, Bool.or_eq_true] at h
    rcases h with hx | hxs
    · exact ⟨x, List.mem_cons_self _ _, hx⟩
    · obtain ⟨a, ha, hpa⟩ := ih hxs
      exact ⟨a, List.mem_cons_of_mem _ ha, hpa⟩

/-- Legal play is total: there always exists a legal play if the hand is non-empty.
    (Because if you can't follow suit, any card is legal.) -/
theorem legal_play_exists (hand : List Card) (leadSuit : Option Suit)
    (hne : hand ≠ []) :
    ∃ c, c ∈ hand ∧ isLegalPlay hand c leadSuit = true := by
  match hh : hand, hne with
  | c :: rest, _ =>
    cases leadSuit with
    | none =>
      exact ⟨c, List.mem_cons_self _ _, by simp [isLegalPlay]⟩
    | some suit =>
      -- Case split on whether hand has cards of the lead suit
      cases hsuit : hasSuitInHand (c :: rest) suit with
      | false =>
        -- Void in suit: any card is legal (including c)
        exact ⟨c, List.mem_cons_self _ _, by
          simp [isLegalPlay, hsuit]⟩
      | true =>
        -- Has suit: c follows suit, or some card in hand does
        cases hc : (c.suit == some suit) with
        | true =>
          exact ⟨c, List.mem_cons_self _ _, by
            simp [isLegalPlay, hc]⟩
        | false =>
          -- c doesn't follow suit, but some card in rest does
          simp [hasSuitInHand, List.any_cons, hc] at hsuit
          obtain ⟨card, hm, hcard⟩ := hsuit
          exact ⟨card, List.mem_cons_of_mem _ hm, by
            simp [isLegalPlay, hcard]⟩

/-! ## Card Comparison -/

/-- Suit ordering for trick resolution. -/
structure SuitOrder where
  /-- Compare two suits. Returns true if s1 beats s2. -/
  beats : Suit → Suit → Bool

/-- Value ordering for cards of the same suit. -/
def cardBeats (c1 c2 : Card) (trumpSuit : Option Suit) : Bool :=
  match c1.suit, c2.suit with
  | some s1, some s2 =>
    if trumpSuit == some s1 && trumpSuit ≠ some s2 then true    -- trump beats non-trump
    else if trumpSuit ≠ some s1 && trumpSuit == some s2 then false -- non-trump loses to trump
    else  -- same suit (or both trump/both non-trump): compare values
      match c1.value, c2.value with
      | some v1, some v2 => v1 > v2
      | _, _ => false
  | _, _ => false

/-! ## Trick Resolution -/

/-- Determine the winner of a trick. -/
def resolveTrick (trick : TrickState) : Option PlayerId :=
  match trick.played with
  | [] => none
  | first :: rest =>
    let winner := rest.foldl (fun best tc =>
      if cardBeats tc.card best.card trick.trumpSuit then tc else best
    ) first
    some winner.player

/-- The lead suit is set by the first card played. -/
def setLeadSuit (trick : TrickState) (card : Card) : TrickState :=
  if trick.leadSuit.isNone then
    { trick with leadSuit := card.suit }
  else trick

/-- Play a card into the trick. -/
def playToTrick (trick : TrickState) (pid : PlayerId) (card : Card) : TrickState :=
  let trick' := setLeadSuit trick card
  { trick' with played := trick'.played ++ [⟨pid, card⟩] }

/-! ## Laws -/

/-- Playing a card increases trick size by 1. -/
theorem play_increases_size (trick : TrickState) (pid : PlayerId) (card : Card) :
    (playToTrick trick pid card).played.length = trick.played.length + 1 := by
  simp [playToTrick, setLeadSuit]
  split <;> simp [List.length_append]

/-- The first card sets the lead suit. -/
theorem first_sets_lead (card : Card) (trump : Option Suit) :
    (playToTrick (TrickState.empty trump) "p1" card).leadSuit = card.suit := by
  simp [playToTrick, setLeadSuit, TrickState.empty]

/-- A non-empty trick has a winner. -/
theorem nonempty_trick_has_winner (trick : TrickState) (h : trick.played ≠ []) :
    (resolveTrick trick).isSome = true := by
  simp [resolveTrick]
  match trick.played, h with
  | _ :: _, _ => simp

end Playtest.TrickTaking

/-! ## Trick-Taking Mechanic Typeclass -/

namespace Playtest

/-- The TrickTakingMechanic typeclass.
    `requires: ['cards']` is expressed as `[CardMechanic G]`. -/
class TrickTakingMechanic (G : Type) [CardMechanic G] where
  /-- Get the current trick state. -/
  getCurrentTrick : G → TrickTaking.TrickState
  /-- Get the trump suit. -/
  getTrumpSuit : G → Option Suit
  /-- Play a card to the current trick. -/
  playToTrick : G → PlayerId → Card → Option G
  /-- Resolve the current trick (determine winner, award points). -/
  resolveTrick : G → Option (G × PlayerId)
  /-- Get the number of tricks won by a player. -/
  tricksWon : G → PlayerId → Nat

  -- Laws

  /-- Must follow suit if possible. -/
  follow_suit : ∀ (g : G) (pid : PlayerId) (card : Card) (suit : Suit),
    (getCurrentTrick g).leadSuit = some suit →
    TrickTaking.hasSuitInHand (CardMechanic.getHand g pid) suit = true →
    card.suit ≠ some suit →
    playToTrick g pid card = none

  /-- Trick winner exists for non-empty tricks. -/
  resolve_has_winner : ∀ (g : G),
    (getCurrentTrick g).played ≠ [] →
    (resolveTrick g).isSome = true

  /-- Playing a card removes it from hand (delegates to CardMechanic). -/
  play_removes_from_hand : ∀ (g : G) (pid : PlayerId) (card : Card) (g' : G),
    playToTrick g pid card = some g' →
    card ∉ CardMechanic.getHand g' pid

end Playtest
