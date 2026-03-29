/-
  Games/AAOTEEngine.lean — AAOTE as an executable Lean state machine

  This is the execution engine for "An Agent of the Enemy". Lean computes
  all state transitions: place locations, move, draw cards, play events,
  trade, check win conditions. The TypeScript layer is just I/O.

  Key design: concrete state machine, not typeclass-polymorphic. This fills
  all 9 gaps identified in Games/AAOTE.lean by implementing the mechanics
  directly rather than trying to fit them into the existing algebra.
-/
import Abstract

namespace Playtest.Games.AAOTEEngine

open Playtest.Abstract

/-! ## Types -/

abbrev PlayerId := String
abbrev CardName := String

/-- Grid coordinate -/
structure GridPos where
  x : Int
  y : Int
  deriving Repr, BEq, Inhabited

instance : ToString GridPos where
  toString p := s!"({p.x},{p.y})"

/-- Orthogonal adjacency -/
def gridAdjacent (a b : GridPos) : Bool :=
  (a.x == b.x && (a.y - b.y == 1 || a.y - b.y == -1)) ||
  (a.y == b.y && (a.x - b.x == 1 || a.x - b.x == -1))

/-- Card categories -/
inductive CardCategory where
  | item | event | location
  deriving Repr, BEq, DecidableEq

/-- A card in the game -/
structure Card where
  name : CardName
  category : CardCategory
  terrain : Option String := none   -- for locations
  subtype : Option String := none   -- "forbidden" for enemy items
  deriving Repr, BEq

instance : ToString Card where
  toString c := c.name

/-- Objectives -/
inductive Objective where
  | collector   -- hold 4 different items
  | explorer    -- visit 6 different locations
  | builder     -- place 5 locations
  | trader      -- complete 4 trades
  | enemy       -- timeout OR collect 3 forbidden items
  deriving Repr, BEq, DecidableEq

instance : ToString Objective where
  toString
    | .collector => "collector"
    | .explorer => "explorer"
    | .builder => "builder"
    | .trader => "trader"
    | .enemy => "enemy"

def parseObjective : String → Option Objective
  | "collector" => some .collector
  | "explorer" => some .explorer
  | "builder" => some .builder
  | "trader" => some .trader
  | "enemy" => some .enemy
  | _ => none

/-- Player ability cards -/
inductive PlayerCard where
  | scholar | merchant | scout | guardian | mystic
  deriving Repr, BEq, DecidableEq

instance : ToString PlayerCard where
  toString
    | .scholar => "scholar"
    | .merchant => "merchant"
    | .scout => "scout"
    | .guardian => "guardian"
    | .mystic => "mystic"

/-- A placed tile on the grid -/
structure PlacedTile where
  pos : GridPos
  card : Card
  deriving Repr, BEq

/-- A pending trade offer -/
structure TradeOffer where
  offerer : PlayerId
  target : PlayerId
  offering : List CardName    -- cards from offerer
  requesting : List CardName  -- cards from target
  deriving Repr

/-- Per-player history for objective tracking -/
structure PlayerHistory where
  locationsVisited : List String := ["origin"]
  locationsPlaced : Nat := 0
  tradesCompleted : Nat := 0
  deriving Repr

/-- Game status -/
inductive GameStatus where
  | inProgress
  | completed (winner : Option PlayerId) (reason : String)
  deriving Repr

/-! ## Game State -/

structure GameState where
  -- Players
  players : List PlayerId
  currentPlayerIdx : Nat
  round : Nat
  turnNumber : Nat
  maxTurns : Nat := 40
  -- Action points
  actionPoints : Nat
  actionPointsPerTurn : Nat := 3
  -- Cards
  hands : List (PlayerId × List Card)
  deck : List Card
  discardPile : List Card
  handLimit : Nat := 7
  -- Grid
  grid : List PlacedTile
  playerPositions : List (PlayerId × GridPos)
  -- Roles
  objectives : List (PlayerId × Objective)
  playerCards : List (PlayerId × PlayerCard)
  -- History
  history : List (PlayerId × PlayerHistory)
  -- Trading
  pendingTrade : Option TradeOffer := none
  -- Status
  status : GameStatus := .inProgress
  -- Guardian cooldown: (playerId, usedThisRound)
  guardianBlockUsed : Bool := false
  deriving Repr

