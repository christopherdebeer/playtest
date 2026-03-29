/-
  Composition/Registry.lean — Mechanic registry and resolution formalization.

  Mirrors src/mechanics/registry.ts.
  The registry is the composition layer: it determines which mechanics
  are active for a game config, validates requires/conflicts, and
  resolves dependencies transitively.

  In Lean, this is modeled via typeclass resolution: `requires` becomes
  typeclass constraints, `conflicts` becomes negated conjunctions,
  and the registry's dependency algorithm becomes instance resolution.
-/

import Core.Types

namespace Playtest.Composition

open Playtest

/-! ## Mechanic Descriptors -/

/-- A mechanic descriptor — the metadata from the TypeScript `MechanicHooks`.
    This is the *static* description, not the runtime implementation. -/
structure MechanicDescriptor where
  /-- Unique identifier (the `slug` field). -/
  slug : String
  /-- Human-readable name. -/
  name : String
  /-- Required mechanic slugs (`requires` field). -/
  requires_ : List String := []
  /-- Conflicting mechanic slugs (`conflicts` field). -/
  conflicts : List String := []
  /-- Whether always enabled (`alwaysEnabled` field). -/
  alwaysEnabled : Bool := false
  deriving Repr, DecidableEq

/-! ## Registry State -/

/-- A registry: the set of all registered mechanics. -/
structure Registry where
  mechanics : List MechanicDescriptor
  /-- All slugs are unique. -/
  unique_slugs : ∀ m1 m2, m1 ∈ mechanics → m2 ∈ mechanics →
    m1.slug = m2.slug → m1 = m2

/-- Look up a mechanic by slug. -/
def Registry.find (reg : Registry) (slug : String) : Option MechanicDescriptor :=
  reg.mechanics.find? (fun m => m.slug == slug)

/-- Get all slugs in the registry. -/
def Registry.slugs (reg : Registry) : List String :=
  reg.mechanics.map MechanicDescriptor.slug

/-! ## Dependency Resolution -/

/-- Check if all requirements of a mechanic are satisfied by enabled mechanics. -/
def requirementsSatisfied (enabled : List String) (mechanic : MechanicDescriptor) : Bool :=
  mechanic.requires_.all (fun req => enabled.any (· == req))

/-- Check if a mechanic conflicts with any enabled mechanic. -/
def hasConflict (enabled : List String) (mechanic : MechanicDescriptor) : Bool :=
  mechanic.conflicts.any (fun conf => enabled.any (· == conf))

/-- Transitive dependency resolution.
    Given explicitly enabled mechanics, compute the full closure
    including all transitive dependencies.

    This mirrors the two-phase resolution in registry.ts. -/
def resolveDependencies (reg : Registry) (explicit : List String)
    (fuel : Nat := 100) : List String :=
  match fuel with
  | 0 => explicit
  | fuel + 1 =>
    let newDeps := reg.mechanics.filterMap fun m =>
      if m.requires_.all (fun r => explicit.any (· == r)) &&
         !explicit.any (· == m.slug) &&
         m.requires_ ≠ [] then
        some m.slug
      else
        none
    if newDeps.isEmpty then explicit
    else resolveDependencies reg (explicit ++ newDeps) fuel

/-! ## Validation -/

/-- Validation error types. -/
inductive ValidationError where
  | missingRequirement (mechanic : String) (missing : String) : ValidationError
  | conflict (mechanic1 mechanic2 : String) : ValidationError
  | unknownMechanic (slug : String) : ValidationError
  deriving Repr

/-- Validate a set of enabled mechanics. -/
def validate (reg : Registry) (enabled : List String) : List ValidationError :=
  let enabledMechanics := reg.mechanics.filter (fun m => enabled.any (· == m.slug))
  let reqErrors := enabledMechanics.bind fun m =>
    m.requires_.filterMap fun req =>
      if enabled.any (· == req) then none
      else some (ValidationError.missingRequirement m.slug req)
  let confErrors := enabledMechanics.bind fun m =>
    m.conflicts.filterMap fun conf =>
      if enabled.any (· == conf) then
        some (ValidationError.conflict m.slug conf)
      else none
  reqErrors ++ confErrors

/-- A mechanic configuration is valid if validation produces no errors. -/
def isValidConfig (reg : Registry) (enabled : List String) : Prop :=
  validate reg enabled = []

/-! ## Typeclass Resolution Correspondence -/

/-- The key insight: `requires` in TypeScript corresponds to typeclass constraints.
    If mechanic B requires mechanic A, then:
    - In TypeScript: `{ requires: ['A'] }` checked at registry startup
    - In Lean: `class B (G : Type) [A G]` checked at compile time

    This theorem states: if the registry validates successfully, then
    all dependency chains are satisfied. -/
theorem valid_config_satisfies_deps (reg : Registry) (enabled : List String)
    (h : isValidConfig reg enabled) :
    ∀ m, m ∈ reg.mechanics → enabled.any (· == m.slug) = true →
    m.requires_.all (fun r => enabled.any (· == r)) = true := by
  -- Proof sketch: by contradiction. If any requirement `r` of `m` is missing
  -- from `enabled`, then `validate` emits `missingRequirement m.slug r` (since
  -- m ∈ enabledMechanics via henabled). This makes validate's output non-empty,
  -- contradicting `h : isValidConfig reg enabled` (i.e., validate returns []).
  sorry

