/-
  Abstract.Sequence — Turn/phase ordering and advancement

  Covers: turn order, initiative, round tracking, snake drafts,
  phase sequences, priority passing, etc.

  An ordered list of players with cyclic advancement and round counting.
-/
namespace Playtest.Abstract

structure Sequence (π : Type) where
  players : List π
  currentIdx : Nat := 0
  round : Nat := 0
  turnNumber : Nat := 0
  deriving Repr

namespace Sequence

variable {π : Type}

def init (players : List π) : Sequence π :=
  ⟨players, 0, 0, 0⟩

def current (seq : Sequence π) : Option π :=
  seq.players.get? seq.currentIdx

def advance (seq : Sequence π) : Sequence π :=
  if seq.players.length == 0 then seq
  else
    let nextIdx := (seq.currentIdx + 1) % seq.players.length
    let nextRound := if nextIdx == 0 then seq.round + 1 else seq.round
    { seq with
      currentIdx := nextIdx
      round := nextRound
      turnNumber := seq.turnNumber + 1 }

def isRoundStart (seq : Sequence π) : Bool :=
  seq.currentIdx == 0

def playerCount (seq : Sequence π) : Nat :=
  seq.players.length

end Sequence

end Playtest.Abstract
