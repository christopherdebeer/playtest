# Proposal 013: Mechanic Agent — From Effect Fallback to Game Interpretation Layer

## Status: In Progress (v3 — lifecycle trigger, mechanic audit, description extraction)

## Problem

The playtest framework has 138+ leaf mechanics implemented in TypeScript, each one a hardcoded rule interpreter for a specific game pattern. When a game designer invents novel actions, effects, or interactions, someone must write new TypeScript. This creates two problems:

1. **Coverage gap**: ~62% of AAOTE's card effects have no engine handler — they silently become cosmetic status effects that do nothing.
2. **Scalability ceiling**: Supporting arbitrary game designs requires infinite TypeScript mechanics. The framework should support any game expressible in RULES.md without new code.

## Vision

Separate the engine into two layers:

- **Structural layer** (engine code): Game-agnostic primitives for state management — card CRUD, resource tracking, board positions, effect lifecycle, turn management, visibility.
- **Interpretation layer** (mechanic agent): An LLM agent that reads RULES.md, examines game state, and applies the correct state mutations for any game-specific behavior the engine doesn't hardcode.

The engine provides the **toolkit**. The mechanic agent provides the **judgment**.

## Architecture

```
Player submits action
    ↓
Engine validates structural constraints (is it your turn? does the card exist in hand?)
    ↓
Engine tries mechanic hooks (first-responder pattern)
    ↓
┌─ Handled by core mechanic? ──────────────────────────────┐
│ YES (draw, play_card, move, pass, etc.)                  │
│ → Fast path: engine applies state changes directly       │
│ → Fire post-hooks (deduct AP, check win, etc.)           │
└──────────────────────────────────────────────────────────┘
    ↓ NO
┌─ Mechanic agent registered? ─────────────────────────────┐
│ YES → Create PendingIntervention                         │
│     → Block player turns                                 │
│     → mechanic:pending picks it up                       │
│     → Agent reads rules + state                          │
│     → Agent applies mutations via mechanic:update        │
│     → Agent resolves via mechanic:resolve                │
│     → Player turns unblocked                             │
│                                                          │
│ NO  → Legacy fallback (cosmetic status or error)         │
└──────────────────────────────────────────────────────────┘
```

### Intervention Trigger Points (v2)

| Trigger | When | Example |
|---------|------|---------|
| **Effect dispatch fallback** | Card effect has no `applyEffect` handler | `forced_trade`, `teleport_adjacent`, `block_tile` |
| **Action execution fallback** | No mechanic returns `handled: true` for action type | Novel action types defined in RULES.md |
| **Location entry effects** | Player moves to location with unhandled effect type | `draw_on_enter`, `trade_bonus`, `reveal_hint` |
| **Turn lifecycle effects** | Active player effects with no engine interpretation | `enemy_item` curses, conditional triggers |

## What's Game-Agnostic (Stays in Engine)

| Layer | Components | Purpose |
|-------|-----------|---------|
| State management | `loadState`, `saveState`, `logEvent` | Persistence, locking, events |
| Turn orchestration | `advanceTurn`, `waitForTurn`, turn order | Player sequencing |
| Card primitives | `drawFromDeck`, `addToHand`, `removeFromHand`, `playCard`, `shuffle` | Deck/hand/discard CRUD |
| Resource primitives | `addResource`, `spendResource`, `transferResource` | Currency tracking |
| Board primitives | `setBoardState`, `getAdjacent` | Position tracking |
| Effect primitives | `addEffect`, `removeEffect`, `decrementDurations` | Buff/debuff lifecycle |
| Visibility | `getVisibleState`, `canSeeInfo` | Information hiding |
| Contest system | `adjudicateContest`, auto-timeout | Dispute resolution |
| Action points | AP tracking, `shouldAutoEndTurn` | Turn metering |
| Win conditions | `onCheckWin` hooks, simple predicates | Victory detection |

## What's Game-Specific (Defer to Mechanic Agent)

### Effect Interpretation

Currently hardcoded in `effect-dispatcher.ts` (draw, score, reverse, bonus_worker) and various leaf mechanics. The mechanic agent can interpret any effect type by reading the card description in RULES.md and applying primitives.

### Location Entry Effects

Currently hardcoded in `grid-movement.ts` (`draw_on_enter`, `trade_bonus`, `hide`, `reveal`, `enemy_only`) and `board-state.ts` (`probability_boost`, `probability_penalty`, `force_discard`). These are game-specific interpretations the agent can handle.

### Novel Action Types

Currently, unknown action types return `"Unknown action type"` error. With the mechanic agent, these become interventions — the agent reads RULES.md to understand what the action should do.

### Complex Multi-Step Interactions

Trading rules, auction variants, trick-taking trump rules, set collection criteria — all vary between games and are currently separate TypeScript files. The mechanic agent can interpret these from RULES.md.

## Implementation

### Phase 1: Foundation (v1 — complete)

- `PendingIntervention` type with full context
- `createIntervention()` / `resolveIntervention()` / auto-timeout
- Effect dispatcher creates interventions for unhandled card effects
- CLI: `mechanic:pending`, `mechanic:resolve`, `mechanic:state`, `mechanic:update`, `mechanic:shared`
- Mechanic agent prompt (`.claude/agents/mechanic.md`)
- Turn blocking while intervention is pending

### Phase 2: Widened Triggers (v2 — this commit)

- **`executeAction` fallback**: When no mechanic returns `handled: true`, create intervention instead of `"Unknown action type"` error
- **Location entry effects**: `grid-movement.ts` and `board-state.ts` defer unhandled location effects to mechanic agent
- **Effect dispatcher thinning**: Remove direct handlers for effect types that the agent handles better (keep only truly universal ones)
- **PendingIntervention type expanded**: New `triggerType` field distinguishes effect/action/location/lifecycle triggers
- **Mechanic agent prompt updated**: Expanded to cover action interpretation, location effects, and turn lifecycle

