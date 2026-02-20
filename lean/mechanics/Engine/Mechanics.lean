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

/-- Helper: get the action point cost for an action type from config. -/
private def getActionCost (gs : GameState) (actionType : String) : Nat :=
  let apConfig := gs.config.engineMechanics.find? "action_points"
  match apConfig with
  | some cfg =>
    match cfg.getObjVal? "action_costs" with
    | .ok (Json.obj kvs) =>
      let found := kvs.toArray.find? fun ⟨k, _⟩ => k == actionType
      match found with
      | some ⟨_, v⟩ => v.getNat?.toOption |>.getD 1
      | none => 1
    | _ => 1
  | none => 1

/-- Helper: get the hand limit from config. -/
private def getHandLimit (gs : GameState) : Option Nat :=
  match gs.config.engineMechanics.find? "hand_limit" with
  | some cfg => cfg.getNat?.toOption
  | none => none

/-- Helper: get the starting tile name from grid config. -/
private def getStartingTile (gs : GameState) : String :=
  match gs.config.engineMechanics.find? "grid" with
  | some cfg => (cfg.getObjVal? "starting_tile" |>.toOption |>.bind (·.getStr?.toOption)).getD "origin"
  | none => "origin"

/-- Helper: get all valid location names on the grid (starting tile + placed). -/
private def getValidLocations (gs : GameState) : List String :=
  let startingTile := getStartingTile gs
  [startingTile] ++ gs.shared.placedLocations

/-- Helper: check if a visibility rule hides an info type from a viewer.
    Config format: visibility: { hand: "self", role: "self", score: "all", ... } -/
private def isInfoHidden (gs : GameState) (infoType : String) (viewerId ownerId : String) : Bool :=
  if viewerId == ownerId then false  -- always see own info
  else
    match gs.config.engineMechanics.find? "visibility" with
    | none => false  -- no visibility config = everything public
    | some cfg =>
      match cfg.getObjVal? infoType with
      | .ok (Json.str "self") => true        -- only self can see
      | .ok (Json.str "hidden") => true      -- hidden from all others
      | .ok (Json.str "all") => false        -- visible to all
      | .ok (Json.str "public") => false
      | _ => false  -- default: public

/-! ## Effects Mechanic -/

namespace Effects

/-- Tick all effects for a player: decrease durations, remove expired.
    Duration 0 = permanent (never expires). -/
def tickEffects (ps : PlayerState) : PlayerState × List Effect :=
  let (remaining, expired) := ps.effects.foldl (init := ([], []))
    fun (rem, exp) eff =>
      if eff.duration == 0 then
        -- Permanent effect: never expires
        (rem ++ [eff], exp)
      else if eff.duration ≤ 1 then
        -- Expires this tick
        (rem, exp ++ [eff])
      else
        -- Decrement duration
        (rem ++ [{ eff with duration := eff.duration - 1 }], exp)
  ({ ps with effects := remaining }, expired)

