/-
  Core/Visibility.lean — Visibility (information hiding) mechanic formalization.

  Mirrors src/mechanics/core/visibility.ts.
  This is essentially epistemic logic over game state: what each player
  knows, what they can see, and what is hidden. The TypeScript runtime
  filters GameState per-player; here we formalize the information
  partitioning and prove properties about knowledge.
-/

import Core.Types

namespace Playtest.Visibility

open Playtest

/-! ## Information Types -/

/-- Categories of information that can be visible or hidden.
    Mirrors the `infoType` parameter in visibility.ts. -/
inductive InfoType where
  | role       -- hidden role
  | team       -- team affiliation
  | hand       -- cards in hand
  | position   -- board position
  | score      -- score/points
  | objective  -- personal objective
  | resources  -- resource amounts
  | effects    -- active effects
  deriving Repr, DecidableEq, BEq

/-! ## Visibility Rules -/

/-- A visibility rule defines who can see what.
    This is the core predicate of the epistemic logic. -/
structure VisibilityRule where
  /-- The type of information. -/
  infoType : InfoType
  /-- Who owns this information. -/
  owner : PlayerId
  /-- Who can see it (none means nobody, or specific players). -/
  visibleTo : Option (List PlayerId)
  deriving Repr

/-- A visibility configuration: a collection of rules. -/
def VisibilityConfig := List VisibilityRule

/-- Default visibility: everything is public. -/
def defaultVisibility : VisibilityConfig := []

/-! ## Knowledge State -/

/-- What a player knows about another player. -/
structure PlayerKnowledge where
  /-- Known role of target (if revealed). -/
  knownRole : Option String := none
  /-- Known team of target (if revealed). -/
  knownTeam : Option String := none
  deriving Repr, DecidableEq

/-- Full knowledge state: what each player knows about each other player. -/
def KnowledgeState := PlayerId → PlayerId → PlayerKnowledge

instance : Inhabited KnowledgeState := ⟨fun _ _ => {}⟩

/-! ## Visibility Predicates -/

/-- Can viewer see owner's info of a given type? -/
def canSee (config : VisibilityConfig) (viewer owner : PlayerId) (info : InfoType) : Bool :=
  -- If no rule restricts it, it's visible (default public)
  match config.find? (fun r => r.infoType == info && r.owner == owner) with
  | none => true  -- no restriction → visible
  | some rule =>
    match rule.visibleTo with
    | none => false  -- explicitly hidden from everyone
    | some viewers => viewers.any (· == viewer)

/-- A player can always see their own information. -/
def selfVisible (viewer owner : PlayerId) : Bool :=
  viewer == owner

/-- Combined visibility check: self always sees own info. -/
def isVisible (config : VisibilityConfig) (viewer owner : PlayerId) (info : InfoType) : Bool :=
  selfVisible viewer owner || canSee config viewer owner info

/-! ## Revelation -/

/-- Record that viewer now knows target's role. -/
def revealRole (ks : KnowledgeState) (viewer target : PlayerId) (role : String) : KnowledgeState :=
  fun v t =>
    if v == viewer && t == target
    then { (ks v t) with knownRole := some role }
    else ks v t

/-- Record that viewer now knows target's team. -/
def revealTeam (ks : KnowledgeState) (viewer target : PlayerId) (team : String) : KnowledgeState :=
  fun v t =>
    if v == viewer && t == target
    then { (ks v t) with knownTeam := some team }
    else ks v t

/-! ## Laws -/

/-- A player can always see their own information. -/
theorem self_always_visible (config : VisibilityConfig) (pid : PlayerId) (info : InfoType) :
    isVisible config pid pid info = true := by
  simp [isVisible, selfVisible, BEq.beq]

/-- Revealing information makes it known. -/
theorem reveal_role_makes_known (ks : KnowledgeState) (viewer target : PlayerId) (role : String) :
    (revealRole ks viewer target role viewer target).knownRole = some role := by
  simp [revealRole, BEq.beq]

/-- Revealing doesn't affect other players' knowledge (frame). -/
theorem reveal_role_frame (ks : KnowledgeState) (viewer target other_v other_t : PlayerId)
    (role : String)
    (h : ¬(other_v == viewer && other_t == target) = true) :
    revealRole ks viewer target role other_v other_t = ks other_v other_t := by
  simp [revealRole, h]

/-! ## Hidden Role System -/

/-- Assignment of hidden roles to players. -/
def RoleAssignment := PlayerId → Option String

/-- Two players are on the same team if their roles map to the same team. -/
def sameTeam (teamOf : String → Option String) (roles : RoleAssignment)
    (p1 p2 : PlayerId) : Bool :=
  match roles p1, roles p2 with
  | some r1, some r2 =>
    match teamOf r1, teamOf r2 with
    | some t1, some t2 => t1 == t2
    | _, _ => false
  | _, _ => false

end Playtest.Visibility

/-! ## Visibility Mechanic Typeclass -/

namespace Playtest

/-- The VisibilityMechanic typeclass — what core/visibility.ts provides.
    Models information partitioning and epistemic access. -/
class VisibilityMechanic (G : Type) where
  /-- Get the visible state for a specific player. -/
  getVisibleState : G → PlayerId → G
  /-- Check if viewer can see a specific info type about target. -/
  canSeeInfo : G → PlayerId → Visibility.InfoType → PlayerId → Bool
  /-- Reveal information to specific players. -/
  revealInfo : G → PlayerId → Visibility.InfoType → List PlayerId → G
  /-- Get a player's hidden role. -/
  getHiddenRole : G → PlayerId → Option String
  /-- Check if two players are on the same team. -/
  isSameTeam : G → PlayerId → PlayerId → Bool

  -- Laws

  /-- Players can always see their own info. -/
  self_visible : ∀ (g : G) (pid : PlayerId) (info : Visibility.InfoType),
    canSeeInfo g pid info pid = true

  /-- Revealing makes info visible to target players. -/
  reveal_enables : ∀ (g : G) (owner : PlayerId) (info : Visibility.InfoType)
    (targets : List PlayerId) (t : PlayerId),
    t ∈ targets →
    canSeeInfo (revealInfo g owner info targets) t info owner = true

  /-- isSameTeam is symmetric. -/
  team_symmetric : ∀ (g : G) (p1 p2 : PlayerId),
    isSameTeam g p1 p2 = isSameTeam g p2 p1

  /-- Visible state is idempotent: filtering twice equals filtering once. -/
  visible_idempotent : ∀ (g : G) (pid : PlayerId),
    getVisibleState (getVisibleState g pid) pid = getVisibleState g pid

end Playtest