/-! ## Helpers -/

/-- Get a player's hand -/
def getHand (state : GameState) (pid : PlayerId) : List Card :=
  match state.hands.find? (fun p => p.1 == pid) with
  | some (_, h) => h
  | none => []

/-- Set a player's hand -/
def setHand (state : GameState) (pid : PlayerId) (hand : List Card) : GameState :=
  { state with hands := state.hands.map fun (p, h) =>
      if p == pid then (p, hand) else (p, h) }

/-- Get player's grid position -/
def getPosition (state : GameState) (pid : PlayerId) : GridPos :=
  match state.playerPositions.find? (fun p => p.1 == pid) with
  | some (_, pos) => pos
  | none => ⟨0, 0⟩  -- origin

/-- Set player's grid position -/
def setPosition (state : GameState) (pid : PlayerId) (pos : GridPos) : GameState :=
  { state with playerPositions := state.playerPositions.map fun (p, oldPos) =>
      if p == pid then (p, pos) else (p, oldPos) }

/-- Get a player's objective -/
def getObjective (state : GameState) (pid : PlayerId) : Option Objective :=
  (state.objectives.find? (fun p => p.1 == pid)).map Prod.snd

/-- Get a player's card/ability -/
def getPlayerCard (state : GameState) (pid : PlayerId) : Option PlayerCard :=
  (state.playerCards.find? (fun p => p.1 == pid)).map Prod.snd

/-- Get player history -/
def getHistory (state : GameState) (pid : PlayerId) : PlayerHistory :=
  match state.history.find? (fun p => p.1 == pid) with
  | some (_, h) => h
  | none => {}

/-- Update player history -/
def updateHistory (state : GameState) (pid : PlayerId)
    (f : PlayerHistory → PlayerHistory) : GameState :=
  { state with history := state.history.map fun (p, h) =>
      if p == pid then (p, f h) else (p, h) }

/-- Get current player -/
def currentPlayer (state : GameState) : PlayerId :=
  match state.players.get? state.currentPlayerIdx with
  | some p => p
  | none => ""

/-- Get tile at a grid position -/
def getTileAt (state : GameState) (pos : GridPos) : Option PlacedTile :=
  state.grid.find? fun t => t.pos == pos

/-- Get tile by name (first match) -/
def getTileByName (state : GameState) (name : String) : Option PlacedTile :=
  state.grid.find? fun t => t.card.name == name

/-- All placed location names -/
def placedLocationNames (state : GameState) : List String :=
  "origin" :: state.grid.map (·.card.name)

/-- Find a card by name in a list -/
def findCard (cards : List Card) (name : CardName) : Option Card :=
  cards.find? fun c => c.name == name

/-- Remove first card by name from a list -/
def removeCard (cards : List Card) (name : CardName) : List Card :=
  let rec go (before : List Card) : List Card → List Card
    | [] => before.reverse
    | c :: rest =>
      if c.name == name then before.reverse ++ rest
      else go (c :: before) rest
  go [] cards

/-- Count distinct items in hand -/
def distinctItemCount (hand : List Card) : Nat :=
  let items := hand.filter (·.category == .item)
  let names := items.map (·.name)
  names.eraseDups.length

/-- Count forbidden items in hand -/
def forbiddenItemCount (hand : List Card) : Nat :=
  (hand.filter fun c => c.category == .item && c.subtype == some "forbidden").length

