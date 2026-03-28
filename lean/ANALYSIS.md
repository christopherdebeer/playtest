# Mechanic Algebra Analysis: What Lean Proves About the Engine

## Executive Summary

The Lean 4 formalization layer expresses the Playtest engine's mechanic system as
typeclasses with proof obligations. After compiling all 23 modules against 18 games
and 160+ TypeScript mechanics, this analysis answers three questions:

1. **What does compilation actually prove?**
2. **How can the algebra become truly general-purpose?**
3. **How can it improve or replace existing engine mechanics?**

---

## 1. What Compilation Proves (and Doesn't)

### What a Clean Compile Means

When `Games/MarkovsChains.lean` compiles, Lean verifies:

**Structural soundness** — The game's mechanic composition type-checks:
- Every `requires` dependency is satisfied (typeclass constraints resolve)
- Operations from different mechanics compose without type errors
- The game state structure carries all fields needed by all mechanics

**Proven invariants** (where proofs are complete, not `sorry`):
- `no_dead_states`: Every non-victory board state has an outgoing edge
- `victory_reachable_from_start`: A 3-hop path exists (Start -> A -> CX -> Victory)
- `min_hops_to_victory`: No shorter path exists (no 2-hop shortcut)
- `probabilities_valid`: No transition exceeds 100%
- `game_terminates`: With max rounds, the game must end
- `expected_min_turns`: Minimum expected turns = 9 (via ceiling division)

**Core mechanic laws** (proven at the typeclass level):
- Resources: `add_spend_roundtrip` — adding then spending is identity
- Resources: `spend_frame`, `add_frame` — operations are player-isolated
- Cards: `transfer_moves_card`, `transfer_frame` — zone transfers are correct
- Effects: `permanent_survives_tick` — permanent effects don't expire
- Turns: `advance_monotone` — turn numbers strictly increase
- Visibility: `reveal_role_frame` — revealing to A doesn't affect B's knowledge
- Auctions: `bid_strictly_increases`, `auction_terminates`
- Workers: `place_preserves_validity`, `retrieve_clears_player`

### What Compilation Does NOT Prove

**Runtime behavior** — The algebra doesn't execute games. It verifies structure,
not that agents make valid moves or that the game is fun.

**Hook ordering** — The TypeScript engine fires hooks in registration order with
three resolution strategies (blocking, merge, first). The `HookChain.lean` models
this but `blocking_preserves_invariant` is still `sorry`'d.

**Dynamic dispatch** — At runtime, the engine does `Object.assign(state, changes)`
to merge StateChanges from multiple mechanics. The algebra can't verify that two
mechanics don't clobber each other's state fields (this is a dynamic property).

**Balance** — "Is this game fair?" is not a type-level question. The algebra can
prove structural bounds (minimum turns, probability caps) but not emergent balance.

### What Failed Compilation Reveals

When `Games/AAOTE.lean` fails to compile, each error is a precise diagnostic:

| Error | Meaning |
|-------|---------|
| `failed to synthesize ActionPointsMechanic` | No typeclass for per-turn-reset resources |
| `failed to synthesize DynamicBoardMechanic` | BoardMechanic assumes fixed graph |
| `failed to synthesize TradingMechanic` | No bilateral consent model |
| Type mismatch in `canEnterLocation` | Cross-mechanic preconditions aren't expressible |

These aren't bugs — they're **design signals**. The algebra is a formal language
for asking "does this game fit the engine's abstractions?" and getting a precise
answer when it doesn't.

---

## 2. Making the Algebra Truly General-Purpose

### Current Coverage

The algebra covers **8 core typeclasses** and **5 leaf typeclasses**. Mapping this
against the engine's 160+ mechanics and 18 games:

