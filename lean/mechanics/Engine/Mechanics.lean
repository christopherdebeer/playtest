/-
  Engine/Mechanics.lean — Concrete mechanic implementations.

  Each mechanic is a module that provides:
  - `validate` : Check if an action is legal
  - `execute`  : Apply an action and return state changes
  - `getAvailableActions` : List legal actions for a player
  - `onTurnStart` / `onTurnEnd` : Lifecycle hooks
  - `checkWin` : Win condition check

  These are concrete functions on GameState — the executable counterpart
  of the abstract typeclasses in Core/Abstract/.
-/

import Engine.Json

namespace Playtest.Engine.Mechanics

open Playtest.Engine
open Lean (Json ToJson)

/-- Helper: create a single-player state change entry. -/
private def mkPlayerChange (pid : String) (changes : List (String × Json)) :
    Lean.RBMap String (Lean.RBMap String Json compare) compare :=
  let inner := changes.foldl (init := (Lean.RBMap.empty : Lean.RBMap String Json compare))
    fun m (k, v) => m.insert k v
  (Lean.RBMap.empty : Lean.RBMap String (Lean.RBMap String Json compare) compare).insert pid inner

/-! ## Resource Mechanic -/

namespace Resources

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if action.actionType != "spend" then { valid := true }
  else
    match action.resource, action.amount with
    | some resName, some amount =>
      let ps := gs.getPlayer pid
      let current := ps.getResource resName
      if amount ≤ current then { valid := true }
      else { valid := false, error := some s!"Insufficient {resName}: have {current}, need {amount}" }
    | none, _ => { valid := false, error := some "spend action requires 'resource' field" }
    | _, none => { valid := false, error := some "spend action requires 'amount' field" }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "spend" then none
  else match action.resource, action.amount with
  | some resName, some amount =>
    let ps := gs.getPlayer pid
    let current := ps.getResource resName
    if amount ≤ current then
      let ps' := ps.setResource resName (current - amount)
      let targetMsg := match action.target with
        | some t => s!" for {t}"
        | none => ""
      let gs' := gs.setPlayer pid ps'
      some (gs', {
        handled := true,
        stateChanges := {
          playerStateChanges := mkPlayerChange pid
            [("resources", Json.mkObj [(resName, ToJson.toJson (current - amount))])]
        },
        logMessage := some s!"{pid} spent {amount} {resName}{targetMsg}",
        checkWin := true
      })
    else none
  | _, _ => none

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let ps := gs.getPlayer pid
  ps.resources.toList.filterMap fun (name, amount) =>
    if amount > 0 then
      some {
        action := { actionType := "spend", resource := some name, amount := some 1 },
        category := some "resources"
      }
    else none

end Resources

/-! ## Cards Mechanic -/

