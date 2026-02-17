# Proposal 014: Generic Mechanics Audit — Engine Agnosticism & Mechanic Agent Delegation

## Status: Draft (v2 — expanded from parallel audit of all 150+ mechanics, 18 game RULES.md files, win conditions, core engine, and mechanic agent protocol)

---

## Problem

The engine contains hardcoded knowledge about what specific strings — effect types, card types, player states — *mean*. This violates the core principle: **the engine must be game-agnostic**. A game author who invents a `"curse"` effect, a `"trap"` card type, or a `"defeated"` player state cannot use engine features without editing TypeScript.

The initial audit identified 7 hardcoded locations. The full parallel audit across all mechanics, games, win conditions, and agent protocol found the pattern is **systemic** — with 20+ distinct violation sites falling into 6 categories.

---

## Full Audit Findings

### Category 1: Effect Type Hardcoding (Engine Infers Semantics from Strings)

| File | Hardcoded Construct | What It Assumes |
|------|--------------------|-----------------|
| `src/mechanics/core/targeting.ts` | `OPPONENT_EFFECT_TYPES` set | Certain effect names always target opponents |
| `src/mechanics/core/targeting.ts` | `TARGETING_KEYWORDS` regex | Description text reveals targeting intent |
| `src/mechanics/core/effect-dispatcher.ts` | `UNIVERSAL_EFFECT_TYPES = ['draw', 'score', 'reverse']` | These effects are structurally universal |
| `src/mechanics/core/effect-dispatcher.ts` | `OPPONENT_TARGETING_EFFECTS` set | Duplicate/extended targeting inference |
| `src/mechanics/core/effect-dispatcher.ts` | `KNOWN_PASSIVE_EFFECTS` set | Certain names don't need lifecycle interventions |
| `src/mechanics/core/effects.ts` | `isBlocked()` list `['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen']` | Certain names prevent a player from acting |
| `src/mechanics/take-that.ts` | `INTERFERENCE_EFFECTS` list | Certain names identify attack cards |
| `src/mechanics/location-effects.ts` | `LOCATION_EFFECT_TYPES = ['draw_on_enter', 'heal_on_enter', 'damage_on_enter']` | Certain names trigger on location entry |
| `src/mechanics/placed-card-effects.ts` | `PLACED_CARD_EFFECT_TYPES` set | Certain names apply to placed/trap cards |

### Category 2: Card Type Hardcoding (Engine Infers Role from Type Name)

| File | Hardcoded Pattern | What It Assumes |
|------|--------------------|-----------------|
| `src/mechanics/card-matching.ts` | `card.type === 'wild'` | Cards named type `"wild"` change color |
| `src/mechanics/card-type-rules.ts` | `card.type === 'item'`, `card.type === 'location'` | Specific type names have specific playability rules |
| `src/mechanics/place-card.ts` | `card.type === 'location'` | Only `"location"` typed cards can be placed |
| `src/mechanics/take-that.ts` | `card.type === 'interference'` | Cards typed `"interference"` target opponents |
| `src/mechanics/card-matching.ts` | `DEFAULT_COLORS = ['Red', 'Blue', 'Green', 'Yellow']` | These are the only valid colors |

### Category 3: Player State Hardcoding (Engine Treats Specific States Specially)

| File | Hardcoded Value | What It Assumes |
|------|----------------|-----------------|
| `src/mechanics/win-conditions/elimination.ts` | `'eliminated'` string | This exact string marks a player as out |
| `src/mechanics/core/turns.ts` | `player.state === 'eliminated'` | Same |
| `src/mechanics/registry.ts` | `p.state !== 'eliminated'` | Same |
| `src/core/game.ts` (via `checkAllWinConditions`) | Via `turns.ts` | Same |
| `src/mechanics/core/pass.ts` | `toState: 'Victory'` | Victory declarations transition to exactly `"Victory"` |

### Category 4: Domain Constants Hardcoded in Engine Code

