/-
  Leaf/ActionPoints.lean — ActionPointsMechanic as ResettablePool instance.

  This is the #1 priority typeclass from ANALYSIS.md: "per-turn-reset
  resources." It's needed by AAOTE, Alliance, Arcane Assembly, Battle
  Forge, Shadow Ops, and Treasure Hunters (6/18 games).

  ActionPointsMechanic is defined as a ResettablePool — it inherits all
  pool laws (add, spend, frame conditions) plus the reset semantics
  (reset_restores_max, no_accumulation).

  This demonstrates the power of the abstract pattern approach: instead
  of defining ActionPointsMechanic from scratch with duplicate laws,
  we extend ResettablePool and only add AP-specific behavior.
-/

import Core.Types
import Core.Abstract.Pool

namespace Playtest.Leaf

open Playtest
open Playtest.Abstract

variable {G : Type}

/-! ## Action Point Identity -/

/-- Action point pool identifier.
    Games may have multiple AP-like pools (action points, movement points,
    ability charges). Each is identified by an APPoolId. -/
inductive APPoolId where
  | actionPoints : APPoolId
  | movementPoints : APPoolId
  | abilityCharges (name : String) : APPoolId
  deriving Repr, DecidableEq, BEq

/-! ## Action Points Mechanic -/

/-- ActionPointsMechanic: per-turn action points with reset.

    This extends ResettablePool with action-cost semantics:
    - Each action type has a cost in AP
    - Actions require sufficient AP
    - AP resets at the start of each turn

    The ResettablePool parent provides all pool operations and laws.
    This class only adds the action-cost integration. -/
class ActionPointsMechanic (G : Type)
    extends ResettablePool G APPoolId where
  /-- Get the cost of an action in AP. -/
  getActionCost : G → Action → APPoolId → Nat
  /-- Check if a player can afford an action. -/
  canAfford : G → PlayerId → Action → Bool
  /-- Spend AP for an action. Returns none if insufficient. -/
  spendForAction : G → PlayerId → Action → Option G

  -- === Laws ===

  /-- canAfford is consistent with pool value and action cost. -/
  afford_consistent : ∀ (g : G) (pid : PlayerId) (action : Action),
    canAfford g pid action = true ↔
    getPool g pid APPoolId.actionPoints ≥ getActionCost g action APPoolId.actionPoints

  /-- spendForAction deducts the action's cost. -/
  spend_action_deducts : ∀ (g : G) (pid : PlayerId) (action : Action) (g' : G),
    spendForAction g pid action = some g' →
    getPool g' pid APPoolId.actionPoints =
    getPool g pid APPoolId.actionPoints - getActionCost g action APPoolId.actionPoints

  /-- Cannot spend for unaffordable actions. -/
  spend_requires_afford : ∀ (g : G) (pid : PlayerId) (action : Action),
    canAfford g pid action = false →
    spendForAction g pid action = none

/-! ## Derived: Turn Lifecycle -/

/-- At turn start, AP is fully restored. -/
theorem turn_start_full_ap [inst : ActionPointsMechanic G]
    (g : G) (pid : PlayerId) :
    inst.getPool (inst.resetPool g pid APPoolId.actionPoints) pid APPoolId.actionPoints =
    inst.getMaxPool g pid APPoolId.actionPoints :=
  inst.reset_restores_max g pid APPoolId.actionPoints

/-- After reset, any action costing ≤ maxAP is affordable. -/
theorem reset_enables_affordable [inst : ActionPointsMechanic G]
    (g : G) (pid : PlayerId) (action : Action)
    (h_cost : inst.getActionCost g action APPoolId.actionPoints ≤
              inst.getMaxPool g pid APPoolId.actionPoints) :
    inst.getPool (inst.resetPool g pid APPoolId.actionPoints) pid APPoolId.actionPoints ≥
    inst.getActionCost g action APPoolId.actionPoints := by
  rw [inst.reset_restores_max]
  exact h_cost

/-! ## Movement Points (same pattern, different pool)

    Movement points work identically to action points but spend from
    a different pool. Games like AAOTE use both:
    - Action points for general actions (explore, trade, play card)
    - Movement points specifically for grid movement

    Because both are ResettablePool instances over APPoolId, they share
    all the same laws. The pool isolation laws guarantee that spending
    action points doesn't affect movement points and vice versa.

    No additional typeclass needed — ActionPointsMechanic already supports
    multiple pool types via APPoolId. A game can use:
      `getPool g pid APPoolId.actionPoints`     -- action points
      `getPool g pid APPoolId.movementPoints`   -- movement points
    and the pool_frame laws guarantee they don't interfere. -/

end Playtest.Leaf
