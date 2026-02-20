# Lean Generalizations Needed for All 18 Games

After deleting all TypeScript mechanic implementations and moving to a Lean-first
architecture, this document identifies the exact Lean typeclasses, abstract patterns,
and bridge commands needed to support every game in the catalog.

## Architecture After Cleanup

```
TypeScript Engine (pure I/O)         Lean 4 Engine (all game logic)
─────────────────────────────       ─────────────────────────────────
Agent orchestration                  State transitions
JSON serialization                   Action validation
File I/O / logging                   Win condition checking
                                     Invariant enforcement
                                     Available actions computation

    TS calls lean-game binary ──→  Bridge.Main dispatches to game module
    TS applies returned state  ←──  Game module returns JSON state diff
```

The `lean-executor` mechanic handles all game state via the Lean binary.
The `lean-verifier` mechanic validates moves against formally verified rules.
No TypeScript mechanic implementations remain.

---

## Current Lean Coverage

### Existing Typeclasses (13)
| Typeclass | Status | Games Using |
|-----------|--------|-------------|
| ResourceMechanic | 7 proofs | All games with resources |
| CardMechanic | 5 proofs | All card games |
| BoardMechanic | 4 proofs | Markov's, Road Rally, Shadow Ops |
| TurnMechanic | 4 proofs | All games |
| EffectsMechanic | 6 proofs | Most games |
| DiceMechanic | 2 proofs, 3 sorry | Fortune Seekers, Dice Dynasties, Battle Forge |
| VisibilityMechanic | 4 proofs | Council of Whispers, Shadow Ops, AAOTE |
| ActionPointsMechanic | 7 proofs | AAOTE, Battle Forge, Treasure Hunters, Arcane Assembly |
| TradingMechanic | 4 proofs | AAOTE, Grand Bazaar |
| CombatMechanic | 6 proofs | Shadow Ops, Battle Forge |
| AuctionMechanic (English) | 3 proofs | Grand Bazaar |
| TrickTakingMechanic | 3 proofs | Road Rally |
| DeckBuildingMechanic | 4 proofs | Engine Masters |
| WorkerPlacementMechanic | 4 proofs | Battle Forge, Arcane Assembly |

### Existing Abstract Patterns (5)
| Pattern | Used By |
|---------|---------|
| Pool | Resources, AP, scores |
| Graph | Board states, movement |
| Scoring | Win conditions |
| Collection | Card zones |
| Modifier | Temporary effects |

### Existing Game Formalizations (3)
| Game | Status |
|------|--------|
| Markov's Chains | 8 proofs, complete |
| Gem Collector | Bridge working |
| AAOTE | Bridge working, compilation partial |

---

## Gap Analysis by Game

### Tier 1: Covered by existing algebra (needs bridge only)

#### UNO
- **Needs:** CardMechanic, TurnMechanic
- **New typeclass:** `CardMatchingMechanic` — predicate over (card, topCard) pairs
- **New typeclass:** `TurnManipulationMechanic` — skip, reverse operations on turn order
- **Bridge:** `uno validate <card> <topCard>`, `uno check-win <handSizes...>`

#### Treasure Hunters
- **Needs:** CardMechanic, ResourceMechanic, ActionPointsMechanic
- **New typeclass:** `SetCollectionMechanic` — predicate matching over card attribute groups
- **Bridge:** `treasure-hunters collect-set <cards...>`, `treasure-hunters check-win <scores...>`

#### Parallel Race
- **Needs:** BoardMechanic (linear path), CardMechanic
- **Gap:** `FreeplayMechanic` — simultaneous real-time action (8 actions/round)
- **Bridge:** `parallel-race validate <pos> <target>`, `parallel-race check-win <positions...>`

### Tier 2: Needs 1-3 new typeclasses

#### Fortune Seekers
- **Needs:** DiceMechanic, CardMechanic, ResourceMechanic
- **New typeclass:** `PushYourLuckMechanic` — sequential dice with bust condition
  ```lean
  class PushYourLuckMechanic (G : Type) [DiceMechanic G] where
    getRollCount : G → PlayerId → Nat
    getBustCondition : G → Nat → Bool  -- e.g., rolled 1
    getAccumulated : G → PlayerId → Nat
    rollOrStop : G → PlayerId → Bool → Option G  -- true = roll, false = bank
    bustResets : G → PlayerId → G
  ```