| File | Hardcoded Value | Problem |
|------|----------------|---------|
| `src/mechanics/hexagon-grid.ts` | Terrain types `['plains', 'forest', 'hills', 'water']` | Game-specific terrain vocabulary |
| `src/mechanics/hexagon-grid.ts` | `cell.terrain !== 'water'` blocks movement | Game-specific terrain restriction |
| `src/mechanics/hexagon-grid.ts` | Start positions `['0,0', '1,0', ...]` | Game-specific starting arrangement |
| `src/mechanics/freeplay.ts` | `DEFAULT_INTERACTION_ACTIONS = ['trade_offer', 'trade_respond', 'attack', ...]` | Specific action types are "interactions" |
| `src/mechanics/turn-order-stat-based.ts` | Field names `'score'`, `'actionPoints'`, `'tricksWon'`, `'handSize'` | Only these stats can determine turn order |
| `src/mechanics/roll-spin-and-move.ts` | `currentDoublesCount >= 3` → jail | Monopoly-specific triple-doubles rule |

### Category 5: Game Termination Hardcoding

| File | Hardcoded Pattern | Problem |
|------|------------------|---------|
| `src/core/game.ts:1006-1020` | `max_rounds` and `max_turns` as only timeout mechanisms | Cannot define "end when deck exhausted" or other termination conditions |
| `src/core/game.ts:69` | `AUTO_ADJUDICATION_TIMEOUT_MS = 60000` | Fixed timeout; can't adjust for faster/slower playtests |
| `src/core/game.ts:1576` | `AUTO_INTERVENTION_TIMEOUT_MS = 120000` | Fixed; can't configure per-game |
| `src/core/rules.ts:32` | `max_rounds: raw.max_rounds ?? 50` | Arbitrary default of 50 rounds |

### Category 6: Mechanic Agent Protocol Gaps

The mechanic agent has good coverage for single-player, single-field mutations but is missing:

**Missing primitives:**
- `mechanic:reverse-turn-order` — currently engine-only
- `mechanic:draw -p <player> --count N` — `--add-cards` doesn't interact with deck state
- `mechanic:discard -p <player> --count N` — force discard to discard pile
- `mechanic:transfer-card -f <from> -t <to> --card <name>` — atomic card theft/trade
- `mechanic:transfer-resource -f <from> -t <to> --resource <name> --amount N` — atomic resource transfer
- `mechanic:set-turn-order --order <json>` — beyond simple reversal
- `mechanic:end-game --winner <player>` — instant-win card effects

**Missing intervention context:**
- Full card object (`cardData`) not just name + description
- `targetMode` explicit in payload
- Effect flags (`blocks_turn`, `passive`) in payload
- Player hand contents (snapshot has `handSize` count, not actual cards)
- Board adjacency context for movement effects
- Deck/discard state for draw feasibility

**Atomicity gap:** Multi-step mutations (card theft = remove from A + add to B) are not atomic. A crash mid-sequence leaves state inconsistent.

**Single-intervention queue:** Only one `pendingIntervention` at a time. Multi-step effects that logically require chained interventions must be batched into a single resolution.

---

## The Unifying Pattern

Every violation above follows the same anti-pattern:

> **Code contains a set/array of strings that are also user-configurable data in RULES.md.**

The fix in every case is the same principle:

> **Move the semantic meaning from the code string-set to a flag or annotation co-located with the data in RULES.md.**

The engine reads flags (booleans, enums). It never matches against named string sets. Only the mechanic agent reads type name strings — to understand game semantics from RULES.md prose.

---

## Proposed Implementation Strategy

### Phase 1: Universal `targetMode` — Eliminate All Targeting Inference

**Principle**: Cards declare targeting intent explicitly. The engine never infers it.

**Card schema additions:**
```yaml
# Opponent-targeting card — explicit
- { name: "Block", targetMode: "opponents",
    effect: { type: "block_turn", duration: 1, blocks_turn: true } }

# Self-targeting (default, no targetMode needed)
- { name: "Catalyst", effect: { type: "probability_boost", value: 0.2, passive: true } }

# All opponents simultaneously
- { name: "Blizzard", targetMode: "all_opponents",
    effect: { type: "freeze", duration: 1, blocks_turn: true } }
```

**`targetMode` values:**
- `"self"` — default; affects the playing player
- `"opponents"` — must specify which opponent when >1 exist
- `"all_opponents"` — applies to every opponent simultaneously
- `"any"` — player chooses any player including themselves
- `"owner"` — for placed/trap cards: affects the player who placed it

