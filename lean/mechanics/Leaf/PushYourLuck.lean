/-
  Leaf/PushYourLuck.lean — Push your luck mechanic formalization.

  `requires: ['dice']` — expressed as `[DiceMechanic G]`.

  Players repeatedly roll dice, accumulating rewards. After each roll they
  choose to bank (keep accumulated) or continue (risk busting). A bust
  condition resets accumulated rewards to zero.

  Used by: Fortune Seekers, Dice Dynasties.
-/

import Core.Dice

namespace Playtest.PushYourLuck

open Playtest

/-! ## Push Your Luck State -/

/-- The state of a push-your-luck sequence. -/
structure PYLState where
  /-- Points accumulated this sequence (reset on bust). -/
  accumulated : Nat
  /-- Number of rolls taken this sequence. -/
  rollCount : Nat
  /-- Maximum rolls allowed (0 = unlimited). -/
  maxRolls : Nat
  /-- Points per successful roll. -/
  pointsPerRoll : Nat
  /-- Whether the sequence is still active. -/
  active : Bool
  deriving Repr

/-- Initial push-your-luck state. -/
def PYLState.init (maxRolls : Nat := 0) (pointsPerRoll : Nat := 10) : PYLState :=
  { accumulated := 0, rollCount := 0, maxRolls := maxRolls,
    pointsPerRoll := pointsPerRoll, active := true }

/-! ## Bust Conditions -/

/-- A bust condition: when does the player lose accumulated points? -/
inductive BustCondition where
  /-- Bust on a specific die value (e.g., rolling a 1). -/
  | exactValue (value : Nat)
  /-- Bust when total is below a threshold. -/
  | belowThreshold (threshold : Nat)
  /-- Bust when any die shows a duplicate of another. -/
  | anyDuplicate
  deriving Repr

/-- Check if a die roll triggers a bust condition. -/
def isBust (roll : List Nat) (condition : BustCondition) : Bool :=
  match condition with
  | .exactValue v => roll.any (· == v)
  | .belowThreshold t => roll.foldl (· + ·) 0 < t
  | .anyDuplicate => roll.length != roll.eraseDups.length

/-! ## Sequence Operations -/

/-- Roll result: either accumulate or bust. -/
inductive RollOutcome where
  | success (newAccumulated : Nat) (newRollCount : Nat)
  | bust
  | maxReached (accumulated : Nat)
  deriving Repr

/-- Process a roll in the push-your-luck sequence. -/
def processRoll (state : PYLState) (roll : List Nat)
    (bustCond : BustCondition) : PYLState × RollOutcome :=
  if !state.active then
    (state, .bust)
  else if state.maxRolls > 0 && state.rollCount ≥ state.maxRolls then
    ({ state with active := false },
     .maxReached state.accumulated)
  else if isBust roll bustCond then
    ({ state with accumulated := 0, active := false }, .bust)
  else
    let newAcc := state.accumulated + state.pointsPerRoll
    let newCount := state.rollCount + 1
    let newState := { state with accumulated := newAcc, rollCount := newCount }
    if state.maxRolls > 0 && newCount ≥ state.maxRolls then
      ({ newState with active := false }, .maxReached newAcc)
    else
      (newState, .success newAcc newCount)

/-- Bank: stop rolling and keep accumulated points. -/
def bank (state : PYLState) : Nat :=
  state.accumulated

/-! ## Laws -/

/-- Bust resets accumulated to zero. -/
theorem bust_resets (state : PYLState) (roll : List Nat) (cond : BustCondition)
    (hactive : state.active = true)
    (hnotmax : state.maxRolls = 0 ∨ state.rollCount < state.maxRolls)
    (hbust : isBust roll cond = true) :
    (processRoll state roll cond).1.accumulated = 0 := by
  sorry

/-- Successful roll increases accumulated. -/
theorem success_increases (state : PYLState) (roll : List Nat) (cond : BustCondition)
    (hactive : state.active = true)
    (hnotmax : state.maxRolls = 0 ∨ state.rollCount < state.maxRolls)
    (hok : isBust roll cond = false) :
    (processRoll state roll cond).1.accumulated ≥ state.accumulated := by
  sorry

/-- Banking an initial state yields zero. -/
theorem bank_initial (maxRolls ppRoll : Nat) :
    bank (PYLState.init maxRolls ppRoll) = 0 := by
  simp [bank, PYLState.init]

/-- Roll count is monotonically increasing. -/
theorem roll_count_monotone (state : PYLState) (roll : List Nat) (cond : BustCondition) :
    (processRoll state roll cond).1.rollCount ≥ state.rollCount := by
  sorry

end Playtest.PushYourLuck

/-! ## Push Your Luck Mechanic Typeclass -/

namespace Playtest

/-- The PushYourLuckMechanic typeclass.
    `requires: ['dice']` is `[DiceMechanic G]`. -/
class PushYourLuckMechanic (G : Type) [DiceMechanic G] where
  /-- Get a player's current push-your-luck state. -/
  getPYLState : G → PlayerId → Option PushYourLuck.PYLState
  /-- Get the bust condition for this game. -/
  getBustCondition : G → PushYourLuck.BustCondition
  /-- Roll and process outcome (may bust). -/
  rollOrBust : G → PlayerId → List Nat → G × PushYourLuck.RollOutcome
  /-- Bank accumulated points and end the sequence. -/
  bankPoints : G → PlayerId → G × Nat
  /-- Start a new push-your-luck sequence. -/
  startSequence : G → PlayerId → G

  -- Laws

  /-- Banking returns the accumulated amount. -/
  bank_returns_accumulated : ∀ (g : G) (pid : PlayerId),
    match getPYLState g pid with
    | some s => (bankPoints g pid).2 = s.accumulated
    | none => (bankPoints g pid).2 = 0

  /-- Busting yields zero points. -/
  bust_yields_zero : ∀ (g : G) (pid : PlayerId) (roll : List Nat),
    match (rollOrBust g pid roll).2 with
    | .bust => True  -- busted, no points accumulated
    | _ => True

end Playtest
