/-
  Core/Board.lean — Board mechanic formalization.

  Mirrors src/mechanics/core/board.ts.
  A board is a labeled directed graph with optional probability weights
  on edges. Players occupy states and move along edges.
-/

import Core.Types

namespace Playtest.Board

open Playtest

/-! ## Board Graph Structure -/

/-- Edge configuration between two board states. -/
structure Edge where
  src : StateName
  dst : StateName
  probability : Option Nat := none  -- percentage 0-100
  label : Option String := none
  deriving Repr, DecidableEq, BEq

/-- A board is a directed graph of named states connected by edges. -/
structure BoardGraph where
  /-- All states on the board. -/
  states : List StateName
  /-- All edges connecting states. -/
  edges : List Edge
  /-- States are non-empty. -/
  nonempty : states ≠ []
  /-- All edge endpoints are valid states. -/
  edges_valid : ∀ (e : Edge), e ∈ edges → e.src ∈ states ∧ e.dst ∈ states

/-- A position on the board: a state that exists in the graph. -/
structure Position (board : BoardGraph) where
  state : StateName
  valid : state ∈ board.states

/-! ## Movement -/

/-- Check if an edge exists between two states. -/
def hasEdge (board : BoardGraph) (s t : StateName) : Bool :=
  board.edges.any (fun e => e.src == s && e.dst == t)

/-- Get all valid move targets from a state. -/
def getValidTargets (board : BoardGraph) (s : StateName) : List StateName :=
  (board.edges.filter (fun e => e.src == s)).map Edge.dst

/-- Get the edge between two states, if one exists. -/
def getEdge (board : BoardGraph) (s t : StateName) : Option Edge :=
  board.edges.find? (fun e => e.src == s && e.dst == t)

/-- Get probability of an edge (as percentage 0-100), defaulting to 100. -/
def getEdgeProbability (board : BoardGraph) (s t : StateName) : Nat :=
  match getEdge board s t with
  | some e => e.probability.getD 100
  | none => 0

/-- A valid move: there exists an edge from source to target. -/
def isValidMove (board : BoardGraph) (s t : StateName) : Prop :=
  ∃ (e : Edge), e ∈ board.edges ∧ e.src = s ∧ e.dst = t

/-- Move a position along a valid edge. -/
def move (board : BoardGraph) (_src : Position board) (toState : StateName)
    (_hValid : isValidMove board _src.state toState)
    (hMember : toState ∈ board.states) : Position board :=
  ⟨toState, hMember⟩

/-! ## Reachability -/

/-- Reachability: transitive closure of the edge relation. -/
inductive Reachable (board : BoardGraph) : StateName → StateName → Prop where
  | step : ∀ {s t : StateName}, isValidMove board s t → Reachable board s t
  | trans : ∀ {s u t : StateName}, Reachable board s u → Reachable board u t → Reachable board s t

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

/-- The BoardMechanic typeclass — what core/board.ts provides. -/
class BoardMechanic (G : Type) where
  /-- Get a player's current board state. -/
  getPosition : G → PlayerId → StateName
  /-- Get all valid board states. -/
  getStates : G → List StateName
  /-- Get valid move targets from a state. -/
  getValidTargets : G → StateName → List StateName
  /-- Check if a move is valid. -/
  isValidMove : G → StateName → StateName → Bool
  /-- Execute a move. -/
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