**`targetFilter` for conditional targeting** (adjacency, state requirements):
```yaml
- { name: "Ambush", targetMode: "opponents",
    targetFilter: { adjacency: true },   # Only adjacent opponents are valid
    effect: { type: "steal_item" } }
```

**Engine changes:**
- `isOpponentTargeting(card)` → `card.targetMode === "opponents" || card.targetMode === "all_opponents"`
- Delete `OPPONENT_EFFECT_TYPES`, `TARGETING_KEYWORDS`, `OPPONENT_TARGETING_EFFECTS`
- Rules parser: warn (not error) if a card appears to target opponents but lacks `targetMode`
- `rules.ts:119`: remove hardcoded `targetMode: 'opponents'` default for placeable cards — require explicit

**RULES.md updates required for all 18 games** (17 games have opponent-targeting cards):
- Markov's Chains: `Friction`, `Block`, `Sabotage` → `targetMode: "opponents"`
- UNO: `Skip`, `Draw Two`, `Wild Draw Four` → `targetMode: "opponents"`
- AAOTE: `Spy`, `Interrogate`, `Theft`, `Roadblock`, `Sabotage` → explicit `targetMode`
- Spellbook Showdown: all damage/freeze spells → `targetMode: "opponents"` or `"all_opponents"`
- Parallel Race, Treasure Hunters: interference cards → `targetMode: "opponents"`

---

### Phase 2: Effect Flags — Eliminate All Hardcoded Effect-Semantic Sets

**Principle**: Effects carry their structural semantics as boolean flags. The engine reads flags, not type names.

**Three new flags on effect definitions:**

```yaml
effect:
  type: "block_turn"       # opaque — mechanic agent reads this
  duration: 1
  blocks_turn: true        # ENGINE: player.effects.some(e => e.blocks_turn) → skip turn
  passive: false           # ENGINE: false = needs lifecycle intervention when active
  on_enter: false          # ENGINE: false = not a location-entry effect
```

**Engine changes:**

*`effects.ts`:*
```typescript
// BEFORE
const BLOCKING = ['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen'];
isBlocked = () => player.effects.some(e => BLOCKING.includes(e.type));

// AFTER — zero knowledge of type names
isBlocked = () => player.effects.some(e => e.blocks_turn === true);
```

*`effect-dispatcher.ts`:*
```typescript
// BEFORE
const KNOWN_PASSIVE = new Set(['block_turn', 'probability_boost', ...]);
filter(e => !KNOWN_PASSIVE.has(e.type))

// AFTER
filter(e => e.passive !== true)
```

*`location-effects.ts`:*
```typescript
// BEFORE
const LOCATION_EFFECT_TYPES = ['draw_on_enter', 'heal_on_enter', 'damage_on_enter'];
if (LOCATION_EFFECT_TYPES.includes(effect.type))

// AFTER
if (effect.on_enter === true)
```

**Type additions (`game.ts`):**
```typescript
interface Effect {
  type: string;
  value?: number;
  duration?: number;
  source?: string;
  blocks_turn?: boolean;   // NEW
  passive?: boolean;       // NEW
  on_enter?: boolean;      // NEW
}
```

**RULES.md updates:**
- All cards with `block_turn`, `skip`, `lose_turn`, `freeze` effects → add `blocks_turn: true`
- All cards with `probability_boost/penalty`, movement mods → add `passive: true`
- All location entry effects (`draw_on_enter`, etc.) → add `on_enter: true`

**Eliminates:** `KNOWN_PASSIVE_EFFECTS`, `BLOCKING_EFFECT_TYPES`, `LOCATION_EFFECT_TYPES`, `PLACED_CARD_EFFECT_TYPES`, `INTERFERENCE_EFFECTS`

---

### Phase 3: Card Type Semantic Flags — Replace Card Type String Checks

**Principle**: Cards carry semantic flags that describe their role. The engine reads flags, not type name strings.

**Current problem**: `card.type === 'wild'`, `card.type === 'interference'`, `card.type === 'location'` etc. are scattered throughout engine mechanics. A game using `"joker"` for a wild card won't work with `card-matching`.