- **New typeclass:** `DraftingMechanic` (open variant)
  ```lean
  class OpenDraftingMechanic (G : Type) [CardMechanic G] where
    getDisplay : G → List Card
    draftCard : G → PlayerId → Card → Option G
    refreshDisplay : G → G
  ```

#### Markov's Chains
- **Status:** Already formalized (8 proofs). Needs bridge expansion.

#### Alliance
- **Needs:** ResourceMechanic, CardMechanic
- **New typeclass:** `SharedPoolMechanic` — global resource pool all players contribute to/draw from
  ```lean
  class SharedPoolMechanic (G : Type) [ResourceMechanic G] where
    getSharedPool : G → Pool ResourceName
    contributeToPool : G → PlayerId → ResourceName → Nat → Option G
    drawFromPool : G → PlayerId → ResourceName → Nat → Option G
  ```
- **New typeclass:** `TableauMechanic` — persistent card area with synergy rules
  ```lean
  class TableauMechanic (G : Type) [CardMechanic G] where
    getTableau : G → PlayerId → List Card
    addToTableau : G → PlayerId → Card → Option G
    getTableauLimit : G → Nat
    getSynergies : G → PlayerId → List (String × Nat)  -- (synergy_name, bonus)
  ```
- **New typeclass:** `ThreatMechanic` — escalating shared threat with threshold
  ```lean
  class ThreatMechanic (G : Type) where
    getThreatLevel : G → Nat
    addThreat : G → Nat → G
    getThreatThreshold : G → Nat
    isThresholdBreached : G → Bool
  ```

#### Dice Dynasties
- **Needs:** DiceMechanic, ResourceMechanic
- **New typeclass:** `CommodityMechanic` — dynamic pricing with volatility bounds
  ```lean
  class CommodityMechanic (G : Type) [ResourceMechanic G] where
    getPrice : G → ResourceName → Nat
    buyAt : G → PlayerId → ResourceName → Nat → Option G
    sellAt : G → PlayerId → ResourceName → Nat → Option G
    tickPrices : G → G  -- random walk within volatility
    getPriceFloor : ResourceName → Nat
    getPriceCeiling : ResourceName → Nat
  ```
- **New typeclass:** `InvestmentMechanic` — time-locked returns
  ```lean
  class InvestmentMechanic (G : Type) [ResourceMechanic G] where
    invest : G → PlayerId → ResourceName → Nat → Nat → Option G  -- amount, maturity_rounds
    getActiveInvestments : G → PlayerId → List Investment
    tickInvestments : G → PlayerId → G × List InvestmentReturn
    getMaxInvestments : G → Nat
  ```

#### Draft Duel
- **New typeclass:** `ClosedDraftingMechanic` — simultaneous pick-and-pass
  ```lean
  class ClosedDraftingMechanic (G : Type) [CardMechanic G] where
    getDraftPool : G → PlayerId → List Card
    pickCard : G → PlayerId → Card → Option G
    passPool : G → G  -- rotate pools to next player
    getDraftDirection : G → Bool  -- true = left, false = right
  ```
- **New typeclass:** `CatchUpMechanic` — trailing player bonuses
  ```lean
  class CatchUpMechanic (G : Type) [ResourceMechanic G] where
    getScoreGap : G → PlayerId → Int  -- negative = trailing
    getCatchUpBonus : G → PlayerId → List (ResourceName × Nat)
    applyCatchUp : G → PlayerId → G
  ```

### Tier 3: Needs 3-5 new typeclasses

#### Road Rally
- **Needs:** CardMechanic, BoardMechanic, TrickTakingMechanic
- **New typeclass:** `LadderClimbingMechanic` — beat-or-pass card comparison
  ```lean
  class LadderClimbingMechanic (G : Type) [CardMechanic G] where
    getCurrentPlay : G → Option (List Card)
    playCards : G → PlayerId → List Card → Option G
    passLadder : G → PlayerId → Option G
    comparePlays : List Card → List Card → Bool  -- new beats old?
  ```