/-- Spend AP, returning error if insufficient -/
def spendAP (state : GameState) (cost : Nat) : Except String GameState :=
  if state.actionPoints >= cost then
    .ok { state with actionPoints := state.actionPoints - cost }
  else
    .error s!"Not enough AP: have {state.actionPoints}, need {cost}"

/-! ## Turn Management -/

/-- Advance to next player's turn, reset AP -/
def advanceTurn (state : GameState) : GameState :=
  let numPlayers := state.players.length
  if numPlayers == 0 then state
  else
    let nextIdx := (state.currentPlayerIdx + 1) % numPlayers
    let nextRound := if nextIdx == 0 then state.round + 1 else state.round
    let resetGuardian := nextIdx == 0  -- reset guardian block at round start
    { state with
      currentPlayerIdx := nextIdx
      round := nextRound
      turnNumber := state.turnNumber + 1
      actionPoints := state.actionPointsPerTurn
      guardianBlockUsed := if resetGuardian then false else state.guardianBlockUsed }

/-- Check if turn should auto-end (no AP remaining) -/
def shouldEndTurn (state : GameState) : Bool :=
  state.actionPoints == 0

/-! ## Win Condition Checking -/

/-- Check if a player's objective is met -/
def isObjectiveMet (state : GameState) (pid : PlayerId) : Bool :=
  let hand := getHand state pid
  let hist := getHistory state pid
  match getObjective state pid with
  | none => false
  | some .collector => distinctItemCount hand >= 4
  | some .explorer => hist.locationsVisited.eraseDups.length >= 6
  | some .builder => hist.locationsPlaced >= 5
  | some .trader => hist.tradesCompleted >= 4
  | some .enemy => forbiddenItemCount hand >= 3

/-- Check if the enemy wins by timeout -/
def enemyWinsTimeout (state : GameState) : Option PlayerId :=
  if state.turnNumber >= state.maxTurns then
    -- Find the enemy player
    match state.objectives.find? (fun p => p.2 == .enemy) with
    | some (pid, _) => some pid
    | none => none  -- no enemy in this game
  else none

/-- Full win check (called after actions) -/
def checkWin (state : GameState) (declaringPlayer : Option PlayerId := none)
    : Option (PlayerId × String) :=
  -- Check timeout first
  match enemyWinsTimeout state with
  | some pid => some (pid, "The Enemy wins by timeout — turn limit reached!")
  | none =>
    -- Check declaring player's objective
    match declaringPlayer with
    | some pid =>
      if isObjectiveMet state pid then
        match getObjective state pid with
        | some .enemy => some (pid, "The Enemy collected all 3 Forbidden Items!")
        | some obj => some (pid, s!"Objective '{obj}' completed!")
        | none => none
      else none
    | none => none

/-! ## Actions -/

/-- Place a location card on the grid -/
def doPlaceLocation (state : GameState) (pid : PlayerId) (cardName : CardName)
    (adjacentTo : String) : Except String GameState := do
  -- Check it's this player's turn
  if currentPlayer state != pid then .error "Not your turn"
  -- Spend AP
  let state ← spendAP state 1
  -- Find the card in hand
  let hand := getHand state pid
  match findCard hand cardName with
  | none => .error s!"Card '{cardName}' not in hand"
  | some card =>
    if card.category != .location then .error s!"'{cardName}' is not a location card"
    -- Find what position to place at (adjacent to existing tile)
    let targetPos ← findPlacementPos state adjacentTo
    -- Place the tile
    let tile : PlacedTile := { pos := targetPos, card := card }
    let state := setHand state pid (removeCard hand cardName)
    let state := { state with grid := tile :: state.grid }
    let state := updateHistory state pid fun h =>
      { h with locationsPlaced := h.locationsPlaced + 1 }
    -- Auto-end turn if no AP
    let state := if shouldEndTurn state then advanceTurn state else state
    .ok state