**Card schema additions:**
```yaml
# Instead of type: "wild" being special, the flag is explicit
- { name: "Wild", type: "wild", wild: true,
    effect: { type: "wild" } }

# Instead of type: "location" being checked in place-card.ts
- { name: "Ruins", type: "location", placeable_as_location: true,
    effect: { type: "draw_on_enter", on_enter: true } }

# Instead of type: "interference" being the opponent-targeting signal
- { name: "Block", type: "interference", targetMode: "opponents",
    effect: { type: "block_turn", blocks_turn: true } }
```

**Flag dictionary:**
- `wild: true` — card is a wild card (changes active color/suit); `card-matching` reads this
- `placeable_as_location: true` — card can be placed on the board as a location
- `placeable: true` — already exists; card can be placed as a trap/modifier (keep)
- `multi_use: true` — card has multiple playable modes (new; see compound effects)

**Engine changes:**
- `card-matching.ts`: `card.type === 'wild'` → `card.wild === true`
- `place-card.ts`: `card.type === 'location'` → `card.placeable_as_location === true`
- `card-type-rules.ts`: `card.type === 'item'` → configurable card type rules (see below)
- `cards.ts`: `c.type !== 'location'` filter → `!c.placeable_as_location`

**Configurable card type rules** (`card-type-rules.ts` generalization):
```yaml
mechanics:
  card_type_rules:
    type_rules:
      - { type: "item", can_play: true, requires_target: false }
      - { type: "event", can_play: true, requires_target: false }
      # engine reads these to determine playability; doesn't hardcode type names
```

**Eliminates:** All `card.type === 'specific_name'` checks in engine mechanics. Card types become opaque game-author labels; flags carry meaning.

---

### Phase 4: Configurable Elimination and Victory State Semantics

**Principle**: The strings `"eliminated"` and `"Victory"` should not be hardcoded in engine code.

**Current problem:** Five files check `player.state === 'eliminated'` or `e.type === 'eliminated'`. `pass.ts` hardcodes `toState: 'Victory'`. A game wanting `"defeated"` or `"out"` must patch code.

**Config schema addition:**
```yaml
engine_mechanics:
  player_lifecycle:
    eliminated_state: "eliminated"         # Default; game can override
    eliminated_effect_type: "eliminated"   # Default; game can override
    victory_state: "Victory"               # Default; game can override
```

**Engine changes:**
- Extract `isPlayerEliminated()` to shared utility that reads `config.engine_mechanics.player_lifecycle`
- `turns.ts`, `elimination.ts`, `registry.ts`, `win-conditions/` all call this utility
- `pass.ts` reads `victoryState` from config instead of hardcoding `'Victory'`

**Eliminates:** 5 separate hardcoded `"eliminated"` string checks; `toState: 'Victory'` in pass.ts

---

### Phase 5: Generalize Remaining Hardcoded Domain Arrays

Several mechanics hardcode game-specific vocabulary that should be RULES.md config.

**A. `card-matching.ts` — Default Colors:**
```yaml
# BEFORE: DEFAULT_COLORS = ['Red', 'Blue', 'Green', 'Yellow'] in code
# AFTER: in RULES.md
mechanics:
  card_matching:
    valid_colors: ["Red", "Blue", "Green", "Yellow"]  # Game configures this
```

**B. `hexagon-grid.ts` — Terrain Types and Movement Restrictions:**
```yaml
mechanics:
  hexagon_grid:
    terrain_types: ["plains", "forest", "hills", "water"]
    impassable_terrain: ["water"]       # Replaces hardcoded terrain !== 'water'
    start_positions: ["0,0", "1,0"]    # Replaces hardcoded array
```

**C. `freeplay.ts` — Default Interaction Actions:**
```yaml
mechanics:
  freeplay:
    interaction_actions: []             # Empty by default; game lists what needs synchronization
```

**D. `turn-order-stat-based.ts` — Stat Field Names:**
```typescript
// BEFORE: hardcoded field name list
const KNOWN_STAT_FIELDS = ['score', 'actionPoints', 'tricksWon', 'handSize', 'resources.*'];

// AFTER: use property path resolver on any field
// Config: sort_by: "resources.gold"
// Engine: resolves via getNestedValue(player, config.sort_by)
```

