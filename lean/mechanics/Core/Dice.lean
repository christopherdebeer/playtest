/-
  Core/Dice.lean — Dice mechanic formalization.

  Mirrors src/mechanics/core/dice.ts.
  We model dice rolls as universally quantified over all possible
  outcomes, proving properties that hold for *every* roll.
-/

import Core.Types

namespace Playtest.Dice

open Playtest

/-! ## Dice Configuration -/

/-- Configuration for a dice roll. -/
structure DiceConfig where
  count : Nat
  sides : Nat
  sides_pos : sides > 0
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
  dice : List (DieResult config.sides config.sides_pos)
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

/-- Helper: foldl add over die values is at least acc + list length. -/
private theorem foldl_add_ge_length {sides : Nat} {h : sides > 0}
    (dice : List (DieResult sides h)) (acc : Nat) :
    dice.foldl (fun a (d : DieResult sides h) => a + d.value) acc ≥ acc + dice.length := by
  induction dice generalizing acc with
  | nil => simp
  | cons d rest ih =>
    simp [List.foldl]
    have hge := ih (acc + d.value)
    have := d.ge_one
    omega

/-- Helper: foldl add over die values is at most acc + length * sides. -/
private theorem foldl_add_le_mul_sides {sides : Nat} {h : sides > 0}
    (dice : List (DieResult sides h)) (acc : Nat) :
    dice.foldl (fun a (d : DieResult sides h) => a + d.value) acc ≤ acc + dice.length * sides := by
  induction dice generalizing acc with
  | nil => simp
  | cons d rest ih =>
    simp [List.foldl]
    have hle := ih (acc + d.value)
    have hsides := d.le_sides
    have hmul : (rest.length + 1) * sides = rest.length * sides + sides := by
      rw [Nat.add_mul, Nat.one_mul]
    rw [hmul]
    omega

/-- Any roll's raw total is at least the number of dice (each die ≥ 1). -/
theorem roll_ge_min (config : DiceConfig) (r : RollResult config) :
    r.rawTotal ≥ minRaw config := by
  unfold RollResult.rawTotal minRaw
  have := foldl_add_ge_length r.dice 0
  simp at this
  rw [r.count_correct] at this
  exact this

/-- Any roll's raw total is at most count × sides (each die ≤ sides). -/
theorem roll_le_max (config : DiceConfig) (r : RollResult config) :
    r.rawTotal ≤ maxRaw config := by
  unfold RollResult.rawTotal maxRaw
  have := foldl_add_le_mul_sides r.dice 0
  simp at this
  rw [r.count_correct] at this
  exact this

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

/-! ## Success Counting -/

/-- Count of successes: how many dice meet or exceed a threshold. -/
def countSuccesses {config : DiceConfig} (r : RollResult config) (threshold : Nat) : Nat :=
  r.dice.foldl (fun acc d => if d.value ≥ threshold then acc + 1 else acc) 0

/-- Helper: foldl counting successes is bounded by acc + list length. -/
private theorem foldl_count_le_length {sides : Nat} {h : sides > 0}
    (dice : List (DieResult sides h)) (threshold : Nat) (acc : Nat) :
    dice.foldl (fun a (d : DieResult sides h) => if d.value ≥ threshold then a + 1 else a) acc
    ≤ acc + dice.length := by
  induction dice generalizing acc with
  | nil => simp
  | cons d rest ih =>
    simp only [List.foldl, List.length_cons]
    have h1 := ih (if d.value ≥ threshold then acc + 1 else acc)
    have h2 : (if d.value ≥ threshold then acc + 1 else acc) ≤ acc + 1 := by
      split <;> omega
    omega

/-- Successes are bounded by the number of dice. -/
theorem successes_bounded {config : DiceConfig} (r : RollResult config) (threshold : Nat) :
    countSuccesses r threshold ≤ config.count := by
  unfold countSuccesses
  have := foldl_count_le_length r.dice threshold 0
  simp at this
  rw [r.count_correct] at this
  exact this

end Playtest.Dice

/-! ## Dice Mechanic Typeclass -/

namespace Playtest

/-- The DiceMechanic typeclass — what core/dice.ts provides. -/
class DiceMechanic (G : Type) where
  /-- Roll dice and update state. Returns (new state, raw results, total). -/
  rollDice : G → PlayerId → Dice.DiceConfig → G × List Nat × Int
  /-- Get the last roll results for a player. -/
  getLastRoll : G → PlayerId → Option (List Nat)

  -- Laws

  /-- Roll results have correct count and are within valid bounds. -/
  roll_valid : ∀ (g : G) (pid : PlayerId) (config : Dice.DiceConfig),
    let (_, results, _) := rollDice g pid config
    results.length = config.count ∧
    results.all (fun v => decide (v ≥ 1 && v ≤ config.sides)) = true

  /-- Total equals sum of results plus modifier. -/
  roll_total : ∀ (g : G) (pid : PlayerId) (config : Dice.DiceConfig),
    let (_, results, total) := rollDice g pid config
    total = (results.foldl (fun (acc : Int) (v : Nat) => acc + ↑v) 0) + config.modifier

end Playtest