namespace Cards

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  match action.actionType with
  | "play_card" =>
    match action.card with
    | none => { valid := false, error := some "play_card requires 'card' field" }
    | some cardName =>
      let ps := gs.getPlayer pid
      if ps.hand.any (·.name == cardName) then { valid := true }
      else { valid := false, error := some s!"Card '{cardName}' not in hand" }
  | "draw" => { valid := true }
  | _ => { valid := true }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  match action.actionType with
  | "play_card" => do
    let cardName ← action.card
    let ps := gs.getPlayer pid
    let card ← ps.hand.find? (·.name == cardName)
    let ps' := { ps with hand := ps.hand.filter (·.name != cardName) }
    let shared' := { gs.shared with discard := gs.shared.discard ++ [card] }
    let gs' := { gs.setPlayer pid ps' with shared := shared' }
    some (gs', {
      handled := true,
      stateChanges := {
        playerStateChanges := mkPlayerChange pid
            [("hand", ToJson.toJson ps'.hand)]
      },
      logMessage := some s!"{pid} played {cardName}",
      advanceTurn := true,
      checkWin := true
    })
  | "draw" =>
    let count := action.amount.getD 1
    let ps := gs.getPlayer pid
    let available := gs.shared.deck.take count
    if available.isEmpty then none
    else
      let ps' := { ps with hand := ps.hand ++ available }
      let shared' := { gs.shared with deck := gs.shared.deck.drop count }
      let gs' := { gs.setPlayer pid ps' with shared := shared' }
      some (gs', {
        handled := true,
        stateChanges := {
          playerStateChanges := .empty |>.insert pid
            (.empty |>.insert "hand" (ToJson.toJson ps'.hand))
        },
        logMessage := some s!"{pid} drew {available.length} card(s)"
      })
  | _ => none

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let ps := gs.getPlayer pid
  let playActions := ps.hand.map fun card => {
    action := { actionType := "play_card", card := some card.name : GameAction },
    category := some "cards" : AvailableAction
  }
  let drawAction : List AvailableAction :=
    if !gs.shared.deck.isEmpty then
      [{ action := { actionType := "draw" }, category := some "cards" }]
    else []
  playActions ++ drawAction

end Cards

/-! ## Board Mechanic -/

namespace Board

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if action.actionType != "move" then { valid := true }
  else match action.target with
  | none => { valid := false, error := some "move action requires 'target' field" }
  | some targetState =>
    if !gs.shared.boardStates.contains targetState then
      { valid := false, error := some s!"Invalid board state: '{targetState}'" }
    else
      let ps := gs.getPlayer pid
      let hasEdge := gs.shared.boardEdges.any fun (from_, to_) =>
        from_ == ps.state && to_ == targetState
      if hasEdge then { valid := true }
      else { valid := false, error := some s!"No path from '{ps.state}' to '{targetState}'" }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "move" then none
  else do
    let target ← action.target
    let ps := gs.getPlayer pid
    let ps' := { ps with
      state := target
      visitedLocations := if ps.visitedLocations.contains target then ps.visitedLocations
                          else ps.visitedLocations ++ [target]
    }
    let gs' := gs.setPlayer pid ps'
    some (gs', {
      handled := true,
      stateChanges := {
        playerStateChanges := mkPlayerChange pid
          [("state", Json.str target),
           ("visitedLocations", ToJson.toJson ps'.visitedLocations)]
      },
      logMessage := some s!"{pid} moved from {ps.state} to {target}",
      advanceTurn := true,
      checkWin := true
    })

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let ps := gs.getPlayer pid
  let reachable := gs.shared.boardEdges.filterMap fun (from_, to_) =>
    if from_ == ps.state then some to_ else none
  reachable.map fun target => {
    action := { actionType := "move", target := some target },
    category := some "movement"
  }

end Board

/-! ## Action Points Mechanic -/

namespace ActionPoints

def validate (gs : GameState) (pid : String) (_action : GameAction) : ValidationResult :=
  if !gs.isMechanicEnabled "action_points" then { valid := true }
  else
    let ps := gs.getPlayer pid
    match ps.actionPoints with
    | some ap =>
      if ap > 0 then { valid := true }
      else { valid := false, error := some "No action points remaining" }
    | none => { valid := true }

def onTurnStart (gs : GameState) (pid : String) : GameState :=
  if !gs.isMechanicEnabled "action_points" then gs
  else
    let apConfig := gs.config.engineMechanics.find? "action_points"
    let pointsPerTurn := match apConfig with
      | some cfg => (cfg.getObjVal? "points_per_turn" |>.toOption |>.bind (·.getNat?.toOption)).getD 3
      | none => 3
    gs.modifyPlayer pid fun ps =>
      { ps with actionPoints := some pointsPerTurn, actionPointsUsed := some 0 }

def postExecute (gs : GameState) (pid : String) (action : GameAction) : GameState :=
  if !gs.isMechanicEnabled "action_points" then gs
  else
    let apConfig := gs.config.engineMechanics.find? "action_points"
    let costs := match apConfig with
      | some cfg => cfg.getObjVal? "action_costs" |>.toOption
      | none => none
    let cost := match costs with
      | some (Json.obj kvs) =>
        let found := kvs.toArray.find? fun ⟨k, _⟩ => k == action.actionType
        match found with
        | some ⟨_, v⟩ => v.getNat?.toOption |>.getD 1
        | none => 1
      | _ => 1
    gs.modifyPlayer pid fun ps =>
      { ps with
        actionPoints := ps.actionPoints.map (· - cost)
        actionPointsUsed := ps.actionPointsUsed.map (· + cost)
      }

def shouldAutoEndTurn (gs : GameState) (pid : String) : Bool :=
  if !gs.isMechanicEnabled "action_points" then false
  else
    let ps := gs.getPlayer pid
    match ps.actionPoints with
    | some ap => ap == 0
    | none => false

end ActionPoints

/-! ## Pass Mechanic -/

namespace Pass

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "pass" then none
  else some (gs, {
    handled := true,
    advanceTurn := true,
    logMessage := some s!"{pid} passed"
  })

def getAvailableActions (_gs : GameState) (_pid : String) : List AvailableAction :=
  [{ action := { actionType := "pass" }, category := some "general", priority := some 0 }]

end Pass

/-! ## Win Condition Mechanics -/

namespace WinConditions

def checkScoreThreshold (gs : GameState) (pid : String) : WinCheckResult :=
  match gs.config.engineMechanics.find? "win_score_threshold" with
  | none => { won := false }
  | some cfg =>
    let threshold := (cfg.getObjVal? "threshold" |>.toOption |>.bind (·.getNat?.toOption)).getD 0
    let ps := gs.getPlayer pid
    let score := ps.score.getD 0
    if score ≥ threshold then
      { won := true, reason := some s!"Reached score threshold: {score} ≥ {threshold}" }
    else { won := false }

def checkEmptyHand (gs : GameState) (pid : String) : WinCheckResult :=
  if !gs.isMechanicEnabled "win_empty_hand" then { won := false }
  else
    let ps := gs.getPlayer pid
    if ps.hand.isEmpty then
      { won := true, reason := some s!"{pid} emptied their hand" }
    else { won := false }

def checkReachState (gs : GameState) (pid : String) : WinCheckResult :=
  match gs.config.engineMechanics.find? "win_reach_state" with
  | none => { won := false }
  | some cfg =>
    let targetState := (cfg.getObjVal? "target_state" |>.toOption |>.bind (·.getStr?.toOption)).getD ""
    let ps := gs.getPlayer pid
    if ps.state == targetState then
      { won := true, reason := some s!"{pid} reached {targetState}" }
    else { won := false }

def checkMaxRounds (gs : GameState) : Option String :=
  match gs.config.maxRounds with
  | some maxR =>
    if gs.round > maxR then some "max_rounds_reached"
    else none
  | none => none

def checkAll (gs : GameState) (pid : String) : WinCheckResult :=
  -- Check all win conditions in priority order
  let checks := [
    checkScoreThreshold gs pid,
    checkEmptyHand gs pid,
    checkReachState gs pid
  ]
  match checks.find? (·.won) with
  | some result => result
  | none => { won := false }

end WinConditions

/-! ## Mechanic Router -/

/-- Route a validation call through all enabled mechanics.
    Returns first failure, or valid if all pass. -/
def validateAction (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  -- Check it's the player's turn (unless out-of-turn action)
  if gs.currentPlayer != pid && action.actionType != "pass" then
    { valid := false, error := some s!"Not {pid}'s turn (current: {gs.currentPlayer})" }
  else
    let checks := [
      ActionPoints.validate gs pid action,
      Resources.validate gs pid action,
      Cards.validate gs pid action,
      Board.validate gs pid action
    ]
    match checks.find? (!·.valid) with
    | some failure => failure
    | none => { valid := true }

/-- Route an action execution through mechanics.
    First mechanic to handle it wins (like TypeScript registry). -/
def executeAction (gs : GameState) (pid : String) (action : GameAction) : EngineResponse :=
  -- First validate
  let validation := validateAction gs pid action
  if !validation.valid then
    { success := false, validation := some validation }
  else
    -- Try each mechanic until one handles it
    let handlers := [
      Pass.execute gs pid action,
      Cards.execute gs pid action,
      Board.execute gs pid action,
      Resources.execute gs pid action
    ]
    let results := handlers.filterMap fun x => x
    match results.head? with
    | none =>
      { success := false, error := some s!"No mechanic handled action type '{action.actionType}'" }
    | some (gs', execResult) =>
      -- Post-execute hooks
      let gs'' := ActionPoints.postExecute gs' pid action
      { success := true,
        execution := some execResult,
        state := some gs'' }

/-- Get all available actions for a player. -/
def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let cardActions := if gs.isMechanicEnabled "cards" then Cards.getAvailableActions gs pid else []
  let boardActions := if gs.isMechanicEnabled "board" || !gs.shared.boardStates.isEmpty
    then Board.getAvailableActions gs pid else []
  let resourceActions := if gs.isMechanicEnabled "resources" then Resources.getAvailableActions gs pid else []
  let passActions := Pass.getAvailableActions gs pid
  cardActions ++ boardActions ++ resourceActions ++ passActions

/-- Check win conditions for a player. -/
def checkWin (gs : GameState) (pid : String) (_trigger : String) : WinCheckResult :=
  WinConditions.checkAll gs pid

/-- Handle turn start lifecycle. -/
def onTurnStart (gs : GameState) (pid : String) (_isNewRound : Bool) : GameState :=
  ActionPoints.onTurnStart gs pid

/-- Handle turn end lifecycle. -/
def onTurnEnd (gs : GameState) (_pid : String) (_nextPid : String) (_isRoundEnd : Bool) : GameState :=
  -- Tick effect durations, etc.
  gs

/-- Initialize game state from config. -/
def initState (config : GameConfig) (playerIds : List String) : GameState :=
  let deck : List Card := match config.engineMechanics.find? "cards" with
    | some cfg =>
      match cfg.getObjVal? "deck" with
      | .ok (Json.arr cards) =>
        let cardLists : List (List Card) := cards.toList.filterMap fun cardJson => do
          let name ← (cardJson.getObjValAs? String "name").toOption
          let ctype ← (cardJson.getObjValAs? String "type" <|> pure "").toOption
          let count := (cardJson.getObjVal? "count" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
          let suit := cardJson.getObjVal? "suit" |>.toOption |>.bind (·.getStr?.toOption)
          let value := cardJson.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)
          some (List.replicate count { name, cardType := ctype, suit, value : Card })
        cardLists.flatten
      | _ => []
    | none => []
  let startingHand := match config.engineMechanics.find? "cards" with
    | some cfg => (cfg.getObjVal? "starting_hand" |>.toOption |>.bind (·.getNat?.toOption)).getD 0
    | none => 0
  let boardStates := match config.engineMechanics.find? "board" with
    | some cfg =>
      match cfg.getObjVal? "states" with
      | .ok (Json.arr states) => states.toList.filterMap (·.getStr?.toOption)
      | _ => []
    | none => []
  let boardEdges := match config.engineMechanics.find? "board" with
    | some cfg =>
      match cfg.getObjVal? "edges" with
      | .ok (Json.arr edges) => edges.toList.filterMap fun e => do
          let f ← (e.getObjValAs? String "from").toOption
          let t ← (e.getObjValAs? String "to").toOption
          some (f, t)
      | _ => []
    | none => []
  let startState := boardStates.head?
  -- Deal cards to players
  let (playerMap, remainingDeck) := playerIds.foldl (init := (Lean.RBMap.empty, deck))
    fun (players, deck) pid =>
      let hand := deck.take startingHand
      let rest := deck.drop startingHand
      let resources := match config.engineMechanics.find? "resources" with
        | some (Json.arr resList) =>
          resList.toList.foldl (init := Lean.RBMap.empty) fun m resJson =>
            let name := (resJson.getObjValAs? String "name" |>.toOption).getD ""
            let starting := (resJson.getObjVal? "starting" |>.toOption |>.bind (·.getNat?.toOption)).getD 0
            if name.isEmpty then m else m.insert name starting
        | _ => .empty
      let ps : PlayerState := {
        state := startState.getD "start"
        hand := hand
        resources := resources
      }
      (players.insert pid ps, rest)
  {
    config := config,
    players := playerMap,
    turnOrder := playerIds,
    currentPlayer := playerIds.head?.getD "",
    shared := {
      deck := remainingDeck,
      boardStates := boardStates,
      boardEdges := boardEdges,
      currentBoardState := startState
    }
  }

end Playtest.Engine.Mechanics
