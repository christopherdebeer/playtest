/-
  Core/Board.lean — Board mechanic formalization.

  Mirrors src/mechanics/core/board.ts.
  A board is a labeled directed graph with optional probability weights
  on edges. Players occupy states and move along edges.

  Key properties: valid moves follow edges, positions are always valid states,
  and for specific boards we can prove reachability (no dead states).
-/

import Core.Types

namespace Playtest.Board

open Playtest

/-! ## Board Graph Structure -/

/-- Edge configuration between two board states.
    Mirrors `EdgeConfig` in the TypeScript board mechanic. -/
structure Edge where
  fromState : StateName
  toState : StateName
  probability : Option Nat := none  -- Stored as percentage (0-100) to avoid Float
  label : Option String := none
  deriving Repr, DecidableEq, BEq

/-- A board is a directed graph of named states connected by edges.
    Wrapping the raw data with validity invariants. -/
structure BoardGraph where
  /-- All states on the board. -/
  states : List StateName
  /-- All edges connecting states. -/
  edges : List Edge
  /-- States are non-empty (a board must have at least one state). -/
  nonempty : states ≠ []
  /-- All edge endpoints are valid states. -/
  edges_valid : ∀ e, e ∈ edges → e.fromState ∈ states ∧ e.toState ∈ states

/-- A position on the board: a state that exists in the graph. -/
structure Position (board : BoardGraph) where
  state : StateName
  valid : state ∈ board.states

instance (board : BoardGraph) : BEq (Position board) :=
  ⟨fun a b => a.state == b.state⟩

/-! ## Movement -/

/-- Check if an edge exists between two states. -/
def hasEdge (board : BoardGraph) (from to : StateName) : Bool :=
  board.edges.any (fun e => e.fromState == from && e.toState == to)

/-- Get all valid move targets from a state. -/
def getValidTargets (board : BoardGraph) (from : StateName) : List StateName :=
  (board.edges.filter (fun e => e.fromState == from)).map Edge.toState

/-- Get the edge between two states, if one exists. -/
def getEdge (board : BoardGraph) (from to : StateName) : Option Edge :=
  board.edges.find? (fun e => e.fromState == from && e.toState == to)

/-- Get probability of an edge (as percentage 0-100), defaulting to 100. -/
def getEdgeProbability (board : BoardGraph) (from to : StateName) : Nat :=
  match getEdge board from to with
  | some e => e.probability.getD 100
  | none => 0

/-- A valid move: there exists an edge from source to target. -/
def isValidMove (board : BoardGraph) (from to : StateName) : Prop :=
  ∃ e, e ∈ board.edges ∧ e.fromState = from ∧ e.toState = to

instance (board : BoardGraph) (from to : StateName) : Decidable (isValidMove board from to) :=
  if h : board.edges.any (fun e => e.fromState == from && e.toState == to) = true then
    isTrue (by
      simp [isValidMove]
      rw [List.any_eq_true] at h
      obtain ⟨e, he, hcond⟩ := h
      simp [Bool.and_eq_true] at hcond
      obtain ⟨hf, ht⟩ := hcond
      exact ⟨e, he, by rw [BEq.comm] at hf; exact of_decide_eq_true (by rwa [beq_iff_eq] at hf ⊢; exact beq_iff_eq ▸ hf), by rw [BEq.comm] at ht; exact of_decide_eq_true (by rwa [beq_iff_eq] at ht ⊢; exact beq_iff_eq ▸ ht)⟩)
  else
    isFalse (by
      simp [isValidMove]
      rw [List.any_eq_true, not_exists] at h ⊢
      intro e he hfrom hto
      have := h e he
      simp [hfrom, hto, BEq.comm, beq_iff_eq] at this)

/-- Move a position along a valid edge. -/
def move (board : BoardGraph) (from : Position board) (toState : StateName)
    (hValid : isValidMove board from.state toState)
    (hMember : toState ∈ board.states) : Position board :=
  ⟨toState, hMember⟩

/-! ## Reachability -/

/-- Reachability: transitive closure of the edge relation. -/
inductive Reachable (board : BoardGraph) : StateName → StateName → Prop where
  | step : isValidMove board s t → Reachable board s t
  | trans : Reachable board s u → Reachable board u t → Reachable board s t

/-- Reachability is transitive by construction. -/
theorem reachable_trans (board : BoardGraph) (s u t : StateName)
    (h1 : Reachable board s u) (h2 : Reachable board u t) :
    Reachable board s t :=
  Reachable.trans h1 h2

/-! ## Player Positions -/

/-- Track all players' positions on a board. -/
def PlayerPositions (board : BoardGraph) := PlayerId → Position board

/-- Get players at a specific state. -/
def getPlayersAt (board : BoardGraph) (positions : PlayerPositions board)
    (players : List PlayerId) (target : StateName) : List PlayerId :=
  players.filter (fun pid => (positions pid).state == target)

end Playtest.Board

/-! ## Board Mechanic Typeclass -/

namespace Playtest

/-- The BoardMechanic typeclass — what core/board.ts provides.
    Game states implementing this support board positions and movement. -/
class BoardMechanic (G : Type) where
  /-- Get a player's current board state. -/
  getPosition : G → PlayerId → StateName
  /-- Get all valid board states. -/
  getStates : G → List StateName
  /-- Get valid move targets from a state. -/
  getValidTargets : G → StateName → List StateName
  /-- Check if a move is valid. -/
  isValidMove : G → StateName → StateName → Bool
  /-- Execute a move. Returns updated state or none if invalid. -/
  movePlayer : G → PlayerId → StateName → Option G
  /-- Get all players at a given state. -/
  getPlayersAt : G → StateName → List PlayerId

  -- Laws

  /-- Moving updates the player's position. -/
  move_updates : ∀ (g : G) (pid : PlayerId) (target : StateName) (g' : G),
    movePlayer g pid target = some g' →
    getPosition g' pid = target

  /-- Moving doesn't affect other players' positions (frame). -/
  move_frame : ∀ (g : G) (pid other : PlayerId) (target : StateName) (g' : G),
    pid ≠ other →
    movePlayer g pid target = some g' →
    getPosition g' other = getPosition g other

  /-- Only valid moves succeed. -/
  move_valid_only : ∀ (g : G) (pid : PlayerId) (target : StateName),
    isValidMove g (getPosition g pid) target = false →
    movePlayer g pid target = none

  /-- Player position is always a valid state. -/
  position_valid : ∀ (g : G) (pid : PlayerId),
    getPosition g pid ∈ getStates g

end Playtest
