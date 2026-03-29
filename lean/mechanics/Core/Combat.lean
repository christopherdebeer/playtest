/-
  Core/Combat.lean — Combat resolution mechanic formalization.

  Models opposed contests between game entities: combat, duels,
  contests, challenges, attacks vs defense.

  Covers: direct combat, area control battles, unit combat,
  opposed skill checks, attack/defense resolution.

  The core abstraction: an attacker value vs a defender value,
  modified by effects, producing a CombatResult.
-/

import Core.Types

namespace Playtest.Combat

open Playtest

/-! ## Combat Values -/

/-- A combat participant's stats. -/
structure CombatStats where
  /-- Base attack/offense value. -/
  attack : Nat
  /-- Base defense value. -/
  defense : Nat
  /-- Bonus modifier (from effects, terrain, etc). -/
  modifier : Int := 0
  deriving Repr, DecidableEq

/-- Effective attack value (base + modifier, floored at 0). -/
def CombatStats.effectiveAttack (stats : CombatStats) : Nat :=
  if (stats.attack : Int) + stats.modifier ≥ 0
  then ((stats.attack : Int) + stats.modifier).toNat
  else 0

/-- Effective defense value (base + modifier, floored at 0). -/
def CombatStats.effectiveDefense (stats : CombatStats) : Nat :=
  if (stats.defense : Int) + stats.modifier ≥ 0
  then ((stats.defense : Int) + stats.modifier).toNat
  else 0

/-! ## Combat Resolution -/

/-- Result of a combat encounter. -/
inductive CombatResult where
  /-- Attacker wins with margin. -/
  | attackerWins (margin : Nat)
  /-- Defender wins with margin. -/
  | defenderWins (margin : Nat)
  /-- Tie (equal values). -/
  | tie
  deriving Repr, DecidableEq

/-- Simple combat resolution: compare attack vs defense. -/
def resolveCombat (attacker defender : CombatStats) : CombatResult :=
  let atk := attacker.effectiveAttack
  let def_ := defender.effectiveDefense
  if atk > def_ then .attackerWins (atk - def_)
  else if def_ > atk then .defenderWins (def_ - atk)
  else .tie

/-- Combat with dice: attack + roll vs defense + roll. -/
def resolveCombatWithRolls (attacker defender : CombatStats)
    (atkRoll defRoll : Nat) : CombatResult :=
  let atk := attacker.effectiveAttack + atkRoll
  let def_ := defender.effectiveDefense + defRoll
  if atk > def_ then .attackerWins (atk - def_)
  else if def_ > atk then .defenderWins (def_ - atk)
  else .tie

/-! ## Damage Model -/

/-- Apply combat result as damage. Returns remaining HP. -/
def applyDamage (hp : Nat) (damage : Nat) : Nat :=
  if damage ≥ hp then 0 else hp - damage

/-- Check if a unit is eliminated (0 HP). -/
def isEliminated (hp : Nat) : Bool :=
  hp == 0

/-! ## Laws -/

/-- If attacker strictly exceeds defender, attacker wins. -/
theorem stronger_attacker_wins (atk def_ : CombatStats)
    (h : atk.effectiveAttack > def_.effectiveDefense) :
    ∃ margin, resolveCombat atk def_ = .attackerWins margin := by
  unfold resolveCombat
  simp [h]

/-- If defender strictly exceeds attacker, defender wins. -/
theorem stronger_defender_wins (atk def_ : CombatStats)
    (h : def_.effectiveDefense > atk.effectiveAttack) :
    ∃ margin, resolveCombat atk def_ = .defenderWins margin := by
  unfold resolveCombat
  have hna : ¬(atk.effectiveAttack > def_.effectiveDefense) := by omega
  simp [hna, h]

/-- Equal values produce a tie. -/
theorem equal_ties (atk def_ : CombatStats)
    (h : atk.effectiveAttack = def_.effectiveDefense) :
    resolveCombat atk def_ = .tie := by
  unfold resolveCombat
  have hna : ¬(atk.effectiveAttack > def_.effectiveDefense) := by omega
  have hnd : ¬(def_.effectiveDefense > atk.effectiveAttack) := by omega
  simp [hna, hnd]

/-- Damage cannot exceed HP (no negative HP). -/
theorem damage_nonneg (hp damage : Nat) :
    applyDamage hp damage ≥ 0 := by
  exact Nat.zero_le _

/-- Lethal damage eliminates. -/
theorem lethal_eliminates (hp damage : Nat) (h : damage ≥ hp) :
    applyDamage hp damage = 0 := by
  simp [applyDamage, h]

/-- Non-lethal damage reduces HP. -/
theorem nonlethal_reduces (hp damage : Nat) (h : damage < hp) :
    applyDamage hp damage = hp - damage := by
  simp [applyDamage]
  omega

end Playtest.Combat

/-! ## Combat Mechanic Typeclass -/

namespace Playtest

/-- The CombatMechanic typeclass.
    Models opposed contests and combat resolution. -/
class CombatMechanic (G : Type) where
  /-- Get combat stats for a player/unit. -/
  getCombatStats : G → PlayerId → Combat.CombatStats
  /-- Initiate combat between attacker and defender. -/
  initiateCombat : G → PlayerId → PlayerId → Option (G × Combat.CombatResult)
  /-- Apply damage to a player/unit. -/
  applyDamage : G → PlayerId → Nat → G
  /-- Get current HP of a player/unit. -/
  getHP : G → PlayerId → Nat
  /-- Check if a player/unit is eliminated. -/
  isEliminated : G → PlayerId → Bool

  -- Laws

  /-- Combat result is consistent with stats. -/
  combat_consistent : ∀ (g : G) (atk def_ : PlayerId) (g' : G) (result : Combat.CombatResult),
    initiateCombat g atk def_ = some (g', result) →
    (getCombatStats g atk).effectiveAttack > (getCombatStats g def_).effectiveDefense →
    ∃ margin, result = Combat.CombatResult.attackerWins margin

  /-- Damage reduces HP. -/
  damage_reduces : ∀ (g : G) (pid : PlayerId) (dmg : Nat),
    getHP (applyDamage g pid dmg) pid ≤ getHP g pid

  /-- Zero HP means eliminated. -/
  zero_hp_eliminated : ∀ (g : G) (pid : PlayerId),
    getHP g pid = 0 → isEliminated g pid = true

  /-- Combat isolation: uninvolved players unaffected. -/
  combat_isolation : ∀ (g : G) (atk def_ other : PlayerId) (g' : G)
    (result : Combat.CombatResult),
    initiateCombat g atk def_ = some (g', result) →
    other ≠ atk → other ≠ def_ →
    getHP g' other = getHP g other

end Playtest
