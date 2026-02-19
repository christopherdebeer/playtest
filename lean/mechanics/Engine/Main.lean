/-
  Engine/Main.lean — IO entry point for the Lean game engine.

  This is the executable that the TypeScript CLI calls.
  Protocol: read JSON command from stdin, write JSON response to stdout.

  Usage:
    echo '{"command":"execute_action","state":{...},"playerId":"p1","action":{...}}' | ./lean-engine
-/

import Engine.Json
import Engine.Mechanics

namespace Playtest.Engine

open Lean (Json ToJson FromJson)

/-- Process an engine command and return a response. -/
def processCommand (cmd : EngineCommand) : EngineResponse :=
  match cmd with
  | .validateAction state pid action =>
    let result := Mechanics.validateAction state pid action
    { success := result.valid, validation := some result }
  | .executeAction state pid action =>
    Mechanics.executeAction state pid action
  | .getAvailableActions state pid =>
    let actions := Mechanics.getAvailableActions state pid
    { success := true, availableActions := some actions }
  | .checkWin state pid trigger =>
    let result := Mechanics.checkWin state pid trigger
    { success := true, winResult := some result }
  | .initState config playerIds =>
    let state := Mechanics.initState config playerIds
    { success := true, state := some state }
  | .turnStart state pid isNewRound =>
    let state' := Mechanics.onTurnStart state pid isNewRound
    { success := true, state := some state' }
  | .turnEnd state pid nextPid isRoundEnd =>
    let state' := Mechanics.onTurnEnd state pid nextPid isRoundEnd
    { success := true, state := some state' }

/-- Read all stdin, parse command, process, write response. -/
def engineMain : IO Unit := do
  let stdin ← IO.getStdin
  let mut input := ""
  -- Read all of stdin
  repeat do
    let line ← stdin.getLine
    if line.isEmpty then break
    input := input ++ line
  -- Parse JSON
  match Json.parse input.trim with
  | .error e =>
    let response : EngineResponse := { success := false, error := some s!"JSON parse error: {e}" }
    IO.println (toString (ToJson.toJson response))
  | .ok json =>
    match (FromJson.fromJson? json : Except String EngineCommand) with
    | .error e =>
      let response : EngineResponse := { success := false, error := some s!"Command parse error: {e}" }
      IO.println (toString (ToJson.toJson response))
    | .ok cmd =>
      let response := processCommand cmd
      IO.println (toString (ToJson.toJson response))

end Playtest.Engine

/-- Top-level entry point. -/
def main : IO Unit := Playtest.Engine.engineMain
