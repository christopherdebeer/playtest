# Proposal 014: Generic Mechanics Audit — Engine Agnosticism & Mechanic Agent Delegation

## Status: Draft

## Problem

The engine contains hardcoded knowledge about what specific effect type *strings* mean. This violates the core principle: **the engine must be game-agnostic**. Currently, five locations in the engine embed implicit semantics about game content:

| File | Hardcoded Construct | What It Assumes |
|------|--------------------|-----------------|
| `src/mechanics/core/targeting.ts` | `OPPONENT_EFFECT_TYPES` set | Certain effect names always target opponents |
| `src/mechanics/core/targeting.ts` | `TARGETING_KEYWORDS` regex | Card description text reveals targeting intent |
| `src/mechanics/core/effect-dispatcher.ts` | `UNIVERSAL_EFFECT_TYPES = ['draw', 'score', 'reverse']` | These three effects are structurally universal |
| `src/mechanics/core/effect-dispatcher.ts` | `OPPONENT_TARGETING_EFFECTS` set | Duplicate/extended targeting inference |
| `src/mechanics/core/effect-dispatcher.ts` | `KNOWN_PASSIVE_EFFECTS` set | Certain effect names don't need lifecycle interventions |
| `src/mechanics/core/effects.ts` | `isBlocked()` with `['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen']` | Certain effect names prevent a player from acting |
| `src/mechanics/take-that.ts` | `INTERFERENCE_EFFECTS` list | Certain effect names identify attack cards |

The result: adding a new blocking/targeting/passive effect to a game requires editing engine TypeScript, not just RULES.md.

---

## Audit Findings

### Finding 1: Three Distinct Hardcoding Problems

**A. Targeting Inference** (`targeting.ts`, `effect-dispatcher.ts`, `cards.ts`, `take-that.ts`)

The engine tries to infer *who* a card targets (self vs opponent) from effect type strings and description text:
- `isOpponentTargeting()` checks `OPPONENT_EFFECT_TYPES` + `TARGETING_KEYWORDS` regex
- `effect-dispatcher.ts` independently maintains `OPPONENT_TARGETING_EFFECTS`
- `take-that.ts` maintains `INTERFERENCE_EFFECTS` and applies special routing for them

This means a card like `{ effect: { type: "freeze" } }` won't be recognized as opponent-targeting unless either the engine is patched or the card type is `"interference"`.

**B. Blocking Effect Inference** (`effects.ts`)

`isBlocked()` checks whether a player's turn should be skipped by matching effect type names against a hardcoded list. A game inventing a `"curse"` or `"paralyzed"` status effect will not block turns without a code change.

**C. Passive Effect Inference** (`effect-dispatcher.ts`)

`KNOWN_PASSIVE_EFFECTS` prevents lifecycle interventions for effects the engine already checks at appropriate points (e.g., `probability_boost` checked during movement). This set must be manually extended for each new passively-checked effect.

### Finding 2: `reverse` Is Not Universal

`UNIVERSAL_EFFECT_TYPES` includes `reverse` alongside `draw` and `score`. But `draw` and `score` are pure structural primitives applicable to any game. `reverse` (reversing turn order) is a game-specific mechanic — not all games have turn-order reversal semantics. It belongs in the mechanic agent layer.

### Finding 3: `targetMode` Already Exists But Isn't Enforced

Markov's Chains v2.3 already uses `targetMode` on placed cards:
```yaml
- { name: "Hazard", ..., targetMode: "opponents", effect: { type: "probability_penalty" } }
```

This field was added for `placed-card-effects` specifically but never generalized. The targeting heuristics exist because `targetMode` was not made universal and required on all cards with opponent-targeting effects.

### Finding 4: `take-that` Is a Symptom, Not the Problem

The `take-that` mechanic exists to fill the gap left by heuristic-based targeting: it explicitly validates and routes interference cards. If targeting were declared explicitly in RULES.md, the need for `take-that` as a special-case mechanic shrinks dramatically — it becomes a simple pass-through that validates target choice, not a routing layer.

### Finding 5: Mechanic Agent Has Good Primitives, Missing Two

