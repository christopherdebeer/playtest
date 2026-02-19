/-
  Bridge/Main.lean — CLI entry point for the Lean game verifier

  Protocol:
    ./lean-game <game> <cmd> <args...>

  Examples:
    ./lean-game gem-collector validate Alice mine cave
    ./lean-game gem-collector check-win Alice:3 Bob:1
    ./lean-game gem-collector targets mine
    ./lean-game gem-collector invariants Alice:3 Bob:1 max:20

  Output: single-line JSON to stdout.
  Exit code: 0 on success, 1 on usage error.

  The TS engine calls this binary from src/mechanics/lean-verifier.ts
  via execSync. It maps GameState fields → CLI args and parses the
  JSON response back into ValidationResult / WinCheckResult.
-/
import Bridge.GemCollector

open Playtest.Bridge

def usage : String :=
  "Usage: lean-game <game> <cmd> <args...>\n" ++
  "Games: gem-collector\n" ++
  "Commands:\n" ++
  "  validate <player> <position> <target>  - Check if move is legal\n" ++
  "  targets <position>                     - List valid move targets\n" ++
  "  check-win <name:gems>...               - Check win condition\n" ++
  "  invariants <name:gems>... [max:N]      - Verify state invariants"

def main (args : List String) : IO UInt32 := do
  match args with
  | [] =>
    IO.eprintln usage
    return 1
  | game :: rest =>
    let result := match game with
      | "gem-collector" => GemCollector.dispatch rest
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
