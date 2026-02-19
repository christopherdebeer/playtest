/-
  Core/Resources.lean — Resource mechanic formalization.

  Mirrors src/mechanics/core/resources.ts.
  Resources are named non-negative quantities owned by players.
  The fundamental operations are spend (with sufficiency proof) and add.
  The key invariant: non-negativity is enforced by construction (Nat).
-/

import Core.Types

namespace Playtest.Resources

open Playtest

/-! ## Resource Pool -/

/-- A resource pool maps resource names to non-negative amounts.
    Using Nat guarantees non-negativity by construction — no runtime check needed. -/
def ResourcePool := ResourceName → Nat

instance : Inhabited ResourcePool := ⟨fun _ => 0⟩

/-- Empty resource pool. -/
def ResourcePool.empty : ResourcePool := fun _ => 0

/-- Get amount of a resource. -/
def ResourcePool.get (pool : ResourcePool) (name : ResourceName) : Nat :=
  pool name

/-- Set a resource to a specific amount. -/
def ResourcePool.set (pool : ResourcePool) (name : ResourceName) (amount : Nat) : ResourcePool :=
  fun n => if n = name then amount else pool n

/-! ## Core Operations with Proofs -/

/-- Add resources to a pool. Always succeeds. -/
def addResource (pool : ResourcePool) (name : ResourceName) (amount : Nat) : ResourcePool :=
  fun n => if n = name then pool n + amount else pool n

/-- Spend resources from a pool. Requires a proof of sufficiency.
    The `(h : amount ≤ pool name)` parameter is what the TypeScript runtime checks
    in `spendResource` — here it's a compile-time guarantee. -/
def spendResource (pool : ResourcePool) (name : ResourceName) (amount : Nat)
    (_h : amount ≤ pool name) : ResourcePool :=
  fun n => if n = name then pool name - amount else pool n

/-- Check if a player has enough of a resource. -/
def hasResource (pool : ResourcePool) (name : ResourceName) (amount : Nat) : Prop :=
  amount ≤ pool name

instance (pool : ResourcePool) (name : ResourceName) (amount : Nat) :
    Decidable (hasResource pool name amount) :=
  inferInstanceAs (Decidable (amount ≤ pool name))

/-! ## Laws -/

/-- Spending never creates resources: result is always ≤ original. -/
theorem spend_monotone (pool : ResourcePool) (name : ResourceName)
    (amount : Nat) (h : amount ≤ pool name) (n : ResourceName) :
    spendResource pool name amount h n ≤ pool n := by
  simp [spendResource]
  split
  · next heq => subst heq; omega
  · omega

/-- Spending the exact amount yields zero for that resource. -/
theorem spend_exact_yields_zero (pool : ResourcePool) (name : ResourceName)
    (h : pool name ≤ pool name) :
    spendResource pool name (pool name) h name = 0 := by
  simp [spendResource]

/-- Adding then spending the same amount is identity for that resource.
    This is the fundamental round-trip law. -/
theorem add_spend_roundtrip (pool : ResourcePool) (name : ResourceName) (amount : Nat) :
    let pool' := addResource pool name amount
    have h : amount ≤ pool' name := by show amount ≤ addResource pool name amount name; unfold addResource; simp
    spendResource pool' name amount h name = pool name := by
  simp [addResource, spendResource]

/-- Spending does not affect other resources (frame condition). -/
theorem spend_frame (pool : ResourcePool) (name other : ResourceName)
    (amount : Nat) (h : amount ≤ pool name) (hne : other ≠ name) :
    spendResource pool name amount h other = pool other := by
  unfold spendResource; exact if_neg hne

/-- Adding does not affect other resources (frame condition). -/
theorem add_frame (pool : ResourcePool) (name other : ResourceName)
    (amount : Nat) (hne : other ≠ name) :
    addResource pool name amount other = pool other := by
  unfold addResource; exact if_neg hne

/-- Adding is commutative: order of additions doesn't matter. -/
theorem add_comm (pool : ResourcePool) (n1 n2 : ResourceName) (a1 a2 : Nat) :
    addResource (addResource pool n1 a1) n2 a2 =
    addResource (addResource pool n2 a2) n1 a1 := by
  funext n
  simp [addResource]
  split <;> split <;> omega

/-- Adding zero is identity. -/
theorem add_zero (pool : ResourcePool) (name : ResourceName) :
    addResource pool name 0 = pool := by
  funext n; unfold addResource
  split <;> simp_all

/-! ## Player Resource State -/

/-- Per-player resource state: maps players to their resource pools. -/
def PlayerResources := PlayerId → ResourcePool

instance : Inhabited PlayerResources := ⟨fun _ => ResourcePool.empty⟩

/-- Get a player's resource amount. -/
def PlayerResources.get (pr : PlayerResources) (pid : PlayerId) (name : ResourceName) : Nat :=
  (pr pid).get name

/-- Modify a specific player's pool. -/
def PlayerResources.modifyPlayer (pr : PlayerResources) (pid : PlayerId)
    (f : ResourcePool → ResourcePool) : PlayerResources :=
  fun p => if p = pid then f (pr pid) else pr p

/-- Player resource modification doesn't affect other players (isolation). -/
theorem modifyPlayer_frame (pr : PlayerResources) (pid other : PlayerId)
    (f : ResourcePool → ResourcePool) (hne : other ≠ pid) :
    pr.modifyPlayer pid f other = pr other := by
  simp [PlayerResources.modifyPlayer, hne]

end Playtest.Resources

/-! ## Resource Mechanic Typeclass -/

namespace Playtest

/-- The ResourceMechanic typeclass — what core/resources.ts provides.
    Any game state `G` implementing this interface must support
    resource operations and satisfy the listed laws. -/
class ResourceMechanic (G : Type) where
  /-- Get a player's amount of a named resource. -/
  getResource : G → PlayerId → ResourceName → Nat
  /-- Add resources to a player. Returns updated state. -/
  addResource : G → PlayerId → ResourceName → Nat → G
  /-- Spend resources from a player (requires sufficiency). -/
  spendResource : G → PlayerId → ResourceName → Nat → G
  /-- Check resource sufficiency (decidable). -/
  hasResource : G → PlayerId → ResourceName → Nat → Bool

  -- Laws

  /-- Adding increases the resource by exactly the given amount. -/
  add_increases : ∀ (g : G) (pid : PlayerId) (name : ResourceName) (amount : Nat),
    getResource (addResource g pid name amount) pid name =
    getResource g pid name + amount

  /-- Adding doesn't affect other players' resources (player isolation). -/
  add_player_frame : ∀ (g : G) (pid other : PlayerId) (name : ResourceName) (amount : Nat),
    pid ≠ other →
    getResource (addResource g pid name amount) other name =
    getResource g other name

  /-- Adding doesn't affect other resources for the same player. -/
  add_resource_frame : ∀ (g : G) (pid : PlayerId) (n1 n2 : ResourceName) (amount : Nat),
    n1 ≠ n2 →
    getResource (addResource g pid n1 amount) pid n2 =
    getResource g pid n2

  /-- Spending decreases the resource by exactly the given amount. -/
  spend_decreases : ∀ (g : G) (pid : PlayerId) (name : ResourceName) (amount : Nat),
    amount ≤ getResource g pid name →
    getResource (spendResource g pid name amount) pid name =
    getResource g pid name - amount

  /-- hasResource is consistent with getResource. -/
  has_iff_sufficient : ∀ (g : G) (pid : PlayerId) (name : ResourceName) (amount : Nat),
    hasResource g pid name amount = true ↔ amount ≤ getResource g pid name

end Playtest