| Category | TS Mechanics | Lean Typeclasses | Coverage |
|----------|-------------|-----------------|----------|
| Resources | resources, income, auto-growth, catch-leader, loans, investment, commodity-spec, stock-holding | ResourceMechanic | 1/8 (12%) |
| Cards | cards, hand-mgmt, card-matching, set-collection, drafting (x2), deck-building, deck-construction, multi-use, place-card, tableau-building, placed-effects, card-type-rules | CardMechanic, DeckBuilding, TrickTaking | 3/13 (23%) |
| Board | board, grid-movement, area-movement, point-to-point, roll-spin-move, tile-placement, place-location, hidden-movement, modular-board, map-addition, hexagon-grid, square-grid | BoardMechanic | 1/12 (8%) |
| Turns | pass, turn-order-random, stat-based, progressive, pass-order, claim, auction, time-track, role | TurnMechanic | 1/9 (11%) |
| Effects | effects, chaining, lose-a-turn, advantage-token | EffectsMechanic | 1/4 (25%) |
| Dice | dice, dice-rolling, re-rolling, critical-hits, die-icon, different-dice-movement, chit-pull, push-your-luck | DiceMechanic | 1/8 (12%) |
| Visibility | visibility, hidden-roles, hidden-objectives, hidden-VP, traitor-game, roles-asymmetric, deduction, memory | VisibilityMechanic | 1/8 (12%) |
| Social | social, voting, negotiation, player-judge, i-cut-you-choose, bribery, communication-limits | None | 0/7 (0%) |
| Combat | combat, critical-hits, zone-of-control, ratio-crt, force-commitment, kill-steal | None | 0/6 (0%) |
| Workers | workers, worker-placement, different-types, dice-workers | WorkerPlacementMechanic | 1/4 (25%) |
| Win Cond | 13 specific win conditions | WinScoreThreshold, WinReachState, WinEmptyHand, WinMaxRounds | 4/13 (31%) |
| Actions | action-points, action-programming, action-timer, action-queue, action-drafting, action-retrieval, action-event, simultaneous-selection, freeplay, rondel | None | 0/10 (0%) |
| Economy | trading, market, contracts, ownership | None | 0/4 (0%) |
| Auction | english, sealed, once-around, dutch, dutch-priority, fixed-placement, multiple-lot, compensation, turn-order-until-pass, bidding | AuctionMechanic | 1/10 (10%) |
| Cooperative | cooperative, semi-cooperative, cooperative-actions, team-based | None | 0/4 (0%) |
| Special | events, alliances, betting-bluffing, prisoners-dilemma, ladder-climbing, matching, pattern-building, network-route, pick-up-deliver, enclosure, grid-coverage, area-majority, tug-of-war, tech-trees, storytelling, variable-powers, variable-setup, once-per-game, contracts, score-reset, interrupts, follow | None | 0/22 (0%) |

**Overall: 13/160 mechanics formalized (8%)**

### The Path to General Purpose: Layered Abstraction

The algebra should NOT try to formalize all 160 mechanics individually. Instead,
it should capture the **structural patterns** that mechanics share:

#### Layer 1: Abstract Mechanic Patterns (new)

These typeclasses capture patterns shared by many concrete mechanics:

```
PoolMechanic          — anything with get/add/spend on a named pool
  instances: ResourceMechanic, ActionPointsMechanic, MovementPointsMechanic

ResettableMechanic    — pool that resets at a boundary (turn/round)
  instances: ActionPointsMechanic (per-turn), AbilityCooldowns (per-round)

CollectionMechanic    — typed items in named zones with transfer operations
  instances: CardMechanic, WorkerMechanic, CargMechanic

GraphMechanic         — positions on a graph with constrained movement
  instances: BoardMechanic (fixed), DynamicBoardMechanic (growing), RondelMechanic (cyclic)

BilateralMechanic     — two-party interactions with offer/accept/decline
  instances: TradingMechanic, NegotiationMechanic, AllianceMechanic

ScoringMechanic       — win condition checking with configurable criteria
  instances: all 13 win condition mechanics

SequentialMechanic    — ordered action execution with priority
  instances: TrickTaking, LadderClimbing, AuctionMechanic (all variants)

SimultaneousMechanic  — all-at-once action selection
  instances: ActionProgramming, SimultaneousSelection, PrisonersDilemma
```

This reduces 160 mechanics to ~8 abstract patterns. Each pattern carries the
laws that ALL its instances must satisfy.

#### Layer 2: Composition Constraints (strengthened)

The current `HookChain.lean` and `Registry.lean` model basic composition. To be
general-purpose, the algebra needs:

**Cross-mechanic invariant preservation:**
```lean
class MechanicComposition (G : Type) (M₁ M₂ : Type → Type) where
  compose_preserves : ∀ (inv : G → Prop),
    M₁.preserves inv → M₂.preserves inv → (M₁ ∘ M₂).preserves inv
```

**StateChanges commutativity:**
When two mechanics both return StateChanges, the merge order shouldn't matter:
```lean
theorem state_changes_commute (c1 c2 : StateChanges G) :
    applyChanges (applyChanges g c1) c2 = applyChanges (applyChanges g c2) c1
```

This is the engine's deepest assumption (Object.assign ordering is irrelevant)
and the hardest to prove. When it fails, it signals a real runtime bug.

**Hook resolution contracts:**
```lean
-- Blocking: if any hook blocks, the action doesn't execute
-- Merge: all hooks' state changes are applied
-- First: first non-none result wins
```

#### Layer 3: Game Verification (automated)

Instead of manually writing `Games/X.lean` for each game, generate it from
RULES.md frontmatter:

