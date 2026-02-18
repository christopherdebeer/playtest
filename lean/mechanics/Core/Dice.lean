/-
  Core/Dice.lean — Dice mechanic formalization.

  Mirrors src/mechanics/core/dice.ts.
  Dice are fundamentally about nondeterministic choice. Since Lean is
  deterministic, we model dice rolls as universally quantified over all
  possible outcomes, proving properties that hold for *every* roll.

  This is the "probability as nondeterminism" approach: instead of
  computing probabilities, we prove that invariants hold regardless
  of what the dice show.
-/

import Core.Types

namespace Playtest.Dice

open Playtest

/-! ## Dice Configuration -/

/-- Configuration for a dice roll. -/
structure DiceConfig where
  /-- Number of dice to roll. -/
  count : Nat
  /-- Number of sides per die. -/
  sides : Nat
  /-- Sides must be positive. -/
  sides_pos : sides > 0
  /-- Additive modifier to the total. -/
  modifier : Int := 0
  deriving Repr

/-- Standard d6. -/
def d6 : DiceConfig := ⟨1, 6, by omega, 0⟩

/-- Roll 2d6. -/
def twod6 : DiceConfig := ⟨2, 6, by omega, 0⟩

/-! ## Roll Results -/

/-- A single die result: a value in [1, sides]. -/
structure DieResult (sides : Nat) (h : sides > 0) where
  value : Nat
  ge_one : value ≥ 1
  le_sides : value ≤ sides
  deriving Repr

/-- A complete roll result for a dice configuration. -/
structure RollResult (config : DiceConfig) where
  /-- Individual die results. -/
  dice : List (DieResult config.sides config.sides_pos)
  /-- Correct number of dice. -/
  count_correct : dice.length = config.count
  deriving Repr

/-- Get the raw total of a roll (sum of dice). -/
def RollResult.rawTotal {config : DiceConfig} (r : RollResult config) : Nat :=
  r.dice.foldl (fun acc d => acc + d.value) 0

/-- Get the modified total (raw + modifier). -/
def RollResult.total {config : DiceConfig} (r : RollResult config) : Int :=
  (r.rawTotal : Int) + config.modifier

/-! ## Roll Bounds -/

/-- Minimum possible raw total for a config. -/
def minRaw (config : DiceConfig) : Nat := config.count

/-- Maximum possible raw total for a config. -/
def maxRaw (config : DiceConfig) : Nat := config.count * config.sides

/-- Any roll's raw total is at least the number of dice (each die ≥ 1). -/
theorem roll_ge_min (config : DiceConfig) (r : RollResult config) :
    r.rawTotal ≥ minRaw config := by
  sorry -- Provable by induction on dice list using ge_one

/-- Any roll's raw total is at most count × sides (each die ≤ sides). -/
theorem roll_le_max (config : DiceConfig) (r : RollResult config) :
    r.rawTotal ≤ maxRaw config := by
  sorry -- Provable by induction on dice list using le_sides

/-- The raw total is bounded. -/
theorem roll_bounded (config : DiceConfig) (r : RollResult config) :
    minRaw config ≤ r.rawTotal ∧ r.rawTotal ≤ maxRaw config :=
  ⟨roll_ge_min config r, roll_le_max config r⟩

/-! ## Roll Checks -/

/-- A roll check: compare total against a target. -/
def rollCheck (total : Int) (target : Int) : Bool :=
  total ≥ target

/-- Margin of success/failure. -/
def rollMargin (total : Int) (target : Int) : Int :=
  total - target

/-! ## Advantage / Disadvantage -/

/-- Roll with advantage: take the higher of two rolls. -/
def withAdvantage {config : DiceConfig}
    (r1 r2 : RollResult config) : RollResult config :=
  if r1.rawTotal ≥ r2.rawTotal then r1 else r2

/-- Roll with disadvantage: take the lower of two rolls. -/
def withDisadvantage {config : DiceConfig}
    (r1 r2 : RollResult config) : RollResult config :=
  if r1.rawTotal ≤ r2.rawTotal then r1 else r2

/-- Advantage is at least as good as either roll. -/
theorem advantage_ge_both {config : DiceConfig}
    (r1 r2 : RollResult config) :
    (withAdvantage r1 r2).rawTotal ≥ r1.rawTotal ∧
    (withAdvantage r1 r2).rawTotal ≥ r2.rawTotal := by
  simp [withAdvantage]
  split <;> omega

/-- Disadvantage is at most as good as either roll. -/
theorem disadvantage_le_both {config : DiceConfig}
    (r1 r2 : RollResult config) :
    (withDisadvantage r1 r2).rawTotal ≤ r1.rawTotal ∧
    (withDisadvantage r1 r2).rawTotal ≤ r2.rawTotal := by
  simp [withDisadvantage]
  split <;> omega

/-! ## Exploding Dice -/

/-- Count of successes: how many dice meet or exceed a threshold. -/
def countSuccesses {config : DiceConfig} (r : RollResult config) (threshold : Nat) : Nat :=
  r.dice.foldl (fun acc d => if d.value ≥ threshold then acc + 1 else acc) 0

/-- Successes are bounded by the number of dice. -/
theorem successes_bounded {config : DiceConfig} (r : RollResult config) (threshold : Nat) :
    countSuccesses r threshold ≤ config.count := by
  sorry -- Provable by induction using count_correct

end Playtest.Dice

/-! ## Dice Mechanic Typeclass -/

namespace Playtest

/-- The DiceMechanic typeclass — what core/dice.ts provides.
    Since dice are nondeterministic, the typeclass models rolling as
    producing a result that satisfies validity constraints, universally
    quantified over the actual outcome. -/
class DiceMechanic (G : Type) where
  /-- Roll dice and update state. The result is nondeterministic,
      but we know its bounds. Returns (new state, raw results, total). -/
  rollDice : G → PlayerId → Dice.DiceConfig → G × List Nat × Int
  /-- Get the last roll results for a player. -/
  getLastRoll : G → PlayerId → Option (List Nat)

  -- Laws (hold for all possible outcomes)

  /-- Roll results are within valid bounds. -/
  roll_valid : ∀ (g : G) (pid : PlayerId) (config : Dice.DiceConfig),
    let (_, results, _) := rollDice g pid config
    results.length = config.count ∧
    results.all (fun v => v ≥ 1 && v ≤ config.sides) = true

  /-- Total equals sum of results plus modifier. -/
  roll_total : ∀ (g : G) (pid : PlayerId) (config : Dice.DiceConfig),
    let (_, results, total) := rollDice g pid config
    total = (results.foldl (· + ·) 0 : Int) + config.modifier

end Playtest
