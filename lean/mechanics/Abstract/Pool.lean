/-
  Abstract.Pool — Generic quantity pools

  Covers: resources, action points, health, score, movement points,
  currency, victory points, energy, mana, etc.

  Any named bag of natural numbers with add/spend/check operations.
-/
namespace Playtest.Abstract

structure Pool (α : Type) where
  data : List (α × Nat) := []
  deriving Repr

namespace Pool

variable {α : Type}

def empty : Pool α := ⟨[]⟩

def get [BEq α] (pool : Pool α) (name : α) : Nat :=
  match pool.data.find? (fun entry => entry.1 == name) with
  | some (_, v) => v
  | none => 0

def set [BEq α] (pool : Pool α) (name : α) (value : Nat) : Pool α :=
  ⟨(name, value) :: pool.data.filter (fun entry => !(entry.1 == name))⟩

def add [BEq α] (pool : Pool α) (name : α) (amount : Nat) : Pool α :=
  pool.set name (pool.get name + amount)

def spend [BEq α] (pool : Pool α) (name : α) (amount : Nat) : Option (Pool α) :=
  if pool.get name >= amount then
    some (pool.set name (pool.get name - amount))
  else
    none

def has [BEq α] (pool : Pool α) (name : α) (amount : Nat) : Bool :=
  pool.get name >= amount

def transfer [BEq α] (src dst : Pool α) (name : α) (amount : Nat)
    : Option (Pool α × Pool α) :=
  match src.spend name amount with
  | some src' => some (src', dst.add name amount)
  | none => none

def resetTo [BEq α] (pool : Pool α) (name : α) (value : Nat) : Pool α :=
  pool.set name value

def keys (pool : Pool α) : List α :=
  pool.data.map Prod.fst

def total (pool : Pool α) : Nat :=
  pool.data.foldl (fun acc entry => acc + entry.2) 0

end Pool

end Playtest.Abstract