**E. `roll-spin-and-move.ts` — Monopoly-Specific Triple-Doubles:**
```yaml
mechanics:
  roll_spin_and_move:
    doubles_bonus: true
    max_consecutive_doubles: 3         # Replaces hardcoded `>= 3` check
    max_doubles_consequence: "jail"    # Mechanic agent handles "jail" action
```

---

### Phase 6: Delegate `reverse` and Shrink `UNIVERSAL_EFFECT_TYPES`

**Principle**: Only effects that are structural primitives for *every* conceivable game stay engine-native.

**Keep as engine-native:**
- `draw` — draw N cards from deck (high-frequency; universal card primitive)
- `score` — modify player score (high-frequency; universal resource primitive)

**Delegate to mechanic agent:**
- `reverse` — reverse turn order (game-specific; rare enough to afford agent latency)

**New CLI primitive:**
```bash
./playtest mechanic:reverse-turn-order {INSTANCE_ID}
```

**Engine changes:**
- Remove `'reverse'` from `UNIVERSAL_EFFECT_TYPES`
- Games using Reverse cards → agent intervention → `mechanic:reverse-turn-order`
- `UNIVERSAL_EFFECT_TYPES` becomes `['draw', 'score']`

**Note on UNO:** UNO has 8 Reverse cards — high frequency. For UNO-like games, the `card-matching` mechanic should handle `reverse` directly (it already reverses turn order as a structural mechanic behavior), bypassing the mechanic agent. This keeps the common case fast.

---

### Phase 7: Thin `take-that` and `lose-a-turn` — Remove Effect Routing Logic

After Phases 1–2, these mechanics' routing logic becomes redundant.

**`take-that.ts`:**
- Delete `INTERFERENCE_EFFECTS` constant
- Delete `onCardPlayed` hook (effect-dispatcher now routes correctly via `targetMode` + flags)
- Simplify `preValidateAction`: validate any card with `targetMode === "opponents"` has a valid target
- Result: ~80 lines of code → ~20 lines

**`lose-a-turn.ts`:**
- Delete `BLOCKING_EFFECT_TYPES` constant
- `isBlocked()` already reads `blocks_turn` flag — `lose-a-turn` mechanic becomes a no-op
- Can be deleted entirely; its function is subsumed by Phase 2

---

### Phase 8: Enrich Mechanic Agent — Payload, Primitives, and Transactions

**Intervention payload additions:**
```typescript
interface PendingIntervention {
  // existing fields...
  targetMode?: string;                    // "opponents" | "self" | "any" | etc.
  validTargets?: string[];                // Pre-computed legal target player IDs
  effectFlags?: {                         // Structural flags from card definition
    blocks_turn?: boolean;
    passive?: boolean;
    on_enter?: boolean;
  };
  cardData?: Record<string, unknown>;     // Full card object from RULES.md
  boardContext?: {                        // For movement/location triggers
    currentLocation: string;
    adjacentLocations: string[];
    blockedLocations: string[];
  };
  deckState?: {                           // For draw feasibility
    remaining: number;
    discardSize: number;
  };
}
```

**New CLI primitives:**
```bash
# Structural operations (atomic)
./playtest mechanic:reverse-turn-order {INSTANCE_ID}
./playtest mechanic:draw {INSTANCE_ID} -p player-1 --count 2        # From deck
./playtest mechanic:discard {INSTANCE_ID} -p player-1 --count 1     # Force discard
./playtest mechanic:transfer-card {INSTANCE_ID} -f player-1 -t player-2 --card "Gold Coin"
./playtest mechanic:transfer-resource {INSTANCE_ID} -f player-1 -t player-2 --resource gold --amount 3
./playtest mechanic:end-game {INSTANCE_ID} --winner player-1 --reason "Victory condition met"
```

**Tiered auto-resolution** (replaces blanket auto-skip):
```typescript
// Interventions declare their fallback strategy
PendingIntervention {
  autoResolveStrategy: 'apply_default' | 'skip';
}
// apply_default: structural effects (draw, score) — engine applies using effectValue/Duration
// skip: interpretive effects (steal, conditional, multi-step) — safe to skip
```

