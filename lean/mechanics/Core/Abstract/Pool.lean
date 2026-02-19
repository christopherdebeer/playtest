/-
  Core/Abstract/Pool.lean — Abstract Pool mechanic pattern.

  The most fundamental abstract pattern: anything with get/add/spend
  operations on named pools owned by players.

  **Instances:**
  - ResourceMechanic — persistent pools (gold, wood, score)
  - ActionPointsMechanic — resettable per-turn pool
  - MovementPointsMechanic — resettable per-turn pool
  - AbilityCooldowns — uses-per-round counter

  **Key insight:** All pool-like mechanics share the same algebraic
  structure. The laws below (frame conditions, roundtrip, monotonicity)
  hold for ALL pools regardless of reset semantics. Reset semantics
  are captured by the ResettablePool refinement.

  This replaces the need to individually formalize 20+ resource-like
  mechanics. Any mechanic that "tracks a number per player" is a Pool.
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Abstract Pool Mechanic -/

/-- PoolMechanic: the abstract pattern for any named numeric pool.

    `PoolId` is the type of pool identifiers — `ResourceName` for resources,
    `String` for generic pools, or a custom enum for a specific game.

    Every pool supports get, add, spend, and satisfies frame conditions
    (operations on one pool/player don't affect others) plus a roundtrip
    law (add then spend is identity). -/
class PoolMechanic (G : Type) (PoolId : outParam Type) [BEq PoolId] where
  /-- Get the current value of a pool for a player. -/
  getPool : G → PlayerId → PoolId → Nat
  /-- Add to a pool. Always succeeds (pools are unbounded from above). -/
  addPool : G → PlayerId → PoolId → Nat → G
  /-- Spend from a pool. Returns none if insufficient. -/
  spendPool : G → PlayerId → PoolId → Nat → Option G
  /-- Check sufficiency (decidable). -/
  hasPool : G → PlayerId → PoolId → Nat → Bool

  -- === Laws ===

  /-- Adding increases the pool by exactly the given amount. -/
  add_increases : ∀ (g : G) (pid : PlayerId) (pool : PoolId) (amount : Nat),
    getPool (addPool g pid pool amount) pid pool =
    getPool g pid pool + amount

  /-- Adding doesn't affect other players (player isolation). -/
  add_player_frame : ∀ (g : G) (pid other : PlayerId) (pool : PoolId) (amount : Nat),
    pid ≠ other →
    getPool (addPool g pid pool amount) other pool =
    getPool g other pool

  /-- Adding doesn't affect other pools (pool isolation). -/
  add_pool_frame : ∀ (g : G) (pid : PlayerId) (p1 p2 : PoolId) (amount : Nat),
    (p1 == p2) = false →
    getPool (addPool g pid p1 amount) pid p2 =
    getPool g pid p2

  /-- Spending decreases the pool by exactly the given amount. -/
  spend_decreases : ∀ (g : G) (pid : PlayerId) (pool : PoolId) (amount : Nat) (g' : G),
    spendPool g pid pool amount = some g' →
    getPool g' pid pool = getPool g pid pool - amount

  /-- Spending requires sufficiency. -/
  spend_requires_sufficient : ∀ (g : G) (pid : PlayerId) (pool : PoolId) (amount : Nat),
    amount > getPool g pid pool → spendPool g pid pool amount = none

  /-- hasPool is consistent with getPool. -/
  has_iff_sufficient : ∀ (g : G) (pid : PlayerId) (pool : PoolId) (amount : Nat),
    hasPool g pid pool amount = true ↔ amount ≤ getPool g pid pool

  /-- Spending doesn't affect other players (player isolation). -/
  spend_player_frame : ∀ (g : G) (pid other : PlayerId) (pool : PoolId) (amount : Nat) (g' : G),
    pid ≠ other →
    spendPool g pid pool amount = some g' →
    getPool g' other pool = getPool g other pool

  /-- Spending doesn't affect other pools (pool isolation). -/
  spend_pool_frame : ∀ (g : G) (pid : PlayerId) (p1 p2 : PoolId) (amount : Nat) (g' : G),
    (p1 == p2) = false →
    spendPool g pid p1 amount = some g' →
    getPool g' pid p2 = getPool g pid p2

/-! ## Derived Laws -/

variable {G : Type} {PoolId : Type} {CounterId : Type}

/-- Adding zero is identity — derived from add_increases. -/
theorem pool_add_zero [BEq PoolId] [PoolMechanic G PoolId]
    (g : G) (pid : PlayerId) (pool : PoolId) :
    PoolMechanic.getPool (PoolMechanic.addPool g pid pool 0 : G) pid pool =
    PoolMechanic.getPool g pid pool := by
  rw [PoolMechanic.add_increases]
  omega

/-- Add-then-spend roundtrip: adding and spending the same amount
    returns the pool to its original value. -/
theorem pool_add_spend_roundtrip [BEq PoolId] [PoolMechanic G PoolId]
    (g : G) (pid : PlayerId) (pool : PoolId) (amount : Nat)
    (g' : G) (h : PoolMechanic.spendPool (PoolMechanic.addPool g pid pool amount : G) pid pool amount = some g') :
    PoolMechanic.getPool g' pid pool = PoolMechanic.getPool g pid pool := by
  have hd := PoolMechanic.spend_decreases
    (PoolMechanic.addPool g pid pool amount : G) pid pool amount g' h
  rw [PoolMechanic.add_increases] at hd
  omega

/-! ## Resettable Pool -/

/-- ResettablePool: a pool that resets to a maximum value at a boundary.

    This captures the pattern shared by:
    - Action points (reset per turn)
    - Movement points (reset per turn)
    - Ability cooldowns (reset per round)
    - Per-turn budgets of any kind

    The key distinction from a plain Pool: a resettable pool has a
    hard cap (`getMaxPool`) and a reset operation that restores it.
    The `no_accumulation` law prevents "banking" unused points. -/
class ResettablePool (G : Type) (PoolId : outParam Type) [BEq PoolId]
    extends PoolMechanic G PoolId where
  /-- Get the maximum value of a pool. -/
  getMaxPool : G → PlayerId → PoolId → Nat
  /-- Reset a pool to its maximum value. -/
  resetPool : G → PlayerId → PoolId → G

  -- === Additional Laws ===

  /-- Reset restores the pool to its maximum. -/
  reset_restores_max : ∀ (g : G) (pid : PlayerId) (pool : PoolId),
    getPool (resetPool g pid pool) pid pool = getMaxPool g pid pool

  /-- The pool never exceeds its maximum (no accumulation). -/
  no_accumulation : ∀ (g : G) (pid : PlayerId) (pool : PoolId),
    getPool g pid pool ≤ getMaxPool g pid pool

  /-- Reset doesn't affect other players. -/
  reset_player_frame : ∀ (g : G) (pid other : PlayerId) (pool : PoolId),
    pid ≠ other →
    getPool (resetPool g pid pool) other pool =
    getPool g other pool

  /-- Reset doesn't affect other pools. -/
  reset_pool_frame : ∀ (g : G) (pid : PlayerId) (p1 p2 : PoolId),
    (p1 == p2) = false →
    getPool (resetPool g pid p1) pid p2 =
    getPool g pid p2

/-! ## Derived: Reset then spend is bounded -/

/-- After reset, spending the maximum empties the pool. -/
theorem reset_spend_max [BEq PoolId] [inst : ResettablePool G PoolId]
    (g : G) (pid : PlayerId) (pool : PoolId)
    (g' : G)
    (h : inst.spendPool (inst.resetPool g pid pool) pid pool
      (inst.getMaxPool g pid pool) = some g') :
    inst.getPool g' pid pool = 0 := by
  have hd := inst.spend_decreases (inst.resetPool g pid pool) pid pool
    (inst.getMaxPool g pid pool) g' h
  rw [inst.reset_restores_max] at hd
  omega

/-! ## Monotone Counter (History Pattern) -/

/-- MonotoneCounter: a pool that can only grow, never decrease.

    This captures the pattern for tracking cumulative history:
    - Locations visited count
    - Trades completed count
    - Rounds survived count
    - Total damage dealt

    Unlike a regular pool, there is no spend operation.
    The value can only increase monotonically. -/
class MonotoneCounter (G : Type) (CounterId : outParam Type) [BEq CounterId] where
  /-- Get the current counter value. -/
  getCount : G → PlayerId → CounterId → Nat
  /-- Increment the counter. -/
  increment : G → PlayerId → CounterId → Nat → G

  -- === Laws ===

  /-- Incrementing increases the count. -/
  increment_increases : ∀ (g : G) (pid : PlayerId) (cid : CounterId) (amount : Nat),
    getCount (increment g pid cid amount) pid cid =
    getCount g pid cid + amount

  /-- Incrementing doesn't affect other players. -/
  increment_player_frame : ∀ (g : G) (pid other : PlayerId) (cid : CounterId) (amount : Nat),
    pid ≠ other →
    getCount (increment g pid cid amount) other cid =
    getCount g other cid

  /-- Incrementing doesn't affect other counters. -/
  increment_counter_frame : ∀ (g : G) (pid : PlayerId) (c1 c2 : CounterId) (amount : Nat),
    (c1 == c2) = false →
    getCount (increment g pid c1 amount) pid c2 =
    getCount g pid c2

/-- Monotone counters are monotonically non-decreasing. -/
theorem counter_monotone [BEq CounterId] [MonotoneCounter G CounterId]
    (g : G) (pid : PlayerId) (cid : CounterId) (amount : Nat) :
    MonotoneCounter.getCount g pid cid ≤
    MonotoneCounter.getCount (MonotoneCounter.increment g pid cid amount : G) pid cid := by
  rw [MonotoneCounter.increment_increases]
  omega

end Playtest.Abstract
