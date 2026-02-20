/-
  Engine/Json.lean — JSON serialization for the Lean engine.

  Converts between Lean game state types and JSON for IPC
  with the TypeScript CLI.
-/

import Engine.GameState
import Lean.Data.Json

namespace Playtest.Engine

open Lean (Json ToJson FromJson)

/-! ## Utility: Nat to JSON -/

/-- Convert a Nat to a JSON number value. -/
private def jsonNat (n : Nat) : Json := ToJson.toJson n

/-! ## Utility: RBMap JSON helpers -/

private def rbmapToJsonWith {V : Type} (f : V → Json) (m : Lean.RBMap String V compare) : Json :=
  Json.mkObj (m.toList.map fun (k, v) => (k, f v))

private def rbmapNatToJson (m : Lean.RBMap String Nat compare) : Json :=
  rbmapToJsonWith (fun (n : Nat) => ToJson.toJson n) m

private def rbmapJsonToJson (m : Lean.RBMap String Json compare) : Json :=
  rbmapToJsonWith id m

private def rbmapFromJsonWith {V : Type} (f : Json → Except String V)
    (j : Json) : Except String (Lean.RBMap String V compare) := do
  match j with
  | Json.obj kvs =>
    let mut m : Lean.RBMap String V compare := .empty
    for ⟨k, v⟩ in kvs.toArray do
      match f v with
      | .ok a => m := m.insert k a
      | .error e => throw s!"Error parsing key '{k}': {e}"
    return m
  | Json.null => return .empty
  | _ => throw "Expected JSON object for RBMap"

private def rbmapNatFromJson (j : Json) : Except String (Lean.RBMap String Nat compare) :=
  rbmapFromJsonWith (fun v => match v.getNat? with | .ok n => .ok n | .error e => .error e) j

private def rbmapJsonFromJson (j : Json) : Except String (Lean.RBMap String Json compare) :=
  rbmapFromJsonWith .ok j

/-! ## Card JSON -/

instance : ToJson Card where
  toJson c :=
    let fields : List (String × Json) := [("name", Json.str c.name), ("type", Json.str c.cardType)]
    let fields := match c.id with | some id => fields ++ [("id", Json.str id)] | none => fields
    let fields := match c.suit with | some s => fields ++ [("suit", Json.str s)] | none => fields
    let fields := match c.value with | some v => fields ++ [("value", jsonNat v)] | none => fields
    let fields := match c.subtype with | some st => fields ++ [("subtype", Json.str st)] | none => fields
    -- Merge extra fields (effect, terrain, etc.)
    let fields := fields ++ c.extra.toList
    Json.mkObj fields

instance : FromJson Card where
  fromJson? j := do
    let name ← j.getObjValAs? String "name"
    let cardType ← (j.getObjValAs? String "type") <|> pure ""
    let id := j.getObjVal? "id" |>.toOption |>.bind (·.getStr?.toOption)
    let suit := j.getObjVal? "suit" |>.toOption |>.bind (·.getStr?.toOption)
    let value := j.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)
    let subtype := j.getObjVal? "subtype" |>.toOption |>.bind (·.getStr?.toOption)
    let knownFields : List String := ["name", "type", "id", "suit", "value", "subtype", "count"]
    let extra ← match j with
      | Json.obj kvs => do
        let mut m : Lean.RBMap String Json compare := .empty
        for ⟨k, v⟩ in kvs.toArray do
          if !knownFields.contains k then
            m := m.insert k v
        pure m
      | _ => pure .empty
    return { name, cardType, id, suit, value, subtype, extra }

/-! ## Effect JSON -/

instance : ToJson Effect where
  toJson e :=
    let fields : List (String × Json) := [("type", Json.str e.effectType), ("duration", jsonNat e.duration)]
    let fields := match e.value with | some v => fields ++ [("value", jsonNat v.toNat)] | none => fields
    let fields := match e.source with | some s => fields ++ [("source", Json.str s)] | none => fields
    Json.mkObj fields

