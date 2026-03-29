/-
  Bridge/AAOTE.lean — AAOTE bridge: JSON state ↔ Lean engine

  Protocol:
    echo '<json>' | ./lean-game aaote init <numPlayers> <seed>
    echo '<stateJson>' | ./lean-game aaote act <playerId> <actionJson>
    echo '<stateJson>' | ./lean-game aaote available <playerId>
    echo '<stateJson>' | ./lean-game aaote check-win [<playerId>]

  State is passed via stdin as JSON. Actions are passed as CLI args.
  Output is always single-line JSON to stdout.
-/
import Bridge.Json
import Bridge.JsonParser
import Games.AAOTEEngine

namespace Playtest.Bridge.AAOTEBridge

open Playtest.Bridge
open Playtest.Bridge.JsonParser
open Playtest.Games.AAOTEEngine

/-! ## State Serialization (Lean → JSON) -/

def serializeCard (c : Card) : String :=
  let fields := [
    ("name", Json.str c.name),
    ("category", Json.str (match c.category with
      | .item => "item" | .event => "event" | .location => "location")),
    ("terrain", match c.terrain with | some t => Json.str t | none => Json.null),
    ("subtype", match c.subtype with | some s => Json.str s | none => Json.null)
  ]
  Json.obj fields

def serializeGridPos (p : GridPos) : String :=
  Json.obj [("x", Json.nat p.x.toNat), ("y", Json.nat p.y.toNat),
            ("xNeg", Json.bool (p.x < 0)), ("yNeg", Json.bool (p.y < 0))]

def serializeTile (t : PlacedTile) : String :=
  Json.obj [("pos", serializeGridPos t.pos), ("card", serializeCard t.card)]

def serializeHistory (h : PlayerHistory) : String :=
  Json.obj [
    ("locationsVisited", Json.arr (h.locationsVisited.map Json.str)),
    ("locationsPlaced", Json.nat h.locationsPlaced),
    ("tradesCompleted", Json.nat h.tradesCompleted)
  ]

def serializeTrade (t : TradeOffer) : String :=
  Json.obj [
    ("offerer", Json.str t.offerer),
    ("target", Json.str t.target),
    ("offering", Json.arr (t.offering.map Json.str)),
    ("requesting", Json.arr (t.requesting.map Json.str))
  ]

def serializeObjective (o : Objective) : String :=
  Json.str (toString o)

def serializePlayerCard (pc : PlayerCard) : String :=
  Json.str (toString pc)

def serializeState (state : GameState) : String :=
  let handsJson := state.hands.map fun (pid, hand) =>
    Json.obj [("player", Json.str pid),
              ("cards", Json.arr (hand.map serializeCard))]
  let gridJson := state.grid.map serializeTile
  let positionsJson := state.playerPositions.map fun (pid, pos) =>
    Json.obj [("player", Json.str pid), ("pos", serializeGridPos pos)]
  let objectivesJson := state.objectives.map fun (pid, obj) =>
    Json.obj [("player", Json.str pid), ("objective", serializeObjective obj)]
  let playerCardsJson := state.playerCards.map fun (pid, pc) =>
    Json.obj [("player", Json.str pid), ("card", serializePlayerCard pc)]
  let historyJson := state.history.map fun (pid, h) =>
    Json.obj [("player", Json.str pid), ("history", serializeHistory h)]
  let statusJson := match state.status with
    | .inProgress => Json.obj [("type", Json.str "in_progress")]
    | .completed w r =>
      Json.obj [("type", Json.str "completed"),
                ("winner", match w with | some p => Json.str p | none => Json.null),
                ("reason", Json.str r)]
  let tradeJson := match state.pendingTrade with
    | some t => serializeTrade t
    | none => Json.null
  Json.obj [
    ("players", Json.arr (state.players.map Json.str)),
    ("currentPlayerIdx", Json.nat state.currentPlayerIdx),
    ("round", Json.nat state.round),
    ("turnNumber", Json.nat state.turnNumber),
    ("maxTurns", Json.nat state.maxTurns),
    ("actionPoints", Json.nat state.actionPoints),
    ("actionPointsPerTurn", Json.nat state.actionPointsPerTurn),
    ("hands", Json.arr handsJson),
    ("deck", Json.arr (state.deck.map serializeCard)),
    ("discardPile", Json.arr (state.discardPile.map serializeCard)),
    ("handLimit", Json.nat state.handLimit),
    ("grid", Json.arr gridJson),
    ("playerPositions", Json.arr positionsJson),
    ("objectives", Json.arr objectivesJson),
    ("playerCards", Json.arr playerCardsJson),
    ("history", Json.arr historyJson),
    ("pendingTrade", tradeJson),
    ("status", statusJson),
    ("guardianBlockUsed", Json.bool state.guardianBlockUsed)
  ]

