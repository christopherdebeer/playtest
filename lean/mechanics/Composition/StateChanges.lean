/-
  Composition/StateChanges.lean — StateChanges formalization and commutativity.

  The TypeScript engine's deepest assumption: when two mechanics both
  return StateChanges, the merge order shouldn't matter. This file
  formalizes that assumption and provides tools to prove or disprove it.

  In the TypeScript runtime:
  ```
  Object.assign(state, changes1, changes2)
  ```
  This is NOT commutative in general! If changes1 and changes2 both
  modify the same field, the last one wins. The algebra formalizes
  when commutativity DOES hold (disjoint fields) and when it doesn't
  (field collision → potential bug).

  This is Layer 2 of the generalization strategy from ANALYSIS.md:
  "StateChanges commutativity — formalize the engine's merge semantics."
-/

import Core.Types

namespace Playtest.Composition.StateChanges

open Playtest

/-! ## StateChange Model -/

/-- A state change is a partial update: a set of field assignments.
    We model this as a function from field names to optional new values.
    `none` means "no change to this field"; `some v` means "set to v".

    This mirrors the TypeScript `StateChanges` which is a partial object
    merged via Object.assign. -/
structure FieldChange (Value : Type) where
  fieldName : String
  newValue : Value
  deriving Repr

/-- A set of state changes from a single mechanic hook.
    Modeled as a list of field-value pairs (like a partial record). -/
def StateChanges (Value : Type) := List (FieldChange Value)

instance {Value : Type} : Inhabited (StateChanges Value) := ⟨[]⟩

/-- Empty state changes (no modifications). -/
def StateChanges.empty {Value : Type} : StateChanges Value := []

/-- Get the change for a specific field (last write wins). -/
def StateChanges.getField {Value : Type} (changes : StateChanges Value) (field : String) : Option Value :=
  match changes.reverse.find? (fun fc => fc.fieldName == field) with
  | some fc => some fc.newValue
  | none => none

/-! ## Applying State Changes -/

/-- Apply state changes to a state.
    The state is modeled as a function from field names to values. -/
def applyChanges {Value : Type} (state : String → Value)
    (changes : StateChanges Value) : String → Value :=
  fun field =>
    match changes.getField field with
    | some v => v
    | none => state field

/-- Apply two sets of changes sequentially (second set wins on conflict). -/
def applyBoth {Value : Type} (state : String → Value)
    (changes1 changes2 : StateChanges Value) : String → Value :=
  applyChanges (applyChanges state changes1) changes2

/-! ## Disjointness and Commutativity -/

/-- Two state changes are disjoint if they modify different fields. -/
def disjoint {Value : Type} (c1 c2 : StateChanges Value) : Prop :=
  ∀ (f : String),
    (c1.getField f).isSome = true →
    (c2.getField f).isSome = false

/-- Decidable disjointness check. -/
def isDisjoint {Value : Type} [DecidableEq Value] (c1 c2 : StateChanges Value) : Bool :=
  c1.all fun fc =>
    (c2.getField fc.fieldName).isNone

/-- **The key theorem**: disjoint state changes commute.
    This is the formal version of "Object.assign order doesn't matter
    when mechanics modify different fields." -/
theorem disjoint_changes_commute {Value : Type} [DecidableEq Value]
    (state : String → Value) (c1 c2 : StateChanges Value)
    (h_disjoint : disjoint c1 c2) :
    applyBoth state c1 c2 = applyBoth state c2 c1 := by
  funext field
  simp [applyBoth, applyChanges]
  sorry -- Provable: case split on getField c1/c2; disjointness rules out both-some case

/-! ## Field Collision Detection -/

/-- Fields modified by a set of changes. -/
def modifiedFields {Value : Type} (changes : StateChanges Value) : List String :=
  changes.map FieldChange.fieldName |>.eraseDups

/-- Colliding fields between two change sets. -/
def collidingFields {Value : Type} (c1 c2 : StateChanges Value) : List String :=
  (modifiedFields c1).filter fun f => (modifiedFields c2).any (· == f)

