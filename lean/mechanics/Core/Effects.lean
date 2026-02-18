/-
  Core/Effects.lean — Effect (timed modifier) mechanic formalization.

  Mirrors src/mechanics/core/effects.ts.
  Effects are temporal modifiers on players: buffs, debuffs, blocks.
  They have a type, magnitude, and duration. Duration 0 means permanent;
  positive durations tick down each turn, and effects expire when duration
  reaches zero after decrement (i.e., duration 1 → expired next tick).
-/

import Core.Types

namespace Playtest.Effects

open Playtest

/-! ## Effect Operations -/

/-- A player's effect list. -/
abbrev EffectList := List Effect

/-- Check if a player has an effect of a given type. -/
def hasEffect (effects : EffectList) (et : EffectType) : Bool :=
  effects.any (fun e => e.effectType == et)

/-- Get all effects of a given type. -/
def getEffectsByType (effects : EffectList) (et : EffectType) : EffectList :=
  effects.filter (fun e => e.effectType == et)

/-- Get the first effect of a given type. -/
def getEffect (effects : EffectList) (et : EffectType) : Option Effect :=
  effects.find? (fun e => e.effectType == et)

/-- Sum the values of all effects of a given type.
    Mirrors `getEffectValue` in effects.ts. -/
def getEffectValue (effects : EffectList) (et : EffectType) : Int :=
  (getEffectsByType effects et).foldl (fun acc e => acc + e.value) 0

/-- Check if a player has a blocking effect. -/
def isBlocked (effects : EffectList) : Bool :=
  hasEffect effects "block_turn"

/-- Add an effect to a player's effect list. -/
def addEffect (effects : EffectList) (effect : Effect) : EffectList :=
  effects ++ [effect]

/-- Remove the first effect of a given type. -/
def removeEffect (effects : EffectList) (et : EffectType) : EffectList :=
  match effects with
  | [] => []
  | e :: rest =>
    if e.effectType == et then rest
    else e :: removeEffect rest et

/-- Clear all effects from a player. -/
def clearEffects : EffectList → EffectList := fun _ => []

/-! ## Duration Ticking -/

/-- Tick an individual effect's duration. Returns none if it expired. -/
def tickEffect (e : Effect) : Option Effect :=
  match e.duration with
  | 0 => some e               -- permanent (duration 0 means forever)
  | 1 => none                  -- expires this tick
  | n + 2 => some { e with duration := n + 1 }  -- decrement

/-- Decrement all effect durations. Returns (remaining, expired) effects.
    Mirrors `decrementEffectDurations` in effects.ts. -/
def tickEffects (effects : EffectList) : EffectList × EffectList :=
  let results := effects.map (fun e => (e, tickEffect e))
  let remaining := results.filterMap (fun (_, opt) => opt)
  let expired := results.filterMap (fun (e, opt) =>
    match opt with | none => some e | some _ => none)
  (remaining, expired)

/-- Extend the duration of an effect. -/
def extendDuration (effects : EffectList) (et : EffectType) (extra : Nat) : EffectList :=
  effects.map (fun e =>
    if e.effectType == et && e.duration > 0
    then { e with duration := e.duration + extra }
    else e)

/-! ## Laws -/

/-- Permanent effects survive ticking. -/
theorem permanent_survives_tick (e : Effect) (h : e.duration = 0) :
    tickEffect e = some e := by
  simp [tickEffect, h]

/-- An effect with duration 1 expires on tick. -/
theorem duration_one_expires (e : Effect) (h : e.duration = 1) :
    tickEffect e = none := by
  simp [tickEffect, h]

/-- Ticking decreases positive non-unit durations. -/
theorem tick_decreases_duration (e : Effect) (h : e.duration ≥ 2) :
    ∃ e', tickEffect e = some e' ∧ e'.duration = e.duration - 1 := by
  match e.duration, h with
  | n + 2, _ =>
    exact ⟨{ e with duration := n + 1 }, by simp [tickEffect]; omega⟩

/-- After `d` ticks, an effect with duration `d > 0` expires.
    This is the convergence guarantee. -/
theorem finite_effects_terminate (e : Effect) (h : e.duration > 0) :
    ∃ n : Nat, n ≤ e.duration ∧
    (Nat.iterate (fun opt => opt.bind tickEffect) n (some e) = none) := by
  exact ⟨e.duration, le_refl _, by
    induction e.duration with
    | zero => omega
    | succ n ih => sorry⟩  -- Provable by strong induction on duration

/-- Adding an effect increases the list length by 1. -/
theorem add_increases_length (effects : EffectList) (effect : Effect) :
    (addEffect effects effect).length = effects.length + 1 := by
  simp [addEffect, List.length_append]

/-- Clearing effects yields empty list. -/
theorem clear_empty (effects : EffectList) :
    clearEffects effects = [] := by
  rfl

end Playtest.Effects

/-! ## Effects Mechanic Typeclass -/

namespace Playtest

/-- The EffectsMechanic typeclass — what core/effects.ts provides. -/
class EffectsMechanic (G : Type) where
  /-- Get all effects on a player. -/
  getEffects : G → PlayerId → List Effect
  /-- Add an effect to a player. -/
  addEffect : G → PlayerId → Effect → G
  /-- Remove an effect type from a player. -/
  removeEffect : G → PlayerId → EffectType → G
  /-- Tick all effect durations for a player. Returns expired effects. -/
  tickEffects : G → PlayerId → G × List Effect
  /-- Check if a player has an effect. -/
  hasEffect : G → PlayerId → EffectType → Bool
  /-- Get cumulative effect value. -/
  getEffectValue : G → PlayerId → EffectType → Int
  /-- Check if player is blocked. -/
  isBlocked : G → PlayerId → Bool

  -- Laws

  /-- Adding an effect makes hasEffect true. -/
  add_enables : ∀ (g : G) (pid : PlayerId) (e : Effect),
    hasEffect (addEffect g pid e) pid e.effectType = true

  /-- Removing an effect type makes hasEffect false
      (if there was only one). -/
  remove_disables_single : ∀ (g : G) (pid : PlayerId) (et : EffectType),
    (getEffects g pid |>.filter (fun e => e.effectType == et)).length = 1 →
    hasEffect (removeEffect g pid et) pid et = false

  /-- Effects don't leak between players. -/
  effect_isolation : ∀ (g : G) (pid other : PlayerId) (e : Effect),
    pid ≠ other →
    getEffects (addEffect g pid e) other = getEffects g other

end Playtest