/-! ## State Deserialization (JSON → Lean) -/

def deserializeCard (v : JsonValue) : Option Card := do
  let name ← v.fieldStr "name"
  let catStr ← v.fieldStr "category"
  let category ← match catStr with
    | "item" => some CardCategory.item
    | "event" => some CardCategory.event
    | "location" => some CardCategory.location
    | _ => none
  let terrain := v.fieldStr "terrain"
  let subtype := v.fieldStr "subtype"
  some { name, category, terrain, subtype }

def deserializeGridPos (v : JsonValue) : Option GridPos := do
  let x ← v.fieldNat "x"
  let y ← v.fieldNat "y"
  let xNeg := v.fieldBoolD "xNeg" false
  let yNeg := v.fieldBoolD "yNeg" false
  let xInt : Int := if xNeg then -x else x
  let yInt : Int := if yNeg then -y else y
  some ⟨xInt, yInt⟩

def deserializeTile (v : JsonValue) : Option PlacedTile := do
  let posV ← v.field "pos"
  let pos ← deserializeGridPos posV
  let cardV ← v.field "card"
  let card ← deserializeCard cardV
  some { pos, card }

def deserializeHistory (v : JsonValue) : Option PlayerHistory :=
  let visited := v.fieldStrArr "locationsVisited"
  let placed := (v.fieldNat "locationsPlaced").getD 0
  let trades := (v.fieldNat "tradesCompleted").getD 0
  some { locationsVisited := visited, locationsPlaced := placed, tradesCompleted := trades }

def deserializeTrade (v : JsonValue) : Option TradeOffer := do
  let offerer ← v.fieldStr "offerer"
  let target ← v.fieldStr "target"
  let offering := v.fieldStrArr "offering"
  let requesting := v.fieldStrArr "requesting"
  some { offerer, target, offering, requesting }

def deserializeHand (hv : JsonValue) : Option (PlayerId × List Card) := do
  let pid ← hv.fieldStr "player"
  let cardsArr ← hv.fieldArr "cards"
  some (pid, cardsArr.filterMap deserializeCard)

def deserializePosition (pv : JsonValue) : Option (PlayerId × GridPos) := do
  let pid ← pv.fieldStr "player"
  let posV ← pv.field "pos"
  let pos ← deserializeGridPos posV
  some (pid, pos)

def deserializeObjectiveEntry (ov : JsonValue) : Option (PlayerId × Objective) := do
  let pid ← ov.fieldStr "player"
  let objStr ← (ov.field "objective").bind JsonValue.getString
  let obj ← parseObjective objStr
  some (pid, obj)

def parsePlayerCard (s : String) : Option PlayerCard :=
  match s with
  | "scholar" => some PlayerCard.scholar
  | "merchant" => some PlayerCard.merchant
  | "scout" => some PlayerCard.scout
  | "guardian" => some PlayerCard.guardian
  | "mystic" => some PlayerCard.mystic
  | _ => none

def deserializePlayerCardEntry (pv : JsonValue) : Option (PlayerId × PlayerCard) := do
  let pid ← pv.fieldStr "player"
  let pcStr ← (pv.field "card").bind JsonValue.getString
  let pc ← parsePlayerCard pcStr
  some (pid, pc)

def deserializeHistoryEntry (hv : JsonValue) : Option (PlayerId × PlayerHistory) := do
  let pid ← hv.fieldStr "player"
  let histV ← hv.field "history"
  let hist ← deserializeHistory histV
  some (pid, hist)