instance : FromJson Effect where
  fromJson? j := do
    let effectType ← j.getObjValAs? String "type"
    let duration ← (j.getObjValAs? Nat "duration") <|> pure 0
    let value := j.getObjVal? "value" |>.toOption |>.bind (·.getInt?.toOption)
    let source := j.getObjVal? "source" |>.toOption |>.bind (·.getStr?.toOption)
    return { effectType, value, duration, source }

/-! ## PlayerState JSON -/

instance : ToJson PlayerState where
  toJson ps :=
    let fields : List (String × Json) := [("state", Json.str ps.state), ("effects", ToJson.toJson ps.effects)]
    let fields := if ps.hand.isEmpty then fields else fields ++ [("hand", ToJson.toJson ps.hand)]
    let fields := match ps.score with | some s => fields ++ [("score", jsonNat s)] | none => fields
    let fields := if ps.resources.isEmpty then fields else fields ++ [("resources", rbmapNatToJson ps.resources)]
    let fields := match ps.actionPoints with | some ap => fields ++ [("actionPoints", jsonNat ap)] | none => fields
    let fields := match ps.actionPointsUsed with | some u => fields ++ [("actionPointsUsed", jsonNat u)] | none => fields
    let fields := if ps.visitedLocations.isEmpty then fields else fields ++ [("visitedLocations", ToJson.toJson ps.visitedLocations)]
    let fields := match ps.placedLocationCount with | some plc => fields ++ [("placedLocationCount", jsonNat plc)] | none => fields
    let fields := match ps.completedTrades with | some ct => fields ++ [("completedTrades", jsonNat ct)] | none => fields
    let fields := match ps.currentBid with | some b => fields ++ [("currentBid", jsonNat b)] | none => fields
    -- Merge extra fields
    let fields := fields ++ ps.extra.toList
    Json.mkObj fields

instance : FromJson PlayerState where
  fromJson? j := do
    let state ← (j.getObjValAs? String "state") <|> pure "active"
    let hand ← (j.getObjValAs? (List Card) "hand") <|> pure []
    let effects ← (j.getObjValAs? (List Effect) "effects") <|> pure []
    let score := j.getObjVal? "score" |>.toOption |>.bind (·.getNat?.toOption)
    let resources ← match j.getObjVal? "resources" with
      | .ok rj => rbmapNatFromJson rj
      | .error _ => pure .empty
    let actionPoints := j.getObjVal? "actionPoints" |>.toOption |>.bind (·.getNat?.toOption)
    let actionPointsUsed := j.getObjVal? "actionPointsUsed" |>.toOption |>.bind (·.getNat?.toOption)
    let visitedLocations ← (j.getObjValAs? (List String) "visitedLocations") <|> pure []
    let placedLocationCount := j.getObjVal? "placedLocationCount" |>.toOption |>.bind (·.getNat?.toOption)
    let completedTrades := j.getObjVal? "completedTrades" |>.toOption |>.bind (·.getNat?.toOption)
    let currentBid := j.getObjVal? "currentBid" |>.toOption |>.bind (·.getNat?.toOption)
    let knownFields : List String := ["state", "hand", "effects", "score", "resources",
      "actionPoints", "actionPointsUsed", "visitedLocations", "placedLocationCount",
      "completedTrades", "currentBid", "agentId", "persona"]
    let extra ← match j with
      | Json.obj kvs => do
        let mut m : Lean.RBMap String Json compare := .empty
        for ⟨k, v⟩ in kvs.toArray do
          if !knownFields.contains k then
            m := m.insert k v
        pure m
      | _ => pure .empty
    return { state, hand, effects, score, resources, actionPoints, actionPointsUsed,
             visitedLocations, placedLocationCount, completedTrades, currentBid, extra }

/-! ## SharedState JSON -/