- **Advancement rule:** Trick/ladder winner moves forward on track

#### Battle Forge
- **Needs:** WorkerPlacementMechanic, ResourceMechanic, CommodityMechanic, ActionPointsMechanic
- **New:** WorkerPlacement already exists. Needs commodity pricing (see Dice Dynasties).

#### Grand Bazaar
- **Needs:** ResourceMechanic, TradingMechanic, AuctionMechanic
- **New typeclass:** `SealedBidAuctionMechanic` — sealed bids with simultaneous reveal
  ```lean
  class SealedBidAuctionMechanic (G : Type) [ResourceMechanic G] where
    submitBid : G → PlayerId → Nat → Option G
    allBidsSubmitted : G → Bool
    revealBids : G → G × List (PlayerId × Nat)
    resolveWinner : G → Option (PlayerId × Nat)
  ```
- **New typeclass:** `OnceAroundAuctionMechanic` — single pass, bid or pass
- **New typeclass:** `ContractMechanic` — requirements + rewards matching
  ```lean
  class ContractMechanic (G : Type) [ResourceMechanic G] where
    getAvailableContracts : G → List Contract
    getActiveContracts : G → PlayerId → List Contract
    claimContract : G → PlayerId → Contract → Option G
    fulfillContract : G → PlayerId → Contract → Option G
    getMaxContracts : G → Nat

  structure Contract where
    id : String
    requirements : List (ResourceName × Nat)
    reward : Nat
  ```
- **New typeclass:** `StockMechanic` — shares with dividend income
  ```lean
  class StockMechanic (G : Type) [ResourceMechanic G] where
    buyShare : G → PlayerId → String → Option G
    sellShare : G → PlayerId → String → Option G
    getHoldings : G → PlayerId → List (String × Nat)
    payDividends : G → G
    getSharePrice : G → String → Nat
  ```

#### Rondel Express
- **New typeclass:** `RondelMechanic` — cyclic action wheel with movement cost
  ```lean
  class RondelMechanic (G : Type) where
    getPosition : G → PlayerId → Fin n  -- position on wheel
    getSegments : G → List RondelSegment
    moveOnRondel : G → PlayerId → Fin n → Option G
    getMoveCost : G → Nat → Nat  -- steps → cost (free ≤ 3, then 1/step)
    getSegmentAction : G → Fin n → Action
  ```
- **New typeclass:** `CargoMechanic` — pickup/delivery with capacity
  ```lean
  class CargoMechanic (G : Type) where
    getCargo : G → PlayerId → List Cargo
    getCapacity : G → PlayerId → Nat
    pickUp : G → PlayerId → Cargo → Option G
    deliver : G → PlayerId → Cargo → String → Option G

  structure Cargo where
    id : String
    destination : String
    reward : Nat
  ```

### Tier 4: Needs fundamental extensions

#### Spellbook Showdown
- **New typeclass:** `MultiModeCardMechanic` — cards with multiple use modes
  ```lean
  inductive CardMode where | attack | resource | enchant

  class MultiModeCardMechanic (G : Type) [CardMechanic G] where
    getCardModes : Card → List CardMode
    playInMode : G → PlayerId → Card → CardMode → Option G
  ```
- **New typeclass:** `ActionQueueMechanic` — queued actions with ordered execution
  ```lean
  class ActionQueueMechanic (G : Type) where
    getQueue : G → PlayerId → List Action
    enqueue : G → PlayerId → Action → Option G
    processQueue : G → PlayerId → G × List ActionResult
    getQueueLimit : G → Nat
  ```
- **New typeclass:** `SimultaneousActionMechanic` — all players commit, then resolve
  ```lean
  class SimultaneousActionMechanic (G : Type) where
    commitAction : G → PlayerId → Action → Option G
    allCommitted : G → Bool
    resolveSimultaneous : G → G × List (PlayerId × ActionResult)
  ```