The mechanic agent protocol is well-designed. The CLI provides: add/remove effects, update score, update board state, add/remove cards, set resources, update shared state, resolve/skip. Two primitives are missing and must be delegated today via workarounds:
- **Reverse turn order** (currently engine-only via `UNIVERSAL_EFFECT_TYPES`)
- **Force draw from deck** (currently approximated via `--add-cards`)

---

## Proposed Implementation Strategy

The goal is a system where:
1. Effect types are opaque strings to the engine — the engine has zero implicit knowledge about what they mean
2. All semantics (targeting, blocking, passive-checking) are declared explicitly in RULES.md by the game author
3. The mechanic agent is the sole interpreter of effect semantics not covered by the above explicit declarations

### Phase 1: Universal `targetMode` — Eliminate Targeting Heuristics

**Principle**: Cards declare their targeting intent explicitly. The engine never infers it.

**Changes to card schema in RULES.md:**
```yaml
# Every card with opponent effects declares targetMode
- { name: "Block", type: "interference", targetMode: "opponents",
    effect: { type: "block_turn", duration: 1 } }

# Cards that affect self (or are neutral) need no targetMode (defaults to "self")
- { name: "Catalyst", type: "boost", effect: { type: "probability_boost", value: 0.2 } }
```

**`targetMode` values:**
- `"self"` — affects the playing player (default when unspecified)
- `"opponents"` — targets an opponent; player must specify which one when multiple exist
- `"any"` — player chooses any player including themselves
- `"all_opponents"` — applies to all opponents simultaneously
- `"owner"` — for placed cards: affects the card's owner (already supported)

**Engine changes:**
- `isOpponentTargeting(card)` becomes `card.targetMode === "opponents"` — trivial one-liner
- Delete `OPPONENT_EFFECT_TYPES`, `TARGETING_KEYWORDS`, `OPPONENT_TARGETING_EFFECTS`
- `take-that` loses all effect-type detection; validates only that `targetMode === "opponents"` cards have a valid target
- Rules parser validates: if a card has no `targetMode` and its effect applies to an opponent, emit a warning (soft enforcement initially, strict later)

**RULES.md updates required:**
- Markov's Chains: `Friction`, `Block`, `Sabotage` → add `targetMode: "opponents"`
- UNO: `Skip`, `Draw Two`, `Wild Draw Four` → add `targetMode: "opponents"`
- All other games: audit each card with opponent effects

**Outcome**: Targeting is 100% declarative. No heuristics. A game can use any effect type string for opponent-targeting; the engine doesn't care what the string says.

---

### Phase 2: Effect Flags — Eliminate `isBlocked()` and `KNOWN_PASSIVE_EFFECTS`

**Principle**: Effects declare their structural semantics via boolean flags, not type names.

**Two new flags on the effect definition in RULES.md:**

```yaml
effect:
  type: "block_turn"   # opaque name for human readability / mechanic agent reference
  duration: 1
  blocks_turn: true    # ENGINE FLAG: player cannot act while this is present
  passive: false       # ENGINE FLAG: this effect does NOT need lifecycle intervention
```

```yaml
effect:
  type: "probability_boost"
  value: 0.2
  passive: true        # ENGINE FLAG: engine already checks this during movement; no lifecycle intervention needed
```

**Engine changes:**
- `Effect` type gains `blocks_turn?: boolean` and `passive?: boolean` fields
- `isBlocked(state, playerId)` becomes: `player.effects.some(e => e.blocks_turn === true)`
- `effect-dispatcher.ts` lifecycle scan becomes: `activeEffects.filter(e => !e.passive)`
- Delete `KNOWN_PASSIVE_EFFECTS` set entirely
- When `addEffect()` is called, flags from the card definition are copied to the stored effect

**RULES.md updates required:**
- Any card whose effect should block turns: add `blocks_turn: true`
- Any card whose effect is passively checked by engine code: add `passive: true`
- Markov's Chains: `probability_boost`, `probability_penalty` → `passive: true`; `block_turn` → `blocks_turn: true`
- UNO: `skip` effect → `blocks_turn: true`