def deserializeState (v : JsonValue) : Option GameState := do
  let players := v.fieldStrArr "players"
  let currentPlayerIdx ← v.fieldNat "currentPlayerIdx"
  let round ← v.fieldNat "round"
  let turnNumber ← v.fieldNat "turnNumber"
  let maxTurns := (v.fieldNat "maxTurns").getD 40
  let actionPoints ← v.fieldNat "actionPoints"
  let actionPointsPerTurn := (v.fieldNat "actionPointsPerTurn").getD 3
  let handLimit := (v.fieldNat "handLimit").getD 7
  -- Hands
  let handsArr ← v.fieldArr "hands"
  let hands := handsArr.filterMap deserializeHand
  -- Deck
  let deckArr ← v.fieldArr "deck"
  let deck := deckArr.filterMap deserializeCard
  -- Discard
  let discardArr := (v.fieldArr "discardPile").getD []
  let discardPile := discardArr.filterMap deserializeCard
  -- Grid
  let gridArr := (v.fieldArr "grid").getD []
  let grid := gridArr.filterMap deserializeTile
  -- Positions
  let posArr ← v.fieldArr "playerPositions"
  let positions := posArr.filterMap deserializePosition
  -- Objectives
  let objArr ← v.fieldArr "objectives"
  let objectives := objArr.filterMap deserializeObjectiveEntry
  -- Player cards
  let pcArr := (v.fieldArr "playerCards").getD []
  let playerCards := pcArr.filterMap deserializePlayerCardEntry
  -- History
  let histArr := (v.fieldArr "history").getD []
  let history := histArr.filterMap deserializeHistoryEntry
  -- Pending trade
  let pendingTrade := (v.field "pendingTrade").bind fun tv =>
    match tv with
    | .null => none
    | _ => deserializeTrade tv
  -- Status
  let status := match v.field "status" with
    | some sv =>
      match sv.fieldStr "type" with
      | some "completed" =>
        let winner := sv.fieldStr "winner"
        let reason := (sv.fieldStr "reason").getD ""
        GameStatus.completed winner reason
      | _ => GameStatus.inProgress
    | none => GameStatus.inProgress
  let guardianBlockUsed := v.fieldBoolD "guardianBlockUsed" false
  some {
    players, currentPlayerIdx, round, turnNumber, maxTurns,
    actionPoints, actionPointsPerTurn, hands, deck, discardPile,
    handLimit, grid, playerPositions := positions, objectives,
    playerCards, history, pendingTrade, status, guardianBlockUsed
  }

/-! ## Action Parsing -/

/-- Parse an action from CLI args -/
def parseAction (args : List String) : Option AAOTEAction :=
  match args with
  | ["place_location", card, adjacentTo] =>
    some (.placeLocation card adjacentTo)
  | ["move", target] =>
    some (.move target)
  | ["draw"] =>
    some (.draw)
  | ["play_card", card] =>
    some (.playCard card none)
  | ["play_card", card, target] =>
    some (.playCard card (some target))
  | ["trade_offer", target, offering, requesting] =>
    some (.tradeOffer target (offering.splitOn ",") (requesting.splitOn ","))
  | ["trade_respond", "accept"] =>
    some (.tradeRespond true)
  | ["trade_respond", "decline"] =>
    some (.tradeRespond false)
  | ["pass"] =>
    some (.pass)
  | ["declare_victory", reason] =>
    some (.pass true reason)
  | ["declare_victory"] =>
    some (.pass true "")
  | _ => none

/-! ## Command Dispatch -/

def successResponse (state : GameState) : String :=
  let stateJson := serializeState state
  let currentPid := currentPlayer state
  Json.obj [
    ("success", Json.bool true),
    ("state", stateJson),
    ("currentPlayer", Json.str currentPid),
    ("turnNumber", Json.nat state.turnNumber),
    ("round", Json.nat state.round),
    ("actionPoints", Json.nat state.actionPoints),
    ("gameOver", Json.bool (match state.status with | .completed _ _ => true | _ => false)),
    ("winner", match state.status with
      | .completed (some w) _ => Json.str w
      | _ => Json.null),
    ("winReason", match state.status with
      | .completed _ r => Json.str r
      | _ => Json.null)
  ]