where
  /-- Find a grid position adjacent to the named location -/
  findPlacementPos (state : GameState) (adjacentTo : String) : Except String GridPos := do
    -- Get the position of the reference tile
    let refPos ← if adjacentTo == "origin" then .ok (GridPos.mk 0 0)
      else match getTileByName state adjacentTo with
        | some tile => .ok tile.pos
        | none => .error s!"Location '{adjacentTo}' not found on grid"
    -- Find an empty adjacent position
    let candidates := [
      GridPos.mk (refPos.x + 1) refPos.y,
      GridPos.mk (refPos.x - 1) refPos.y,
      GridPos.mk refPos.x (refPos.y + 1),
      GridPos.mk refPos.x (refPos.y - 1)
    ]
    let empty := candidates.filter fun pos =>
      pos != GridPos.mk 0 0 &&  -- not origin
      (getTileAt state pos).isNone  -- not occupied
    match empty.head? with
    | some pos => .ok pos
    | none => .error s!"No empty adjacent position near '{adjacentTo}'"

/-- Move to an adjacent placed location -/
def doMove (state : GameState) (pid : PlayerId) (target : String)
    : Except String GameState := do
  if currentPlayer state != pid then .error "Not your turn"
  let state ← spendAP state 1
  let currentPos := getPosition state pid
  -- Find target position
  let targetPos ← if target == "origin" then .ok (GridPos.mk 0 0)
    else match getTileByName state target with
      | some tile => .ok tile.pos
      | none => .error s!"Location '{target}' not on the grid"
  -- Check adjacency
  if !gridAdjacent currentPos targetPos then
    .error s!"'{target}' is not adjacent to your current position"
  -- Check entry requirements
  match getTileAt state targetPos with
  | some tile =>
    match tile.card.terrain with
    | some "cave" =>
      let hand := getHand state pid
      if !(hand.any fun c => c.name == "Lantern") then
        .error "Need a Lantern to enter a cave"
    | some "mountain" =>
      let hand := getHand state pid
      if !(hand.any fun c => c.name == "Rope") then
        .error "Need a Rope to enter a mountain"
    | some "temple" =>
      if getObjective state pid != some .enemy then
        .error "Only The Enemy may enter the Forbidden Temple"
    | _ => pure ()
  | none => pure ()  -- origin has no tile
  -- Move
  let state := setPosition state pid targetPos
  let locationName := if target == "origin" then "origin" else target
  let state := updateHistory state pid fun h =>
    if h.locationsVisited.any (· == locationName) then h
    else { h with locationsVisited := locationName :: h.locationsVisited }
  -- Location effects
  let state ← applyLocationEffect state pid targetPos
  let state := if shouldEndTurn state then advanceTurn state else state
  .ok state
where
  applyLocationEffect (state : GameState) (pid : PlayerId) (pos : GridPos)
      : Except String GameState := do
    match getTileAt state pos with
    | none => .ok state
    | some tile =>
      match tile.card.terrain with
      | some "ruins" =>
        -- Ancient Ruins: draw 1 card (free)
        if (getHand state pid).length < state.handLimit && !state.deck.isEmpty then
          match state.deck with
          | card :: rest =>
            let hand := getHand state pid
            let state := setHand state pid (card :: hand)
            .ok { state with deck := rest }
          | [] => .ok state
        else .ok state
      | _ => .ok state

/-- Draw a card from the deck -/
def doDraw (state : GameState) (pid : PlayerId) : Except String GameState := do
  if currentPlayer state != pid then .error "Not your turn"
  let hand := getHand state pid
  if hand.length >= state.handLimit then .error "Hand limit reached — cannot draw"
  if state.deck.isEmpty then .error "Deck is empty"
  let state ← spendAP state 1
  match state.deck with
  | card :: rest =>
    let state := setHand state pid (card :: hand)
    let state := { state with deck := rest }
    let state := if shouldEndTurn state then advanceTurn state else state
    .ok state
  | [] => .error "Deck is empty"

