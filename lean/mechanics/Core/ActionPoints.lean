/-
  Core/ActionPoints.lean — Action point mechanic formalization.

  Models per-turn expendable action budgets: action points (AP),
  movement points, energy, mana, etc. Unlike persistent resources,
  action points reset to a budget at the start of each turn/round.

  Key distinction from ResourceMechanic:
  - Resources persist across turns (gold, VP)
  - Action points reset each turn (AP, movement, energy)
-/

import Core.Types

namespace Playtest.ActionPoints

open Playtest

/-! ## Action Point Pool -/

/-- Action point state for a single player. -/
structure APState where
  /-- Current remaining points this turn. -/
  current : Nat
  /-- Budget: points granted at turn start. -/
  budget : Nat
  /-- Points spent this turn (for tracking). -/
  spent : Nat := 0
  deriving Repr, DecidableEq

/-- Fresh AP state at turn start. -/
def APState.fresh (budget : Nat) : APState :=
  { current := budget, budget, spent := 0 }

/-- Invariant: current + spent = budget (no AP created or destroyed). -/
def APState.conserved (ap : APState) : Prop :=
  ap.current + ap.spent = ap.budget

/-! ## Core Operations -/

/-- Spend action points. Requires sufficient points. -/
def spend (ap : APState) (cost : Nat) (h : cost ≤ ap.current) : APState :=
  { ap with current := ap.current - cost, spent := ap.spent + cost }

/-- Check if a player can afford an action. -/
def canAfford (ap : APState) (cost : Nat) : Bool :=
  cost ≤ ap.current

/-- Reset to budget (called at turn start). -/
def reset (ap : APState) : APState :=
  APState.fresh ap.budget

/-- Modify budget (e.g., from effects or upgrades). -/
def modifyBudget (ap : APState) (newBudget : Nat) : APState :=
  { ap with budget := newBudget }

/-! ## Laws -/

/-- Spending preserves the conservation invariant. -/
theorem spend_conserves (ap : APState) (cost : Nat) (h : cost ≤ ap.current)
    (hc : ap.conserved) :
    (spend ap cost h).conserved := by
  simp [spend, APState.conserved] at *
  omega

/-- Spending reduces current by exactly the cost. -/
theorem spend_reduces (ap : APState) (cost : Nat) (h : cost ≤ ap.current) :
    (spend ap cost h).current = ap.current - cost := by
  simp [spend]

/-- Spending increases spent by exactly the cost. -/
theorem spend_tracks (ap : APState) (cost : Nat) (h : cost ≤ ap.current) :
    (spend ap cost h).spent = ap.spent + cost := by
  simp [spend]

/-- Reset restores full budget. -/
theorem reset_full (ap : APState) :
    (reset ap).current = ap.budget := by
  simp [reset, APState.fresh]

/-- Reset clears spent counter. -/
theorem reset_clears_spent (ap : APState) :
    (reset ap).spent = 0 := by
  simp [reset, APState.fresh]

/-- Reset satisfies conservation. -/
theorem reset_conserves (ap : APState) :
    (reset ap).conserved := by
  simp [reset, APState.fresh, APState.conserved]

/-- Fresh state satisfies conservation. -/
theorem fresh_conserves (budget : Nat) :
    (APState.fresh budget).conserved := by
  simp [APState.fresh, APState.conserved]

/-- canAfford is consistent with spend. -/
theorem can_afford_iff_spend (ap : APState) (cost : Nat) :
    canAfford ap cost = true ↔ cost ≤ ap.current := by
  simp [canAfford, Nat.ble_eq]

end Playtest.ActionPoints

/-! ## ActionPoints Mechanic Typeclass -/

namespace Playtest

/-- The ActionPointsMechanic typeclass.
    Models per-turn expendable budgets (AP, movement points, energy).
    Unlike ResourceMechanic, these reset each turn. -/
class ActionPointsMechanic (G : Type) where
  /-- Get a player's current AP. -/
  getCurrentAP : G → PlayerId → Nat
  /-- Get a player's AP budget. -/
  getBudget : G → PlayerId → Nat
  /-- Get points spent this turn. -/
  getSpent : G → PlayerId → Nat
  /-- Spend action points. Returns none if insufficient. -/
  spendAP : G → PlayerId → Nat → Option G
  /-- Check if player can afford a cost. -/
  canAfford : G → PlayerId → Nat → Bool
  /-- Reset AP to budget (called at turn start). -/
  resetAP : G → PlayerId → G
  /-- Modify a player's budget. -/
  modifyBudget : G → PlayerId → Nat → G

  -- Laws

  /-- Spending reduces AP by exactly the cost. -/
  spend_reduces : ∀ (g : G) (pid : PlayerId) (cost : Nat) (g' : G),
    spendAP g pid cost = some g' →
    getCurrentAP g' pid = getCurrentAP g pid - cost

  /-- Spending requires sufficient AP. -/
  spend_requires : ∀ (g : G) (pid : PlayerId) (cost : Nat),
    cost > getCurrentAP g pid →
    spendAP g pid cost = none

  /-- Reset restores full budget. -/
  reset_full : ∀ (g : G) (pid : PlayerId),
    getCurrentAP (resetAP g pid) pid = getBudget g pid

  /-- Reset clears spent counter. -/
  reset_clears : ∀ (g : G) (pid : PlayerId),
    getSpent (resetAP g pid) pid = 0

  /-- canAfford is consistent with getCurrentAP. -/
  afford_iff : ∀ (g : G) (pid : PlayerId) (cost : Nat),
    canAfford g pid cost = true ↔ cost ≤ getCurrentAP g pid

  /-- AP operations don't affect other players (isolation). -/
  spend_isolation : ∀ (g : G) (pid other : PlayerId) (cost : Nat) (g' : G),
    pid ≠ other →
    spendAP g pid cost = some g' →
    getCurrentAP g' other = getCurrentAP g other

end Playtest