instance : ToJson SharedState where
  toJson ss :=
    let fields : List (String × Json) := []
    let fields := if ss.deck.isEmpty then fields else fields ++ [("deck", ToJson.toJson ss.deck)]
    let fields := if ss.discard.isEmpty then fields else fields ++ [("discard", ToJson.toJson ss.discard)]
    let fields := if ss.boardStates.isEmpty then fields
      else fields ++ [("boardStates", ToJson.toJson ss.boardStates)]
    let fields := if ss.boardEdges.isEmpty then fields
      else fields ++ [("boardEdges", Json.arr (ss.boardEdges.map fun (a, b) =>
        Json.mkObj [("from", Json.str a), ("to", Json.str b)]).toArray)]
    let fields := match ss.currentBoardState with
      | some s => fields ++ [("currentBoardState", Json.str s)]
      | none => fields
    let fields := if ss.placedLocations.isEmpty then fields
      else fields ++ [("placedLocations", ToJson.toJson ss.placedLocations)]
    let fields := fields ++ ss.extra.toList
    Json.mkObj fields

instance : FromJson SharedState where
  fromJson? j := do
    let deck ← (j.getObjValAs? (List Card) "deck") <|> pure []
    let discard ← (j.getObjValAs? (List Card) "discard") <|> pure []
    let boardStates ← (j.getObjValAs? (List String) "boardStates") <|> pure []
    let boardEdges ← match j.getObjVal? "boardEdges" with
      | .ok (Json.arr edges) => do
        let mut result : List (String × String) := []
        for e in edges do
          let f ← e.getObjValAs? String "from"
          let t ← e.getObjValAs? String "to"
          result := result ++ [(f, t)]
        pure result
      | _ => pure []
    let currentBoardState := j.getObjVal? "currentBoardState" |>.toOption |>.bind (·.getStr?.toOption)
    let placedLocations ← (j.getObjValAs? (List String) "placedLocations") <|> pure []
    let knownFields : List String := ["deck", "discard", "boardStates", "boardEdges",
      "currentBoardState", "placedLocations"]
    let extra ← match j with
      | Json.obj kvs => do
        let mut m : Lean.RBMap String Json compare := .empty
        for ⟨k, v⟩ in kvs.toArray do
          if !knownFields.contains k then
            m := m.insert k v
        pure m
      | _ => pure .empty
    return { deck, discard, boardStates, boardEdges, currentBoardState, placedLocations, extra }

/-! ## GameConfig JSON -/

instance : ToJson GameConfig where
  toJson gc :=
    let fields : List (String × Json) := [("name", Json.str gc.name)]
    let fields := match gc.maxRounds with | some n => fields ++ [("max_rounds", jsonNat n)] | none => fields
    let fields := match gc.maxTurns with | some n => fields ++ [("max_turns", jsonNat n)] | none => fields
    let fields := if gc.mechanics.isEmpty then fields else fields ++ [("mechanics", ToJson.toJson gc.mechanics)]
    let fields := if gc.engineMechanics.isEmpty then fields
      else fields ++ [("engine_mechanics", rbmapJsonToJson gc.engineMechanics)]
    Json.mkObj fields

instance : FromJson GameConfig where
  fromJson? j := do
    let name ← (j.getObjValAs? String "name") <|> pure ""
    let maxRounds := j.getObjVal? "max_rounds" |>.toOption |>.bind (·.getNat?.toOption)
    let maxTurns := j.getObjVal? "max_turns" |>.toOption |>.bind (·.getNat?.toOption)
    let mechanics ← (j.getObjValAs? (List String) "mechanics") <|> pure []
    let engineMechanics ← match j.getObjVal? "engine_mechanics" with
      | .ok em => rbmapJsonFromJson em
      | .error _ => pure .empty
    return { name, maxRounds, maxTurns, mechanics, engineMechanics }

/-! ## GameState JSON -/