### Phase 3: Lifecycle Trigger & Mechanic Audit (v3 — this commit)

- **Lifecycle trigger**: `effect-dispatcher` gains `onTurnStart` hook — scans active effects for types no engine mechanic handles, creates lifecycle interventions so the mechanic agent can interpret per-turn effects (e.g., "poison deals 1 damage each turn")
- **Card description extraction**: New `extractCardDescription()` helper checks `card.description`, `card.effect.description`, `card.text`, `card.flavor` for better intervention context
- **Mechanic audit**: Full classification of 138+ leaf mechanics into structural vs agent-deferrable categories (see below)
- **Known passive effects set**: `KNOWN_PASSIVE_EFFECTS` tracks effect types already handled by engine code paths (blocking markers, probability mods) — lifecycle trigger skips these

#### Mechanic Audit Results

**Structural (must stay — manage engine primitives):**
- Core infrastructure (14): `cards`, `resources`, `dice`, `board`, `effects`, `visibility`, `social`, `workers`, `combat`, `auction`, `building`, `pass`, `effect-dispatcher`, `turns`
- Action handlers (30+): `hand-management`, `action-points`, `income`, `card-type-rules`, `card-matching`, `take-that`, `grid-movement`, `place-location`, `place-card`, `board-state`, `open-drafting`, `closed-drafting`, `set-collection`, `deck-building`, `movement-points`, `trick-taking`, `ladder-climbing`, `worker-placement`, `chaining`, `catch-the-leader`, `dice-rolling`, `re-rolling-and-locking`, etc.
- Turn order (7): `turn-order-random`, `turn-order-stat-based`, `turn-order-progressive`, `turn-order-pass-order`, `turn-order-auction`, `turn-order-claim`, `turn-order-time-track`
- Visibility (5): `hidden-roles`, `hidden-movement`, `hidden-objectives`, `hidden-victory-points`, `traitor-game`
- Win conditions (13): all win-condition mechanics

These handle engine primitives (deck CRUD, resource math, board transitions, turn sequencing) and must remain as fast deterministic code paths.

**Agent-deferrable (interpretive — could defer to agent in future):**
- Social/creative: `storytelling`, `acting`, `role-playing`, `questions-and-answers`
- Reasoning: `induction`, `pattern-recognition`, `deduction` (visibility portion stays), `memory`
- Strategic: `betting-and-bluffing`, `bribery`, `prisoners-dilemma`
- Meta: `freeplay` (explicitly designed for agent interpretation)

These mechanics' core logic is "interpret rules and make judgments" rather than "enforce structural constraints." However, they provide useful state management, so **thinning should be additive** — the agent gets first crack when registered, mechanics stay as fallbacks.

### Phase 4: Agent-First Routing (future)

- Add `agentDeferrable: true` flag to interpretive mechanics
- When mechanic agent is registered, skip agent-deferrable mechanics' `onExecuteAction` hooks — route to agent instead
- Mechanics remain as fallback when no agent is registered
- Gradually validate via playtest comparison: agent-handled vs mechanic-handled outcomes
- End state: RULES.md is the single source of truth for game-specific behavior

## Type Changes

```typescript
// Extended PendingIntervention with trigger classification
interface PendingIntervention {
  id: string;
  triggerType: 'effect' | 'action' | 'location' | 'lifecycle';  // NEW
  effectType: string;           // Effect type or action type
  effectValue?: number;
  effectDuration?: number;
  sourcePlayer: string;
  targetPlayer: string;
  cardName?: string;
  cardDescription?: string;
  actionData?: GameAction;      // NEW: full action for action-type triggers
  locationName?: string;        // NEW: location for location-entry triggers
  context: string;
  gameState: { round: number; turnNumber: number; currentPlayer: string | null };
  timestamp: string;
}
```

## Tradeoffs

| Dimension | Engine Mechanics | Mechanic Agent |
|-----------|-----------------|----------------|
| **Speed** | <1ms per action | 5-30s per intervention |
| **Consistency** | Deterministic | May vary across plays |
| **Coverage** | Only what's coded | Any effect/action in RULES.md |
| **Cost** | Zero marginal | LLM tokens per intervention |
| **Maintenance** | Code per mechanic | Single agent prompt |

**Mitigation**: Common operations (draw, play_card, move, pass) keep their fast engine paths. Only novel/unhandled operations trigger the agent. Games using only standard mechanics never invoke the agent.

## Files Changed (v2)

- `src/types/game.ts` — Extended `PendingIntervention` with `triggerType`, `actionData`, `locationName`
- `src/core/game.ts` — `executeAction()` fallback creates intervention instead of error
- `src/mechanics/core/effect-dispatcher.ts` — Cleaner separation of universal vs game-specific effects
- `src/mechanics/grid-movement.ts` — Location effects defer to mechanic agent
- `src/mechanics/board-state.ts` — Placed card effects defer to mechanic agent
- `.claude/agents/mechanic.md` — Expanded prompt for action/location/lifecycle handling
- `docs/proposals/013-mechanic-agent.md` — This document

## Files Changed (v3)

- `src/mechanics/core/effect-dispatcher.ts` — Added `onTurnStart` lifecycle trigger, `extractCardDescription()` helper, `KNOWN_PASSIVE_EFFECTS` set
- `docs/proposals/013-mechanic-agent.md` — Mechanic audit results, Phase 3/4 roadmap
