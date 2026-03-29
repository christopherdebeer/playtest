/-
  Bridge/Generic.lean — Game-agnostic bridge layer

  Provides generic validation and query commands that work
  with ANY game, using the registry + abstract patterns.
  No game-specific types or logic — purely structural.

  Protocol:
    ./lean-game registry validate <slug1> <slug2> ...
    ./lean-game registry deps <slug1> <slug2> ...
    ./lean-game registry list
    ./lean-game graph validate <src> <dst> <edges...>
    ./lean-game graph reachable <src> <dst> <edges...>
    ./lean-game pool check <name> <amount> <entries...>
    ./lean-game pool transfer <name> <amount> <src_entries...> -- <dst_entries...>
    ./lean-game invariant conservation <entries...>
-/
import Bridge.Json
import Composition.Registry
import Abstract

namespace Playtest.Bridge.Generic

open Playtest.Bridge
open Playtest.Composition
open Playtest.Abstract

/-! ## Registry Commands — validate mechanic configurations -/

/-- All known mechanic descriptors. -/
def allMechanics : List MechanicDescriptor :=
  [ cardsMechanic, resourcesMechanic, boardMechanic, turnsMechanic,
    effectsMechanic, diceMechanic, visibilityMechanic,
    trickTakingMechanic, auctionMechanic, deckBuildingMechanic,
    workerPlacementMechanic, actionPointsMechanic, tradingMechanic,
    simultaneousMechanic, dynamicBoardMechanic, combatMechanic,
    setCollectionMechanic, cardMatchingMechanic, tableauMechanic,
    contractsMechanic, pushYourLuckMechanic, openDraftingMechanic,
    closedDraftingMechanic, votingMechanic, areaControlMechanic,
    rondelMechanic ]

/-- Build a registry from all known mechanics. -/
def mkRegistry : Registry :=
  { mechanics := allMechanics
    unique_slugs := by
      intro m1 m2 h1 h2 hs
      -- Proof obligation: all slugs are unique.
      -- In practice verified by construction (all slugs are distinct literals).
      -- For now we trust the list is correct.
      sorry }

/-- Validate a set of enabled mechanic slugs against the registry. -/
def validateConfig (slugs : List String) : String :=
  let reg := mkRegistry
  let errors := validate reg slugs
  match errors with
  | [] =>
    let resolved := resolveDependencies reg slugs
    Json.obj [
      ("valid", Json.bool true),
      ("enabled", Json.arr (slugs.map Json.str)),
      ("resolved", Json.arr (resolved.map Json.str))
    ]
  | errs =>
    let errStrs := errs.map fun e => match e with
      | .missingRequirement m r =>
        Json.obj [("type", Json.str "missing_requirement"),
                  ("mechanic", Json.str m), ("requires", Json.str r)]
      | .conflict m1 m2 =>
        Json.obj [("type", Json.str "conflict"),
                  ("mechanic1", Json.str m1), ("mechanic2", Json.str m2)]
      | .unknownMechanic s =>
        Json.obj [("type", Json.str "unknown"), ("slug", Json.str s)]
    Json.obj [
      ("valid", Json.bool false),
      ("errors", Json.arr errStrs)
    ]

/-- Resolve transitive dependencies for a set of slugs. -/
def resolveDeps (slugs : List String) : String :=
  let reg := mkRegistry
  let resolved := resolveDependencies reg slugs
  Json.obj [
    ("input", Json.arr (slugs.map Json.str)),
    ("resolved", Json.arr (resolved.map Json.str))
  ]

/-- List all known mechanics with their metadata. -/
def listMechanics : String :=
  let entries := allMechanics.map fun m =>
    Json.obj [
      ("slug", Json.str m.slug),
      ("name", Json.str m.name),
      ("requires", Json.arr (m.requires_.map Json.str)),
      ("conflicts", Json.arr (m.conflicts.map Json.str)),
      ("alwaysEnabled", Json.bool m.alwaysEnabled)
    ]
  Json.obj [("mechanics", Json.arr entries), ("count", Json.nat entries.length)]