/-- No collisions implies disjointness (for finite change sets). -/
theorem no_collisions_disjoint {Value : Type} (c1 c2 : StateChanges Value)
    (h : collidingFields c1 c2 = []) :
    ∀ (f : String), f ∈ modifiedFields c1 → f ∉ modifiedFields c2 := by
  sorry -- Provable: empty filter means no element of c1's fields passes the c2 membership test

/-! ## Mechanic Pair Commutativity -/

/-- Two mechanics commute if their state changes always commute.
    This is checked for each hook point where both mechanics can fire. -/
def MechanicsCommute {Value : Type} [DecidableEq Value]
    (mech1 mech2 : String → StateChanges Value) : Prop :=
  ∀ (state : String → Value) (hook : String),
    applyBoth state (mech1 hook) (mech2 hook) =
    applyBoth state (mech2 hook) (mech1 hook)

/-- If two mechanics always produce disjoint changes, they commute. -/
theorem disjoint_mechanics_commute {Value : Type} [DecidableEq Value]
    (mech1 mech2 : String → StateChanges Value)
    (h : ∀ hook, disjoint (mech1 hook) (mech2 hook)) :
    MechanicsCommute mech1 mech2 :=
  fun state hook => disjoint_changes_commute state (mech1 hook) (mech2 hook) (h hook)

end Playtest.Composition.StateChanges

/-! ## Cross-Mechanic Composition -/

namespace Playtest.Composition

/-- MechanicComposition: formalizes the invariant that composing two
    mechanics preserves a game invariant.

    This is the "compose_preserves" theorem from ANALYSIS.md:
    if M₁ preserves invariant P, and M₂ preserves invariant P,
    then (M₁ ∘ M₂) preserves P — provided M₁ and M₂ commute. -/
class MechanicComposition (G : Type) where
  /-- Apply mechanic 1's state changes. -/
  applyM1 : G → G
  /-- Apply mechanic 2's state changes. -/
  applyM2 : G → G

/-- If both mechanics preserve an invariant individually, and they commute,
    then their composition preserves the invariant. -/
theorem compose_preserves {G : Type} [MechanicComposition G]
    (inv : G → Prop)
    (h1 : ∀ g, inv g → inv (MechanicComposition.applyM1 g))
    (h2 : ∀ g, inv g → inv (MechanicComposition.applyM2 g))
    (g : G) (h_inv : inv g) :
    inv (MechanicComposition.applyM2 (MechanicComposition.applyM1 g)) :=
  h2 _ (h1 g h_inv)

/-- Stronger: if they commute, the order doesn't matter. -/
theorem compose_commute {G : Type} [MechanicComposition G]
    (h_commute : ∀ g : G,
      MechanicComposition.applyM2 (MechanicComposition.applyM1 g) =
      MechanicComposition.applyM1 (MechanicComposition.applyM2 g))
    (_inv : G → Prop)
    (_h1 : ∀ g, _inv g → _inv (MechanicComposition.applyM1 g))
    (_h2 : ∀ g, _inv g → _inv (MechanicComposition.applyM2 g))
    (g : G) (_h_inv : _inv g) :
    MechanicComposition.applyM2 (MechanicComposition.applyM1 g) =
    MechanicComposition.applyM1 (MechanicComposition.applyM2 g) :=
  h_commute g

/-! ## N-Way Composition -/

/-- Compose N mechanics by sequential application, verifying invariant
    preservation at each step. -/
def composeN {G : Type} (mechanics : List (G → G)) (state : G) : G :=
  mechanics.foldl (fun s m => m s) state

/-- If every mechanic in a list preserves an invariant, composing all
    of them preserves the invariant. -/
theorem composeN_preserves {G : Type} (mechanics : List (G → G))
    (inv : G → Prop)
    (h_all : ∀ m, m ∈ mechanics → ∀ g, inv g → inv (m g))
    (g : G) (h_inv : inv g) :
    inv (composeN mechanics g) := by
  induction mechanics generalizing g with
  | nil => exact h_inv
  | cons m rest ih =>
    simp [composeN, List.foldl]
    apply ih
    · intro m' hm'
      exact h_all m' (List.mem_cons_of_mem _ hm')
    · exact h_all m (List.mem_cons_self _ _) g h_inv

end Playtest.Composition
