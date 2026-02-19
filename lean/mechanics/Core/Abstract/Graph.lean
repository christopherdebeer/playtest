/-
  Core/Abstract/Graph.lean — Abstract Graph mechanic pattern.

  The pattern for positions on a graph with constrained movement.

  **Instances:**
  - BoardMechanic (fixed) — static graph, predetermined edges
  - DynamicBoardMechanic (growing) — graph grows as tiles are placed
  - RondelMechanic (cyclic) — cyclic action space with movement cost
  - NetworkMechanic (weighted) — weighted graph for routing/delivery

  **Key insight:** All position-on-graph mechanics share the same
  abstract structure: nodes, edges, positions, and movement subject
  to constraints. The variations are:
  - Static vs dynamic topology
  - Directed vs undirected edges
  - Weighted vs unweighted edges
  - Single vs multi-occupancy nodes
  - Movement cost vs free movement

  This typeclass captures the common core. Refinements add the
  variations as additional laws or operations.
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Abstract Graph Mechanic -/

/-- GraphMechanic: the abstract pattern for position-on-graph mechanics.

    `NodeId` is the type of node identifiers (StateName, GridPos, SpaceId, etc.).
    The graph may be static or dynamic; the abstract pattern doesn't assume either.

    Every graph mechanic supports querying nodes/edges, positioning players,
    and moving players along edges, with movement validity constraints. -/