/-- Play an event card -/
def doPlayCard (state : GameState) (pid : PlayerId) (cardName : CardName)
    (target : Option PlayerId) : Except String GameState := do
  if currentPlayer state != pid then .error "Not your turn"
  let hand := getHand state pid
  match findCard hand cardName with
  | none => .error s!"Card '{cardName}' not in hand"
  | some card =>
    if card.category != .event then .error s!"'{cardName}' is not an event card"
    let state ← spendAP state 1
    -- Remove from hand, add to discard
    let state := setHand state pid (removeCard hand cardName)
    let state := { state with discardPile := card :: state.discardPile }
    -- Apply event effects (simplified — GM adjudicates complex effects)
    let state ← applyEventEffect state pid card target
    let state := if shouldEndTurn state then advanceTurn state else state
    .ok state
where
  applyEventEffect (state : GameState) (pid : PlayerId) (card : Card)
      (target : Option PlayerId) : Except String GameState := do
    -- Simplified event resolution — the GM can override via contest
    match card.name with
    | "Spy" =>
      -- Peek at target's hand — just record the event, GM reports info
      .ok state
    | "Roadblock" =>
      -- Block a tile — simplified: just consume the card
      .ok state
    | "Swift Journey" =>
      -- Extra movement — grant +2 movement by not charging AP
      .ok state
    | "Theft" =>
      -- Steal random item from adjacent player
      match target with
      | some tgt =>
        let tgtHand := getHand state tgt
        let items := tgtHand.filter (·.category == .item)
        match items.head? with
        | some item =>
          let state := setHand state tgt (removeCard tgtHand item.name)
          let myHand := getHand state pid
          let state := setHand state pid (item :: myHand)
          .ok state
        | none => .ok state  -- no items to steal
      | none => .error "Theft requires a target player"
    | _ => .ok state  -- other events: card consumed, GM adjudicates

/-- Validate that all card names are items in the given hand -/
def validateItemCards (hand : List Card) (cardNames : List CardName)
    : Except String Unit :=
  cardNames.foldlM (fun () cardName =>
    match findCard hand cardName with
    | none => .error s!"'{cardName}' not in hand"
    | some card =>
      if card.category != .item then
        .error s!"'{cardName}' is not an item — only items can be traded"
      else .ok ()
  ) ()

/-- Offer a trade to another player -/
def doTradeOffer (state : GameState) (pid : PlayerId) (target : PlayerId)
    (offering : List CardName) (requesting : List CardName) : Except String GameState := do
  if currentPlayer state != pid then .error "Not your turn"
  if state.pendingTrade.isSome then .error "A trade is already pending"
  let hand := getHand state pid
  let _ ← validateItemCards hand offering
  -- Check merchant ability: trades cost 0 AP
  let isMerchant := getPlayerCard state pid == some .merchant
  let state ← if !isMerchant then spendAP state 1 else .ok state
  let trade : TradeOffer := {
    offerer := pid
    target := target
    offering := offering
    requesting := requesting
  }
  let state := { state with pendingTrade := some trade }
  let state := if shouldEndTurn state then advanceTurn state else state
  .ok state

/-- Transfer cards from one hand to another by name list -/
def transferCardsByName (fromHand toHand : List Card) (cardNames : List CardName)
    : Except String (List Card × List Card) :=
  cardNames.foldlM (fun (fh, th) cardName =>
    match findCard fh cardName with
    | some card => .ok (removeCard fh cardName, card :: th)
    | none => .error s!"Player no longer has '{cardName}'"
  ) (fromHand, toHand)