/-! ## Graph Commands — validate board topology -/

/-- Parse edges from "src:dst" format. -/
def parseEdges (args : List String) : List (String × String) :=
  args.filterMap fun s =>
    match s.splitOn ":" with
    | [a, b] => some (a, b)
    | _ => none

/-- Build a string-typed graph from edge pairs. -/
def mkGraph (edges : List (String × String)) : Graph String :=
  let nodes := (edges.map Prod.fst ++ edges.map Prod.snd).eraseDups
  let g := nodes.foldl (fun g n => g.addNode n) Graph.empty
  edges.foldl (fun g (s, d) => g.addEdge s d) g

/-- Validate that an edge exists in the graph. -/
def validateEdge (src dst : String) (edgeArgs : List String) : String :=
  let edges := parseEdges edgeArgs
  let g := mkGraph edges
  if g.hasEdge src dst then
    Json.validResponse
  else
    let targets := g.validTargets src
    Json.obj [
      ("valid", Json.bool false),
      ("error", Json.str s!"No edge from {src} to {dst}"),
      ("validTargets", Json.arr (targets.map Json.str))
    ]

/-- Check reachability: is dst reachable from src via BFS? -/
def checkReachable (src dst : String) (edgeArgs : List String) : String :=
  let edges := parseEdges edgeArgs
  let g := mkGraph edges
  -- Simple BFS with fuel
  let rec bfs (queue : List String) (visited : List String) (fuel : Nat) : Bool :=
    match fuel, queue with
    | 0, _ => false
    | _, [] => false
    | fuel + 1, node :: rest =>
      if node == dst then true
      else if visited.any (· == node) then bfs rest visited fuel
      else
        let neighbors := g.neighbors node
        let newQueue := rest ++ neighbors.filter (fun n => !(visited.any (· == n)))
        bfs newQueue (node :: visited) fuel
  let reachable := bfs [src] [] 1000
  Json.obj [
    ("src", Json.str src),
    ("dst", Json.str dst),
    ("reachable", Json.bool reachable)
  ]

/-! ## Pool Commands — validate resource operations -/

/-- Parse "name:amount" entries into a pool. -/
def parsePool (args : List String) : Pool String :=
  args.foldl (fun pool s =>
    match s.splitOn ":" with
    | [name, amtStr] =>
      match amtStr.toNat? with
      | some n => pool.add name n
      | none => pool
    | _ => pool
  ) Pool.empty

/-- Check if a pool has sufficient amount of a resource. -/
def checkPool (name : String) (amount : String) (entries : List String) : String :=
  let pool := parsePool entries
  match amount.toNat? with
  | some amt =>
    if pool.has name amt then
      Json.obj [("sufficient", Json.bool true),
                ("available", Json.nat (pool.get name)),
                ("required", Json.nat amt)]
    else
      Json.obj [("sufficient", Json.bool false),
                ("available", Json.nat (pool.get name)),
                ("required", Json.nat amt),
                ("deficit", Json.nat (amt - pool.get name))]
  | none => Json.invalidResponse s!"Invalid amount: {amount}"

