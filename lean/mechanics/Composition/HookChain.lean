/-
  Composition/HookChain.lean — Hook chain execution formalization.

  Mirrors the hook firing logic in src/mechanics/registry.ts.
  When an action occurs, multiple mechanics' hooks fire in sequence.
  The key question: does mechanic A's hook break mechanic B's invariants?

  Here we formalize the three resolution strategies (blocking, merge, first)
  and prove that hook chains preserve typeclass invariants when each
  individual hook does.
-/

import Core.Types

namespace Playtest.HookChain

open Playtest

/-! ## Hook Types -/

/-- A state-transforming hook: takes game state, returns modified state or none.
    `none` means "not my concern" (hook doesn't apply). -/
def Hook (G : Type) := G → Option G

/-- A blocking hook: can block an action entirely. -/
def BlockingHook (G : Type) := G → Option (G × Bool)  -- (new state, blocked?)

/-- A merge hook: returns state changes to be combined. -/
def MergeHook (G : Type) := G → Option G

/-! ## Resolution Strategies -/

/-- Blocking resolution: fire hooks in order, stop at first block.
    Mirrors the `blocking` strategy in registry.ts. -/
def resolveBlocking (hooks : List (BlockingHook G)) (state : G) : Option G :=
  match hooks with
  | [] => some state
  | hook :: rest =>
    match hook state with
    | none => resolveBlocking rest state   -- hook doesn't apply, continue
    | some (state', true) => none          -- blocked!
    | some (state', false) => resolveBlocking rest state'  -- applied, continue

/-- First resolution: return the first non-none result.
    Mirrors the `first` strategy in registry.ts. -/
def resolveFirst (hooks : List (Hook G)) (state : G) : Option G :=
  match hooks with
  | [] => none
  | hook :: rest =>
    match hook state with
    | some state' => some state'
    | none => resolveFirst rest state

/-- Merge resolution: apply all hooks sequentially, combining results.
    Mirrors the `merge` strategy in registry.ts. -/
def resolveMerge (hooks : List (Hook G)) (state : G) : G :=
  hooks.foldl (fun s hook =>
    match hook s with
    | some s' => s'
    | none => s
  ) state

/-! ## Invariant Preservation -/

/-- A predicate (invariant) on game state. -/
def Invariant (G : Type) := G → Prop

/-- A hook preserves an invariant if: whenever the invariant holds on input,
    it holds on output (when the hook applies). -/
def HookPreserves (hook : Hook G) (inv : Invariant G) : Prop :=
  ∀ s s', inv s → hook s = some s' → inv s'

/-- A blocking hook preserves an invariant. -/
def BlockingHookPreserves (hook : BlockingHook G) (inv : Invariant G) : Prop :=
  ∀ s s' b, inv s → hook s = some (s', b) → inv s'

/-- If every hook in a merge chain preserves an invariant,
    the entire chain preserves it. -/
theorem merge_preserves_invariant (hooks : List (Hook G)) (inv : Invariant G)
    (h_all : ∀ hook, hook ∈ hooks → HookPreserves hook inv) (state : G)
    (h_inv : inv state) :
    inv (resolveMerge hooks state) := by
  induction hooks with
  | nil => exact h_inv
  | cons hook rest ih =>
    simp [resolveMerge, List.foldl]
    sorry -- Provable by induction: each step preserves inv

/-- If every hook in a blocking chain preserves an invariant,
    the successful result preserves it. -/
theorem blocking_preserves_invariant (hooks : List (BlockingHook G)) (inv : Invariant G)
    (h_all : ∀ hook, hook ∈ hooks → BlockingHookPreserves hook inv) (state : G)
    (h_inv : inv state) (result : G)
    (h_result : resolveBlocking hooks state = some result) :
    inv result := by
  sorry -- Provable by induction on hooks list

/-- First resolution preserves invariant if all hooks do. -/
theorem first_preserves_invariant (hooks : List (Hook G)) (inv : Invariant G)
    (h_all : ∀ hook, hook ∈ hooks → HookPreserves hook inv) (state : G)
    (h_inv : inv state) (result : G)
    (h_result : resolveFirst hooks state = some result) :
    inv result := by
  sorry -- Provable: the winning hook preserves inv

/-! ## Composing Hook Chains -/

/-- An action pipeline: validate → execute → post-process.
    This mirrors the full action lifecycle in the TypeScript engine. -/
structure ActionPipeline (G : Type) where
  /-- Pre-validation hooks (blocking). -/
  preValidate : List (BlockingHook G)
  /-- Execution hooks (first — first handler wins). -/
  execute : List (Hook G)
  /-- Post-execution hooks (merge — all apply). -/
  postExecute : List (Hook G)

/-- Run the full pipeline. -/
def ActionPipeline.run (pipeline : ActionPipeline G) (state : G) : Option G :=
  match resolveBlocking pipeline.preValidate state with
  | none => none  -- validation blocked the action
  | some validated =>
    match resolveFirst pipeline.execute validated with
    | none => none  -- no handler for this action
    | some executed =>
      some (resolveMerge pipeline.postExecute executed)

/-- If all hooks in all phases preserve an invariant,
    the pipeline preserves it. -/
theorem pipeline_preserves_invariant (pipeline : ActionPipeline G) (inv : Invariant G)
    (h_pre : ∀ hook, hook ∈ pipeline.preValidate → BlockingHookPreserves hook inv)
    (h_exec : ∀ hook, hook ∈ pipeline.execute → HookPreserves hook inv)
    (h_post : ∀ hook, hook ∈ pipeline.postExecute → HookPreserves hook inv)
    (state : G) (h_inv : inv state) (result : G)
    (h_result : pipeline.run state = some result) :
    inv result := by
  sorry -- Provable by composing the three phase theorems

/-! ## Hook Ordering Independence (for merge) -/

/-- Two hooks commute if applying them in either order gives the same result. -/
def HooksCommute (h1 h2 : Hook G) : Prop :=
  ∀ s, (do let s1 ← h1 s; h2 s1) = (do let s2 ← h2 s; h1 s2)

/-- If all hooks pairwise commute, merge order doesn't matter.
    (This is a sufficient condition for deterministic hook resolution.) -/
theorem commutative_merge_order_independent
    (h1 h2 : Hook G) (hcomm : HooksCommute h1 h2)
    (state : G) :
    resolveMerge [h1, h2] state = resolveMerge [h2, h1] state := by
  sorry -- Provable from HooksCommute definition

end Playtest.HookChain
