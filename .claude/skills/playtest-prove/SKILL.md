---
name: playtest-prove
description: Formal verification of game mechanics using Lean 4. Use when the user asks to "prove mechanics", "verify a game", "check mechanic algebra", "formalize rules", "compile lean", "add a lean game", or wants to use the Lean 4 verification layer. Manages the Lean mechanic algebra that catches composition errors at compile time.
argument-hint: <command> [args...] (build|verify|add-game|add-mechanic|gaps|status|install)
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Playtest Prove - Lean 4 Mechanic Algebra

Formal verification layer that expresses the Playtest engine's mechanic system as Lean 4 typeclasses with proof obligations. Catches mechanic composition errors at compile time rather than runtime.

## Vision

The Playtest engine composes 160+ mechanics at runtime via hooks, dependency injection, and `StateChanges` merging. The Lean layer mirrors this as:

- **Core mechanics** = typeclasses with operations + laws (proof obligations)
- **`requires: [X]`** = typeclass constraints (`[XMechanic G]`)
- **`conflicts: [X, Y]`** = negated conjunction (`¬(XMechanic G ∧ YMechanic G)`)
- **Hook chains** = sequential function composition with invariant preservation
- **Runtime guards** = compile-time proof obligations (e.g., `amount ≤ pool`)
- **Game definitions** = concrete type instantiating all required typeclasses

When a game compiles against the algebra, it proves that the mechanic composition is structurally sound. When it fails, the errors pinpoint exactly which mechanic contracts are violated.

## Architecture

```
lean/                              # Lean 4 project root
├── lakefile.lean                  # Lake build config (autoImplicit=false)
├── lean-toolchain                 # leanprover/lean4:v4.16.0
└── mechanics/
    ├── Core/                      # 8 core typeclasses (mirror src/mechanics/core/)
    │   ├── Types.lean             # PlayerId, Card, Zone, Effect, Action, etc.
    │   ├── Resources.lean         # ResourceMechanic: get/add/spend with frame conditions
    │   ├── Cards.lean             # CardMechanic: hand/deck/discard with conservation
    │   ├── Board.lean             # BoardMechanic: graph movement with reachability
    │   ├── Turns.lean             # TurnMechanic: cyclic order with monotone turns
    │   ├── Effects.lean           # EffectsMechanic: timed buffs/debuffs with tick
    │   ├── Dice.lean              # DiceMechanic: bounded rolls with nondeterminism
    │   └── Visibility.lean        # VisibilityMechanic: epistemic logic, hidden roles
    ├── Leaf/                      # Leaf mechanic typeclasses (require core)
    │   ├── WinConditions.lean     # Score threshold, reach state, empty hand, max rounds
    │   ├── TrickTaking.lean       # Follow-suit law, trick resolution
    │   ├── AuctionEnglish.lean    # Monotone bids, termination
    │   ├── DeckBuilding.lean      # Personal deck acquisition, supply management
    │   └── WorkerPlacement.lean   # Capacity constraints, worker pool validity
    ├── Composition/               # How mechanics compose
    │   ├── HookChain.lean         # Hook resolution strategies, invariant preservation
    │   └── Registry.lean          # Dependency resolution, conflict detection
    └── Games/                     # Concrete game formalizations
        ├── MarkovsChains.lean     # Full formalization (compiles clean)
        └── AAOTE.lean             # Gap analysis (9 identified algebra gaps)
```

## Prerequisites

### Installing Lean 4

```bash
# Install elan (Lean version manager)
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none

# Ensure elan is on PATH
export PATH="$HOME/.elan/bin:$PATH"

# The lean-toolchain file pins to v4.16.0
# Lake will auto-download the correct version on first build
```

### Building

```bash
export PATH="$HOME/.elan/bin:$PATH"
cd lean/
lake build
```

**Expected output**: All 23 modules compile. Warnings for `sorry` (proof placeholders) and unused variables are expected. Zero errors means the algebra is structurally consistent.

## Commands

### `build` - Compile the Lean Algebra

Install Lean if needed, then build all 23 modules.

```bash
# Ensure elan is installed
if ! command -v elan &> /dev/null; then
  curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
fi

export PATH="$HOME/.elan/bin:$PATH"
cd lean/ && lake build
```

**Interpret results:**
- `Built X/23` = modules compiled successfully
- `sorry` warnings = proof placeholders (intentional, not errors)
- Actual errors = algebra inconsistencies that need fixing

### `verify <game>` - Verify a Game Against the Algebra

Check whether a game's mechanic composition compiles. Read the game's RULES.md, identify its mechanics, and check if the corresponding Lean file in `Games/` compiles.