class GraphMechanic (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId] where
  /-- Get all currently valid nodes. -/
  getNodes : G → List NodeId
  /-- Get a player's current position. -/
  getPosition : G → PlayerId → NodeId
  /-- Get all valid move targets from a node. -/
  getNeighbors : G → NodeId → List NodeId
  /-- Check if an edge exists between two nodes. -/
  hasEdge : G → NodeId → NodeId → Bool
  /-- Move a player to a target node. Returns none if invalid. -/
  movePlayer : G → PlayerId → NodeId → Option G
  /-- Get all players at a given node. -/
  getPlayersAt : G → NodeId → List PlayerId

  -- === Laws ===

  /-- Moving updates the player's position. -/
  move_updates : ∀ (g : G) (pid : PlayerId) (target : NodeId) (g' : G),
    movePlayer g pid target = some g' →
    getPosition g' pid = target

  /-- Moving doesn't affect other players' positions (frame condition). -/
  move_frame : ∀ (g : G) (pid other : PlayerId) (target : NodeId) (g' : G),
    pid ≠ other →
    movePlayer g pid target = some g' →
    getPosition g' other = getPosition g other

  /-- Only valid moves succeed (edge must exist). -/
  move_requires_edge : ∀ (g : G) (pid : PlayerId) (target : NodeId),
    hasEdge g (getPosition g pid) target = false →
    movePlayer g pid target = none

  /-- Player position is always a valid node. -/
  position_valid : ∀ (g : G) (pid : PlayerId),
    getPosition g pid ∈ getNodes g

  /-- hasEdge is consistent with getNeighbors. -/
  edge_neighbor_consistent : ∀ (g : G) (src tgt : NodeId),
    hasEdge g src tgt = true ↔ tgt ∈ getNeighbors g src

/-! ## Reachability -/

/-- Reachability in an abstract graph: transitive closure of edges. -/
inductive GraphReachable (G : Type) (NodeId : Type) [DecidableEq NodeId] [BEq NodeId]
    [GraphMechanic G NodeId] (g : G) : NodeId → NodeId → Prop where
  | step : ∀ {s t : NodeId},
      GraphMechanic.hasEdge g s t = true →
      GraphReachable G NodeId g s t
  | trans : ∀ {s u t : NodeId},
      GraphReachable G NodeId g s u →
      GraphReachable G NodeId g u t →
      GraphReachable G NodeId g s t

/-- Reachability is transitive by construction. -/
theorem graph_reachable_trans (G : Type) (NodeId : Type) [DecidableEq NodeId] [BEq NodeId]
    [GraphMechanic G NodeId] (g : G) (s u t : NodeId)
    (h1 : GraphReachable G NodeId g s u)
    (h2 : GraphReachable G NodeId g u t) :
    GraphReachable G NodeId g s t :=
  GraphReachable.trans h1 h2

/-! ## Static Graph (fixed topology) -/

/-- A static graph has a fixed topology that doesn't change during the game. -/
class StaticGraph (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId]
    extends GraphMechanic G NodeId where
  /-- The topology is invariant under movement. -/
  move_preserves_topology : ∀ (g : G) (pid : PlayerId) (target : NodeId) (g' : G),
    movePlayer g pid target = some g' →
    getNodes g' = getNodes g

  move_preserves_edges : ∀ (g : G) (pid : PlayerId) (target : NodeId) (g' : G) (a b : NodeId),
    movePlayer g pid target = some g' →
    hasEdge g' a b = hasEdge g a b

/-! ## Dynamic Graph (growing topology) -/

/-- A dynamic graph can grow as nodes and edges are added.
    This is the pattern for tile-laying, grid expansion, and map building. -/
class DynamicGraph (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId]
    extends GraphMechanic G NodeId where
  /-- Add a new node to the graph. Returns none if invalid placement. -/
  addNode : G → NodeId → Option G
  /-- Check if adding a node at this position is valid. -/
  canAddNode : G → NodeId → Bool

  -- === Laws ===

  /-- Adding a node includes it in the node list. -/
  add_includes : ∀ (g : G) (node : NodeId) (g' : G),
    addNode g node = some g' →
    node ∈ getNodes g'

  /-- Adding a node preserves existing nodes. -/
  add_preserves_existing : ∀ (g : G) (node : NodeId) (g' : G) (existing : NodeId),
    addNode g node = some g' →
    existing ∈ getNodes g →
    existing ∈ getNodes g'

  /-- Cannot add a node that already exists. -/
  add_no_duplicate : ∀ (g : G) (node : NodeId),
    node ∈ getNodes g →
    addNode g node = none

  /-- Adding doesn't move any players. -/
  add_preserves_positions : ∀ (g : G) (node : NodeId) (g' : G) (pid : PlayerId),
    addNode g node = some g' →
    getPosition g' pid = getPosition g pid

/-! ## Weighted Graph (edges have costs/probabilities) -/

/-- A graph with weighted edges. Weights can represent:
    - Movement cost (action points required)
    - Probability (percentage chance of success)
    - Distance (for pathfinding)
    - Value (reward for traversal) -/
class WeightedGraph (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId]
    extends GraphMechanic G NodeId where
  /-- Get the weight of an edge (none if no edge exists). -/
  getEdgeWeight : G → NodeId → NodeId → Option Nat

  -- === Laws ===

  /-- Weight is consistent with edge existence. -/
  weight_requires_edge : ∀ (g : G) (s t : NodeId),
    hasEdge g s t = false → getEdgeWeight g s t = none

  /-- Existing edges always have a weight. -/
  edge_has_weight : ∀ (g : G) (s t : NodeId),
    hasEdge g s t = true → (getEdgeWeight g s t).isSome = true

/-! ## Undirected Graph -/

/-- An undirected graph where edges are symmetric. -/
class UndirectedGraph (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId]
    extends GraphMechanic G NodeId where
  /-- Edge existence is symmetric. -/
  edge_symmetric : ∀ (g : G) (a b : NodeId),
    hasEdge g a b = hasEdge g b a

/-! ## Occupancy Constraints -/

/-- A graph with occupancy constraints on nodes. -/
class OccupancyGraph (G : Type) (NodeId : outParam Type) [DecidableEq NodeId] [BEq NodeId]
    extends GraphMechanic G NodeId where
  /-- Get the capacity of a node (none = unlimited). -/
  getCapacity : G → NodeId → Option Nat

  /-- Movement respects occupancy limits. -/
  move_respects_capacity : ∀ (g : G) (pid : PlayerId) (target : NodeId) (cap : Nat),
    getCapacity g target = some cap →
    (getPlayersAt g target).length ≥ cap →
    movePlayer g pid target = none

end Playtest.Abstract