instance : ToJson GameState where
  toJson gs := Json.mkObj [
    ("gameId", Json.str gs.gameId),
    ("gameName", Json.str gs.gameName),
    ("config", ToJson.toJson gs.config),
    ("players", rbmapToJsonWith ToJson.toJson gs.players),
    ("turnOrder", ToJson.toJson gs.turnOrder),
    ("currentPlayer", Json.str gs.currentPlayer),
    ("round", jsonNat gs.round),
    ("turnNumber", jsonNat gs.turnNumber),
    ("status", Json.str gs.status),
    ("shared", ToJson.toJson gs.shared)
  ]

instance : FromJson GameState where
  fromJson? j := do
    let gameId ← (j.getObjValAs? String "gameId") <|> pure ""
    let gameName ← (j.getObjValAs? String "gameName") <|> pure ""
    let config ← (j.getObjValAs? GameConfig "config") <|> pure {}
    let players ← match j.getObjVal? "players" with
      | .ok pj => rbmapFromJsonWith (fun v => FromJson.fromJson? v) pj
      | .error _ => pure .empty
    let turnOrder ← (j.getObjValAs? (List String) "turnOrder") <|> pure []
    let currentPlayer ← (j.getObjValAs? String "currentPlayer") <|> pure ""
    let round ← (j.getObjValAs? Nat "round") <|> pure 1
    let turnNumber ← (j.getObjValAs? Nat "turnNumber") <|> pure 1
    let status ← (j.getObjValAs? String "status") <|> pure "in_progress"
    let shared ← (j.getObjValAs? SharedState "shared") <|> pure {}
    return { gameId, gameName, config, players, turnOrder,
             currentPlayer, round, turnNumber, status, shared }

/-! ## GameAction JSON -/

instance : ToJson GameAction where
  toJson a :=
    let fields : List (String × Json) := [("type", Json.str a.actionType)]
    let fields := match a.card with | some c => fields ++ [("card", Json.str c)] | none => fields
    let fields := match a.target with | some t => fields ++ [("target", Json.str t)] | none => fields
    let fields := match a.resource with | some r => fields ++ [("resource", Json.str r)] | none => fields
    let fields := match a.amount with | some n => fields ++ [("amount", jsonNat n)] | none => fields
    let fields := match a.adjacentTo with | some a => fields ++ [("adjacentTo", Json.str a)] | none => fields
    let fields := fields ++ a.extra.toList
    Json.mkObj fields

instance : FromJson GameAction where
  fromJson? j := do
    let actionType ← j.getObjValAs? String "type"
    let card := j.getObjVal? "card" |>.toOption |>.bind (·.getStr?.toOption)
    let target := j.getObjVal? "target" |>.toOption |>.bind (·.getStr?.toOption)
    let resource := j.getObjVal? "resource" |>.toOption |>.bind (·.getStr?.toOption)
    let amount := j.getObjVal? "amount" |>.toOption |>.bind (·.getNat?.toOption)
    let adjacentTo := j.getObjVal? "adjacentTo" |>.toOption |>.bind (·.getStr?.toOption)
    let knownFields : List String := ["type", "card", "target", "resource", "amount", "adjacentTo"]
    let extra ← match j with
      | Json.obj kvs => do
        let mut m : Lean.RBMap String Json compare := .empty
        for ⟨k, v⟩ in kvs.toArray do
          if !knownFields.contains k then
            m := m.insert k v
        pure m
      | _ => pure .empty
    return { actionType, card, target, resource, amount, adjacentTo, extra }

/-! ## Response types JSON -/

instance : ToJson ValidationResult where
  toJson v :=
    let fields : List (String × Json) := [("valid", Json.bool v.valid)]
    let fields := match v.error with | some e => fields ++ [("error", Json.str e)] | none => fields
    Json.mkObj fields

