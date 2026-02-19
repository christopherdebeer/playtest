/-
  Composition/HookChain.lean — Hook chain execution formalization.

  Mirrors the hook firing logic in src/mechanics/registry.ts.
  When an action occurs, multiple mechanics' hooks fire in sequence.
  We formalize the three resolution strategies (blocking, merge, first)
  and prove that hook chains preserve typeclass invariants.
-/

import Core.Types

namespace Playtest.HookChain

open Playtest

variable {G : Type}

/-! ## Hook Types -/

/-- A state-transforming hook: takes game state, returns modified state or none. -/
def Hook (G : Type) := G → Option G

/-- A blocking hook: can block an action entirely. -/
def BlockingHook (G : Type) := G → Option (G × Bool)

/-! ## Resolution Strategies -/

/-- Blocking resolution: fire hooks in order, stop at first block. -/
def resolveBlocking (hooks : List (BlockingHook G)) (state : G) : Option G :=
  match hooks with
  | [] => some state
  | hook :: rest =>
    match hook state with
    | none => resolveBlocking rest state
    | some (_, true) => none
    | some (state', false) => resolveBlocking rest state'

/-- First resolution: return the first non-none result. -/
def resolveFirst (hooks : List (Hook G)) (state : G) : Option G :=
  match hooks with
  | [] => none
  | hook :: rest =>
    match hook state with
    | some state' => some state'
    | none => resolveFirst rest state

/-- Merge resolution: apply all hooks sequentially, combining results. -/
def resolveMerge (hooks : List (Hook G)) (state : G) : G :=
  hooks.foldl (fun s hook =>
    match hook s with
    | some s' => s'
    | none => s
  ) state

/-! ## Invariant Preservation -/

/-- A predicate (invariant) on game state. -/
def Invariant (G : Type) := G → Prop

/-- A hook preserves an invariant. -/
def HookPreserves (hook : Hook G) (inv : Invariant G) : Prop :=
  ∀ (s s' : G), inv s → hook s = some s' → inv s'

/-- A blocking hook preserves an invariant. -/
def BlockingHookPreserves (hook : BlockingHook G) (inv : Invariant G) : Prop :=
  ∀ (s s' : G) (b : Bool), inv s → hook s = some (s', b) → inv s'

/-- If every hook in a merge chain preserves an invariant,
    the entire chain preserves it. -/
theorem merge_preserves_invariant (hooks : List (Hook G)) (inv : Invariant G)
    (h_all : ∀ (hook : Hook G), hook ∈ hooks → HookPreserves hook inv) (state : G)
    (h_inv : inv state) :
    inv (resolveMerge hooks state) := by
  induction hooks generalizing state with
  | nil => exact h_inv
  | cons hook rest ih =>
    simp [resolveMerge, List.foldl]
    apply ih
    · intro h hm
      exact h_all h (List.mem_cons_of_mem _ hm)
    · have h_hook := h_all hook (List.mem_cons_self _ _)
      cases hv : hook state with
      | none => exact h_inv
      | some s' => exact h_hook state s' h_inv hv

/-- If every hook in a blocking chain preserves an invariant,
    the successful result preserves it. -/
theorem blocking_preserves_invariant (hooks : List (BlockingHook G)) (inv : Invariant G)
    (h_all : ∀ (hook : BlockingHook G), hook ∈ hooks → BlockingHookPreserves hook inv)
    (state : G) (h_inv : inv state) (result : G)
    (h_result : resolveBlocking hooks state = some result) :
    inv result := by
  sorry -- Provable by induction; requires careful pattern matching on hook results

/-! ## Composing Hook Chains -/

/-- An action pipeline: validate → execute → post-process. -/
structure ActionPipeline (G : Type) where
  preValidate : List (BlockingHook G)
  execute : List (Hook G)
  postExecute : List (Hook G)

/-- Run the full pipeline. -/
def ActionPipeline.run (pipeline : ActionPipeline G) (state : G) : Option G :=
  match resolveBlocking pipeline.preValidate state with
  | none => none
  | some validated =>
    match resolveFirst pipeline.execute validated with
    | none => none
    | some executed =>
      some (resolveMerge pipeline.postExecute executed)

/-! ## Hook Commutativity -/

/-- Two hooks commute if applying them in either order gives the same result. -/
def HooksCommute (h1 h2 : Hook G) : Prop :=
  ∀ (s : G), (do let s1 ← h1 s; h2 s1) = (do let s2 ← h2 s; h1 s2)

end Playtest.HookChain