/-- Apply a card's effect to the game state when played. Reads effect from card.extra. -/
def applyCardEffect (gs : GameState) (pid : String) (card : Card) : GameState × Option String :=
  -- Read effect from card.extra
  let effectJson := card.extra.find? "effect"
  match effectJson with
  | none => (gs, none)
  | some ej =>
    let effectType := (ej.getObjVal? "type" |>.toOption |>.bind (·.getStr?.toOption)).getD ""
    match effectType with
    | "probability_boost" | "probability_penalty" =>
      -- These are informational — the GM interprets them. We just log.
      let value := (ej.getObjVal? "value" |>.toOption |>.bind fun v =>
        match v with | Json.num n => some (toString n) | _ => none).getD "?"
      (gs, some s!"Effect: {effectType} ({value})")
    | "skip" =>
      -- Add skip effect to target (next player) or self-target
      let target := match card.extra.find? "target" with
        | some (Json.str t) => t
        | _ =>
          -- Default: next player in turn order
          let idx := gs.turnOrder.indexOf pid
          let nextIdx := (idx + 1) % gs.turnOrder.length
          gs.turnOrder.get? nextIdx |>.getD pid
      let eff : Effect := { effectType := "skip", duration := 1, source := some pid }
      let gs' := gs.modifyPlayer target fun tps =>
        { tps with effects := tps.effects ++ [eff] }
      (gs', some s!"Skip applied to {target}")
    | "draw" =>
      -- Force target to draw N cards
      let drawCount := (ej.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
      let target := match card.extra.find? "target" with
        | some (Json.str t) => t
        | _ =>
          let idx := gs.turnOrder.indexOf pid
          let nextIdx := (idx + 1) % gs.turnOrder.length
          gs.turnOrder.get? nextIdx |>.getD pid
      let tps := gs.getPlayer target
      let drawn := gs.shared.deck.take drawCount
      let tps' := { tps with hand := tps.hand ++ drawn }
      let shared' := { gs.shared with deck := gs.shared.deck.drop drawCount }
      let gs' := { gs.setPlayer target tps' with shared := shared' }
      (gs', some s!"{target} forced to draw {drawn.length}")
    | "reverse" =>
      -- Reverse turn order
      let gs' := { gs with turnOrder := gs.turnOrder.reverse }
      (gs', some s!"Turn order reversed")
    | "force_discard" =>
      -- Target discards N cards (from front of hand for simplicity)
      let discardCount := (ej.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
      let target := match card.extra.find? "target" with
        | some (Json.str t) => t
        | _ =>
          let idx := gs.turnOrder.indexOf pid
          let nextIdx := (idx + 1) % gs.turnOrder.length
          gs.turnOrder.get? nextIdx |>.getD pid
      let tps := gs.getPlayer target
      let discarded := tps.hand.take discardCount
      let tps' := { tps with hand := tps.hand.drop discardCount }
      let shared' := { gs.shared with discard := gs.shared.discard ++ discarded }
      let gs' := { gs.setPlayer target tps' with shared := shared' }
      (gs', some s!"{target} forced to discard {discarded.length}")
    | "block_turn" =>
      -- Add blocked effect with duration
      let duration := (ej.getObjVal? "duration" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
      let target := match card.extra.find? "target" with
        | some (Json.str t) => t
        | _ =>
          let idx := gs.turnOrder.indexOf pid
          let nextIdx := (idx + 1) % gs.turnOrder.length
          gs.turnOrder.get? nextIdx |>.getD pid
      let eff : Effect := { effectType := "blocked", duration := duration, source := some pid }
      let gs' := gs.modifyPlayer target fun tps =>
        { tps with effects := tps.effects ++ [eff] }
      (gs', some s!"{target} blocked for {duration} turn(s)")
    | "add_score" =>
      -- Add score to player
      let amount := (ej.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
      let gs' := gs.modifyPlayer pid fun ps =>
        { ps with score := some ((ps.score.getD 0) + amount) }
      (gs', some s!"{pid} gained {amount} score")
    | "add_resource" =>
      -- Add resource to player
      let resName := (ej.getObjVal? "resource" |>.toOption |>.bind (·.getStr?.toOption)).getD ""
      let amount := (ej.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
      if resName.isEmpty then (gs, none)
      else
        let gs' := gs.modifyPlayer pid fun ps =>
          ps.setResource resName ((ps.getResource resName) + amount)
        (gs', some s!"{pid} gained {amount} {resName}")
    | _ =>
      -- Unknown effect type — log it for GM interpretation
      (gs, some s!"Effect: {effectType} (GM interprets)")

/-- Check if a player is blocked (has a "blocked" or "skip" effect). -/
def isBlocked (ps : PlayerState) : Bool :=
  ps.effects.any fun e => e.effectType == "blocked" || e.effectType == "skip"

end Effects

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

/-! ## Cards Mechanic (with card type rules, hand limit, and effect resolution) -/

namespace Cards

/-- Check card type rules — e.g., items can't be played, locations must use place_location. -/
private def checkCardTypeRules (gs : GameState) (card : Card) : ValidationResult :=
  match gs.config.engineMechanics.find? "card_type_rules" with
  | none => { valid := true }
  | some rules =>
    match rules.getObjVal? card.cardType with
    | .ok typeRule =>
      let playable := (typeRule.getObjVal? "playable" |>.toOption |>.bind
        fun v => match v with | Json.bool b => some b | _ => none).getD true
      if !playable then
        let hint := if card.cardType == "item" then " Items are held in hand until used or traded."
          else if card.cardType == "location" then " Use place_location action instead."
          else ""
        { valid := false, error := some s!"Cannot play \"{card.name}\". Cards of type \"{card.cardType}\" cannot be played.{hint}" }
      else { valid := true }
    | .error _ => { valid := true }

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  match action.actionType with
  | "play_card" =>
    match action.card with
    | none => { valid := false, error := some "play_card requires 'card' field" }
    | some cardName =>
      let ps := gs.getPlayer pid
      match ps.hand.find? (·.name == cardName) with
      | none => { valid := false, error := some s!"Card '{cardName}' not in hand" }
      | some card => checkCardTypeRules gs card
  | "draw" =>
    -- Check hand limit
    let ps := gs.getPlayer pid
    match getHandLimit gs with
    | some limit =>
      if ps.hand.length ≥ limit then
        { valid := false, error := some s!"Cannot draw: hand is at limit ({limit} cards)" }
      else { valid := true }
    | none => { valid := true }
  | _ => { valid := true }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  match action.actionType with
  | "play_card" => do
    let cardName ← action.card
    let ps := gs.getPlayer pid
    let card ← ps.hand.find? (·.name == cardName)
    -- Remove card from hand and discard
    let ps' := { ps with hand := ps.hand.filter (·.name != cardName) }
    let shared' := { gs.shared with discard := gs.shared.discard ++ [card] }
    let gs' := { gs.setPlayer pid ps' with shared := shared' }
    -- Apply card effect
    let (gs'', effectMsg) := Effects.applyCardEffect gs' pid card
    let logMsg := match effectMsg with
      | some msg => s!"{pid} played {cardName}. {msg}"
      | none => s!"{pid} played {cardName}"
    some (gs'', {
      handled := true,
      stateChanges := {
        playerStateChanges := mkPlayerChange pid
            [("hand", ToJson.toJson (gs''.getPlayer pid).hand),
             ("effects", ToJson.toJson (gs''.getPlayer pid).effects),
             ("score", ToJson.toJson ((gs''.getPlayer pid).score.getD 0))],
        sharedStateChanges := (Lean.RBMap.empty : Lean.RBMap String Json compare).insert
            "discard" (ToJson.toJson gs''.shared.discard)
      },
      logMessage := some logMsg,
      checkWin := true
    })
  | "draw" =>
    let count := action.amount.getD 1
    let ps := gs.getPlayer pid
    -- Respect hand limit
    let actualCount := match getHandLimit gs with
      | some limit =>
        let room := if limit > ps.hand.length then limit - ps.hand.length else 0
        min count room
      | none => count
    let available := gs.shared.deck.take actualCount
    if available.isEmpty then none
    else
      let ps' := { ps with hand := ps.hand ++ available }
      let shared' := { gs.shared with deck := gs.shared.deck.drop actualCount }
      let gs' := { gs.setPlayer pid ps' with shared := shared' }
      some (gs', {
        handled := true,
        stateChanges := {
          playerStateChanges := mkPlayerChange pid
            [("hand", ToJson.toJson ps'.hand)]
        },
        logMessage := some s!"{pid} drew {available.length} card(s)"
      })
  | _ => none

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let ps := gs.getPlayer pid
  -- Only event cards can be played (check card_type_rules)
  let playableCards := ps.hand.filter fun card =>
    match checkCardTypeRules gs card with
    | { valid := true, .. } => true
    | _ => false
  let playActions := playableCards.map fun card => {
    action := { actionType := "play_card", card := some card.name : GameAction },
    category := some "cards" : AvailableAction
  }
  -- Draw action (check hand limit)
  let drawAction : List AvailableAction :=
    if !gs.shared.deck.isEmpty then
      match getHandLimit gs with
      | some limit =>
        if ps.hand.length < limit then
          [{ action := { actionType := "draw" }, category := some "cards" }]
        else []
      | none => [{ action := { actionType := "draw" }, category := some "cards" }]
    else []
  playActions ++ drawAction

end Cards

/-! ## Board / Grid Mechanic (supports both fixed graphs and dynamic location grids) -/

namespace Board

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if action.actionType != "move" then { valid := true }
  else match action.target with
  | none => { valid := false, error := some "move action requires 'target' field" }
  | some targetLoc =>
    -- Dynamic grid mode: check against placedLocations
    let validLocations := getValidLocations gs
    if validLocations.length > 1 || !gs.shared.boardStates.isEmpty then
      -- Grid-based movement (AAOTE style)
      if !gs.shared.boardStates.isEmpty then
        -- Fixed-graph mode: use boardEdges
        let ps := gs.getPlayer pid
        let hasEdge := gs.shared.boardEdges.any fun (from_, to_) =>
          from_ == ps.state && to_ == targetLoc
        if hasEdge then { valid := true }
        else { valid := false, error := some s!"No path from '{ps.state}' to '{targetLoc}'" }
      else
        -- Dynamic grid mode: any placed location is reachable (simplified adjacency)
        if validLocations.contains targetLoc then { valid := true }
        else { valid := false, error := some s!"Location '{targetLoc}' does not exist on the grid. Valid locations: {String.intercalate ", " validLocations}" }
    else
      { valid := false, error := some "No locations to move to. Place locations first!" }

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
      checkWin := true
    })

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  let ps := gs.getPlayer pid
  if !gs.shared.boardStates.isEmpty then
    -- Fixed-graph mode
    let reachable := gs.shared.boardEdges.filterMap fun (from_, to_) =>
      if from_ == ps.state then some to_ else none
    reachable.map fun target => {
      action := { actionType := "move", target := some target },
      category := some "movement"
    }
  else
    -- Dynamic grid mode: can move to any placed location (simplified)
    let validLocations := getValidLocations gs
    let reachable := validLocations.filter (· != ps.state)
    reachable.map fun target => {
      action := { actionType := "move", target := some target },
      category := some "movement"
    }

end Board

/-! ## Place Location Mechanic -/

namespace PlaceLocation

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if action.actionType != "place_location" then { valid := true }
  else
    -- Check card exists in hand
    match action.card with
    | none => { valid := false, error := some "place_location requires 'card' field" }
    | some cardName =>
      let ps := gs.getPlayer pid
      match ps.hand.find? (·.name == cardName) with
      | none => { valid := false, error := some s!"Card '{cardName}' not in hand" }
      | some card =>
        -- Check card is a location type
        if card.cardType != "location" then
          { valid := false, error := some s!"Card \"{cardName}\" is not a location card. Only location cards can be placed on the grid." }
        else
          -- Check adjacentTo is a valid existing location
          match action.adjacentTo with
          | none => { valid := false, error := some "place_location requires 'adjacentTo' field" }
          | some adjTo =>
            let validLocations := getValidLocations gs
            if validLocations.contains adjTo then { valid := true }
            else { valid := false, error := some s!"Invalid adjacentTo target \"{adjTo}\". Must be an existing location: {String.intercalate ", " validLocations}" }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "place_location" then none
  else do
    let cardName ← action.card
    let ps := gs.getPlayer pid
    let _card ← ps.hand.find? (·.name == cardName)
    -- Remove card from hand
    let ps' := { ps with
      hand := ps.hand.filter (·.name != cardName),
      placedLocationCount := some ((ps.placedLocationCount.getD 0) + 1)
    }
    -- Add to placed locations
    let placedLocations' := gs.shared.placedLocations ++ [cardName]
    let shared' := { gs.shared with placedLocations := placedLocations' }
    let gs' := { gs.setPlayer pid ps' with shared := shared' }
    some (gs', {
      handled := true,
      stateChanges := {
        playerStateChanges := mkPlayerChange pid
          [("hand", ToJson.toJson ps'.hand),
           ("placedLocationCount", ToJson.toJson (ps'.placedLocationCount.getD 0))],
        sharedStateChanges := (Lean.RBMap.empty : Lean.RBMap String Json compare).insert
          "placedLocations" (ToJson.toJson placedLocations')
      },
      logMessage := some s!"{pid} placed {cardName}",
      checkWin := true
    })

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  -- Only if grid mechanic is enabled
  if !gs.isMechanicEnabled "grid" && !gs.isMechanicEnabled "place-location" then []
  else
    let ps := gs.getPlayer pid
    let locationCards := ps.hand.filter (·.cardType == "location")
    if locationCards.isEmpty then []
    else
      let validTargets := getValidLocations gs
      if validTargets.isEmpty then []
      else
        locationCards.foldl (init := []) fun acc card =>
          acc ++ validTargets.map fun adjTo => {
            action := { actionType := "place_location", card := some card.name,
                        adjacentTo := some adjTo : GameAction },
            category := some "placement",
            priority := some 35 : AvailableAction
          }

end PlaceLocation

/-! ## Action Points Mechanic -/

namespace ActionPoints

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if !gs.isMechanicEnabled "action_points" && !gs.isMechanicEnabled "action-points" then { valid := true }
  else
    -- Pass always costs 0
    if action.actionType == "pass" then { valid := true }
    else
      let ps := gs.getPlayer pid
      let cost := getActionCost gs action.actionType
      match ps.actionPoints with
      | some ap =>
        if ap ≥ cost then { valid := true }
        else { valid := false, error := some s!"Not enough action points: have {ap}, need {cost} for {action.actionType}" }
      | none => { valid := true }

def onTurnStart (gs : GameState) (pid : String) : GameState :=
  if !gs.isMechanicEnabled "action_points" && !gs.isMechanicEnabled "action-points" then gs
  else
    let apConfig := gs.config.engineMechanics.find? "action_points"
    let pointsPerTurn := match apConfig with
      | some cfg => (cfg.getObjVal? "points_per_turn" |>.toOption |>.bind (·.getNat?.toOption)).getD 3
      | none => 3
    gs.modifyPlayer pid fun ps =>
      { ps with actionPoints := some pointsPerTurn, actionPointsUsed := some 0 }

def postExecute (gs : GameState) (pid : String) (action : GameAction) : GameState :=
  if !gs.isMechanicEnabled "action_points" && !gs.isMechanicEnabled "action-points" then gs
  else
    let cost := getActionCost gs action.actionType
    gs.modifyPlayer pid fun ps =>
      { ps with
        actionPoints := ps.actionPoints.map fun ap => if ap ≥ cost then ap - cost else 0
        actionPointsUsed := ps.actionPointsUsed.map (· + cost)
      }

def shouldAutoEndTurn (gs : GameState) (pid : String) : Bool :=
  if !gs.isMechanicEnabled "action_points" && !gs.isMechanicEnabled "action-points" then false
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

/-! ## Trade Mechanic -/

namespace Trade

def validate (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  if action.actionType != "trade_offer" then { valid := true }
  else
    -- Check target player
    match action.target with
    | none => { valid := false, error := some "trade_offer requires 'target' (target player)" }
    | some targetPid =>
      if !gs.players.contains targetPid then
        { valid := false, error := some s!"Target player '{targetPid}' not found" }
      else if targetPid == pid then
        { valid := false, error := some "Cannot trade with yourself" }
      else
        -- Check offering card exists and is an item
        match action.card with
        | none => { valid := false, error := some "trade_offer requires 'card' (item to offer)" }
        | some cardName =>
          let ps := gs.getPlayer pid
          match ps.hand.find? (·.name == cardName) with
          | none => { valid := false, error := some s!"Card '{cardName}' not in hand" }
          | some card =>
            -- Check trade config — items only?
            let itemOnly := match gs.config.engineMechanics.find? "trade" with
              | some cfg => (cfg.getObjVal? "item_types_only" |>.toOption |>.bind
                  fun v => match v with | Json.bool b => some b | _ => none).getD true
              | none => true
            if itemOnly && card.cardType != "item" then
              { valid := false, error := some s!"Only items can be traded, not {card.cardType} cards" }
            else { valid := true }

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "trade_offer" then none
  else do
    let cardName ← action.card
    let targetPid ← action.target
    let ps := gs.getPlayer pid
    let _card ← ps.hand.find? (·.name == cardName)
    -- For now, simplified: auto-accept gifts (one-sided trades)
    -- Remove card from offering player
    let card := (ps.hand.find? (·.name == cardName)).getD { name := cardName }
    let ps' := { ps with hand := ps.hand.filter (·.name != cardName) }
    -- Add card to target player
    let targetPs := gs.getPlayer targetPid
    let targetPs' := { targetPs with hand := targetPs.hand ++ [card] }
    -- Update completed trades counter
    let ps'' := { ps' with completedTrades := some ((ps'.completedTrades.getD 0) + 1) }
    let gs' := gs.setPlayer pid ps'' |>.setPlayer targetPid targetPs'
    some (gs', {
      handled := true,
      stateChanges := {
        playerStateChanges :=
          let inner1 : Lean.RBMap String Json compare := Lean.RBMap.empty
            |>.insert "hand" (ToJson.toJson ps''.hand)
            |>.insert "completedTrades" (ToJson.toJson (ps''.completedTrades.getD 0))
          let inner2 : Lean.RBMap String Json compare := Lean.RBMap.empty
            |>.insert "hand" (ToJson.toJson targetPs'.hand)
          (Lean.RBMap.empty : Lean.RBMap String (Lean.RBMap String Json compare) compare)
            |>.insert pid inner1
            |>.insert targetPid inner2
      },
      logMessage := some s!"{pid} traded {cardName} to {targetPid}",
      checkWin := true
    })

def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  if !gs.isMechanicEnabled "trade" && !gs.isMechanicEnabled "trading" then []
  else
    let ps := gs.getPlayer pid
    let items := ps.hand.filter (·.cardType == "item")
    if items.isEmpty then []
    else
      let otherPlayers := gs.turnOrder.filter (· != pid)
      items.foldl (init := []) fun acc card =>
        acc ++ otherPlayers.map fun target => {
          action := { actionType := "trade_offer", card := some card.name,
                      target := some target : GameAction },
          category := some "trading",
          priority := some 20 : AvailableAction
        }

end Trade

/-! ## Score Mechanic -/

namespace Score

def execute (gs : GameState) (pid : String) (action : GameAction) : Option (GameState × ExecutionResult) :=
  if action.actionType != "add_score" then none
  else
    let amount := action.amount.getD 1
    let gs' := gs.modifyPlayer pid fun ps =>
      { ps with score := some ((ps.score.getD 0) + amount) }
    some (gs', {
      handled := true,
      stateChanges := {
        playerStateChanges := mkPlayerChange pid
          [("score", ToJson.toJson ((gs'.getPlayer pid).score.getD 0))]
      },
      logMessage := some s!"{pid} gained {amount} score",
      checkWin := true
    })

def getAvailableActions (_gs : GameState) (_pid : String) : List AvailableAction := []

end Score

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

def checkMaxTurns (gs : GameState) : Option WinCheckResult :=
  match gs.config.maxTurns with
  | some maxT =>
    if gs.turnNumber > maxT then
      -- Check timeout_winner config
      match gs.config.engineMechanics.find? "timeout_winner" with
      | some cfg =>
        let winType := (cfg.getObjVal? "type" |>.toOption |>.bind (·.getStr?.toOption)).getD ""
        if winType == "role" then
          let role := (cfg.getObjVal? "role" |>.toOption |>.bind (·.getStr?.toOption)).getD ""
          some { won := true, reason := some s!"Turn limit reached. {role} wins by timeout." }
        else
          some { won := true, reason := some "Turn limit reached." }
      | none => some { won := true, reason := some "Turn limit reached." }
    else none
  | none => none

def checkAll (gs : GameState) (pid : String) : WinCheckResult :=
  -- Check turn limit first
  match checkMaxTurns gs with
  | some result => result
  | none =>
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

/-! ## Visibility / Player View -/

namespace Visibility

/-- Build the player view for a specific player.
    Applies visibility rules to hide information. -/
def getPlayerView (gs : GameState) (viewerId : String) : PlayerViewResult :=
  let myPs := gs.getPlayer viewerId
  let myView : MyStateView := {
    state := myPs.state,
    hand := myPs.hand,
    effects := myPs.effects,
    score := myPs.score,
    resources := myPs.resources,
    actionPoints := myPs.actionPoints,
    actionPointsUsed := myPs.actionPointsUsed,
    visitedLocations := myPs.visitedLocations,
    placedLocationCount := myPs.placedLocationCount,
    completedTrades := myPs.completedTrades,
    extra := myPs.extra
  }
  let opponents := gs.turnOrder.filter (· != viewerId) |>.map fun opId =>
    let opPs := gs.getPlayer opId
    let showScore := !isInfoHidden gs "score" viewerId opId
    let showResources := !isInfoHidden gs "resources" viewerId opId
    let showEffects := !isInfoHidden gs "effects" viewerId opId
    {
      playerId := opId,
      state := opPs.state,
      handSize := opPs.hand.length,
      effects := if showEffects then opPs.effects else [],
      score := if showScore then opPs.score else none,
      resources := if showResources then opPs.resources else .empty,
      placedLocationCount := opPs.placedLocationCount,
      completedTrades := opPs.completedTrades
      : OpponentView
    }
  -- Shared view: hide deck contents (only show size), keep discard visible
  let sharedView : SharedView := {
    deckSize := gs.shared.deck.length,
    discard := gs.shared.discard,
    boardStates := gs.shared.boardStates,
    boardEdges := gs.shared.boardEdges,
    currentBoardState := gs.shared.currentBoardState,
    placedLocations := gs.shared.placedLocations,
    extra := gs.shared.extra
  }
  {
    gameId := gs.gameId,
    round := gs.round,
    turnNumber := gs.turnNumber,
    currentPlayer := gs.currentPlayer,
    myState := myView,
    opponents := opponents,
    shared := sharedView
  }

end Visibility

/-! ## Mechanic Router -/

/-- Route a validation call through all enabled mechanics.
    Returns first failure, or valid if all pass. -/
def validateAction (gs : GameState) (pid : String) (action : GameAction) : ValidationResult :=
  -- Check it's the player's turn (unless out-of-turn action)
  if gs.currentPlayer != pid && action.actionType != "pass" then
    { valid := false, error := some s!"Not {pid}'s turn (current: {gs.currentPlayer})" }
  else
    -- Check if player is blocked by an effect
    let ps := gs.getPlayer pid
    if Effects.isBlocked ps && action.actionType != "pass" then
      { valid := false, error := some s!"{pid} is blocked and cannot act this turn. Pass instead." }
    else
      let checks := [
        ActionPoints.validate gs pid action,
        Resources.validate gs pid action,
        Cards.validate gs pid action,
        Board.validate gs pid action,
        PlaceLocation.validate gs pid action,
        Trade.validate gs pid action
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
      PlaceLocation.execute gs pid action,
      Cards.execute gs pid action,
      Board.execute gs pid action,
      Resources.execute gs pid action,
      Trade.execute gs pid action,
      Score.execute gs pid action
    ]
    let results := handlers.filterMap fun x => x
    match results.head? with
    | none =>
      { success := false, error := some s!"No mechanic handled action type '{action.actionType}'" }
    | some (gs', execResult) =>
      -- Post-execute hooks: deduct action points
      let gs'' := ActionPoints.postExecute gs' pid action
      -- Check if turn should auto-end (0 AP remaining)
      let autoEnd := ActionPoints.shouldAutoEndTurn gs'' pid
      let execResult' := if autoEnd then { execResult with advanceTurn := true } else execResult
      { success := true,
        execution := some execResult',
        state := some gs'' }

/-- Get all available actions for a player. -/
def getAvailableActions (gs : GameState) (pid : String) : List AvailableAction :=
  -- If player is blocked, only pass is available
  let ps := gs.getPlayer pid
  if Effects.isBlocked ps then
    Pass.getAvailableActions gs pid
  else
    let cardActions := Cards.getAvailableActions gs pid
    let boardActions := Board.getAvailableActions gs pid
    let placeActions := PlaceLocation.getAvailableActions gs pid
    let resourceActions := if gs.isMechanicEnabled "resources" then Resources.getAvailableActions gs pid else []
    let tradeActions := Trade.getAvailableActions gs pid
    let passActions := Pass.getAvailableActions gs pid
    -- Filter by action points cost if AP mechanic is enabled
    let allActions := cardActions ++ boardActions ++ placeActions ++ resourceActions ++ tradeActions ++ passActions
    if gs.isMechanicEnabled "action_points" || gs.isMechanicEnabled "action-points" then
      let ps := gs.getPlayer pid
      match ps.actionPoints with
      | some ap =>
        allActions.filter fun a =>
          let cost := getActionCost gs a.action.actionType
          ap ≥ cost
      | none => allActions
    else allActions

/-- Check win conditions for a player. -/
def checkWin (gs : GameState) (pid : String) (_trigger : String) : WinCheckResult :=
  WinConditions.checkAll gs pid

/-- Handle turn start lifecycle: refresh AP, tick effects. -/
def onTurnStart (gs : GameState) (pid : String) (_isNewRound : Bool) : GameState :=
  -- Tick effects for the player whose turn is starting
  let gs' := gs.modifyPlayer pid fun ps =>
    let (ps', _expired) := Effects.tickEffects ps
    ps'
  -- Refresh action points
  ActionPoints.onTurnStart gs' pid

/-- Handle turn end lifecycle: tick effects for ending player. -/
def onTurnEnd (gs : GameState) (pid : String) (_nextPid : String) (_isRoundEnd : Bool) : GameState :=
  -- Currently effects are ticked on turn start. Turn end is a hook point
  -- for future mechanics (income, upkeep, etc.)
  gs.modifyPlayer pid fun ps => ps

/-- Helper: expand board edge config where from/to can be arrays.
    Input: { from: ["A","B"], to: ["X","Y"] } → [(A,X),(A,Y),(B,X),(B,Y)] -/
private def expandBoardEdges (edgesJson : Json) : List (String × String) :=
  match edgesJson with
  | Json.arr edges => edges.toList.foldl (init := []) fun acc e =>
      let froms : List String := match e.getObjVal? "from" with
        | .ok (Json.str s) => [s]
        | .ok (Json.arr arr) => arr.toList.filterMap (·.getStr?.toOption)
        | _ => []
      let tos : List String := match e.getObjVal? "to" with
        | .ok (Json.str s) => [s]
        | .ok (Json.arr arr) => arr.toList.filterMap (·.getStr?.toOption)
        | _ => []
      acc ++ (froms.foldl (init := []) fun inner f =>
        inner ++ tos.map fun t => (f, t))
  | _ => []

/-- Parse card definitions from config, preserving extra fields (effect, etc.). -/
private def parseCards (cardsJson : Json) : List Card :=
  match cardsJson with
  | Json.arr cards => cards.toList.foldl (init := []) fun acc cardJson =>
      match (cardJson.getObjValAs? String "name").toOption with
      | none => acc
      | some name =>
        let ctype := (cardJson.getObjValAs? String "type" <|> pure "").toOption |>.getD ""
        let count := (cardJson.getObjVal? "count" |>.toOption |>.bind (·.getNat?.toOption)).getD 1
        let suit := cardJson.getObjVal? "suit" |>.toOption |>.bind (·.getStr?.toOption)
        let value := cardJson.getObjVal? "value" |>.toOption |>.bind (·.getNat?.toOption)
        let subtype := cardJson.getObjVal? "subtype" |>.toOption |>.bind (·.getStr?.toOption)
        -- Preserve all extra fields (effect, placeable, targetMode, terrain, etc.)
        let knownFields : List String := ["name", "type", "count", "suit", "value", "subtype"]
        let extra : Lean.RBMap String Json compare := match cardJson with
          | Json.obj kvs =>
            kvs.toArray.foldl (init := .empty) fun m ⟨k, v⟩ =>
              if !knownFields.contains k then m.insert k v else m
          | _ => .empty
        acc ++ List.replicate count { name, cardType := ctype, suit, value, subtype, extra : Card }
  | _ => []

/-- Initialize game state from config. -/
def initState (config : GameConfig) (playerIds : List String) : GameState :=
  -- Parse cards from config
  let deck : List Card := match config.engineMechanics.find? "cards" with
    | some cfg =>
      match cfg.getObjVal? "deck" with
      | .ok deckJson => parseCards deckJson
      | _ => []
    | none => []
  -- Starting hand size
  let startingHand := match config.engineMechanics.find? "cards" with
    | some cfg => (cfg.getObjVal? "starting_hand" |>.toOption |>.bind (·.getNat?.toOption)).getD 0
    | none => 0
  -- Board states
  let boardStates := match config.engineMechanics.find? "board" with
    | some cfg =>
      match cfg.getObjVal? "states" with
      | .ok (Json.arr states) => states.toList.filterMap (·.getStr?.toOption)
      | _ => []
    | none => []
  -- Board edges (with array expansion)
  let boardEdges := match config.engineMechanics.find? "board" with
    | some cfg =>
      match cfg.getObjVal? "edges" with
      | .ok edgesJson => expandBoardEdges edgesJson
      | _ => []
    | none => []
  -- Board start state
  let boardStart := match config.engineMechanics.find? "board" with
    | some cfg =>
      (cfg.getObjVal? "start" |>.toOption |>.bind (·.getStr?.toOption))
      |>.orElse fun _ => boardStates.head?
    | none => boardStates.head?
  -- Grid starting tile
  let gridStart := match config.engineMechanics.find? "grid" with
    | some cfg => (cfg.getObjVal? "starting_tile" |>.toOption |>.bind (·.getStr?.toOption))
    | none => none
  -- Determine starting state for players
  let startState := (boardStart.orElse fun _ => gridStart).getD "start"
  -- Starting score
  let startingScore := match config.engineMechanics.find? "starting_score" with
    | some cfg => cfg.getNat?.toOption
    | none => none
  -- Deal cards to players
  let (playerMap, remainingDeck) := playerIds.foldl (init := (Lean.RBMap.empty, deck))
    fun (players, currentDeck) pid =>
      let hand := currentDeck.take startingHand
      let rest := currentDeck.drop startingHand
      let resources := match config.engineMechanics.find? "resources" with
        | some (Json.arr resList) =>
          resList.toList.foldl (init := Lean.RBMap.empty) fun m resJson =>
            let name := (resJson.getObjValAs? String "name" |>.toOption).getD ""
            let starting := (resJson.getObjVal? "starting" |>.toOption |>.bind (·.getNat?.toOption)).getD 0
            if name.isEmpty then m else m.insert name starting
        | _ => .empty
      let ps : PlayerState := {
        state := startState,
        hand := hand,
        resources := resources,
        score := startingScore
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
      currentBoardState := boardStart
    }
  }

end Playtest.Engine.Mechanics