**Implementation:**
1. Read `games/{game}/RULES.md` to extract mechanics list
2. Check if `lean/mechanics/Games/{GameName}.lean` exists
3. If exists: `cd lean/ && lake build Games.{GameName}`
4. If not exists: report which typeclasses the game would need and whether they exist
5. Report compilation result: clean compile = verified, errors = gaps found

### `add-game <game>` - Formalize a New Game

Create a new Lean file expressing a game's mechanic composition against the algebra.

**Implementation:**
1. Read `games/{game}/RULES.md` thoroughly
2. Read the game's TypeScript mechanics (if any custom ones exist in game config)
3. Identify which core + leaf typeclasses the game needs
4. Create `lean/mechanics/Games/{GameName}.lean`:
   - Import required Core and Leaf modules
   - Define game-specific types (board states, card categories, etc.)
   - Define the concrete `GameState` structure
   - Attempt typeclass instantiation for each required mechanic
   - Where instantiation fails, document the gap with `sorry` and comments
5. Update `lean/mechanics/Games.lean` to import the new file
6. Run `lake build` to check compilation
7. Report: which mechanics compiled, which have gaps, what the gaps mean

**Template for new game file:**
```lean
/-
  Games/{GameName}.lean — {Game title} as a mechanic composition.

  {Game} uses: {list of mechanics}
  Win condition: {win condition}
-/

import Core.Resources  -- if game uses resources
import Core.Cards      -- if game uses cards
import Core.Board      -- if game uses board
-- ... import as needed

namespace Playtest.Games.{GameName}

open Playtest

/-! ## Game-Specific Types -/

-- Define board states, card categories, etc.

/-! ## Game State -/

structure GameState where
  -- Fields from each required mechanic
  -- ...

/-! ## Mechanic Instantiation -/

-- Attempt to instantiate each required typeclass
-- Document gaps where instantiation fails

/-! ## Game-Specific Theorems -/

-- Prove properties unique to this game
-- (reachability, termination, balance, etc.)

end Playtest.Games.{GameName}
```

### `add-mechanic <name>` - Add a New Mechanic Typeclass

Create a new Lean typeclass for a mechanic that doesn't yet exist in the algebra.

**Implementation:**
1. Read the TypeScript mechanic source in `src/mechanics/{name}.ts`
2. Identify:
   - What state it manages
   - What operations it exposes
   - What its `requires` are (become typeclass constraints)
   - What hooks it defines/implements
   - What invariants it maintains (become laws)
3. Create `lean/mechanics/Leaf/{Name}.lean` (or Core/ if infrastructure)
4. Define the typeclass with operations and laws
5. Add standalone helper functions and theorems
6. Update the appropriate module file (Leaf.lean or Core.lean)
7. Run `lake build`

**Typeclass design principles:**
- Operations mirror the TypeScript hook signatures
- Laws capture invariants that TypeScript checks at runtime
- Use `Prop` equality (`=`) not `BEq` (`==`) in if-conditions for proof compatibility
- Declare all type variables explicitly (`autoImplicit=false`)
- `from` is a reserved keyword — use `src` for source nodes
- Use `abbrev` (not `def`) for type aliases that need typeclass synthesis transparency

### `gaps [game]` - Analyze Algebra Gaps

Report what's missing from the algebra, optionally focused on a specific game.

**Implementation:**
1. If game specified: read its RULES.md and identify needed mechanics
2. Compare against existing Lean typeclasses
3. For each gap:
   - Which TypeScript mechanic has no Lean counterpart?
   - What category is the gap? (missing typeclass, typeclass too rigid, cross-mechanic)
   - What would the typeclass need to look like?
4. Count `sorry` statements across all Lean files (proof gaps)
5. Report statistics: X/Y typeclasses exist, Z proofs complete, W sorry'd

### `status` - Report Algebra Health

**Implementation:**
1. Count Lean files and modules
2. Run `lake build` and parse output
3. Count completed proofs vs `sorry` placeholders
4. List all typeclasses and their proof completion status
5. List all game formalizations and their status

### `install` - Install Lean 4 Toolchain

Install elan and the Lean 4 toolchain, verify it works.

```bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
export PATH="$HOME/.elan/bin:$PATH"
cd lean/ && lake build
```

## Core Typeclasses Reference

