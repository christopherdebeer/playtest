/-
  Engine/GameState.lean — Concrete game state for the Lean engine.

  This is the concrete type `G` that instantiates all our abstract typeclasses.
  It mirrors the TypeScript `GameState` / `PlayerState` from src/types/game.ts,
  but only the fields relevant to mechanic execution.

  The TypeScript CLI owns the full state (agent IDs, log paths, etc.).
  The Lean engine owns the game-logic state (resources, cards, board, turns).
-/

import Lean.Data.Json

namespace Playtest.Engine

open Lean (Json ToJson FromJson)

/-! ## Card -/

structure Card where
  name : String
  cardType : String := ""
  id : Option String := none
  suit : Option String := none
  value : Option Nat := none
  subtype : Option String := none
  -- Extensible: game-specific card data (e.g., effect, terrain) as raw JSON
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-! ## Effect -/

structure Effect where
  effectType : String
  value : Option Int := none
  duration : Nat := 0
  source : Option String := none
  deriving Repr, BEq, Inhabited

/-! ## Player State -/

structure PlayerState where
  state : String := "active"
  hand : List Card := []
  effects : List Effect := []
  score : Option Nat := none
  resources : Lean.RBMap String Nat compare := .empty
  actionPoints : Option Nat := none
  actionPointsUsed : Option Nat := none
  visitedLocations : List String := []
  placedLocationCount : Option Nat := none
  completedTrades : Option Nat := none
  currentBid : Option Nat := none
  -- Tableau: persistent played cards (for tableau-building, set-collection, workers)
  tableau : List Card := []
  -- Last dice roll result (for dice-rolling games)
  diceResult : List Nat := []
  -- Extensible: additional fields stored as raw JSON
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-! ## Shared State -/

/-- Shared game state visible to all players.
    Board positions, deck, discard pile, market, etc. -/
structure SharedState where
  deck : List Card := []
  discard : List Card := []
  boardStates : List String := []
  boardEdges : List (String × String) := []
  currentBoardState : Option String := none
  placedLocations : List String := []
  -- Market: shared display of cards available for purchase/drafting
  market : List Card := []
  -- Extensible: game-specific shared state as raw JSON
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-! ## Game Config -/

structure MechanicConfig where
  slug : String
  config : Json := Json.null
  deriving Inhabited

structure GameConfig where
  name : String := ""
  maxRounds : Option Nat := none
  maxTurns : Option Nat := none
  mechanics : List String := []
  -- Per-mechanic configuration stored as raw JSON
  engineMechanics : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-! ## Game State -/

/-- The concrete game state that the Lean engine operates on.
    This is the `G` that instantiates all abstract typeclasses. -/
structure GameState where
  gameId : String := ""
  gameName : String := ""
  config : GameConfig := {}
  players : Lean.RBMap String PlayerState compare := .empty
  turnOrder : List String := []
  currentPlayer : String := ""
  round : Nat := 1
  turnNumber : Nat := 1
  status : String := "in_progress"
  shared : SharedState := {}
  deriving Inhabited

/-! ## Game Action -/

/-- Actions that players can take. Mirrors TypeScript GameAction.
    Uses a base type + JSON payload for extensibility. -/
structure GameAction where
  actionType : String
  card : Option String := none
  target : Option String := none
  resource : Option String := none
  amount : Option Nat := none
  adjacentTo : Option String := none
  -- Extensible fields as raw JSON
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-! ## Engine Command Protocol -/

/-- Commands that the TypeScript CLI sends to the Lean engine. -/
inductive EngineCommand where
  | validateAction (state : GameState) (playerId : String) (action : GameAction)
  | executeAction (state : GameState) (playerId : String) (action : GameAction)
  | getAvailableActions (state : GameState) (playerId : String)
  | checkWin (state : GameState) (playerId : String) (trigger : String)
  | initState (config : GameConfig) (playerIds : List String)
  | turnStart (state : GameState) (playerId : String) (isNewRound : Bool)
  | turnEnd (state : GameState) (playerId : String) (nextPlayerId : String) (isRoundEnd : Bool)
  | getPlayerView (state : GameState) (playerId : String)

