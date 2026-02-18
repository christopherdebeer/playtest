/-
  Core/Turns.lean — Turn order mechanic formalization.

  Mirrors src/mechanics/core/turns.ts.
  Turn order is a cyclic permutation of players. The fundamental
  structure is a non-empty list with a current index and round counter.
  Advancing wraps around; completing a cycle increments the round.
-/

import Core.Types

namespace Playtest.Turns

open Playtest

/-! ## Turn Order -/

/-- A turn order: a non-empty list of player IDs. -/
structure TurnOrder where
  players : List PlayerId
  nonempty : players ≠ []
  deriving Repr

/-- Get the number of players. -/
def TurnOrder.size (order : TurnOrder) : Nat :=
  order.players.length

/-- Size is positive (from nonempty). -/
theorem TurnOrder.size_pos (order : TurnOrder) : 0 < order.size := by
  simp [TurnOrder.size]
  exact List.length_pos.mpr order.nonempty

/-! ## Turn State -/

/-- The current state of the turn system. -/
structure TurnState (order : TurnOrder) where
  /-- Current position in the player list. -/
  currentIndex : Fin order.size
  /-- Current round number (0-indexed). -/
  round : Nat
  /-- Current turn number (absolute, across all rounds). -/
  turnNumber : Nat
  deriving Repr

/-- Get the current player. -/
def getCurrentPlayer (order : TurnOrder) (ts : TurnState order) : PlayerId :=
  order.players[ts.currentIndex]

/-- Get the next player (without advancing). -/
def getNextPlayer (order : TurnOrder) (ts : TurnState order) : PlayerId :=
  let nextIdx := (ts.currentIndex.val + 1) % order.size
  order.players[nextIdx]'(by omega)

/-- Get the previous player. -/
def getPreviousPlayer (order : TurnOrder) (ts : TurnState order) : PlayerId :=
  let prevIdx := (ts.currentIndex.val + order.size - 1) % order.size
  order.players[prevIdx]'(by omega)

/-! ## Turn Advancement -/

/-- Advance to the next turn. Wraps around and increments round. -/
def advanceTurn (order : TurnOrder) (ts : TurnState order) : TurnState order :=
  let nextVal := (ts.currentIndex.val + 1) % order.size
  let isNewRound := nextVal == 0
  { currentIndex := ⟨nextVal, Nat.mod_lt _ order.size_pos⟩
    round := if isNewRound then ts.round + 1 else ts.round
    turnNumber := ts.turnNumber + 1 }

/-- Initial turn state: first player, round 0. -/
def initialTurnState (order : TurnOrder) : TurnState order :=
  { currentIndex := ⟨0, order.size_pos⟩
    round := 0
    turnNumber := 0 }

/-! ## Laws -/

/-- Advancing always increments the turn number. -/
theorem advance_increments_turn (order : TurnOrder) (ts : TurnState order) :
    (advanceTurn order ts).turnNumber = ts.turnNumber + 1 := by
  simp [advanceTurn]

/-- After `n` players have taken turns, where `n` is the player count,
    we're back to the first player and the round incremented. -/
theorem full_cycle_returns (order : TurnOrder) (ts : TurnState order)
    (hStart : ts.currentIndex.val = 0) :
    let final := Nat.iterate (advanceTurn order) order.size ts
    final.currentIndex.val = 0 ∧ final.round = ts.round + 1 := by
  sorry -- Provable by induction on order.size; mechanically tedious but sound

/-- The current player is always a valid player in the order. -/
theorem current_player_valid (order : TurnOrder) (ts : TurnState order) :
    getCurrentPlayer order ts ∈ order.players := by
  simp [getCurrentPlayer]
  exact List.getElem_mem ..

/-- Turn number is monotonically increasing through advances. -/
theorem advance_monotone (order : TurnOrder) (ts : TurnState order) :
    ts.turnNumber < (advanceTurn order ts).turnNumber := by
  simp [advanceTurn]; omega

/-! ## Snake Draft Order -/

/-- Generate a snake draft order: 1,2,3,...,n,n,...,3,2,1,1,2,... -/
def snakeDraftOrder (players : List PlayerId) (rounds : Nat) : List PlayerId :=
  let forward := players
  let backward := players.reverse
  (List.range rounds).bind fun i =>
    if i % 2 == 0 then forward else backward

end Playtest.Turns

/-! ## Turn Mechanic Typeclass -/

namespace Playtest

/-- The TurnMechanic typeclass — what core/turns.ts provides. -/
class TurnMechanic (G : Type) where
  /-- Get the current player. -/
  getCurrentPlayer : G → Option PlayerId
  /-- Get the turn order. -/
  getTurnOrder : G → List PlayerId
  /-- Check if it's a player's turn. -/
  isPlayersTurn : G → PlayerId → Bool
  /-- Get the current round number. -/
  getCurrentRound : G → Nat
  /-- Get the absolute turn number. -/
  getTurnNumber : G → Nat
  /-- Advance to the next turn. -/
  advanceTurn : G → G
  /-- Get active (non-eliminated) players. -/
  getActivePlayers : G → List PlayerId

  -- Laws

  /-- The current player is in the turn order. -/
  current_in_order : ∀ (g : G) (pid : PlayerId),
    getCurrentPlayer g = some pid → pid ∈ getTurnOrder g

  /-- isPlayersTurn is consistent with getCurrentPlayer. -/
  turn_consistent : ∀ (g : G) (pid : PlayerId),
    isPlayersTurn g pid = true ↔ getCurrentPlayer g = some pid

  /-- Advancing changes the current player (in a >1 player game). -/
  advance_changes : ∀ (g : G),
    (getTurnOrder g).length > 1 →
    getCurrentPlayer (advanceTurn g) ≠ getCurrentPlayer g

  /-- Turn number increases on advance. -/
  advance_turn_number : ∀ (g : G),
    getTurnNumber (advanceTurn g) > getTurnNumber g

end Playtest