**Mechanic agent impact**: The agent's `--add-effect` command already passes the full effect JSON. When the game author annotates `blocks_turn: true` in the card definition, the engine applies it automatically — the mechanic agent doesn't need to know about it.

**Outcome**: `isBlocked()` is completely agnostic. Any effect type can block turns. The engine never needs to be patched for a new blocking effect.

---

### Phase 3: Shrink `UNIVERSAL_EFFECT_TYPES` — Delegate `reverse` to Mechanic Agent

**Principle**: The only effects the engine auto-handles are pure structural operations applicable to literally every possible game. Turn order reversal is not one of them.

**Keep as engine-native:**
- `draw` — draw cards from deck into hand (universal card primitive)
- `score` — modify a player's score (universal resource primitive)

**Move to mechanic agent:**
- `reverse` — reverse the turn order array

To support this, add one new mechanic agent primitive:

```bash
# New CLI command
./playtest mechanic:reverse-turn-order {INSTANCE_ID}
```

**Engine changes:**
- Remove `'reverse'` from `UNIVERSAL_EFFECT_TYPES` (array shrinks to `['draw', 'score']`)
- Add `mechanic:reverse-turn-order` CLI command that calls `state.turnOrder.reverse()`
- A game with a Reverse card will trigger a mechanic agent intervention → agent calls the new command

**Mechanic agent prompt update:**
- Add `mechanic:reverse-turn-order` to the command reference table
- Add `| reverse | \`./playtest mechanic:reverse-turn-order {INSTANCE_ID}\`` to the Common Patterns table

**Consideration**: Even `draw` and `score` could theoretically be delegated, but their frequency (every draw action, every scoring event) would make every game mechanic-agent-bound and dramatically increase latency/cost. They should remain engine-native. `reverse` is rare enough that delegation is appropriate.

---

### Phase 4: Thin `take-that` — Remove Engine-Specific Effect Routing

**Current problem**: `take-that` has two distinct responsibilities mixed together:
1. Validate that interference cards have a valid target (correct responsibility)
2. Apply `block_turn` and `skip` effects because the generic dispatcher didn't (compensating for heuristic gaps)

After Phases 1 and 2, responsibility #2 disappears entirely:
- Targeting is explicit via `targetMode`; the effect-dispatcher routes correctly without `INTERFERENCE_EFFECTS`
- `block_turn` effects are applied by the generic `addEffect()` path; `take-that` doesn't need to special-case them

**Changes:**
- Delete `INTERFERENCE_EFFECTS` constant from `take-that.ts`
- Delete `onCardPlayed` hook from `take-that.ts` — no longer needed
- Keep `preValidateAction` in `take-that.ts` but simplify: validate any card with `targetMode === "opponents"` has a valid target
- `take-that` becomes a thin targeting validator, not an effect router

---

### Phase 5: Enrich Mechanic Agent Context and Primitives

With the above in place, the mechanic agent gets richer information and cleaner primitives.

**Intervention payload additions:**
```typescript
interface PendingIntervention {
  // existing fields...
  targetMode?: string;          // NEW: "opponents" | "self" | "any" | etc.
  effectFlags?: {               // NEW: structured flags from card definition
    blocks_turn?: boolean;
    passive?: boolean;
  };
  cardData?: Record<string, unknown>;  // NEW: full card object from RULES.md for richer context
}
```

**New CLI commands for mechanic agent:**
```bash
./playtest mechanic:reverse-turn-order {INSTANCE_ID}
./playtest mechanic:draw {INSTANCE_ID} -p player-1 --count 2   # explicit draw-from-deck primitive
./playtest mechanic:discard {INSTANCE_ID} -p player-1 --count 1 # force discard
```

**Mechanic agent prompt additions:**
- Document that `targetMode` is available in the intervention so the agent doesn't need to re-read the card
- Document new primitives in command reference
- Add guidance: "Effect flags (`blocks_turn`, `passive`) are handled automatically by the engine when the effect is added. You do not need to manually apply these — just call `mechanic:resolve` and the engine reads them from state."

---

## Summary of Changes by File