- **New typeclass:** `SplayMechanic` — card arrangement with directional bonuses
  ```lean
  inductive SplayDirection where | left | right | up

  class SplayMechanic (G : Type) [CardMechanic G] where
    getSplayDirection : G → PlayerId → Option SplayDirection
    splayCards : G → PlayerId → SplayDirection → G
    getSplayBonus : G → PlayerId → Nat
  ```
- **New:** `ScoreAndResetMechanic` — multi-round with score persistence

#### Arcane Assembly
- **New typeclass:** `PatternBuildingMechanic` — 2D grid pattern matching
  ```lean
  structure GridPosition where
    row : Fin m
    col : Fin n

  structure Pattern where
    name : String
    shape : List GridPosition  -- relative coordinates
    reward : Nat

  class PatternBuildingMechanic (G : Type) where
    getGrid : G → PlayerId → Array₂ (Option Card) m n
    placeOnGrid : G → PlayerId → Card → GridPosition → Option G
    checkPatterns : G → PlayerId → List (Pattern × Nat)  -- matched patterns with scores
  ```
- **New typeclass:** `TechTreeMechanic` — DAG prerequisites with unlock bonuses
  ```lean
  structure TechNode where
    id : String
    prerequisites : List String
    cost : List (ResourceName × Nat)
    bonus : TechBonus

  class TechTreeMechanic (G : Type) [ResourceMechanic G] where
    getUnlocked : G → PlayerId → List String
    canResearch : G → PlayerId → TechNode → Bool
    research : G → PlayerId → TechNode → Option G
  ```
- **New typeclass:** `ActionProgrammingMechanic` — commit N actions, execute in order
  ```lean
  class ActionProgrammingMechanic (G : Type) where
    programActions : G → PlayerId → List Action → Option G
    executeProgram : G → PlayerId → G × List ActionResult
    getProgramLimit : G → Nat
  ```
- **New:** TypedWorkerPlacement (different worker types with strength) — extends existing WorkerPlacement

#### Council of Whispers
- **New typeclass:** `VotingMechanic` — majority/plurality voting with topics
  ```lean
  inductive VoteResolution where | majority | plurality | unanimous

  structure VotingSession where
    topic : String
    candidates : List String
    resolution : VoteResolution
    votes : List (PlayerId × String)

  class VotingMechanic (G : Type) where
    startVote : G → String → List String → VoteResolution → G
    castVote : G → PlayerId → String → Option G
    resolveVote : G → Option (G × String)  -- winner option
    isVoteComplete : G → Bool
  ```
- **New typeclass:** `NegotiationMechanic` — non-binding agreements with expiry
  ```lean
  structure Agreement where
    parties : List PlayerId
    terms : String
    expiresRound : Nat
    binding : Bool

  class NegotiationMechanic (G : Type) where
    proposeAgreement : G → Agreement → Option G
    acceptAgreement : G → PlayerId → Option G
    breakAgreement : G → PlayerId → G
    getActiveAgreements : G → PlayerId → List Agreement
    tickAgreements : G → G  -- expire old ones
  ```
- **New typeclass:** `BriberyMechanic` — resource transfer to influence actions
- **New typeclass:** `PrisonersDilemmaMechanic` — payoff matrix resolution
  ```lean
  inductive PDChoice where | cooperate | defect

  structure PayoffMatrix where
    bothCooperate : Nat × Nat  -- (p1, p2)
    p1Defects : Nat × Nat
    p2Defects : Nat × Nat
    bothDefect : Nat × Nat

  class PrisonersDilemmaMechanic (G : Type) where
    commitChoice : G → PlayerId → PDChoice → Option G
    resolveEncounter : G → PlayerId → PlayerId → G × (Nat × Nat)
  ```
- **New typeclass:** `CommunicationLimitsMechanic` — message budget per round
- **New:** `SingleLoserWinCondition` — lowest score eliminated

#### Shadow Operations
- **New typeclass:** `AreaControlMechanic` — area majority scoring
  ```lean
  class AreaControlMechanic (G : Type) where
    getForces : G → PlayerId → String → Nat  -- player forces in area
    deployForces : G → PlayerId → String → Nat → Option G
    scoreAreas : G → List (PlayerId × Nat)  -- 1st/2nd place points
    getAreaValues : G → List (String × Nat × Nat)  -- (area, 1st_points, 2nd_points)
  ```
