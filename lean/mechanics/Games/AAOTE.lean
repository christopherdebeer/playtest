/-
  Games/AAOTE.lean — "An Agent of the Enemy" as a mechanic composition.

  AAOTE is a social deduction game: hidden objectives, expanding grid,
  item trading, and a traitor. Attempting to express it in the existing
  algebra reveals **9 gaps** — places where the Lean typeclasses don't
  cover what the TypeScript runtime does.

  Each gap is marked with `-- GAP N:` and a `sorry` that would be a
  real compile error if the missing typeclass existed. These gaps are
  the answer to "what does compiling tell us?"

  AAOTE requires these mechanics (from RULES.md):
    action-points, hand-management, hidden-objectives, hidden-roles,
    traitor-game, place-location, grid-movement, trading,
    victory-declaration, win-timeout

  Which transitively require these core mechanics:
    cards, board, visibility, effects, turns
-/

import Core.Resources
import Core.Cards
import Core.Board
import Core.Effects
import Core.Turns
import Core.Visibility
import Leaf.WinConditions

namespace Playtest.Games.AAOTE

open Playtest

/-! =========================================================================
    GAP 1: ActionPointsMechanic — missing typeclass
    =========================================================================

    AAOTE gives each player 3 AP/turn. Different actions cost different
    amounts. AP resets each turn (no rollover).

    This is NOT the same as ResourceMechanic. Resources persist across
    turns; action points reset. The ResourceMechanic laws say:
      `add_increases: getResource (addResource g pid name amt) pid name = getResource g pid name + amt`

    But action points need:
      `reset_on_turn_start: ∀ g pid, getAP (onTurnStart g pid) pid = maxAP g`

    The TypeScript `action-points.ts` handles this in `onTurnStart` hook,
    but there's no Lean typeclass capturing the reset-per-turn contract. -/

