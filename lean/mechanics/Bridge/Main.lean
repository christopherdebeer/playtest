/-
  Bridge/Main.lean — CLI entry point for the Lean game engine

  Protocol:
    ./lean-game <game> <cmd> <args...>

  GemCollector (validation only):
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

open Playtest.Bridge

def usage : String :=
  "Usage: lean-game <game> <cmd> <args...>\n" ++
  "Games: gem-collector, aaote\n" ++
  "Commands (gem-collector):\n" ++
  "  validate <player> <position> <target>  - Check if move is legal\n" ++
  "  check-win <name:gems>...               - Check win condition\n" ++
  "Commands (aaote — reads state JSON from stdin):\n" ++
  "  init <numPlayers> [<seed>]             - Initialize new game\n" ++
  "  act <playerId> <actionType> <args...>  - Execute an action\n" ++
  "  available <playerId>                   - List available actions\n" ++
  "  check-win [<playerId>]                 - Check win conditions"

def main (args : List String) : IO UInt32 := do
  match args with
  | [] =>
    IO.eprintln usage
    return 1
  | game :: rest =>
    -- Read stdin (needed for AAOTE state round-tripping)
    let stdin ← IO.getStdin
    let stdinContent ← do
      -- Try to read stdin (non-blocking for gem-collector which doesn't use it)
      try
        let content ← stdin.getLine
        -- Read remaining lines
        let mut allContent := content
        while true do
          let line ← stdin.getLine
          if line.isEmpty then break
          allContent := allContent ++ line
        pure allContent
      catch _ => pure ""
    let result := match game with
      | "gem-collector" => GemCollector.dispatch rest
      | "aaote" => AAOTEBridge.dispatch stdinContent rest
      | _ => none
    match result with
    | some json =>
      IO.println json
      return 0
    | none =>
      let argsStr := String.intercalate " " rest
      IO.eprintln s!"Unknown game or command: {game} {argsStr}"
      IO.eprintln usage
      return 1