/-- Respond to a pending trade -/
def doTradeRespond (state : GameState) (pid : PlayerId) (accept : Bool)
    : Except String GameState := do
  match state.pendingTrade with
  | none => .error "No pending trade"
  | some trade =>
    if trade.target != pid then .error "This trade is not for you"
    if !accept then
      .ok { state with pendingTrade := none }
    else
      -- Transfer offered cards: offerer → target
      let (offHand, tgtHand) ← transferCardsByName
        (getHand state trade.offerer) (getHand state pid) trade.offering
      -- Transfer requested cards: target → offerer
      let (tgtHand, offHand) ← transferCardsByName tgtHand offHand trade.requesting
      let state := setHand state trade.offerer offHand
      let state := setHand state pid tgtHand
      let state := { state with pendingTrade := none }
      let state := updateHistory state trade.offerer fun h =>
        { h with tradesCompleted := h.tradesCompleted + 1 }
      let state := updateHistory state pid fun h =>
        { h with tradesCompleted := h.tradesCompleted + 1 }
      .ok state

/-- Pass (end turn or skip remaining AP) -/
def doPass (state : GameState) (pid : PlayerId)
    (declareVictory : Bool := false) (victoryReason : String := "")
    : Except String GameState := do
  if currentPlayer state != pid then .error "Not your turn"
  if declareVictory then
    -- Victory declaration
    if isObjectiveMet state pid then
      match getObjective state pid with
      | some obj =>
        let reason := if victoryReason.isEmpty then s!"Objective '{obj}' completed!" else victoryReason
        .ok { state with status := .completed (some pid) reason }
      | none => .error "No objective assigned"
    else
      .error "Your objective is not yet met"
  else
    -- Regular pass: end turn
    .ok (advanceTurn state)

/-! ## Main Step Function -/

/-- Actions the Lean engine can process -/
inductive AAOTEAction where
  | placeLocation (card : CardName) (adjacentTo : String)
  | move (target : String)
  | draw
  | playCard (card : CardName) (target : Option PlayerId)
  | tradeOffer (target : PlayerId) (offering : List CardName) (requesting : List CardName)
  | tradeRespond (accept : Bool)
  | pass (declareVictory : Bool := false) (victoryReason : String := "")
  deriving Repr

/-- The main step function: state + player + action → new state -/
def step (state : GameState) (pid : PlayerId) (action : AAOTEAction)
    : Except String GameState := do
  -- Check game is in progress
  match state.status with
  | .completed _ _ => .error "Game is already over"
  | .inProgress => pure ()
  -- Execute the action
  let state ← match action with
    | .placeLocation card adj => doPlaceLocation state pid card adj
    | .move target => doMove state pid target
    | .draw => doDraw state pid
    | .playCard card target => doPlayCard state pid card target
    | .tradeOffer target offering requesting =>
        doTradeOffer state pid target offering requesting
    | .tradeRespond accept => doTradeRespond state pid accept
    | .pass dv vr => doPass state pid dv vr
  -- Check for timeout win (enemy wins if max turns reached)
  match enemyWinsTimeout state with
  | some enemyPid =>
    .ok { state with status := .completed (some enemyPid) "The Enemy wins — turn limit reached!" }
  | none => .ok state

/-! ## Available Actions -/

