/-
  Bridge/Main.lean — CLI entry point for the Lean game engine

  Protocol:
    ./lean-game <namespace> <cmd> <args...>

  Game-agnostic commands:
    ./lean-game registry validate cards resources trick-taking
    ./lean-game registry deps trick-taking
    ./lean-game registry list
    ./lean-game graph validate src dst edge1:edge2 ...
    ./lean-game graph reachable src dst edge1:edge2 ...
    ./lean-game pool check gold 5 gold:10 silver:3
    ./lean-game pool transfer gold 5 gold:10 -- gold:2
    ./lean-game invariant conservation gold:5 silver:3 expected:8
    ./lean-game score threshold 10 Alice:8 Bob:12
    ./lean-game score highest Alice:8 Bob:12

  Game-specific commands:
    ./lean-game gem-collector validate Alice mine cave
    ./lean-game gem-collector check-win Alice:3 Bob:1

  AAOTE (full execution engine — state via stdin):
    echo '{}' | ./lean-game aaote init 3 42
    echo '<stateJson>' | ./lean-game aaote act player-1 place_location "Forest Clearing" origin
    echo '<stateJson>' | ./lean-game aaote available player-1
    echo '<stateJson>' | ./lean-game aaote check-win player-1

  Output: single-line JSON to stdout.
  Exit code: 0 on success, 1 on usage error.
-/
import Bridge.GemCollector
import Bridge.AAOTE
import Bridge.Generic

open Playtest.Bridge

def usage : String :=
  "Usage: lean-game <namespace> <cmd> <args...>\n\n" ++
  "Game-agnostic commands:\n" ++
  "  registry validate <slug...>             - Validate mechanic configuration\n" ++
  "  registry deps <slug...>                 - Resolve transitive dependencies\n" ++
  "  registry list                           - List all known mechanics\n" ++
  "  graph validate <src> <dst> <edges...>   - Validate edge exists\n" ++
  "  graph reachable <src> <dst> <edges...>  - Check reachability via BFS\n" ++
  "  pool check <name> <amount> <entries...> - Check resource sufficiency\n" ++
  "  pool transfer <name> <amt> <src> -- <dst> - Validate transfer\n" ++
  "  invariant conservation <entries...>     - Check resource conservation\n" ++
  "  score threshold <N> <name:score...>     - Check threshold win\n" ++
  "  score highest <name:score...>           - Check highest score win\n\n" ++
  "Game-specific commands:\n" ++
  "  gem-collector validate|check-win|...    - GemCollector referee\n" ++
  "  aaote init|act|available|check-win|...  - AAOTE execution engine (stdin JSON)"

def main (args : List String) : IO UInt32 := do
  match args with
  | [] =>
    IO.eprintln usage
    return 1
  | game :: rest =>
    -- Read stdin (needed for AAOTE state round-tripping)
    let stdin ← IO.getStdin
    let stdinContent ← do
      try
        let content ← stdin.getLine
        let mut allContent := content
        while true do
          let line ← stdin.getLine
          if line.isEmpty then break
          allContent := allContent ++ line
        pure allContent
      catch _ => pure ""
    -- Try game-agnostic dispatch first, then game-specific
    let result := match Generic.dispatch (game :: rest) with
      | some json => some json
      | none => match game with
        | "gem-collector" => GemCollector.dispatch rest
        | "aaote" => AAOTEBridge.dispatch stdinContent rest
        | _ => none
    match result with
    | some json =>
      IO.println json
      return 0
    | none =>
      let argsStr := String.intercalate " " (game :: rest)
      IO.eprintln s!"Unknown command: {argsStr}"
      IO.eprintln usage
      return 1