- **New typeclass:** `FogOfWarMechanic` — hidden unit positions with reveal triggers
  ```lean
  class FogOfWarMechanic (G : Type) [VisibilityMechanic G] where
    isRevealed : G → PlayerId → String → Bool  -- is area revealed to player?
    revealArea : G → PlayerId → String → G
    getRevealFrequency : G → Nat  -- turns between auto-reveals
    getClues : G → PlayerId → List Clue
  ```
- **New typeclass:** `ZoneOfControlMechanic` — movement restriction from adjacent forces
- **New typeclass:** `TeamMechanic` — team membership with shared scoring
- **New:** Uses CombatMechanic (exists), DiceMechanic (exists)

#### Engine Masters
- **Needs:** DeckBuildingMechanic (exists), ResourceMechanic (exists)
- **New typeclass:** `ChainingMechanic` — trigger-effect chains between cards
  ```lean
  structure ChainRule where
    trigger : CardPredicate
    effect : ChainEffect
    maxPerTurn : Nat

  class ChainingMechanic (G : Type) [CardMechanic G] where
    getChainRules : G → List ChainRule
    resolveChains : G → PlayerId → Card → G × List ChainEffect
  ```
- **New typeclass:** `AutoGrowthMechanic` — automatic resource accumulation per turn
  ```lean
  class AutoGrowthMechanic (G : Type) [ResourceMechanic G] where
    getGrowthRate : G → PlayerId → ResourceName → Nat
    tickGrowth : G → PlayerId → G
  ```

#### AAOTE (Flagship — Already Has lean-executor)
- **Status:** Working bridge with `lean-executor: true`
- **Needs expansion:** Grid mechanics, hidden objectives, trading validation
- **Current bridge commands:** `init`, `act`, `available`, `check-win`
- **Missing:** Formal proofs for grid expansion, objective completion predicates

---

## New Typeclasses Summary (Priority Order)

### P0: Unlock 5+ games each
| Typeclass | Games Unlocked | Complexity |
|-----------|---------------|------------|
| SetCollectionMechanic | Treasure Hunters, Draft Duel, Grand Bazaar, Alliance | Low |
| CardMatchingMechanic | UNO, Road Rally | Low |
| SimultaneousActionMechanic | Spellbook Showdown, Council of Whispers, Shadow Ops, Arcane Assembly | Medium |
| TableauMechanic | Alliance, Battle Forge, Engine Masters | Medium |
| ContractMechanic | Grand Bazaar, Rondel Express, Battle Forge | Medium |

### P1: Unlock 2-3 games each
| Typeclass | Games Unlocked | Complexity |
|-----------|---------------|------------|
| PushYourLuckMechanic | Fortune Seekers, Dice Dynasties | Low |
| OpenDraftingMechanic | Fortune Seekers, Draft Duel | Low |
| ClosedDraftingMechanic | Draft Duel, Spellbook Showdown | Medium |
| CommodityMechanic | Dice Dynasties, Battle Forge, Grand Bazaar | Medium |
| VotingMechanic | Council of Whispers, Shadow Ops | Medium |
| AreaControlMechanic | Shadow Operations, Alliance | Medium |
| LadderClimbingMechanic | Road Rally | Medium |
| RondelMechanic | Rondel Express | Medium |

### P2: Unlock 1 game each (complex)
| Typeclass | Game | Complexity |
|-----------|------|------------|
| PatternBuildingMechanic | Arcane Assembly | High |
| TechTreeMechanic | Arcane Assembly | High |
| ActionProgrammingMechanic | Arcane Assembly | High |
| MultiModeCardMechanic | Spellbook Showdown | High |
| ActionQueueMechanic | Spellbook Showdown | Medium |
| SplayMechanic | Spellbook Showdown | Medium |
| ChainingMechanic | Engine Masters | Medium |
| FogOfWarMechanic | Shadow Operations | High |
| PrisonersDilemmaMechanic | Council of Whispers | Medium |
| NegotiationMechanic | Council of Whispers | Medium |
| CargoMechanic | Rondel Express | Medium |
| StockMechanic | Grand Bazaar | Medium |
| InvestmentMechanic | Dice Dynasties | Medium |

