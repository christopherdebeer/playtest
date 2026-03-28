/-
  Instances/BoardGraph.lean — BoardMechanic as GraphMechanic instance.

  Demonstrates that BoardMechanic (the existing concrete typeclass for
  fixed board graphs) is an instance of the abstract GraphMechanic pattern
  with the StaticGraph refinement.

  This is the "Layer 1 → Existing Core" connection for board mechanics.
-/

import Core.Types
import Core.Board
import Core.Abstract.Graph

namespace Playtest.Instances

open Playtest
open Playtest.Abstract

variable {G : Type}

/-! ## BoardMechanic → GraphMechanic Instance -/

/-- Any game state with a BoardMechanic is automatically a GraphMechanic
    over StateName. The existing board mechanics become abstract graph
    operations with all the abstract graph theorems available. -/
instance boardIsGraph [inst : BoardMechanic G] : GraphMechanic G StateName where
  getNodes := inst.getStates
  getPosition := inst.getPosition
  getNeighbors := inst.getValidTargets
  hasEdge := inst.isValidMove
  movePlayer := inst.movePlayer
  getPlayersAt := inst.getPlayersAt

  -- Derive laws from BoardMechanic laws

  move_updates := inst.move_updates

  move_frame := fun g pid other target g' h_ne h_move =>
    inst.move_frame g pid other target g' h_ne h_move

  move_requires_edge := fun g pid target h_no_edge =>
    inst.move_valid_only g pid target h_no_edge

  position_valid := inst.position_valid

  edge_neighbor_consistent := fun g src tgt => by
    sorry -- Requires BoardMechanic to state isValidMove ↔ tgt ∈ getValidTargets

/-- BoardMechanic is also a StaticGraph — topology doesn't change. -/
instance boardIsStaticGraph [inst : BoardMechanic G] : StaticGraph G StateName where
  toGraphMechanic := boardIsGraph

  move_preserves_topology := fun g pid target g' h_move => by
    sorry -- Requires BoardMechanic to state getStates invariance

  move_preserves_edges := fun g pid target g' a b h_move => by
    sorry -- Requires BoardMechanic to state isValidMove invariance

/-! ## What This Gives Us -/

/-- With the instance above, we can use abstract graph reachability
    on any game with a board. -/
example [BoardMechanic G] (g : G) (s u t : StateName)
    (h1 : GraphReachable G StateName g s u)
    (h2 : GraphReachable G StateName g u t) :
    GraphReachable G StateName g s t :=
  graph_reachable_trans G StateName g s u t h1 h2

end Playtest.Instances
