/-
  Abstract.Modifier — Timed effects and status modifiers

  Covers: buffs, debuffs, cooldowns, status effects, auras,
  temporary boosts, poison, shields, etc.

  Tagged values with durations that tick down each round.
  Duration 0 = permanent (survives all ticks).
-/
namespace Playtest.Abstract

structure Modifier (τ : Type) where
  tag : τ
  value : Int
  duration : Nat  -- 0 = permanent
  deriving BEq, Repr

structure ModifierStack (τ : Type) where
  modifiers : List (Modifier τ) := []
  deriving Repr

namespace ModifierStack

variable {τ : Type}

def empty : ModifierStack τ := ⟨[]⟩

def add (stack : ModifierStack τ) (tag : τ) (value : Int) (duration : Nat)
    : ModifierStack τ :=
  ⟨⟨tag, value, duration⟩ :: stack.modifiers⟩

def active (stack : ModifierStack τ) : List (Modifier τ) :=
  stack.modifiers

def hasTag [BEq τ] (stack : ModifierStack τ) (tag : τ) : Bool :=
  stack.modifiers.any (fun m => m.tag == tag)

def getValue [BEq τ] (stack : ModifierStack τ) (tag : τ) : Int :=
  match stack.modifiers.find? (fun m => m.tag == tag) with
  | some m => m.value
  | none => 0

def tick (stack : ModifierStack τ) : ModifierStack τ × List (Modifier τ) :=
  let remaining := stack.modifiers.filter (fun m =>
    m.duration == 0 || m.duration > 1)
  let expired := stack.modifiers.filter (fun m =>
    m.duration != 0 && m.duration <= 1)
  let ticked := remaining.map (fun m =>
    if m.duration == 0 then m
    else { m with duration := m.duration - 1 })
  (⟨ticked⟩, expired)

def remove [BEq τ] (stack : ModifierStack τ) (tag : τ) : ModifierStack τ :=
  ⟨stack.modifiers.filter (fun m => !(m.tag == tag))⟩

def clear (_ : ModifierStack τ) : ModifierStack τ :=
  ⟨[]⟩

end ModifierStack

end Playtest.Abstract