| Typeclass | Module | Laws | Operations | Sorry'd |
|-----------|--------|------|------------|---------|
| `ResourceMechanic` | Core/Resources | 5 | get/add/spend/has | 0 |
| `CardMechanic` | Core/Cards | 4 | hand/deck/draw/play/discard | 0 |
| `BoardMechanic` | Core/Board | 4 | position/states/move/targets | 0 |
| `TurnMechanic` | Core/Turns | 3 | current/order/advance/round | 0 |
| `EffectsMechanic` | Core/Effects | 2 | get/add/remove/tick/blocked | 0 |
| `DiceMechanic` | Core/Dice | 2 | roll/lastRoll | 2 |
| `VisibilityMechanic` | Core/Visibility | 4 | visible/canSee/reveal/role/team | 0 |

## Leaf Typeclasses Reference

| Typeclass | Requires | Module | Laws |
|-----------|----------|--------|------|
| `WinScoreThreshold` | ResourceMechanic | Leaf/WinConditions | 1 |
| `WinReachState` | BoardMechanic | Leaf/WinConditions | 1 |
| `WinEmptyHand` | CardMechanic | Leaf/WinConditions | 1 |
| `WinMaxRounds` | TurnMechanic | Leaf/WinConditions | 1 |
| `TrickTakingMechanic` | CardMechanic | Leaf/TrickTaking | 3 |
| `AuctionMechanic` | ResourceMechanic | Leaf/AuctionEnglish | 3 |
| `DeckBuildingMechanic` | CardMechanic | Leaf/DeckBuilding | 3 |
| `WorkerPlacementMechanic` | ResourceMechanic | Leaf/WorkerPlacement | 4 |

## Known Gaps (from AAOTE Analysis)

| # | Gap | Category | Description |
|---|-----|----------|-------------|
| 1 | ActionPointsMechanic | Missing typeclass | Resource with per-turn reset (not persistent) |
| 2 | DynamicBoardMechanic | Typeclass too rigid | Board grows as players place locations |
| 3 | TypedCardMechanic | Typeclass too rigid | Card type restricts allowed operations |
| 4 | TradingMechanic | Missing typeclass | Bilateral consent + out-of-turn response |
| 5 | AsymmetricWinMechanic | Missing typeclass | Role-dependent win + declaration pattern |
| 6 | Entry Requirements | Cross-mechanic | Board movement depends on cards + roles |
| 7 | Location Effects | Cross-mechanic | Board events trigger card/visibility hooks |
| 8 | Ability Cooldowns | Missing typeclass | Per-round reset distinct from Effects |
| 9 | History Tracking | Missing primitive | Monotone counters for cumulative objectives |

## Lean 4 Gotchas (v4.16.0 with autoImplicit=false)

1. **ALL type variables must be explicitly declared** — `{G : Type}`, `{cards : List Card}`, etc.
2. **`from` is reserved** — use `src`, `source`, or `s` for graph edges
3. **Use `=` not `==` in if-conditions** — Prop equality enables `split`/`subst`/`omega` tactics; BEq (`==`) doesn't
4. **`abbrev` not `def` for type aliases** — `def X := List Y` is opaque to typeclass synthesis; `abbrev` is transparent
5. **`Nat.le_refl` not `le_refl`** — qualified names required
6. **`List.mem_cons_self` not `List.mem_cons_of_head`** — check Lean 4 stdlib naming
7. **`List.flatMap` not `List.bind`** — deprecated in v4.16.0
8. **`simp` is powerful** — often solves goals completely; following tactics may error with "no goals"
9. **Function types can't `deriving Repr`** — structs with `PlayerId → X` fields need manual instances
10. **`List.get!` requires `Inhabited`** — prefer pattern matching or `List.get` with proof

## Integration with Other Skills

After formalizing a game:
- `/playtest {game} {n}` to runtime-test it
- `/game-mechanic analyze {game}` to check mechanic composition
- `/playtest-prove gaps {game}` to see what the algebra can't yet express

The algebra and the engine are complementary:
- **Engine** (TypeScript): runtime execution, agent interaction, state management
- **Algebra** (Lean): compile-time verification that mechanic contracts hold

## What Compilation Proves

When a game file compiles against the algebra:

1. **Dependency satisfaction** — every `requires` is met (typeclass constraints resolved)
2. **Operation well-typedness** — mechanic operations compose without type errors
3. **Law preservation** — if proofs completed (not sorry'd), invariants are formally verified:
   - Resources: spending never exceeds balance, frame conditions hold
   - Cards: conservation (no card duplication/loss), zone transfer correctness
   - Board: movement validity, reachability properties
   - Turns: monotone advancement, cyclic order
   - Effects: duration ticking, player isolation
   - Auctions: monotone bids, termination
   - Workers: capacity constraints, pool validity

When compilation fails, the errors are precise:
- **"failed to synthesize X"** = missing mechanic dependency
- **"type mismatch"** = mechanic operations don't compose correctly
- **Unsolved goals** = invariant can't be maintained under the proposed composition