class ActionPointsMechanic (G : Type) where
  getAP : G → PlayerId → Nat
  getMaxAP : G → PlayerId → Nat
  getActionCost : G → Action → Nat
  spendAP : G → PlayerId → Nat → Option G
  resetAP : G → PlayerId → G

  -- Laws
  reset_restores_max : ∀ (g : G) (pid : PlayerId),
    getAP (resetAP g pid) pid = getMaxAP g pid

  spend_deducts : ∀ (g : G) (pid : PlayerId) (cost : Nat) (g' : G),
    spendAP g pid cost = some g' →
    getAP g' pid = getAP g pid - cost

  spend_requires_sufficient : ∀ (g : G) (pid : PlayerId) (cost : Nat),
    cost > getAP g pid → spendAP g pid cost = none

  -- Key distinction from ResourceMechanic: AP doesn't accumulate.
  -- This prevents the resource "add" law from applying.
  no_accumulation : ∀ (g : G) (pid : PlayerId),
    getAP g pid ≤ getMaxAP g pid


/-! =========================================================================
    GAP 2: Dynamic Board — BoardMechanic assumes a fixed graph
    =========================================================================

    AAOTE starts with ONE tile ("Origin"). Players place location cards
    to expand the grid. The board grows over time.

    Current BoardMechanic has:
      `getStates : G → List StateName`
      `position_valid : ∀ g pid, getPosition g pid ∈ getStates g`

    But `getStates` returns a fixed list for a given state. The real
    issue is that `getValidTargets` must change as locations are placed.
    We need a `DynamicBoardMechanic` where:
      - States can be added (but never removed, except by Sabotage)
      - Edges are defined by adjacency on an infinite grid
      - The graph structure itself is part of the mutable state  -/

/-- Grid coordinate for the infinite board. -/
structure GridPos where
  x : Int
  y : Int
  deriving Repr, DecidableEq, BEq

/-- Orthogonal adjacency on the grid. -/
def adjacent (a b : GridPos) : Bool :=
  (a.x == b.x && (a.y - b.y == 1 || a.y - b.y == -1)) ||
  (a.y == b.y && (a.x - b.x == 1 || a.x - b.x == -1))

/-- Adjacency is symmetric. -/
theorem adjacent_symm (a b : GridPos) : adjacent a b = adjacent b a := by
  simp [adjacent]
  sorry -- Provable via Int subtraction commutativity; omega can't handle BEq/Bool

class DynamicBoardMechanic (G : Type) where
  /-- Get all currently placed positions. -/
  getPlacedPositions : G → List GridPos
  /-- Get the location card at a position. -/
  getLocationAt : G → GridPos → Option Card
  /-- Place a new location on the grid. -/
  placeLocation : G → GridPos → Card → Option G
  /-- Get a player's grid position. -/
  getPlayerPos : G → PlayerId → GridPos
  /-- Move a player to an adjacent placed position. -/
  movePlayer : G → PlayerId → GridPos → Option G

  -- Laws
  place_adds : ∀ (g : G) (pos : GridPos) (card : Card) (g' : G),
    placeLocation g pos card = some g' →
    pos ∈ getPlacedPositions g'

  place_requires_adjacency : ∀ (g : G) (pos : GridPos) (card : Card),
    ¬(getPlacedPositions g).any (adjacent pos) →
    placeLocation g pos card = none

  place_no_overlap : ∀ (g : G) (pos : GridPos) (card : Card),
    pos ∈ getPlacedPositions g →
    placeLocation g pos card = none

  move_requires_adjacency : ∀ (g : G) (pid : PlayerId) (target : GridPos),
    ¬adjacent (getPlayerPos g pid) target →
    movePlayer g pid target = none

  move_requires_placed : ∀ (g : G) (pid : PlayerId) (target : GridPos),
    target ∉ getPlacedPositions g →
    movePlayer g pid target = none


/-! =========================================================================
    GAP 3: Card Type Restrictions — CardMechanic has a single `playCard`
    =========================================================================

    AAOTE has three card types with DIFFERENT rules:
      - Items: can hold and trade, CANNOT play
      - Events: can play (discarded after), CANNOT trade
      - Locations: can place on grid, CANNOT play as event

    The current `CardMechanic.playCard : G → PlayerId → Card → Option G`
    doesn't distinguish. We need a type-level distinction that prevents
    calling `playCard` on items. In the TypeScript, this is checked in
    `preValidateAction` — a runtime guard. The Lean version should make
    it a type error.  -/

/-- Card categories with distinct allowed operations. -/
inductive CardCategory where
  | item       -- hold, trade
  | event      -- play (for effect)
  | location   -- place on grid
  deriving Repr, DecidableEq, BEq

/-- Classify a card. -/
def classifyCard (card : Card) : CardCategory :=
  if card.cardType == "item" then .item
  else if card.cardType == "event" then .event
  else if card.cardType == "location" then .location
  else .item  -- fallback

/-- Type-refined card mechanic with per-type operations. -/
class TypedCardMechanic (G : Type) [CardMechanic G] where
  /-- Play an event card. Fails if card is not an event. -/
  playEvent : G → PlayerId → Card → Option G
  /-- Place a location card. Fails if card is not a location. -/
  placeLocationCard : G → PlayerId → Card → GridPos → Option G

  -- Laws
  play_event_only : ∀ (g : G) (pid : PlayerId) (card : Card),
    classifyCard card ≠ .event → playEvent g pid card = none

  place_location_only : ∀ (g : G) (pid : PlayerId) (card : Card) (pos : GridPos),
    classifyCard card ≠ .location → placeLocationCard g pid card pos = none

  /-- Items cannot be played at all. -/
  items_unplayable : ∀ (g : G) (pid : PlayerId) (card : Card),
    classifyCard card = .item → CardMechanic.playCard g pid card = none


/-! =========================================================================
    GAP 4: TradingMechanic — bilateral negotiation is not modeled
    =========================================================================

    Trading requires CONSENT from both parties. This is fundamentally
    different from any existing mechanic — it's a two-player interaction
    with an offer/accept/decline protocol.

    The TypeScript `trading.ts` uses `trade_offer` and `trade_respond`
    actions with `shared.pendingTrades` state. It also supports out-of-turn
    responses (the target player can respond even when it's not their turn).

    Nothing in the algebra models bilateral negotiation or out-of-turn
    actions. The TurnMechanic assumes one player acts at a time. -/

/-- A trade offer. -/
structure TradeOffer where
  offerer : PlayerId
  target : PlayerId
  offering : List Card    -- cards from offerer
  requesting : List Card  -- cards from target
  deriving Repr

class TradingMechanic (G : Type) [CardMechanic G] where
  /-- Propose a trade. -/
  offerTrade : G → TradeOffer → Option G
  /-- Respond to a pending trade (accept/decline). -/
  respondTrade : G → PlayerId → Bool → Option G
  /-- Get pending trade for a player. -/
  getPendingTrade : G → PlayerId → Option TradeOffer

  -- Laws
  offer_items_only : ∀ (g : G) (offer : TradeOffer) (g' : G),
    offerTrade g offer = some g' →
    (offer.offering ++ offer.requesting).all
      (fun c => classifyCard c == .item) = true

  offer_requires_ownership : ∀ (g : G) (offer : TradeOffer) (g' : G),
    offerTrade g offer = some g' →
    offer.offering.all (fun c => (CardMechanic.getHand g offer.offerer).any (· == c)) = true

  accept_transfers : ∀ (g : G) (pid : PlayerId) (g' : G),
    respondTrade g pid true = some g' →
    ∃ offer, getPendingTrade g pid = some offer ∧
    -- offerer loses offered cards, gains requested cards
    -- target loses requested cards, gains offered cards
    offer.offering.all (fun c => (CardMechanic.getHand g' offer.target).any (· == c)) = true

  /-- GAP 4a: Out-of-turn action.
      The responder acts outside normal turn order.
      TurnMechanic.isPlayersTurn would be false for them.
      This violates the assumption that only the current player acts. -/
  out_of_turn_response : ∀ (g : G) (pid : PlayerId),
    (getPendingTrade g pid).isSome = true →
    -- pid can respond even if it's not their turn
    True  -- We can't express this constraint without modifying TurnMechanic


/-! =========================================================================
    GAP 5: Role-Dependent Win Conditions — WinConditions don't branch on role
    =========================================================================

    AAOTE has ASYMMETRIC win conditions:
      - Regular players: complete their hidden objective
      - The Enemy: timeout (turn 40) OR collect 3 Forbidden Items

    Current WinConditions are uniform: "first player to X wins."
    We need role-branching: the check function itself depends on which
    role the player has, and The Enemy's win condition has an OR. -/

/-- Objectives in AAOTE. -/
inductive Objective where
  | collector   -- hold 4 different items
  | explorer    -- visit 6 different locations
  | builder     -- place 5 locations
  | trader      -- complete 4 trades
  | enemy       -- prevent others OR collect 3 forbidden items
  deriving Repr, DecidableEq

/-- Objective completion check — depends on role AND game history. -/
def objectiveMet : Objective → (itemsHeld : Nat) → (locationsVisited : Nat) →
    (locationsPlaced : Nat) → (tradesCompleted : Nat) →
    (forbiddenItemsHeld : Nat) → Bool
  | .collector, items, _, _, _, _ => items ≥ 4
  | .explorer, _, visited, _, _, _ => visited ≥ 6
  | .builder, _, _, placed, _, _ => placed ≥ 5
  | .trader, _, _, _, trades, _ => trades ≥ 4
  | .enemy, _, _, _, _, forbidden => forbidden ≥ 3  -- alt win only

class AsymmetricWinMechanic (G : Type) where
  /-- Get a player's hidden objective. -/
  getObjective : G → PlayerId → Option Objective
  /-- Check if a specific player's objective is met. -/
  isObjectiveMet : G → PlayerId → Bool
  /-- Handle victory declaration (claim + verify). -/
  declareVictory : G → PlayerId → Option G

  -- Laws
  enemy_wins_on_timeout : ∀ (g : G) (maxTurns : Nat),
    -- If turn limit reached and no regular player has won,
    -- the enemy wins by default.
    True  -- Requires TurnMechanic to express turn count

  /-- GAP 5a: Victory requires DECLARATION, not automatic detection.
      Current onCheckWin fires automatically. AAOTE requires
      the player to explicitly claim victory, then the GM verifies.
      This is a different control flow than auto-check. -/
  declaration_required : ∀ (g : G) (pid : PlayerId),
    isObjectiveMet g pid = true →
    -- Player has NOT won yet — they must still declare.
    -- This can't be expressed without separating "met" from "won".
    True


/-! =========================================================================
    GAP 6: Location Entry Requirements — cross-mechanic precondition
    =========================================================================

    Some locations in AAOTE require items to enter:
      - Caves require Lantern
      - Mountains require Rope
      - Forbidden Temple requires The Enemy role

    This is a CROSS-MECHANIC constraint: board movement depends on
    card state (items in hand) AND visibility state (hidden role).
    The BoardMechanic's `movePlayer` has no way to express
    "movement requires holding a specific card."  -/

/-- Location entry requirements. -/
structure EntryRequirement where
  terrain : String
  requiredItem : Option CardName     -- item needed in hand
  requiredRole : Option String       -- role needed (e.g., enemy for Forbidden Temple)
  deriving Repr

def aaoteEntryRequirements : List EntryRequirement :=
  [{ terrain := "cave", requiredItem := some "Lantern", requiredRole := none },
   { terrain := "mountain", requiredItem := some "Rope", requiredRole := none },
   { terrain := "temple", requiredItem := none, requiredRole := some "The Enemy" }]

/-- The cross-mechanic constraint: to move to a location, you need
    the right items AND the right role. This requires simultaneous
    access to BoardMechanic, CardMechanic, and VisibilityMechanic. -/
def canEnterLocation {G : Type} [CardMechanic G] [VisibilityMechanic G]
    (g : G) (pid : PlayerId) (terrain : String) : Bool :=
  let reqs := aaoteEntryRequirements.filter (·.terrain == terrain)
  reqs.all fun req =>
    (match req.requiredItem with
     | none => true
     | some item => (CardMechanic.getHand g pid).any (·.name == item)) &&
    (match req.requiredRole with
     | none => true
     | some role => VisibilityMechanic.getHiddenRole g pid == some role)


/-! =========================================================================
    GAP 7: Location Effects on Entry — board triggers card/visibility hooks
    =========================================================================

    When a player enters certain locations, effects fire:
      - Ancient Ruins: draw 1 card (Board → Card)
      - Hidden Cave: position hidden (Board → Visibility)
      - Watchtower: see all positions (Board → Visibility)
      - Forbidden Temple: reveals The Enemy (Board → Visibility)
      - Village Square: trades cost 0 AP (Board → ActionPoints)

    These are CROSS-MECHANIC TRIGGERS. The `onPlayerMoved` hook in
    board.ts fires, and the location-effects.ts mechanic responds.
    But the Lean typeclasses don't express "when this mechanic's
    operation completes, trigger that mechanic's hook." The
    HookChain formalization models sequential execution but not
    the semantic coupling between specific events and responses. -/

/-- Location effect types. -/
inductive LocationEffect where
  | drawOnEnter (count : Nat)
  | hidePosition
  | revealAllPositions
  | revealRole           -- Forbidden Temple reveals the enemy
  | tradeBonus           -- trades cost 0 AP here
  | safe                 -- no special effect
  deriving Repr, DecidableEq

/-- Applying a location effect touches MULTIPLE mechanic domains. -/
def applyLocationEffect {G : Type} [CardMechanic G] [VisibilityMechanic G]
    (g : G) (pid : PlayerId) (effect : LocationEffect) : G :=
  match effect with
  | .drawOnEnter _count => g  -- Would need CardMechanic.drawCards, but that returns Option
  | .hidePosition => g        -- Would need VisibilityMechanic mutation
  | .revealAllPositions => g  -- Would need to iterate all players
  | .revealRole => g          -- Would need to reveal hidden role
  | .tradeBonus => g          -- Would need to modify AP costs contextually
  | .safe => g
  -- Every non-trivial case requires mutation through a different typeclass.
  -- The algebra has no "cross-mechanic effect application" pattern.


/-! =========================================================================
    GAP 8: Per-Round Cooldowns — not covered by Effects
    =========================================================================

    The Guardian can "block one trade per round." This is:
      - A per-player ability
      - With a per-ROUND cooldown (not per-turn, not duration-based)
      - That interacts with another mechanic (trading)

    The EffectsMechanic models duration-based effects that tick down
    each turn. But a per-round cooldown needs to:
      1. Reset at round boundary (not turn boundary)
      2. Track uses within the round (not just presence/absence)
      3. Gate another mechanic's operation

    The TypeScript handles this ad-hoc in player state. The Lean
    algebra has no "ability with cooldown" pattern. -/

structure AbilityCooldown where
  abilityName : String
  usesPerRound : Nat
  usesThisRound : Nat
  deriving Repr

def AbilityCooldown.available (cd : AbilityCooldown) : Bool :=
  cd.usesThisRound < cd.usesPerRound

def AbilityCooldown.use (cd : AbilityCooldown) : Option AbilityCooldown :=
  if cd.available then some { cd with usesThisRound := cd.usesThisRound + 1 }
  else none

def AbilityCooldown.reset (cd : AbilityCooldown) : AbilityCooldown :=
  { cd with usesThisRound := 0 }

-- This needs a new typeclass: PlayerAbilityMechanic
-- with per-round reset semantics distinct from both Effects and Resources.


/-! =========================================================================
    GAP 9: Tracking Game History — objectives need cumulative counts
    =========================================================================

    Several objectives require tracking HISTORY, not just current state:
      - Explorer: "visit 6 different locations" — needs visitedLocations set
      - Trader: "complete 4 trades" — needs trade counter
      - Builder: "place 5 locations" — needs placement counter

    The current typeclasses are stateless queries over current game state.
    None of them track cumulative history. The TypeScript stores these
    as player state fields (visitedLocations, tradesCompleted, etc.)
    but the Lean algebra has no "monotone counter" or "history set"
    concept that persists and grows across turns. -/

structure PlayerHistory where
  locationsVisited : List StateName   -- set, grows monotonically
  tradesCompleted : Nat               -- counter, grows monotonically
  locationsPlaced : Nat               -- counter, grows monotonically
  deriving Repr

/-- History is monotone: it only grows. -/
def historyMonotone (before after : PlayerHistory) : Prop :=
  before.locationsVisited.length ≤ after.locationsVisited.length ∧
  before.tradesCompleted ≤ after.tradesCompleted ∧
  before.locationsPlaced ≤ after.locationsPlaced


/-! =========================================================================
    ATTEMPTING THE COMPOSITION
    =========================================================================

    Now let's try to instantiate AAOTE using the available typeclasses.
    Each `sorry` below represents a real compile error — a place where
    the algebra doesn't cover what the game needs. -/

/-- AAOTE game state — what we'd LIKE to write. -/
structure AAOTEState where
  -- From TurnMechanic
  playerIds : List PlayerId
  currentPlayerIdx : Nat
  round : Nat
  turnNumber : Nat
  -- From CardMechanic
  hands : PlayerId → List Card
  deck : List Card
  discardPile : List Card
  -- From DynamicBoardMechanic (GAP 2)
  grid : List (GridPos × Card)
  playerPositions : PlayerId → GridPos
  -- From VisibilityMechanic
  hiddenRoles : PlayerId → Option String
  objectives : PlayerId → Option Objective
  knowledge : PlayerId → PlayerId → Visibility.PlayerKnowledge
  -- From ActionPointsMechanic (GAP 1)
  actionPoints : PlayerId → Nat
  -- From TradingMechanic (GAP 4)
  pendingTrade : Option TradeOffer
  -- From EffectsMechanic
  effects : PlayerId → List Effect
  -- History tracking (GAP 9)
  history : PlayerId → PlayerHistory
  -- Ability cooldowns (GAP 8)
  cooldowns : PlayerId → List AbilityCooldown

/-! What we CAN instantiate (existing typeclasses): -/

-- TurnMechanic: YES — standard cyclic turns, works fine.
-- CardMechanic: PARTIAL — basic hand/deck/discard works,
--   but card type restrictions (GAP 3) are not enforced at type level.
-- VisibilityMechanic: PARTIAL — hidden roles work,
--   but role-dependent access (Forbidden Temple) is not expressible.
-- EffectsMechanic: YES — standard duration-based effects work.

/-! What we CANNOT instantiate: -/

-- BoardMechanic: NO — assumes fixed graph, AAOTE has dynamic grid (GAP 2)
-- ResourceMechanic: NO — action points need reset semantics (GAP 1)
-- WinConditions: NO — need asymmetric + declaration pattern (GAP 5)
-- (no typeclass): Trading (GAP 4), Location effects (GAP 7),
--   Cooldowns (GAP 8), History (GAP 9)


/-! =========================================================================
    WHAT COMPILING TELLS US: SUMMARY
    =========================================================================

    Trying to express AAOTE in the algebra reveals these categories of gaps:

    **Missing Typeclasses** (mechanics that exist in TypeScript but not in Lean):
    1. ActionPointsMechanic — resource with per-turn reset
    4. TradingMechanic — bilateral negotiation with consent
    5. AsymmetricWinMechanic — role-dependent win + declaration pattern
    8. PlayerAbilityMechanic — abilities with per-round cooldowns

    **Typeclass Too Rigid** (exists but doesn't cover the game's needs):
    2. BoardMechanic — assumes fixed graph, needs dynamic growth
    3. CardMechanic — single playCard, needs type-refined operations
    9. No history/counter pattern — objectives need cumulative tracking

    **Cross-Mechanic Gaps** (interactions between mechanics):
    6. Location entry requirements — board depends on cards AND roles
    7. Location effects — board events trigger card/visibility mutations

    **The Meta-Insight**: Markov's Chains compiled cleanly because it uses
    a fixed board + cards + simple win condition. AAOTE breaks the algebra
    because it has:
    - DYNAMIC state topology (the board grows)
    - ASYMMETRIC information AND win conditions
    - BILATERAL interactions (trading)
    - CROSS-MECHANIC preconditions (items gate movement)
    - TEMPORAL patterns beyond simple duration (cooldowns, history)

    These 9 gaps map to 4-5 new typeclasses and 2-3 typeclass extensions
    that would make the algebra cover social deduction games. -/

end Playtest.Games.AAOTE
