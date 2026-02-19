/-
  Bridge/GemCollector.lean — GemCollector bridge to the TS engine

  Maps CLI arguments → Lean game types → verified validation logic.
  This is the proof-of-concept for "Lean as formal referee":
  the TS engine calls this binary to validate moves against
  the same graph topology proven to have no dead states.
-/
import Abstract
import Bridge.Json

namespace Playtest.Bridge.GemCollector

open Playtest.Abstract
open Playtest.Bridge

/-! ## Game-specific types (duplicated from Games.GemCollector to avoid
    pulling in the full game module with #eval) -/

inductive Loc where | town | forest | mine | cave
  deriving BEq, Repr

instance : ToString Loc where
  toString
    | .town => "town"
    | .forest => "forest"
    | .mine => "mine"
    | .cave => "cave"

/-- Parse a location from a CLI string. -/
def parseLoc : String → Option Loc
  | "town"   => some .town
  | "forest" => some .forest
  | "mine"   => some .mine
  | "cave"   => some .cave
  | _        => none

/-! ## Board topology — identical to Games.GemCollector.mkBoard -/

def mkBoard : Graph Loc :=
  Graph.empty
    |>.addNode .town |>.addNode .forest |>.addNode .mine |>.addNode .cave
    |>.addEdge .town .forest |>.addEdge .forest .town
    |>.addEdge .town .mine   |>.addEdge .mine .town
    |>.addEdge .mine .cave   |>.addEdge .cave .mine
    |>.addEdge .forest .cave |>.addEdge .cave .forest

/-! ## Validation commands -/

/-- Validate a move: is there an edge from position to target? -/
def validateMove (position target : String) : String :=
  match parseLoc position, parseLoc target with
  | some pos, some tgt =>
    if mkBoard.hasEdge pos tgt then
      Json.validResponse
    else
      Json.invalidResponse s!"No edge from {position} to {target}"
  | none, _ => Json.invalidResponse s!"Unknown location: {position}"
  | _, none => Json.invalidResponse s!"Unknown location: {target}"

/-- List valid targets from a position. -/
def validTargets (position : String) : String :=
  match parseLoc position with
  | some pos =>
    let targets := mkBoard.validTargets pos
    let targetStrs := targets.map (fun l => Json.str (toString l))
    Json.obj [("position", Json.str position),
              ("targets", Json.arr targetStrs)]
  | none => Json.invalidResponse s!"Unknown location: {position}"

/-! ## Win condition -/

/-- Parse "name:gems" pairs from CLI args. -/
def parsePlayerGems (args : List String) : List (String × Nat) :=
  args.filterMap fun s =>
    match s.splitOn ":" with
    | [name, gemsStr] =>
      match gemsStr.toNat? with
      | some n => some (name, n)
      | none   => none
    | _ => none

/-- Check win condition: first to 3 gems. -/
def checkWin (args : List String) : String :=
  let scores := parsePlayerGems args
  match Scoring.thresholdWin scores 3 with
  | .winner w => Json.winResponse w "Reached gem threshold (3)"
  | .draw ps  =>
    Json.obj [("won", Json.bool true),
              ("draw", Json.bool true),
              ("players", Json.arr (ps.map Json.str))]
  | .noWinner => Json.noWinResponse

/-! ## Invariant checking -/

/-- Verify resource conservation: total gems collected ≤ expected maximum.
    In GemCollector, each move to mine or cave grants 1 gem, so total gems
    should never exceed total turns (a loose but sound bound). -/
def checkInvariants (args : List String) : String :=
  -- Separate "max:N" from player gem entries
  let gemArgs := args.filter (fun s => !(s.startsWith "max:"))
  let scores := parsePlayerGems gemArgs
  let totalGems : Nat := scores.foldl (fun acc (_, g) => acc + g) 0
  -- Parse expected max from "max:N" arg if present
  let maxArg := args.find? (fun s => s.startsWith "max:")
  let expectedMax : Nat := match maxArg with
    | some s => match s.splitOn ":" with
      | [_, n] => n.toNat?.getD 999
      | _ => 999
    | none => 999
  if Nat.ble totalGems expectedMax then
    Json.invariantOk
  else
    Json.invariantViolation s!"Total gems ({totalGems}) exceeds maximum ({expectedMax})"

/-! ## Command dispatch -/

/-- Dispatch a GemCollector command. -/
def dispatch (args : List String) : Option String :=
  match args with
  | ["validate", _player, position, target] => some (validateMove position target)
  | ["targets", position]                   => some (validTargets position)
  | "check-win" :: rest                     => some (checkWin rest)
  | "invariants" :: rest                    => some (checkInvariants rest)
  | _                                       => none

end Playtest.Bridge.GemCollector
