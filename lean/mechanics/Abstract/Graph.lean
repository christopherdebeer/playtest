/-
  Abstract.Graph — Graph-based topology and movement

  Covers: game boards, rondels, tech trees, time tracks, trade routes,
  map hexes, network connections, state machines, etc.

  Any set of nodes connected by directed weighted edges.
-/
namespace Playtest.Abstract

structure Edge (ν : Type) where
  src : ν
  dst : ν
  weight : Nat := 100
  deriving BEq, Repr

structure Graph (ν : Type) where
  nodes : List ν := []
  edges : List (Edge ν) := []
  deriving Repr

namespace Graph

variable {ν : Type}

def empty : Graph ν := ⟨[], []⟩

def addNode (g : Graph ν) (node : ν) : Graph ν :=
  { g with nodes := node :: g.nodes }

def addEdge [BEq ν] (g : Graph ν) (src dst : ν) (weight : Nat := 100) : Graph ν :=
  { g with edges := ⟨src, dst, weight⟩ :: g.edges }

def neighbors [BEq ν] (g : Graph ν) (node : ν) : List ν :=
  (g.edges.filter (fun e => e.src == node)).map Edge.dst

def hasEdge [BEq ν] (g : Graph ν) (src dst : ν) : Bool :=
  g.edges.any (fun e => e.src == src && e.dst == dst)

def edgeWeight [BEq ν] (g : Graph ν) (src dst : ν) : Option Nat :=
  match g.edges.find? (fun e => e.src == src && e.dst == dst) with
  | some e => some e.weight
  | none => none

def validTargets [BEq ν] (g : Graph ν) (node : ν) : List ν :=
  g.neighbors node

def containsNode [BEq ν] (g : Graph ν) (node : ν) : Bool :=
  g.nodes.any (· == node)

end Graph

end Playtest.Abstract