def errorResponse (err : String) : String :=
  Json.obj [("success", Json.bool false), ("error", Json.str err)]

/-- Handle 'init' command -/
def handleInit (args : List String) : String :=
  match args with
  | numStr :: seedArgs =>
    match numStr.toNat? with
    | some n =>
      let seed := match seedArgs.head? with
        | some s => s.toNat?.getD 42
        | none => 42
      -- Generate player IDs
      let playerIds := (List.range n).map fun i => s!"player-{i + 1}"
      match initGame playerIds seed with
      | .ok state => successResponse state
      | .error e => errorResponse e
    | none => errorResponse s!"Invalid player count: {numStr}"
  | [] => errorResponse "init requires player count"

/-- Handle 'act' command (requires state from stdin) -/
def handleAct (stdinJson : String) (playerId : String) (actionArgs : List String) : String :=
  match JsonParser.parse stdinJson with
  | none => errorResponse "Failed to parse state JSON from stdin"
  | some jsonVal =>
    match deserializeState jsonVal with
    | none => errorResponse "Failed to deserialize game state"
    | some state =>
      match parseAction actionArgs with
      | none => errorResponse s!"Unknown action: {String.intercalate " " actionArgs}"
      | some action =>
        match step state playerId action with
        | .ok newState => successResponse newState
        | .error e => errorResponse e

/-- Handle 'available' command -/
def handleAvailable (stdinJson : String) (playerId : String) : String :=
  match JsonParser.parse stdinJson with
  | none => errorResponse "Failed to parse state JSON from stdin"
  | some jsonVal =>
    match deserializeState jsonVal with
    | none => errorResponse "Failed to deserialize game state"
    | some state =>
      let actions := availableActions state playerId
      let actionStrs := actions.map fun a =>
        match a with
        | .placeLocation card adj => Json.obj [("type", Json.str "place_location"), ("card", Json.str card), ("adjacentTo", Json.str adj)]
        | .move target => Json.obj [("type", Json.str "move"), ("target", Json.str target)]
        | .draw => Json.obj [("type", Json.str "draw")]
        | .playCard card target =>
          Json.obj [("type", Json.str "play_card"), ("card", Json.str card),
                    ("target", match target with | some t => Json.str t | none => Json.null)]
        | .tradeOffer target off req =>
          Json.obj [("type", Json.str "trade_offer"), ("target", Json.str target),
                    ("offering", Json.arr (off.map Json.str)), ("requesting", Json.arr (req.map Json.str))]
        | .tradeRespond accept => Json.obj [("type", Json.str "trade_respond"), ("accept", Json.bool accept)]
        | .pass dv vr =>
          if dv then Json.obj [("type", Json.str "declare_victory"), ("reason", Json.str vr)]
          else Json.obj [("type", Json.str "pass")]
      Json.obj [
        ("success", Json.bool true),
        ("actions", Json.arr actionStrs),
        ("count", Json.nat actions.length)
      ]

/-- Handle 'check-win' command -/
def handleCheckWin (stdinJson : String) (playerIdOpt : Option String) : String :=
  match JsonParser.parse stdinJson with
  | none => errorResponse "Failed to parse state JSON from stdin"
  | some jsonVal =>
    match deserializeState jsonVal with
    | none => errorResponse "Failed to deserialize game state"
    | some state =>
      match checkWin state playerIdOpt with
      | some (winner, reason) =>
        Json.obj [("won", Json.bool true), ("winner", Json.str winner), ("reason", Json.str reason)]
      | none => Json.obj [("won", Json.bool false)]

/-- Main dispatch for AAOTE commands -/
def dispatch (stdinContent : String) (args : List String) : Option String :=
  match args with
  | "init" :: rest => some (handleInit rest)
  | "act" :: playerId :: actionArgs =>
    some (handleAct stdinContent playerId actionArgs)
  | "available" :: playerId :: _ =>
    some (handleAvailable stdinContent playerId)
  | "check-win" :: rest =>
    some (handleCheckWin stdinContent rest.head?)
  | _ => none

end Playtest.Bridge.AAOTEBridge