### P3: Small extensions to existing typeclasses
| Extension | Base Typeclass | Games |
|-----------|---------------|-------|
| TurnManipulation (skip, reverse) | TurnMechanic | UNO |
| SharedPool (global resources) | ResourceMechanic | Alliance |
| CatchUp (trailing bonuses) | ResourceMechanic | Draft Duel |
| AutoGrowth (per-turn accumulation) | ResourceMechanic | Engine Masters |
| ThreatEscalation (shared threat) | ResourceMechanic | Alliance |
| TypedWorkers (strength attribute) | WorkerPlacementMechanic | Arcane Assembly |
| SealedBid, OnceAround auctions | AuctionMechanic | Grand Bazaar |
| TeamMembership | VisibilityMechanic | Shadow Ops |
| ZoneOfControl | BoardMechanic | Shadow Ops |
| CommunicationLimits | Visibility | Council of Whispers |
| ScoreAndReset (multi-round) | Scoring | Spellbook Showdown |
| SingleLoser win condition | WinConditions | Council of Whispers |

---

## Abstract Patterns to Add

### 1. `Abstract/Market.lean` — Price dynamics with bounds
```lean
structure Market (α : Type) where
  prices : List (α × Nat)
  floor : Nat
  ceiling : Nat
  volatility : Nat  -- basis points (100 = 1.0)

def Market.tick [BEq α] (m : Market α) (rng : Nat) : Market α
def Market.buy [BEq α] (m : Market α) (item : α) (qty : Nat) : Option (Market α × Nat)
def Market.sell [BEq α] (m : Market α) (item : α) (qty : Nat) : Option (Market α × Nat)
```
**Used by:** CommodityMechanic, StockMechanic, Grand Bazaar, Dice Dynasties, Battle Forge

### 2. `Abstract/Grid.lean` — 2D coordinate system with adjacency
```lean
structure Coord where
  x : Int
  y : Int

def Coord.adjacent (a b : Coord) : Bool :=
  (a.x - b.x).natAbs + (a.y - b.y).natAbs == 1  -- Manhattan distance 1

structure Grid (α : Type) where
  cells : List (Coord × α)

def Grid.place (g : Grid α) (pos : Coord) (val : α) : Grid α
def Grid.get (g : Grid α) (pos : Coord) : Option α
def Grid.neighbors (g : Grid α) (pos : Coord) : List (Coord × α)
```
**Used by:** AAOTE (expandable grid), Arcane Assembly (5x5 pattern grid), Shadow Ops (area map)

### 3. `Abstract/PayoffMatrix.lean` — Game theory resolution
```lean
structure PayoffMatrix (n : Nat) where
  payoffs : Fin n → Fin n → Int × Int

def PayoffMatrix.resolve (m : PayoffMatrix n) (p1 p2 : Fin n) : Int × Int
def PayoffMatrix.nashEquilibria (m : PayoffMatrix 2) : List (Fin 2 × Fin 2)
```
**Used by:** PrisonersDilemmaMechanic, Council of Whispers

### 4. `Abstract/DAG.lean` — Directed acyclic graph for tech trees
```lean
structure DAG (α : Type) [BEq α] where
  nodes : List α
  edges : List (α × α)  -- (prerequisite, dependent)
  acyclic : Bool  -- invariant

def DAG.canUnlock [BEq α] (d : DAG α) (unlocked : List α) (target : α) : Bool
def DAG.topologicalSort [BEq α] (d : DAG α) : List α
```
**Used by:** TechTreeMechanic, Arcane Assembly

### 5. `Abstract/Queue.lean` — FIFO with capacity
```lean
structure Queue (α : Type) where
  items : List α
  capacity : Nat

def Queue.enqueue (q : Queue α) (item : α) : Option (Queue α)
def Queue.dequeue (q : Queue α) : Option (Queue α × α)
def Queue.isFull (q : Queue α) : Bool
```
**Used by:** ActionQueueMechanic, Spellbook Showdown