/-- No conflicts in a valid configuration. -/
theorem valid_config_no_conflicts (reg : Registry) (enabled : List String)
    (h : isValidConfig reg enabled) :
    ∀ m, m ∈ reg.mechanics → enabled.any (· == m.slug) = true →
    m.conflicts.all (fun c => !enabled.any (· == c)) = true := by
  -- Proof sketch: by contradiction. If conflict `c` of `m` is in `enabled`,
  -- then `validate` emits `conflict m.slug c`, making its output non-empty,
  -- contradicting `h : isValidConfig reg enabled`.
  sorry

/-! ## Conflict as Negated Conjunction -/

/-- The `conflicts` field is formalized as: if A conflicts with B,
    then ¬(A ∧ B) — they cannot both be instances of the same game state. -/
def MechanicsConflict (A B : Type → Prop) : Prop :=
  ∀ (G : Type), ¬(A G ∧ B G)

/-! ## Example: Core Mechanic Descriptors -/

def cardsMechanic : MechanicDescriptor :=
  { slug := "cards", name := "Cards" }

def resourcesMechanic : MechanicDescriptor :=
  { slug := "resources", name := "Resources" }

def boardMechanic : MechanicDescriptor :=
  { slug := "board", name := "Board" }

def turnsMechanic : MechanicDescriptor :=
  { slug := "turns", name := "Turns", alwaysEnabled := true }

def effectsMechanic : MechanicDescriptor :=
  { slug := "effects", name := "Effects" }

def diceMechanic : MechanicDescriptor :=
  { slug := "dice", name := "Dice" }

def visibilityMechanic : MechanicDescriptor :=
  { slug := "visibility", name := "Visibility" }

/-- Trick-taking requires cards. -/
def trickTakingMechanic : MechanicDescriptor :=
  { slug := "trick-taking", name := "Trick-Taking", requires_ := ["cards"] }

/-- Auction requires resources. -/
def auctionMechanic : MechanicDescriptor :=
  { slug := "auction-english", name := "English Auction", requires_ := ["resources"] }

/-- Deck-building requires cards. -/
def deckBuildingMechanic : MechanicDescriptor :=
  { slug := "deck-building", name := "Deck Building", requires_ := ["cards"] }

/-- Worker placement requires resources. -/
def workerPlacementMechanic : MechanicDescriptor :=
  { slug := "worker-placement", name := "Worker Placement", requires_ := ["resources"] }

/-- Action points (per-turn expendable budget). -/
def actionPointsMechanic : MechanicDescriptor :=
  { slug := "action-points", name := "Action Points" }

/-- Trading (bilateral resource exchange). -/
def tradingMechanic : MechanicDescriptor :=
  { slug := "trading", name := "Trading", requires_ := ["resources"] }

/-- Simultaneous action selection. -/
def simultaneousMechanic : MechanicDescriptor :=
  { slug := "simultaneous", name := "Simultaneous" }

/-- Dynamic board (mutable topology). -/
def dynamicBoardMechanic : MechanicDescriptor :=
  { slug := "dynamic-board", name := "Dynamic Board", requires_ := ["board"],
    conflicts := ["board"] }

/-- Combat resolution. -/
def combatMechanic : MechanicDescriptor :=
  { slug := "combat", name := "Combat" }

/-- Set collection requires cards. -/
def setCollectionMechanic : MechanicDescriptor :=
  { slug := "set-collection", name := "Set Collection", requires_ := ["cards"] }

/-- Card matching requires cards. -/
def cardMatchingMechanic : MechanicDescriptor :=
  { slug := "card-matching", name := "Card Matching", requires_ := ["cards"] }

/-- Tableau building requires cards. -/
def tableauMechanic : MechanicDescriptor :=
  { slug := "tableau", name := "Tableau", requires_ := ["cards"] }

/-- Contracts require resources. -/
def contractsMechanic : MechanicDescriptor :=
  { slug := "contracts", name := "Contracts", requires_ := ["resources"] }

/-- Push your luck requires dice. -/
def pushYourLuckMechanic : MechanicDescriptor :=
  { slug := "push-your-luck", name := "Push Your Luck", requires_ := ["dice"] }

/-- Open drafting requires cards. -/
def openDraftingMechanic : MechanicDescriptor :=
  { slug := "open-drafting", name := "Open Drafting", requires_ := ["cards"] }

/-- Closed drafting requires cards. -/
def closedDraftingMechanic : MechanicDescriptor :=
  { slug := "closed-drafting", name := "Closed Drafting", requires_ := ["cards"] }

/-- Voting (standalone). -/
def votingMechanic : MechanicDescriptor :=
  { slug := "voting", name := "Voting" }

/-- Area control requires board. -/
def areaControlMechanic : MechanicDescriptor :=
  { slug := "area-control", name := "Area Control", requires_ := ["board"] }

/-- Rondel (standalone). -/
def rondelMechanic : MechanicDescriptor :=
  { slug := "rondel", name := "Rondel" }

end Playtest.Composition