**Mechanic agent prompt updates:**
- Add all new commands to reference table
- Add guidance: "Effect flags are handled automatically — you don't re-apply `blocks_turn`. The engine reads it from the effect you add."
- Add `boardContext` and `deckState` to intervention field docs
- Add `validTargets` to eliminate manual target lookup

---

### Phase 9: Configurable Game Termination

**Principle**: Move `max_rounds`/`max_turns` timeout logic from engine core to win condition mechanics. This allows custom termination conditions.

**Current problem:** `game.ts:1006-1020` directly checks `max_rounds`/`max_turns` in the turn advancement loop. A game wanting "end when deck runs out twice" cannot express this.

**Changes:**
- Extract timeout check from `advanceTurn()` into win condition hook calls
- Existing `win-conditions/timeout-winner.ts`, `highest-lowest-scoring.ts` already respond to `'timeout'` trigger
- Engine fires `onCheckWin` with `trigger: 'turn_limit'` or `trigger: 'round_limit'` instead of directly ending the game
- Add to engine config schema:
```yaml
engine_debug:
  auto_adjudication_timeout_ms: 60000    # Was hardcoded
  auto_intervention_timeout_ms: 120000   # Was hardcoded
```

---

## Compound Effects (Cross-Cutting)

Several games have cards with multiple simultaneous effects (UNO's Draw Two = draw + lose turn; Spellbook Showdown multi-mode cards). The current schema only supports one effect per card.

**Proposed `effects` array (plural) on card definition:**
```yaml
- { name: "Draw Two", targetMode: "opponents",
    effects:
      - { type: "draw", value: 2 }
      - { type: "skip", blocks_turn: true }
  }

# Multi-mode card (Spellbook Showdown)
- { name: "Ember Shard", multi_use: true,
    modes:
      - { id: "attack", label: "Attack", effect: { type: "damage", value: 2 } }
      - { id: "resource", label: "Gain Mana", effect: { type: "gain_resource", resource: "mana", value: 1 } }
  }
```

Engine handles single `effect` (backwards compatible). If `effects` array present, each is processed in order. If `modes` array present, player specifies `mode` in action.

---

## Delegation Boundary Principle (Refined)

> **The engine handles: "set this specific field of this specific player/state to this specific value" — expressed via flags on data, not via knowledge of string names.**
>
> **The mechanic agent handles: anything that requires reading RULES.md to know *what* to change, *why*, or *whether*.**

Effect flags (`blocks_turn`, `passive`, `on_enter`) are game-author declarations about the *structural shape* of an effect — not its game semantics. The engine reads shape; the agent reads semantics.

---

## Summary: Changes Required

### Engine Files

| File | Change |
|------|--------|
| `src/mechanics/core/targeting.ts` | **Delete** entirely |
| `src/mechanics/core/effect-dispatcher.ts` | Remove all three hardcoded sets; replace with flag checks; remove `'reverse'` |
| `src/mechanics/core/effects.ts` | `isBlocked()`: flag check only |
| `src/mechanics/core/cards.ts` | `isOpponentTargeting()` → flag check; card type checks → flag checks |
| `src/mechanics/core/turns.ts` | `isEliminated()` → reads config |
| `src/mechanics/core/pass.ts` | Victory state from config |
| `src/mechanics/card-matching.ts` | `card.type === 'wild'` → `card.wild === true`; colors from config |
| `src/mechanics/card-type-rules.ts` | Type rules from config; no hardcoded type names |
| `src/mechanics/place-card.ts` | `card.type === 'location'` → `card.placeable_as_location === true` |
| `src/mechanics/take-that.ts` | Delete effect routing; keep target validation (simplified) |
| `src/mechanics/lose-a-turn.ts` | **Delete** — subsumed by `blocks_turn` flag |
| `src/mechanics/location-effects.ts` | `LOCATION_EFFECT_TYPES` → `effect.on_enter === true` |
| `src/mechanics/placed-card-effects.ts` | `PLACED_CARD_EFFECT_TYPES` → `effect.on_enter/passive` flags |
| `src/mechanics/freeplay.ts` | `DEFAULT_INTERACTION_ACTIONS` from config |
| `src/mechanics/hexagon-grid.ts` | Terrain types/restrictions/starts from config |
| `src/mechanics/turn-order-stat-based.ts` | Stat fields via property path resolver |
| `src/mechanics/roll-spin-and-move.ts` | Max consecutive doubles from config |
| `src/mechanics/win-conditions/elimination.ts` | Use shared `isEliminated()` |
| `src/mechanics/registry.ts` | `'eliminated'` check → via utility |
| `src/core/game.ts` | Timeout checks → win condition hooks; timeouts from config |
| `src/core/rules.ts` | `targetMode` default fix; `max_rounds` default fix |
| `src/types/game.ts` | `Effect` gains `blocks_turn?`, `passive?`, `on_enter?`; `Card` gains `targetMode?`, `wild?`, `placeable_as_location?`, `multi_use?`, `effects?`, `modes?` |
| `src/cli/index.ts` | Add 6 new `mechanic:*` commands |

### RULES.md Files (All 18 Games)

- Add `targetMode` to all opponent-targeting cards
- Add `blocks_turn: true` to all turn-blocking effects
- Add `passive: true` to all passively-checked effects
- Add `on_enter: true` to all location entry effects
- Replace `effect:` with `effects:` array for compound-effect cards (e.g., UNO Draw Two)

### Agent Files

- `.claude/agents/mechanic.md`: New commands, richer intervention field docs, flag semantics guidance

---

## What Stays in Engine vs. Mechanic Agent

### Engine (Structural — Fast, Deterministic, Flag-Driven)
| Operation | Mechanism |
|-----------|-----------|
| Turn blocking | `effect.blocks_turn === true` flag |
| Lifecycle intervention trigger | `!effect.passive` flag |
| Location entry trigger | `effect.on_enter === true` flag |
| Wild card identification | `card.wild === true` flag |
| Location card identification | `card.placeable_as_location === true` flag |
| Opponent targeting validation | `card.targetMode === "opponents"` flag |
| All-opponent effect application | `card.targetMode === "all_opponents"` flag |
| Draw N cards | Engine primitive |
| Modify score | Engine primitive |
| Player elimination check | Config-driven utility |

### Mechanic Agent (Interpretive — Game Semantics, RULES.md Driven)
| Operation | Why Agent |
|-----------|-----------|
| Effect type semantics ("what does `freeze` do each turn?") | Game-specific; reads RULES.md |
| Novel action types | Game-specific; reads RULES.md |
| Location entry effects | Game-specific; reads RULES.md |
| Turn order reversal | Game-specific; rare enough to afford latency |
| Resource transfers (steal, trade) | Requires rules interpretation |
| Conditional effects | Requires state + rules interpretation |
| Multi-step interactions | Requires rules interpretation |
| Social/creative mechanics | Inherently interpretive |

---

## Migration Order (Safe, Backward-Compatible)

1. **Phase 1** — Add `targetMode` to RULES.md before removing heuristics. Rules parser warns but doesn't break. Remove heuristics only after all games updated.
2. **Phase 2** — Add effect flags to RULES.md. No behavior change (flags just replace sets). Remove sets after all games updated.
3. **Phase 3** — Card type flags. Add flags first; remove type-name checks after all games updated.
4. **Phase 4** — Elimination/victory config. Add config defaults matching current hardcoded values; games opt-in to custom names.
5. **Phase 5** — Domain array config. Add config support; move values from code to RULES.md per game.
6. **Phase 6** — `reverse` delegation. Additive: `card-matching` handles UNO-style reverse fast path; others go to agent.
7. **Phase 7** — Delete thin-wrapper mechanics. Only after Phases 1–2 confirmed working.
8. **Phase 8** — Agent enrichment. Additive; no breaking changes.
9. **Phase 9** — Game termination refactor. Requires careful testing; leave for last.

---

## Non-Goals

- Do not delegate `draw` or `score` to the mechanic agent (frequency too high)
- Do not remove the mechanic agent fallback (essential for novel effects)
- Do not require all 150+ leaf mechanics to be rewritten (they remain as fast paths)
- Do not change the hook system or registry architecture
- Do not make all 40+ custom action types in RULES.md replace TypeScript mechanics (mechanics are the right fast path; the agent handles only what mechanics can't)