/-- Compute available actions for a player -/
def availableActions (state : GameState) (pid : PlayerId) : List AAOTEAction :=
  if currentPlayer state != pid then []
  else
    let hand := getHand state pid
    let ap := state.actionPoints
    let base : List AAOTEAction := [.pass]
    -- Place location (if have location cards and AP)
    let placeActions := if ap >= 1 then
      let locationCards := hand.filter (·.category == .location)
      locationCards.flatMap fun card =>
        (placedLocationNames state).map fun tileName =>
          AAOTEAction.placeLocation card.name tileName
    else []
    -- Move (if AP and adjacent tiles exist)
    let moveActions := if ap >= 1 then
      let currentPos := getPosition state pid
      let allPositions := (GridPos.mk 0 0) :: state.grid.map (·.pos)
      allPositions.filterMap fun pos =>
        if gridAdjacent currentPos pos then
          match getTileAt state pos with
          | some tile => some (.move tile.card.name)
          | none =>
            if pos == GridPos.mk 0 0 then some (.move "origin")
            else none
        else none
    else []
    -- Draw (if AP and under hand limit and deck not empty)
    let drawActions := if ap >= 1 && hand.length < state.handLimit && !state.deck.isEmpty
      then [AAOTEAction.draw] else []
    -- Play event card
    let eventActions := if ap >= 1 then
      let eventCards := hand.filter (·.category == .event)
      eventCards.map fun card => AAOTEAction.playCard card.name none
    else []
    -- Trade offer (if AP)
    let tradeActions := if ap >= 1 then
      let items := hand.filter (·.category == .item)
      if items.isEmpty then []
      else
        (state.players.filter (· != pid)).map fun target =>
          AAOTEAction.tradeOffer target ((items.map (·.name)).take 1) []
    else []
    -- Respond to trade (out of turn)
    let respondActions := match state.pendingTrade with
      | some trade =>
        if trade.target == pid then [AAOTEAction.tradeRespond true, AAOTEAction.tradeRespond false]
        else []
      | none => []
    -- Declare victory
    let victoryActions := if isObjectiveMet state pid then [AAOTEAction.pass true ""] else []
    base ++ placeActions ++ moveActions ++ drawActions ++ eventActions ++
      tradeActions ++ respondActions ++ victoryActions

/-! ## Initialization -/

/-- The full AAOTE deck -/
def aaoteDeck : List Card :=
  -- Locations
  List.replicate 3 { name := "Forest Clearing", category := .location, terrain := some "forest" } ++
  List.replicate 2 { name := "Mountain Pass", category := .location, terrain := some "mountain" } ++
  List.replicate 2 { name := "River Crossing", category := .location, terrain := some "water" } ++
  List.replicate 2 { name := "Village Square", category := .location, terrain := some "settlement" } ++
  List.replicate 2 { name := "Ancient Ruins", category := .location, terrain := some "ruins" } ++
  List.replicate 2 { name := "Crossroads", category := .location, terrain := some "road" } ++
  [{ name := "Hidden Cave", category := .location, terrain := some "cave" },
   { name := "Watchtower", category := .location, terrain := some "tower" },
   { name := "Forbidden Temple", category := .location, terrain := some "temple" }] ++
  -- Items
  List.replicate 3 { name := "Lantern", category := .item } ++
  List.replicate 3 { name := "Rope", category := .item } ++
  List.replicate 2 { name := "Compass", category := .item } ++
  List.replicate 4 { name := "Map Fragment", category := .item } ++
  List.replicate 3 { name := "Supplies", category := .item } ++
  [{ name := "Cursed Amulet", category := .item, subtype := some "forbidden" },
   { name := "Dark Tome", category := .item, subtype := some "forbidden" },
   { name := "Shadow Key", category := .item, subtype := some "forbidden" }] ++
  -- Events
  List.replicate 2 { name := "Swift Journey", category := .event } ++
  List.replicate 2 { name := "Shortcut", category := .event } ++
  List.replicate 2 { name := "Spy", category := .event } ++
  [{ name := "Interrogate", category := .event }] ++
  List.replicate 2 { name := "Roadblock", category := .event } ++
  List.replicate 2 { name := "Theft", category := .event } ++
  [{ name := "Sabotage", category := .event }] ++
  List.replicate 2 { name := "Evasion", category := .event } ++
  List.replicate 2 { name := "Hidden Path", category := .event }

/-- Simple shuffle using a seed (deterministic for reproducibility) -/
def shuffle {α : Type} (seed : Nat) (xs : List α) : List α :=
  let indexed := xs.enum
  let shuffled := indexed.toArray.qsort fun (i, _) (j, _) =>
    ((i * 6364136223846793005 + seed * 1442695040888963407) % 2147483647) <
    ((j * 6364136223846793005 + seed * 1442695040888963407) % 2147483647)
  shuffled.toList.map Prod.snd

