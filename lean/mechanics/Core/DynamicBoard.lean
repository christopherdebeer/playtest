/-
  Core/DynamicBoard.lean — Dynamic board mechanic formalization.

  Extends BoardMechanic with mutable topology: tiles/nodes can be
  added, removed, or reconnected during play.

  Covers: tile-laying games (Carcassonne), expandable grids (AAOTE),
  network building, modular boards, terrain generation.

  Key distinction from BoardMechanic:
  - BoardMechanic: fixed graph, only positions change
  - DynamicBoardMechanic: graph itself changes during play
-/

import Core.Types
import Core.Board

namespace Playtest.DynamicBoard

open Playtest

/-! ## Tile / Node Types -/

/-- A tile that can be placed on the board. -/
structure Tile where
  id : String
  tileType : String
  /-- Edges this tile provides when placed. -/
  connections : List (String × String) := []
  deriving Repr, DecidableEq

/-- A grid coordinate for 2D boards. -/
structure GridPos where
  row : Int
  col : Int
  deriving Repr, DecidableEq

/-- Grid adjacency: the 8 neighbors of a position. -/
def GridPos.neighbors (pos : GridPos) : List GridPos :=
  [ ⟨pos.row - 1, pos.col - 1⟩, ⟨pos.row - 1, pos.col⟩, ⟨pos.row - 1, pos.col + 1⟩,
    ⟨pos.row, pos.col - 1⟩,                               ⟨pos.row, pos.col + 1⟩,
    ⟨pos.row + 1, pos.col - 1⟩, ⟨pos.row + 1, pos.col⟩, ⟨pos.row + 1, pos.col + 1⟩ ]

/-- 4-directional adjacency (orthogonal only). -/
def GridPos.orthogonalNeighbors (pos : GridPos) : List GridPos :=
  [ ⟨pos.row - 1, pos.col⟩, ⟨pos.row + 1, pos.col⟩,
    ⟨pos.row, pos.col - 1⟩, ⟨pos.row, pos.col + 1⟩ ]

/-! ## Dynamic Board State -/

/-- A dynamic board: grows as tiles are placed. -/
structure DynBoard where
  /-- Placed tiles with their positions. -/
  placed : List (GridPos × Tile)
  /-- Available (unplaced) tiles. -/
  supply : List Tile
  deriving Repr

/-- Check if a position is occupied. -/
def DynBoard.isOccupied (board : DynBoard) (pos : GridPos) : Bool :=
  board.placed.any (fun (p, _) => p == pos)

/-- Get tile at a position. -/
def DynBoard.getTile (board : DynBoard) (pos : GridPos) : Option Tile :=
  match board.placed.find? (fun (p, _) => p == pos) with
  | some (_, tile) => some tile
  | none => none

/-- Check if a position is adjacent to any placed tile. -/
def DynBoard.isAdjacentToPlaced (board : DynBoard) (pos : GridPos) : Bool :=
  (GridPos.neighbors pos).any (fun n => board.isOccupied n)

/-- Place a tile at a position. -/
def DynBoard.placeTile (board : DynBoard) (pos : GridPos) (tile : Tile)
    (hNotOccupied : board.isOccupied pos = false) : DynBoard :=
  { placed := (pos, tile) :: board.placed
    supply := board.supply.filter (fun t => t.id != tile.id) }

/-- Get all occupied positions. -/
def DynBoard.positions (board : DynBoard) : List GridPos :=
  board.placed.map Prod.fst

/-- Count placed tiles. -/
def DynBoard.size (board : DynBoard) : Nat :=
  board.placed.length

/-! ## Laws -/

/-- Placing a tile increases board size by 1. -/
theorem place_increases_size (board : DynBoard) (pos : GridPos) (tile : Tile)
    (h : board.isOccupied pos = false) :
    (board.placeTile pos tile h).size = board.size + 1 := by
  simp [DynBoard.placeTile, DynBoard.size]

/-- Placed tile is retrievable. -/
theorem place_then_get (board : DynBoard) (pos : GridPos) (tile : Tile)
    (h : board.isOccupied pos = false) :
    (board.placeTile pos tile h).isOccupied pos = true := by
  simp only [DynBoard.placeTile, DynBoard.isOccupied, List.any_cons]
  simp [beq_self_eq_true]

/-- Placing doesn't disturb existing tiles. -/
theorem place_frame (board : DynBoard) (pos other : GridPos) (tile : Tile)
    (h : board.isOccupied pos = false) (hne : other ≠ pos) :
    (board.placeTile pos tile h).getTile other = board.getTile other := by
  simp only [DynBoard.placeTile, DynBoard.getTile, List.find?]
  have hneq : (pos == other) = false := by
    cases h' : (pos == other) with
    | false => rfl
    | true => exact absurd (eq_of_beq h').symm hne
  simp [hneq]

/-- 8-directional neighbors always has 8 elements. -/
theorem neighbors_count (pos : GridPos) :
    (GridPos.neighbors pos).length = 8 := by
  simp [GridPos.neighbors]

/-- 4-directional neighbors always has 4 elements. -/
theorem orthogonal_neighbors_count (pos : GridPos) :
    (GridPos.orthogonalNeighbors pos).length = 4 := by
  simp [GridPos.orthogonalNeighbors]

end Playtest.DynamicBoard

/-! ## DynamicBoard Mechanic Typeclass -/

namespace Playtest

/-- The DynamicBoardMechanic typeclass.
    Extends BoardMechanic with mutable topology. -/
class DynamicBoardMechanic (G : Type) [BoardMechanic G] where
  /-- Place a tile/node on the board. -/
  placeTile : G → PlayerId → DynamicBoard.GridPos → String → Option G
  /-- Remove a tile/node from the board. -/
  removeTile : G → DynamicBoard.GridPos → Option G
  /-- Connect two positions with an edge. -/
  addConnection : G → StateName → StateName → G
  /-- Check if a position is occupied. -/
  isOccupied : G → DynamicBoard.GridPos → Bool
  /-- Get all occupied positions. -/
  getOccupiedPositions : G → List DynamicBoard.GridPos
  /-- Check adjacency constraint (must be adjacent to existing). -/
  isValidPlacement : G → DynamicBoard.GridPos → Bool

  -- Laws

  /-- Placement adds the position to occupied. -/
  place_occupies : ∀ (g : G) (pid : PlayerId) (pos : DynamicBoard.GridPos) (tileType : String) (g' : G),
    placeTile g pid pos tileType = some g' →
    isOccupied g' pos = true

  /-- Cannot place on occupied position. -/
  place_no_overlap : ∀ (g : G) (pid : PlayerId) (pos : DynamicBoard.GridPos) (tileType : String),
    isOccupied g pos = true →
    placeTile g pid pos tileType = none

  /-- Placement doesn't disturb other positions. -/
  place_frame : ∀ (g : G) (pid : PlayerId) (pos other : DynamicBoard.GridPos) (tileType : String) (g' : G),
    pos ≠ other →
    placeTile g pid pos tileType = some g' →
    isOccupied g' other = isOccupied g other

  /-- Removing makes position unoccupied. -/
  remove_frees : ∀ (g : G) (pos : DynamicBoard.GridPos) (g' : G),
    removeTile g pos = some g' →
    isOccupied g' pos = false

end Playtest