| File | Change |
|------|--------|
| `src/mechanics/core/targeting.ts` | Delete file entirely |
| `src/mechanics/core/effect-dispatcher.ts` | Remove `OPPONENT_TARGETING_EFFECTS`, `KNOWN_PASSIVE_EFFECTS`; replace passive filter with `e.passive !== true`; remove `reverse` from `UNIVERSAL_EFFECT_TYPES` |
| `src/mechanics/core/effects.ts` | Replace `isBlocked()` hardcoded list with `effect.blocks_turn === true` check |
| `src/mechanics/core/cards.ts` | Replace `isOpponentTargeting()` with `card.targetMode === "opponents"` |
| `src/mechanics/take-that.ts` | Delete `INTERFERENCE_EFFECTS`, `onCardPlayed`; simplify `preValidateAction` to target-mode-based check |
| `src/types/game.ts` | Add `blocks_turn?: boolean`, `passive?: boolean` to `Effect` type; add `targetMode?: string` to `Card` |
| `src/cli/index.ts` | Add `mechanic:reverse-turn-order`, `mechanic:draw`, `mechanic:discard` commands |
| `src/core/rules.ts` | Add `targetMode` validation warning for cards with opponent-type effects and no `targetMode` |
| `.claude/agents/mechanic.md` | Add new primitives to command reference; add `targetMode`/`effectFlags` to intervention docs |
| `games/*/RULES.md` | Add `targetMode` to all opponent-targeting cards; add `blocks_turn: true` / `passive: true` to relevant effects |

---

## What Stays in the Engine vs. What Delegates to Mechanic Agent

### Engine Keeps (Structural Primitives — Fast, Deterministic)

| Operation | Why Engine |
|-----------|-----------|
| Draw cards from deck | Every card game; high frequency |
| Modify score | Universal across all games |
| Add/remove effects (with flags) | Structural storage; flags carry semantics |
| Apply `blocks_turn` skip | Pure flag check, no interpretation |
| Apply `passive` (no intervention) | Pure flag check |
| Move player to board state | Universal board primitive |
| Advance/manage turn order | Structural sequencing |
| Win condition checks (hooks) | Deterministic predicates |
| Validate action structure | Structural constraints only |

### Mechanic Agent Gets (Interpretive — Anything with Game Semantics)

| Operation | Why Agent |
|-----------|----------|
| Effect type semantics (what does `"freeze"` do each turn?) | Game-specific, reads RULES.md |
| Novel action types | Game-specific, reads RULES.md |
| Location entry effects | Game-specific, reads RULES.md |
| Turn order reversal | Game-specific; rare enough to delegate |
| Complex interactions (trade, auction resolution) | Requires rule interpretation |
| Multi-step effects (conditional triggers) | Requires rule interpretation |
| Social/creative mechanics | Inherently interpretive |

---

## Delegation Boundary Principle

> **The engine handles anything that can be expressed as: "change this specific field of this specific player from X to Y."**
> **The mechanic agent handles anything that requires reading RULES.md to know *what* to change or *why*.**

Effect flags (`blocks_turn`, `passive`) are declarations by the game author in RULES.md about the structural *shape* of an effect — not its game semantics. The engine reads flags, not type names. The mechanic agent reads type names (and descriptions, and rules) to understand semantics.

---

## Migration Path for Existing Games

1. **Phase 1 first** — targeting is the highest-impact, most visible bug surface
2. Add `targetMode` to all games before removing heuristics (don't break existing games)
3. Use rules parser warning (not error) initially to identify cards that need `targetMode`
4. **Phase 2** — add flags to existing RULES.md files; no game behavior changes (flags just replace hardcoded sets)
5. **Phase 3** — `reverse` delegation is additive; only affects games with reverse cards
6. **Phases 4-5** — cleanup and enrichment; no behavior changes for games not using `take-that`

---

## Non-Goals

- Do not delegate `draw` or `score` to the mechanic agent — frequency is too high
- Do not remove the mechanic agent fallback — it remains essential for novel effects
- Do not require all 150+ existing leaf mechanics to be rewritten — they continue working as fast paths for games that enable them
- Do not change the hook system or registry — this proposal is about eliminating hardcoded *constants*, not restructuring the mechanic architecture