```
RULES.md                    Lean file
─────────                   ─────────
mechanics: [cards, board]   import Core.Cards; import Core.Board
                            variable {G : Type} [CardMechanic G] [BoardMechanic G]

engine_mechanics:
  action_points:            import Leaf.ActionPoints  (once created)
    points_per_turn: 3      theorem ap_sufficient : maxAP g ≥ 3

win_condition: reach_state  import Leaf.WinConditions
                            instance : WinReachState G where ...
```

This makes `/playtest-prove add-game` mechanical rather than creative.

### Priority Typeclasses to Add

Based on game coverage analysis, the highest-impact additions are:

| Priority | Typeclass | Games That Need It | Mechanics It Covers |
|----------|-----------|-------------------|---------------------|
| 1 | `ActionPointsMechanic` | AAOTE, Alliance, Arcane Assembly, Battle Forge, Shadow Ops, Treasure Hunters | action-points, movement-points |
| 2 | `SocialMechanic` | Council of Whispers, AAOTE | voting, negotiation, communication-limits |
| 3 | `SimultaneousMechanic` | Arcane Assembly, Spellbook Showdown, Shadow Ops, Council of Whispers | simultaneous-selection, action-programming |
| 4 | `TradingMechanic` | AAOTE, Grand Bazaar, Battle Forge | trading, market |
| 5 | `DynamicBoardMechanic` | AAOTE, Engine Masters (deck as "board") | grid-movement, place-location, map-addition |
| 6 | `HistoryMechanic` | AAOTE, Engine Masters, Grand Bazaar | monotone counters, cumulative tracking |
| 7 | `CombatMechanic` | Shadow Ops | combat, critical-hits, zone-of-control |
| 8 | `CooperativeMechanic` | Alliance, Shadow Ops | cooperative-game, semi-cooperative, team-based |

Adding just #1-#4 would cover the mechanics used by 14/18 games.

---

## 3. How the Algebra Can Improve or Replace Engine Mechanics

### Near-Term: Verification Layer (Current Role)

The algebra sits alongside the engine, catching errors the engine can't:

**Game design validation** — Before runtime testing:
```
/game-mechanic author my-game
/playtest-prove verify my-game
→ "Error: your game requires TradingMechanic but also uses
   WinEmptyHand — trading adds cards to hand, making empty-hand
   win condition harder to achieve. Is this intentional?"
```

**Mechanic compatibility checking** — At config time:
```
/playtest-prove gaps my-game
→ "Your game uses action-points + freeplay. ActionPointsMechanic
   assumes turn-based AP reset. Freeplay has no turns. These
   mechanics have no composition theorem."
```

**Regression detection** — When mechanics change:
```
# Modify resources.ts to allow negative balances
/playtest-prove build
→ "Error in ResourceMechanic.spend_monotone: goal unsolvable.
   The spend operation no longer guarantees non-negative result."
```

### Medium-Term: Code Generation

The Lean typeclasses can **generate** TypeScript mechanic skeletons:

```
Lean typeclass                    Generated TypeScript
──────────────                    ─────────────────────
class FooMechanic (G : Type)      export const fooMechanic: MechanicHooks = {
  getFoo : G → PlayerId → Nat       slug: 'foo',
  addFoo : G → PlayerId → Nat → G   requires: [],
  add_increases : ∀ ...              // Law: getFoo (addFoo g pid n) pid = getFoo g pid + n
                                     // Enforced at: postExecuteAction validation
                                   }
```

The laws become runtime assertions or test cases. This inverts the current flow:
instead of writing TypeScript first and Lean second, write Lean first and generate
TypeScript that's correct by construction.

### Long-Term: Algebra as Engine Core

The algebra could replace the TypeScript hook system entirely for mechanic
composition logic:

**Current architecture:**
```
RULES.md → TypeScript engine → hooks → StateChanges → Object.assign → state
           (dynamic, untyped)  (any order)  (may conflict)
```

**Algebra-driven architecture:**
```
RULES.md → Lean verification → TypeScript runtime → verified StateChanges → state
           (static, proven)    (execution only)     (conflict-free by proof)
```

In this architecture:
1. Lean verifies that the mechanic composition is sound at game-design time
2. Lean generates the composition order and conflict resolution strategy
3. TypeScript executes the verified composition at runtime
4. No runtime validation needed — correctness is a compile-time property

This eliminates entire categories of runtime bugs:
- Mechanics clobbering each other's state
- Missing dependency hooks
- Invalid action sequences
- Win condition unreachability

---

## 4. Game-by-Game Algebra Coverage

### Games That Compile Clean

| Game | Mechanics Used | Lean Status |
|------|---------------|-------------|
| Markov's Chains | board, cards, effects, dice, turns, win-reach-state | Full formalization, 8 theorems proven |
| UNO | cards, card-matching, win-empty-hand | Could compile with existing algebra |
| Treasure Hunters | cards, set-collection, income, win-score-threshold | Could compile (income needs ResourceMechanic extension) |

