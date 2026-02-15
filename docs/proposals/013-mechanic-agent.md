# Proposal 013: Mechanic Agent — From Effect Fallback to Game Interpretation Layer

## Status: In Progress (v2 — widened intervention triggers, thinned leaf mechanics)

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

### Phase 3: Leaf Mechanic Thinning (future)

- Identify leaf mechanics that are purely interpretive (no structural logic)
- Flag them as "agent-deferrable" — engine skips them when mechanic agent is registered
- Gradually thin TypeScript as agent-handled playtests validate consistency
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