---

## Bridge Commands Needed

### Per-game bridges (Bridge/<Game>.lean)
Each game needs its own bridge module that handles:
- `init <numPlayers> <seed>` — initial state
- `act <player> <action...>` — execute action, return new state
- `available <player>` — compute available actions
- `check-win` — check all win conditions
- `validate <action...>` — validate move legality

### Generic bridge extensions (Bridge/Generic.lean)
| Command | Purpose |
|---------|---------|
| `market tick <prices...>` | Price oscillation |
| `market buy/sell <item> <qty> <prices...>` | Trade execution |
| `grid adjacent <x1,y1> <x2,y2>` | Adjacency check |
| `grid pattern <grid...> <pattern...>` | Pattern matching |
| `dag unlock <unlocked...> <target> <edges...>` | Prerequisite check |
| `vote resolve <votes...> <method>` | Vote resolution |
| `auction sealed <bids...>` | Sealed bid resolution |
| `contract check <holdings...> <requirements...>` | Contract fulfillment |

---

## Implementation Roadmap

### Phase 1: Core generalizations (unlocks Tier 1-2 games)
1. `SetCollectionMechanic` — predicate matching over card attributes
2. `CardMatchingMechanic` — play predicate (card, topCard)
3. `OpenDraftingMechanic` — display + pick
4. `PushYourLuckMechanic` — sequential risk with bust
5. `TableauMechanic` — persistent card area with synergies
6. Fill remaining `sorry`s in Core/Dice

### Phase 2: Economic generalizations (unlocks Tier 2-3 games)
7. `Abstract/Market.lean` — price dynamics
8. `CommodityMechanic` — buy/sell with market pricing
9. `ContractMechanic` — requirement matching + rewards
10. `StockMechanic` — shares + dividends
11. `InvestmentMechanic` — time-locked returns

### Phase 3: Social/political generalizations (unlocks Council of Whispers, Shadow Ops)
12. `VotingMechanic` — majority/plurality/unanimous
13. `NegotiationMechanic` — non-binding agreements with expiry
14. `SimultaneousActionMechanic` — commit-then-resolve
15. `AreaControlMechanic` — area majority scoring
16. `TeamMechanic` — team membership + shared scoring

### Phase 4: Advanced generalizations (unlocks remaining Tier 3-4 games)
17. `Abstract/Grid.lean` — 2D coordinate system
18. `PatternBuildingMechanic` — 2D pattern matching
19. `TechTreeMechanic` + `Abstract/DAG.lean` — prerequisites
20. `ActionProgrammingMechanic` — program N actions
21. `RondelMechanic` — cyclic action wheel
22. `ChainingMechanic` — trigger-effect chains
23. `MultiModeCardMechanic` — multi-use cards
24. `FogOfWarMechanic` — hidden positions + clues

### Phase 5: Game bridges
25. Per-game Bridge modules for all 18 games
26. Auto-generate bridge scaffolding from RULES.md frontmatter
27. CI integration: `lake build` on every RULES.md change

---

## Total New Typeclasses Needed: 28

| Category | Count | Examples |
|----------|-------|---------|
| Card extensions | 5 | SetCollection, CardMatching, MultiMode, Splay, LadderClimbing |
| Economic | 5 | Commodity, Contract, Stock, Investment, AutoGrowth |
| Social/Political | 5 | Voting, Negotiation, Bribery, PrisonersDilemma, CommunicationLimits |
| Action systems | 4 | ActionQueue, ActionProgramming, SimultaneousAction, Chaining |
| Spatial | 4 | AreaControl, PatternBuilding, FogOfWar, ZoneOfControl |
| Movement | 2 | Rondel, Cargo/PickupDelivery |
| Drafting | 2 | OpenDrafting, ClosedDrafting |
| Risk | 1 | PushYourLuck |

Plus 5 new abstract patterns: Market, Grid, PayoffMatrix, DAG, Queue.
Plus extensions to 5 existing typeclasses (turn manipulation, shared pool, etc).

This gives complete formal coverage of all 18 games in the catalog.
