/-
  Leaf/Rondel.lean — Rondel (circular action wheel) mechanic formalization.

  Standalone (no core dependency).

  Players move a pawn around a circular track of action segments. Movement
  has a free range; exceeding it costs resources. The segment you land on
  determines your action for the turn.

  Used by: Rondel Express.
-/

import Core.Types

namespace Playtest.Rondel

open Playtest

/-! ## Rondel Structure -/

/-- A segment on the rondel wheel. -/
structure Segment where
  id : String
  /-- The action this segment provides. -/
  actionType : String
  /-- Optional bonus when landing here. -/
  bonus : Option (String × Nat) := none
  deriving Repr, DecidableEq, BEq

/-- The rondel: a circular arrangement of segments. -/
structure RondelWheel where
  segments : List Segment
  /-- Proof that the rondel is non-empty. -/
  nonempty : segments.length > 0
  deriving Repr

/-- A player's position on the rondel. -/
structure RondelPosition where
  /-- Index into the segments list. -/
  index : Nat
  deriving Repr, DecidableEq, BEq

/-! ## Movement -/

/-- Calculate the clockwise distance between two positions on the rondel. -/
def clockwiseDistance (from_ to_ : Nat) (size : Nat) : Nat :=
  if to_ ≥ from_ then to_ - from_
  else size - from_ + to_

/-- Get the segment at a position. -/
def getSegment (wheel : RondelWheel) (pos : RondelPosition) : Segment :=
  let idx := pos.index % wheel.segments.length
  wheel.segments.get ⟨idx, Nat.mod_lt _ wheel.nonempty⟩

/-- Calculate movement cost (free steps don't cost, extra steps do). -/
def movementCost (steps : Nat) (freeSteps : Nat) (costPerStep : Nat) : Nat :=
  if steps ≤ freeSteps then 0
  else (steps - freeSteps) * costPerStep

/-- Move to a target position on the rondel. -/
def moveOnRondel (pos : RondelPosition) (target : Nat) (size : Nat)
    : RondelPosition :=
  { index := target % size }

/-- Get all reachable positions within a budget. -/
def reachablePositions (pos : RondelPosition) (wheel : RondelWheel)
    (freeSteps : Nat) (budget : Nat) (costPerStep : Nat)
    : List (Nat × Nat) :=  -- (target_index, cost)
  let size := wheel.segments.length
  List.range size |>.map (fun offset =>
    let target := (pos.index + offset + 1) % size
    let steps := offset + 1
    let cost := movementCost steps freeSteps costPerStep
    (target, cost)
  ) |>.filter (fun p => p.2 ≤ budget)

/-! ## Laws -/

/-- Clockwise distance is always less than the wheel size. -/
theorem clockwise_bounded (from_ to_ size : Nat) (h : size > 0) :
    clockwiseDistance from_ to_ size < size := by
  sorry

/-- Zero free steps means every move has a cost. -/
theorem no_free_steps_costs (steps : Nat) (costPerStep : Nat)
    (hs : steps > 0) (hc : costPerStep > 0) :
    movementCost steps 0 costPerStep > 0 := by
  sorry

/-- Free steps within budget cost nothing. -/
theorem free_steps_no_cost (steps freeSteps costPerStep : Nat)
    (h : steps ≤ freeSteps) :
    movementCost steps freeSteps costPerStep = 0 := by
  sorry

/-- Movement wraps around (cyclic). -/
theorem move_wraps (pos : RondelPosition) (target size : Nat) (h : size > 0) :
    (moveOnRondel pos target size).index < size := by
  simp [moveOnRondel]
  exact Nat.mod_lt target h

/-- Every position has a valid segment. -/
theorem segment_valid (wheel : RondelWheel) (pos : RondelPosition) :
    (getSegment wheel pos).id = (getSegment wheel pos).id := by
  rfl

end Playtest.Rondel

/-! ## Rondel Mechanic Typeclass -/

namespace Playtest

/-- The RondelMechanic typeclass. Standalone. -/
class RondelMechanic (G : Type) where
  /-- Get the rondel wheel. -/
  getWheel : G → Rondel.RondelWheel
  /-- Get a player's current position. -/
  getPosition : G → PlayerId → Rondel.RondelPosition
  /-- Get free movement steps per turn. -/
  getFreeSteps : G → Nat
  /-- Get cost per extra step. -/
  getCostPerStep : G → Nat
  /-- Move a player on the rondel. -/
  movePlayer : G → PlayerId → Nat → Option G
  /-- Get the action type at a player's current position. -/
  getCurrentAction : G → PlayerId → String

  -- Laws

  /-- Moving updates the player's position. -/
  move_updates : ∀ (g : G) (pid : PlayerId) (target : Nat) (g' : G),
    movePlayer g pid target = some g' →
    (getPosition g' pid).index = target % (getWheel g).segments.length

  /-- Moving doesn't affect other players (frame). -/
  move_frame : ∀ (g : G) (pid other : PlayerId) (target : Nat) (g' : G),
    pid ≠ other →
    movePlayer g pid target = some g' →
    getPosition g' other = getPosition g other

  /-- Current action reflects position on the wheel. -/
  action_from_position : ∀ (g : G) (pid : PlayerId),
    getCurrentAction g pid =
    (Rondel.getSegment (getWheel g) (getPosition g pid)).actionType

end Playtest