### Games That Reveal Gaps

| Game | Key Gap | What It Teaches |
|------|---------|-----------------|
| AAOTE | Dynamic board, trading, asymmetric win | Social deduction needs 4+ new typeclasses |
| Council of Whispers | Voting, negotiation, prisoner's dilemma | Social mechanics are entirely missing |
| Arcane Assembly | Simultaneous selection, tech trees, pattern building | Simultaneous play and prerequisite chains aren't modeled |
| Shadow Operations | Hidden movement, area majority, tug-of-war, events | Spatial control and event systems need typeclasses |
| Grand Bazaar | 3 auction types, I-cut-you-choose, contracts | Auction variants need parameterized typeclass |
| Engine Masters | Chaining (6 rules), exponential growth | Chain composition with limits is complex |
| Spellbook Showdown | Multi-use cards, melding/splaying, queuing | Card modes and spatial arrangement not modeled |
| Rondel Express | Rondel, pick-up-deliver, pass-order turn order | Cyclic action spaces and cargo systems missing |

### Complexity Tiers

**Tier 1 (algebra covers):** UNO, Treasure Hunters, Parallel Race, Markov's Chains
— Fixed board/cards, uniform win conditions, standard turn order.

**Tier 2 (needs 2-3 new typeclasses):** Draft Duel, Fortune Seekers, Road Rally,
Dice Dynasties — Need drafting, push-your-luck, or variable powers.

**Tier 3 (needs 4-6 new typeclasses):** Alliance, Battle Forge, Engine Masters,
Rondel Express — Need economy extensions, chaining, rondel.

**Tier 4 (needs fundamental extensions):** AAOTE, Council of Whispers, Arcane
Assembly, Shadow Operations, Grand Bazaar, Spellbook Showdown — Need social
mechanics, simultaneous play, dynamic topology, cross-mechanic constraints.

---

## 5. Proof Inventory

### Complete Proofs (37 total)

**Core/Resources:** 7 — roundtrip, frame conditions, commutativity, identity
**Core/Cards:** 5 — transfer, frame, draw-into-hand, conservation
**Core/Effects:** 6 — tick decreases, permanent survives, add increases, clear
**Core/Board:** 1 — reachability transitivity
**Core/Turns:** 4 — advance increments, monotone, current valid, size positive
**Core/Visibility:** 3 — self-visible, reveal-makes-known, reveal-frame
**Leaf/TrickTaking:** 3 — play increases, first sets lead, nonempty has winner
**Leaf/AuctionEnglish:** 3 — bid increases, terminates, sole bidder wins
**Leaf/DeckBuilding:** 3 — reshuffle preserves, acquire increases, draw succeeds
**Leaf/WorkerPlacement:** 4 — occupancy, frame, retrieve clears, validity
**Composition/HookChain:** 1 — merge preserves invariant
**Games/MarkovsChains:** 8 — reachability, min hops, no dead states, probabilities, termination, expected turns

### Sorry'd Proofs (12 total)

**Core/Dice:** 3 — roll bounds (technical, provable with Fin arithmetic)
**Leaf/WinConditions:** 3 — threshold reachable (needs multiplication bounds), composed finds winner
**Leaf/TrickTaking:** 1 — legal play exists (needs hand non-empty case analysis)
**Leaf/AuctionEnglish:** 1 — pass reduces bidders (List.erase length)
**Leaf/DeckBuilding:** 1 — draw reduces deck (List.tail length)
**Composition/HookChain:** 1 — blocking preserves invariant (pattern match on BlockingHook)
**Composition/Registry:** 2 — valid config satisfies deps, no conflicts
**Games/AAOTE:** 1 — adjacent_symm (Int BEq/Bool interplay)

---

## 6. Recommendations

### Immediate (next session)

1. **Fill sorry's** in Core/Dice (roll bounds) — straightforward Fin arithmetic
2. **Add ActionPointsMechanic** typeclass — highest-impact single addition
3. **Formalize UNO** — simplest game not yet in algebra, validates card-matching pattern
4. **Add SocialMechanic** typeclass — unlocks Council of Whispers formalization

### Short-term (next few sessions)

5. **Abstract pattern typeclasses** — PoolMechanic, CollectionMechanic, GraphMechanic
6. **Formalize 3-4 more games** at each tier to validate coverage
7. **Strengthen HookChain** — prove blocking_preserves_invariant, add commutativity
8. **StateChanges commutativity** — formalize the engine's merge semantics

### Medium-term

9. **Auto-generate game files** from RULES.md frontmatter
10. **Generate TypeScript from Lean** — verified mechanic skeletons
11. **CI integration** — `lake build` runs on every RULES.md change
12. **Parametric auction typeclass** — one typeclass covering all 10 auction variants