/-! ## Player View (visibility-filtered state) -/

/-- What an opponent looks like to the viewing player. -/
structure OpponentView where
  playerId : String
  state : String := "active"
  handSize : Nat := 0
  effects : List Effect := []
  score : Option Nat := none
  resources : Lean.RBMap String Nat compare := .empty
  placedLocationCount : Option Nat := none
  completedTrades : Option Nat := none
  tableau : List Card := []
  deriving Inhabited

/-- The viewing player's own state (full visibility). -/
structure MyStateView where
  state : String := "active"
  hand : List Card := []
  effects : List Effect := []
  score : Option Nat := none
  resources : Lean.RBMap String Nat compare := .empty
  actionPoints : Option Nat := none
  actionPointsUsed : Option Nat := none
  visitedLocations : List String := []
  placedLocationCount : Option Nat := none
  completedTrades : Option Nat := none
  tableau : List Card := []
  diceResult : List Nat := []
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-- Visibility-filtered shared state (hides deck contents). -/
structure SharedView where
  deckSize : Nat := 0
  discard : List Card := []
  boardStates : List String := []
  boardEdges : List (String × String) := []
  currentBoardState : Option String := none
  placedLocations : List String := []
  market : List Card := []
  extra : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-- Complete player view — what a specific player can see. -/
structure PlayerViewResult where
  gameId : String := ""
  round : Nat := 1
  turnNumber : Nat := 1
  currentPlayer : String := ""
  myState : MyStateView := {}
  opponents : List OpponentView := []
  shared : SharedView := {}
  deriving Inhabited

/-- State changes returned by the engine. Matches TypeScript StateChanges. -/
structure StateChanges where
  playerStateChanges : Lean.RBMap String (Lean.RBMap String Json compare) compare := .empty
  sharedStateChanges : Lean.RBMap String Json compare := .empty
  deriving Inhabited

/-- Result of an action execution. -/
structure ExecutionResult where
  handled : Bool := false
  stateChanges : StateChanges := {}
  advanceTurn : Bool := false
  checkWin : Bool := false
  logMessage : Option String := none
  deriving Inhabited

/-- Result of a validation check. -/
structure ValidationResult where
  valid : Bool := true
  error : Option String := none
  deriving Inhabited

/-- Available action descriptor. -/
structure AvailableAction where
  action : GameAction
  priority : Option Nat := none
  category : Option String := none
  enabled : Bool := true
  reason : Option String := none
  deriving Inhabited

/-- Win check result. -/
structure WinCheckResult where
  won : Bool := false
  reason : Option String := none
  deriving Inhabited

/-- Full engine response. -/
structure EngineResponse where
  success : Bool := true
  error : Option String := none
  validation : Option ValidationResult := none
  execution : Option ExecutionResult := none
  availableActions : Option (List AvailableAction) := none
  winResult : Option WinCheckResult := none
  state : Option GameState := none
  playerView : Option PlayerViewResult := none
  deriving Inhabited

/-! ## Helper accessors -/

def GameState.getPlayer (gs : GameState) (pid : String) : PlayerState :=
  gs.players.findD pid {}

def GameState.setPlayer (gs : GameState) (pid : String) (ps : PlayerState) : GameState :=
  { gs with players := gs.players.insert pid ps }

def GameState.modifyPlayer (gs : GameState) (pid : String) (f : PlayerState → PlayerState) : GameState :=
  gs.setPlayer pid (f (gs.getPlayer pid))

def PlayerState.getResource (ps : PlayerState) (name : String) : Nat :=
  ps.resources.findD name 0

def PlayerState.setResource (ps : PlayerState) (name : String) (amount : Nat) : PlayerState :=
  { ps with resources := ps.resources.insert name amount }

def PlayerState.modifyResource (ps : PlayerState) (name : String) (f : Nat → Nat) : PlayerState :=
  ps.setResource name (f (ps.getResource name))

def GameState.isMechanicEnabled (gs : GameState) (slug : String) : Bool :=
  gs.config.mechanics.contains slug || gs.config.engineMechanics.contains slug

end Playtest.Engine