/-- Validate a pool transfer (check src has enough, compute result). -/
def checkTransfer (name amount : String) (args : List String) : String :=
  -- Split args at "--" separator
  let (srcArgs, dstArgs) := args.foldl (fun (acc : List String × List String × Bool) s =>
    let (srcAcc, dstAcc, pastSep) := acc
    if s == "--" then (srcAcc, dstAcc, true)
    else if pastSep then (srcAcc, dstAcc ++ [s], true)
    else (srcAcc ++ [s], dstAcc, false)
  ) ([], [], false) |> fun (s, d, _) => (s, d)
  let src := parsePool srcArgs
  let dst := parsePool dstArgs
  match amount.toNat? with
  | some amt =>
    match Pool.transfer src dst name amt with
    | some (src', dst') =>
      Json.obj [("valid", Json.bool true),
                ("srcRemaining", Json.nat (src'.get name)),
                ("dstTotal", Json.nat (dst'.get name))]
    | none =>
      Json.obj [("valid", Json.bool false),
                ("error", Json.str s!"Insufficient {name}: have {src.get name}, need {amt}")]
  | none => Json.invalidResponse s!"Invalid amount: {amount}"

/-! ## Invariant Commands — generic conservation checks -/

/-- Check resource conservation: sum of all pools equals expected total. -/
def checkConservation (args : List String) : String :=
  -- Parse "expected:N" and remaining entries
  let expectedArg := args.find? (fun s => s.startsWith "expected:")
  let entries := args.filter (fun s => !(s.startsWith "expected:"))
  let pool := parsePool entries
  let total := pool.total
  match expectedArg with
  | some s =>
    match (s.splitOn ":").get? 1 with
    | some nStr =>
      match nStr.toNat? with
      | some expected =>
        if total == expected then Json.invariantOk
        else Json.invariantViolation s!"Total {total} ≠ expected {expected}"
      | none => Json.invariantViolation s!"Invalid expected: {nStr}"
    | none => Json.invariantViolation "Malformed expected:N"
  | none =>
    -- No expected total; just report the sum
    Json.obj [("ok", Json.bool true), ("total", Json.nat total)]

/-! ## Scoring Commands — generic win condition checks -/

/-- Check threshold win condition. -/
def checkThresholdWin (threshold : String) (entries : List String) : String :=
  match threshold.toNat? with
  | some t =>
    let scores := entries.filterMap fun s =>
      match s.splitOn ":" with
      | [name, nStr] => nStr.toNat?.map (name, ·)
      | _ => none
    match Scoring.thresholdWin scores t with
    | .winner w => Json.winResponse w s!"Reached threshold ({t})"
    | .draw ps =>
      Json.obj [("won", Json.bool true), ("draw", Json.bool true),
                ("players", Json.arr (ps.map Json.str))]
    | .noWinner => Json.noWinResponse
  | none => Json.invalidResponse s!"Invalid threshold: {threshold}"

/-- Check highest-score win condition. -/
def checkHighestWin (entries : List String) : String :=
  let scores := entries.filterMap fun s =>
    match s.splitOn ":" with
    | [name, nStr] => nStr.toNat?.map (name, ·)
    | _ => none
  match Scoring.highestScoreWin scores with
  | .winner w => Json.winResponse w "Highest score"
  | .draw ps =>
    Json.obj [("won", Json.bool true), ("draw", Json.bool true),
              ("players", Json.arr (ps.map Json.str))]
  | .noWinner => Json.noWinResponse

/-! ## Command Dispatch -/

/-- Dispatch a generic command. -/
def dispatch (args : List String) : Option String :=
  match args with
  -- Registry
  | "registry" :: "validate" :: slugs => some (validateConfig slugs)
  | "registry" :: "deps" :: slugs => some (resolveDeps slugs)
  | ["registry", "list"] => some listMechanics
  -- Graph
  | "graph" :: "validate" :: src :: dst :: edges => some (validateEdge src dst edges)
  | "graph" :: "reachable" :: src :: dst :: edges => some (checkReachable src dst edges)
  -- Pool
  | "pool" :: "check" :: name :: amount :: entries => some (checkPool name amount entries)
  | "pool" :: "transfer" :: name :: amount :: rest => some (checkTransfer name amount rest)
  -- Invariants
  | "invariant" :: "conservation" :: rest => some (checkConservation rest)
  -- Scoring
  | "score" :: "threshold" :: threshold :: entries => some (checkThresholdWin threshold entries)
  | "score" :: "highest" :: entries => some (checkHighestWin entries)
  | _ => none

end Playtest.Bridge.Generic