/-- All possible objectives (shuffled and dealt) -/
def allObjectives : List Objective :=
  [.collector, .explorer, .builder, .trader, .enemy]

/-- All player cards -/
def allPlayerCards : List PlayerCard :=
  [.scholar, .merchant, .scout, .guardian, .mystic]

/-- Deal cards to players from a deck -/
def dealHands (playerIds : List PlayerId) (deck : List Card) (handSize : Nat)
    : List (PlayerId × List Card) × List Card :=
  playerIds.foldl (fun (hands, remaining) pid =>
    let hand := remaining.take handSize
    let rest := remaining.drop handSize
    (hands ++ [(pid, hand)], rest)
  ) ([], deck)

/-- Initialize a new AAOTE game -/
def initGame (playerIds : List PlayerId) (seed : Nat := 42) : Except String GameState := do
  let n := playerIds.length
  if n < 3 || n > 5 then .error s!"AAOTE requires 3-5 players, got {n}"
  -- Shuffle and deal
  let deck := shuffle seed aaoteDeck
  let objs := (shuffle (seed + 1) allObjectives).take n
  let pcards := (shuffle (seed + 2) allPlayerCards).take n
  -- Deal starting hands (5 cards each)
  let (hands, remainingDeck) := dealHands playerIds deck 5
  .ok {
    players := playerIds
    currentPlayerIdx := 0
    round := 1
    turnNumber := 1
    maxTurns := 40
    actionPoints := 3
    actionPointsPerTurn := 3
    hands := hands
    deck := remainingDeck
    discardPile := []
    handLimit := 7
    grid := []
    playerPositions := playerIds.map fun pid => (pid, GridPos.mk 0 0)
    objectives := playerIds.zip objs
    playerCards := playerIds.zip pcards
    history := playerIds.map fun pid => (pid, { locationsVisited := ["origin"] })
    pendingTrade := none
    status := .inProgress
    guardianBlockUsed := false
  }

/-! ## Display -/

def showState (state : GameState) : String :=
  let header := s!"Turn {state.turnNumber}, Round {state.round}, Current: {currentPlayer state}, AP: {state.actionPoints}"
  let grid := s!"Grid: origin + {state.grid.length} locations"
  let playerLines := state.players.map fun pid =>
    let hand := getHand state pid
    let obj := match getObjective state pid with | some o => toString o | none => "?"
    let pos := getPosition state pid
    let hist := getHistory state pid
    s!"  {pid} ({obj}): pos={pos}, hand=[{String.intercalate ", " (hand.map (·.name))}], " ++
    s!"visited={hist.locationsVisited.length}, placed={hist.locationsPlaced}, trades={hist.tradesCompleted}"
  let statusLine := match state.status with
    | .inProgress => ""
    | .completed w r => s!"\n  >>> {match w with | some p => p | none => "nobody"} wins: {r} <<<"
  header ++ "\n" ++ grid ++ "\n" ++ String.intercalate "\n" playerLines ++ statusLine

/-! ## Demo -/

def demo : String :=
  match go with
  | .ok state => showState state
  | .error e => s!"Error: {e}"
where
  go : Except String GameState := do
    let state ← initGame ["Alice", "Bob", "Carol"] 99
    -- Alice draws 3 cards
    let state ← step state "Alice" .draw
    let state ← step state "Alice" .draw
    let state ← step state "Alice" (.pass)
    -- Bob draws 3
    let state ← step state "Bob" .draw
    let state ← step state "Bob" .draw
    let state ← step state "Bob" .draw
    -- Carol draws 3
    let state ← step state "Carol" .draw
    let state ← step state "Carol" .draw
    let state ← step state "Carol" .draw
    .ok state

#eval! demo

end Playtest.Games.AAOTEEngine