instance : ToJson StateChanges where
  toJson sc :=
    let fields : List (String × Json) := []
    let fields := if sc.playerStateChanges.isEmpty then fields
      else
        let psc := rbmapToJsonWith (fun changes => rbmapJsonToJson changes) sc.playerStateChanges
        fields ++ [("playerStateChanges", psc)]
    let fields := if sc.sharedStateChanges.isEmpty then fields
      else fields ++ [("sharedStateChanges", rbmapJsonToJson sc.sharedStateChanges)]
    Json.mkObj fields

instance : ToJson ExecutionResult where
  toJson e :=
    let fields : List (String × Json) := [
      ("handled", Json.bool e.handled),
      ("advanceTurn", Json.bool e.advanceTurn),
      ("checkWin", Json.bool e.checkWin)
    ]
    let fields := if e.stateChanges.playerStateChanges.isEmpty && e.stateChanges.sharedStateChanges.isEmpty
      then fields else fields ++ [("stateChanges", ToJson.toJson e.stateChanges)]
    let fields := match e.logMessage with | some m => fields ++ [("logMessage", Json.str m)] | none => fields
    Json.mkObj fields

instance : ToJson AvailableAction where
  toJson a :=
    let fields : List (String × Json) := [("action", ToJson.toJson a.action), ("enabled", Json.bool a.enabled)]
    let fields := match a.priority with | some p => fields ++ [("priority", jsonNat p)] | none => fields
    let fields := match a.category with | some c => fields ++ [("category", Json.str c)] | none => fields
    let fields := match a.reason with | some r => fields ++ [("reason", Json.str r)] | none => fields
    Json.mkObj fields

instance : ToJson WinCheckResult where
  toJson w :=
    let fields : List (String × Json) := [("won", Json.bool w.won)]
    let fields := match w.reason with | some r => fields ++ [("reason", Json.str r)] | none => fields
    Json.mkObj fields

instance : ToJson EngineResponse where
  toJson r :=
    let fields : List (String × Json) := [("success", Json.bool r.success)]
    let fields := match r.error with | some e => fields ++ [("error", Json.str e)] | none => fields
    let fields := match r.validation with | some v => fields ++ [("validation", ToJson.toJson v)] | none => fields
    let fields := match r.execution with | some e => fields ++ [("execution", ToJson.toJson e)] | none => fields
    let fields := match r.availableActions with | some a => fields ++ [("availableActions", ToJson.toJson a)] | none => fields
    let fields := match r.winResult with | some w => fields ++ [("winResult", ToJson.toJson w)] | none => fields
    let fields := match r.state with | some s => fields ++ [("state", ToJson.toJson s)] | none => fields
    Json.mkObj fields

/-! ## EngineCommand JSON -/

instance : FromJson EngineCommand where
  fromJson? j := do
    let command ← j.getObjValAs? String "command"
    match command with
    | "validate_action" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      let action ← j.getObjValAs? GameAction "action"
      return .validateAction state playerId action
    | "execute_action" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      let action ← j.getObjValAs? GameAction "action"
      return .executeAction state playerId action
    | "get_available_actions" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      return .getAvailableActions state playerId
    | "check_win" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      let trigger ← (j.getObjValAs? String "trigger") <|> pure "action"
      return .checkWin state playerId trigger
    | "init_state" => do
      let config ← j.getObjValAs? GameConfig "config"
      let playerIds ← j.getObjValAs? (List String) "playerIds"
      return .initState config playerIds
    | "turn_start" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      let isNewRound ← (j.getObjValAs? Bool "isNewRound") <|> pure false
      return .turnStart state playerId isNewRound
    | "turn_end" => do
      let state ← j.getObjValAs? GameState "state"
      let playerId ← j.getObjValAs? String "playerId"
      let nextPlayerId ← (j.getObjValAs? String "nextPlayerId") <|> pure ""
      let isRoundEnd ← (j.getObjValAs? Bool "isRoundEnd") <|> pure false
      return .turnEnd state playerId nextPlayerId isRoundEnd
    | other => throw s!"Unknown command: {other}"

end Playtest.Engine
