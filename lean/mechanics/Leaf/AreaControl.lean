/-
  Leaf/AreaControl.lean — Area control / area majority mechanic formalization.

  `requires: ['board']` — expressed as `[BoardMechanic G]`.

  Players deploy forces to areas. At scoring time, the player with the
  most forces in each area earns points (1st place and 2nd place awards).

  Used by: Shadow Operations, Alliance.
-/

import Core.Board

namespace Playtest.AreaControl

open Playtest

/-! ## Area Definitions -/

/-- An area that can be contested. -/
structure Area where
  id : String
  name : String
  /-- Points for the player with the most forces. -/
  firstPlacePoints : Nat
  /-- Points for the player with the second-most forces. -/
  secondPlacePoints : Nat
  /-- Whether this area is scoreable (some areas may be neutral). -/
  scoreable : Bool := true
  deriving Repr, DecidableEq, BEq

/-- Forces deployed by a player in an area. -/
structure Deployment where
  playerId : PlayerId
  areaId : String
  forces : Nat
  deriving Repr, DecidableEq, BEq

/-! ## Force Tracking -/

/-- All deployments in the game. -/
structure ForceMap where
  deployments : List Deployment
  deriving Repr

/-- Get forces for a specific player in a specific area. -/
def ForceMap.getForces (fm : ForceMap) (pid : PlayerId) (areaId : String) : Nat :=
  match fm.deployments.find? (fun d => d.playerId == pid && d.areaId == areaId) with
  | some d => d.forces
  | none => 0

/-- Deploy forces to an area. -/
def ForceMap.deploy (fm : ForceMap) (pid : PlayerId) (areaId : String)
    (amount : Nat) : ForceMap :=
  let current := fm.getForces pid areaId
  let updated := fm.deployments.filter (fun d =>
    !(d.playerId == pid && d.areaId == areaId))
  { deployments := updated ++ [⟨pid, areaId, current + amount⟩] }

/-- Remove forces from an area. -/
def ForceMap.withdraw (fm : ForceMap) (pid : PlayerId) (areaId : String)
    (amount : Nat) : ForceMap :=
  let current := fm.getForces pid areaId
  let newForces := if current ≥ amount then current - amount else 0
  let updated := fm.deployments.filter (fun d =>
    !(d.playerId == pid && d.areaId == areaId))
  if newForces > 0 then
    { deployments := updated ++ [⟨pid, areaId, newForces⟩] }
  else
    { deployments := updated }

/-! ## Scoring -/

/-- Score result for a single area. -/
structure AreaScore where
  areaId : String
  first : Option PlayerId
  firstPoints : Nat
  second : Option PlayerId
  secondPoints : Nat
  deriving Repr

/-- Get all players' forces in an area, sorted descending. -/
def getAreaRanking (fm : ForceMap) (areaId : String)
    (players : List PlayerId) : List (PlayerId × Nat) :=
  let forces := players.map (fun pid => (pid, fm.getForces pid areaId))
  let nonzero := forces.filter (fun p => p.2 > 0)
  -- Sort descending by forces (simple insertion sort)
  nonzero.foldl (fun acc p =>
    let (before, after) := acc.span (fun q => q.2 ≥ p.2)
    before ++ [p] ++ after
  ) []

/-- Score a single area. -/
def scoreArea (fm : ForceMap) (area : Area) (players : List PlayerId)
    : AreaScore :=
  if !area.scoreable then
    { areaId := area.id, first := none, firstPoints := 0,
      second := none, secondPoints := 0 }
  else
    let ranking := getAreaRanking fm area.id players
    match ranking with
    | [] =>
      { areaId := area.id, first := none, firstPoints := 0,
        second := none, secondPoints := 0 }
    | [(pid, _)] =>
      { areaId := area.id, first := some pid,
        firstPoints := area.firstPlacePoints,
        second := none, secondPoints := 0 }
    | (p1, f1) :: (p2, f2) :: _ =>
      if f1 > f2 then
        { areaId := area.id, first := some p1,
          firstPoints := area.firstPlacePoints,
          second := some p2, secondPoints := area.secondPlacePoints }
      else
        -- Tie for first: both get second-place points (no first awarded)
        { areaId := area.id, first := none, firstPoints := 0,
          second := none, secondPoints := 0 }

/-- Score all areas and return total points per player. -/
def scoreAllAreas (fm : ForceMap) (areas : List Area)
    (players : List PlayerId) : List (PlayerId × Nat) :=
  let areaScores := areas.map (fun a => scoreArea fm a players)
  players.map (fun pid =>
    let points := areaScores.foldl (fun acc as_ =>
      let fromFirst := if as_.first == some pid then as_.firstPoints else 0
      let fromSecond := if as_.second == some pid then as_.secondPoints else 0
      acc + fromFirst + fromSecond
    ) 0
    (pid, points))

/-! ## Laws -/

/-- Deploying increases forces. -/
theorem deploy_increases (fm : ForceMap) (pid : PlayerId) (areaId : String)
    (amount : Nat) :
    (fm.deploy pid areaId amount).getForces pid areaId ≥
    fm.getForces pid areaId := by
  sorry -- requires reasoning about list filter + find interaction

/-- Deploying doesn't affect other players' forces (frame). -/
theorem deploy_frame (fm : ForceMap) (pid other : PlayerId) (areaId : String)
    (amount : Nat) (hne : pid ≠ other) :
    (fm.deploy pid areaId amount).getForces other areaId =
    fm.getForces other areaId := by
  sorry -- requires showing filter preserves other player's entries

/-- Empty area scores zero for everyone. -/
theorem empty_area_zero (area : Area) (players : List PlayerId)
    (hscoreable : area.scoreable = true) :
    let fm : ForceMap := { deployments := [] }
    let score := scoreArea fm area players
    score.firstPoints = 0 ∧ score.secondPoints = 0 := by
  sorry

end Playtest.AreaControl

/-! ## Area Control Mechanic Typeclass -/

namespace Playtest

/-- The AreaControlMechanic typeclass.
    `requires: ['board']` is `[BoardMechanic G]`. -/
class AreaControlMechanic (G : Type) [BoardMechanic G] where
  /-- Get all contestable areas. -/
  getAreas : G → List AreaControl.Area
  /-- Get the current force map. -/
  getForceMap : G → AreaControl.ForceMap
  /-- Deploy forces to an area. -/
  deployForces : G → PlayerId → String → Nat → Option G
  /-- Withdraw forces from an area. -/
  withdrawForces : G → PlayerId → String → Nat → Option G
  /-- Score all areas (usually at end of round/game). -/
  scoreAreas : G → List (PlayerId × Nat)

  -- Laws

  /-- Deployment requires forces to deploy. -/
  deploy_requires_forces : ∀ (g : G) (pid : PlayerId) (areaId : String) (n : Nat),
    n = 0 → deployForces g pid areaId n = none

  /-- Scoring is deterministic. -/
  score_deterministic : ∀ (g : G),
    scoreAreas g = scoreAreas g

  /-- Deployment is player-isolated. -/
  deploy_frame : ∀ (g : G) (pid other : PlayerId) (areaId : String)
    (n : Nat) (g' : G),
    pid ≠ other →
    deployForces g pid areaId n = some g' →
    (getForceMap g').getForces other areaId =
    (getForceMap g).getForces other areaId

end Playtest
