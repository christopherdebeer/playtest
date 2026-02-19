/-
  Games.GemCollector — Executable demo composing abstract patterns

  A minimal game demonstrating Pool + Graph + Sequence + Scoring composition.
  Players move on a graph collecting gems. First to 3 gems wins.

  This is the proof-of-concept for "Lean as execution engine":
  the game runs entirely in Lean via #eval, not just verified.
-/
import Abstract

namespace Playtest.Games.GemCollector

open Playtest.Abstract

/-! ## Game-specific types -/

inductive Loc where | town | forest | mine | cave
  deriving BEq, Repr, Inhabited

inductive Res where | gold | gems
  deriving BEq, Repr

instance : ToString Loc where
  toString
    | .town => "town"
    | .forest => "forest"
    | .mine => "mine"
    | .cave => "cave"

instance : ToString Res where
  toString
    | .gold => "gold"
    | .gems => "gems"

/-! ## Composed state from abstract patterns -/

structure PlayerState where
  name : String
  resources : Pool Res   -- Pool pattern: gold + gems
  position : Loc         -- Position on Graph
  deriving Repr

structure GameState where
  players : List PlayerState
  turns : Sequence String   -- Sequence pattern: turn order
  board : Graph Loc          -- Graph pattern: movement topology
  deriving Repr

/-! ## Board topology -/

def mkBoard : Graph Loc :=
  Graph.empty
    |>.addNode .town |>.addNode .forest |>.addNode .mine |>.addNode .cave
    |>.addEdge .town .forest |>.addEdge .forest .town
    |>.addEdge .town .mine   |>.addEdge .mine .town
    |>.addEdge .mine .cave   |>.addEdge .cave .mine
    |>.addEdge .forest .cave |>.addEdge .cave .forest

/-! ## Location effects — what you get when arriving -/

def locationReward (loc : Loc) (ps : PlayerState) : PlayerState :=
  match loc with
  | .town   => ps
  | .forest => { ps with resources := ps.resources.add .gold 1 }
  | .mine   => { ps with resources := ps.resources.add .gems 1 }
  | .cave   => { ps with resources := ps.resources.add .gems 1 |>.add .gold 1 }

/-! ## Initialization -/

def init (names : List String) : GameState where
  players := names.map fun n => ⟨n, Pool.empty, .town⟩
  turns := Sequence.init names
  board := mkBoard

/-! ## Player lookup and update -/

def getPlayer (state : GameState) (name : String) : Option PlayerState :=
  state.players.find? fun p => p.name == name

def updatePlayer (state : GameState) (name : String)
    (f : PlayerState → PlayerState) : GameState :=
  { state with players := state.players.map fun p =>
      if p.name == name then f p else p }

/-! ## Core action: move to adjacent location -/

def doMove (state : GameState) (player : String) (target : Loc)
    : Except String GameState :=
  match getPlayer state player with
  | none => .error s!"Unknown player: {player}"
  | some ps =>
    if state.board.hasEdge ps.position target then
      let state := updatePlayer state player
        (fun ps => locationReward target { ps with position := target })
      .ok { state with turns := state.turns.advance }
    else
      .error s!"{player} can't move from {ps.position} to {target}"

/-! ## Win condition: first to 3 gems (Scoring pattern) -/

def checkWin (state : GameState) : Scoring.WinCheck String :=
  let scores := state.players.map fun p => (p.name, p.resources.get .gems)
  Scoring.thresholdWin scores 3

/-! ## Display -/

def showPlayer (p : PlayerState) : String :=
  s!"  {p.name}: pos={p.position}, gold={p.resources.get .gold}, gems={p.resources.get .gems}"

def showState (state : GameState) : String :=
  let header := s!"Round {state.turns.round}, Turn {state.turns.turnNumber}"
  let playerLines := state.players.map showPlayer
  let winLine := match checkWin state with
    | .winner w => s!"\n  >>> {w} WINS! <<<"
    | .draw _ => "\n  >>> DRAW <<<"
    | .noWinner => ""
  header ++ "\n" ++ String.intercalate "\n" playerLines ++ winLine

/-! ## Executable demo — runs entirely in Lean -/

def demo : String :=
  match go with
  | .ok state => showState state
  | .error e => s!"Error: {e}"
where
  go : Except String GameState := do
    let state := init ["Alice", "Bob"]
    -- Turn 1: Alice → mine (+1 gem)
    let state ← doMove state "Alice" .mine
    -- Turn 2: Bob → forest (+1 gold)
    let state ← doMove state "Bob" .forest
    -- Turn 3: Alice → cave (+1 gem, +1 gold = 2 gems)
    let state ← doMove state "Alice" .cave
    -- Turn 4: Bob → cave (+1 gem, +1 gold = 1 gem)
    let state ← doMove state "Bob" .cave
    -- Turn 5: Alice → mine (+1 gem = 3 gems — wins!)
    let state ← doMove state "Alice" .mine
    -- Turn 6: Bob → mine (+1 gem = 2 gems)
    let state ← doMove state "Bob" .mine
    return state

#eval demo

end Playtest.Games.GemCollector
