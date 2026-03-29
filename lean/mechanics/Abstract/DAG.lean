/-
  Abstract/DAG.lean — Directed acyclic graph for tech trees and prerequisites.

  Covers: tech trees, research prerequisites, skill trees, upgrade paths,
  building prerequisites.

  Used by: TechTreeMechanic, Arcane Assembly.
-/

namespace Playtest.Abstract

/-! ## DAG Structure -/

/-- A directed acyclic graph node with dependencies. -/
structure DAGNode (α : Type) where
  id : α
  /-- Prerequisites that must be unlocked first. -/
  prerequisites : List α
  deriving Repr

/-- A DAG: collection of nodes with prerequisite edges. -/
structure DAG (α : Type) where
  nodes : List (DAGNode α)
  deriving Repr

namespace DAG

variable {α : Type} [BEq α]

/-- Empty DAG. -/
def empty : DAG α := ⟨[]⟩

/-- Add a node to the DAG. -/
def addNode (d : DAG α) (node : DAGNode α) : DAG α :=
  ⟨d.nodes ++ [node]⟩

/-- Get a node by its ID. -/
def getNode (d : DAG α) (id : α) : Option (DAGNode α) :=
  d.nodes.find? (fun n => n.id == id)

/-- Check if a node exists in the DAG. -/
def hasNode (d : DAG α) (id : α) : Bool :=
  d.nodes.any (fun n => n.id == id)

/-- Check if a node can be unlocked given the set of already-unlocked nodes. -/
def canUnlock (d : DAG α) (unlocked : List α) (target : α) : Bool :=
  match d.getNode target with
  | some node => node.prerequisites.all (fun p => unlocked.any (· == p))
  | none => false

/-- Get all nodes that can be unlocked given current state. -/
def availableNodes (d : DAG α) (unlocked : List α) : List α :=
  d.nodes.filter (fun n =>
    !(unlocked.any (· == n.id)) &&
    n.prerequisites.all (fun p => unlocked.any (· == p))
  ) |>.map DAGNode.id

/-- Get all direct dependents of a node (nodes that require it). -/
def dependents (d : DAG α) (nodeId : α) : List α :=
  d.nodes.filter (fun n =>
    n.prerequisites.any (· == nodeId)
  ) |>.map DAGNode.id

/-- Topological sort (returns nodes in valid unlock order).
    Uses Kahn's algorithm with fuel for termination. -/
def topologicalSort (d : DAG α) : List α :=
  let rec go (fuel : Nat) (unlocked : List α) (remaining : List (DAGNode α))
      : List α :=
    match fuel with
    | 0 => unlocked
    | fuel' + 1 =>
      let ready := remaining.filter (fun n =>
        n.prerequisites.all (fun p => unlocked.any (· == p)))
      match ready with
      | [] => unlocked  -- done (or cycle detected)
      | _ =>
        let newUnlocked := unlocked ++ ready.map DAGNode.id
        let newRemaining := remaining.filter (fun n =>
          !(ready.any (fun r => r.id == n.id)))
        go fuel' newUnlocked newRemaining
  go d.nodes.length [] d.nodes

end DAG

/-! ## Laws -/

/-- A node with no prerequisites can always be unlocked. -/
theorem no_prereqs_always_available {α : Type} [BEq α]
    (d : DAG α) (id : α) (node : DAGNode α)
    (hfound : d.getNode id = some node)
    (hempty : node.prerequisites = []) :
    d.canUnlock [] id = true := by
  simp [DAG.canUnlock, hfound, hempty]

/-- Unlocking is monotone: more unlocked nodes can only enable more. -/
theorem unlock_monotone {α : Type} [BEq α]
    (d : DAG α) (unlocked extra : List α) (target : α)
    (h : d.canUnlock unlocked target = true) :
    d.canUnlock (unlocked ++ extra) target = true := by
  sorry

/-- Available nodes is a subset of all nodes. -/
theorem available_subset {α : Type} [BEq α] (d : DAG α) (unlocked : List α) :
    (d.availableNodes unlocked).length ≤ d.nodes.length := by
  simp [DAG.availableNodes]
  exact List.length_filter_le ..

end Playtest.Abstract
