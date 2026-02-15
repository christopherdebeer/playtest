# Proposal 013: Mechanic Agent for Unhandled Effects

## Status: In Progress (v1 implemented, needs validation)

## Problem

When a card effect has no engine handler (no mechanic's `applyEffect` returns `handled: true`), the engine silently creates a cosmetic status effect that does nothing. Agents see the effect appear and expire but never realize it was inert. ~62% of AAOTE's card effects fall into this gap.

## Solution

A new **mechanic agent** that implements unhandled effects by reasoning about game rules and applying state mutations through low-level CLI tools.

### Architecture

```
Card played → Effect Dispatcher → No handler found
                                       ↓
                            ┌─ mechanic agent registered? ─┐
                            │ YES                          │ NO
                            ↓                              ↓
                   PendingIntervention          Cosmetic status (legacy)
                   Player turns BLOCKED
                            ↓
                   mechanic:pending picks it up
                   Reads rules + state
                   Applies mutations via mechanic:update
                   Resolves via mechanic:resolve
                            ↓
                   Player turns UNBLOCKED
```

## What's Implemented (commit 2dc67d2)

### Types (`src/types/game.ts`)
- `PendingIntervention` interface with full context (effect type, source/target players, card name/description, game state snapshot)
- `InterventionHistoryEntry` for audit trail
- `Role` extended with `'mechanic'`
- `ContestState` extended with `pendingIntervention` and `interventionHistory`

### Core Logic (`src/core/game.ts`)
- `createIntervention()` — creates a pending intervention with full context
- `resolveIntervention()` — marks intervention resolved with description of changes
- `checkAndAutoResolveIntervention()` — auto-skips after 120s timeout
- `registerAgent()` accepts `'mechanic'` role, stores `mechanicAgentId` in shared state
- `validateAction()` blocks player actions while intervention is pending

### Effect Dispatcher (`src/mechanics/core/effect-dispatcher.ts`)
- When `mechanicAgentId` is set and no handler found, creates `PendingIntervention` instead of cosmetic status
- Legacy fallback preserved when no mechanic agent is registered
- Circular dependency avoided by writing to state directly (not importing from game.ts)

### Turn Blocking (`src/core/turns.ts`)
- `waitForTurn()` holds when `pendingIntervention` exists — mechanic must resolve first

### CLI Commands (`src/cli/index.ts`)
- `mechanic:pending <game>` — blocking poll for interventions (100ms interval)
- `mechanic:resolve <game> --apply|--skip -r "reason"` — resolve intervention
- `mechanic:state <game>` — full game state view
- `mechanic:update <game> -p <player>` — granular state mutations (state, score, effects, resources, cards)
- `mechanic:shared <game> -k <key> -v <json>` — shared state mutations

### Agent Prompt (`.claude/agents/mechanic.md`)
- Full instructions for the mechanic agent loop
- Common effect patterns table
- Tool reference for all mechanic: CLI commands

### Integration
- `.claude/settings.json` — SubagentStart/SubagentStop hooks for mechanic
- `.claude/skills/playtest/SKILL.md` — spawns mechanic agent alongside GM and players
- 228/228 tests pass, clean build

## Issues Found During First Playtest

### Issue 1: No `mechanic` subagent type in Task tool
**Severity**: Blocker for autonomous operation
**Details**: The Task tool only supports `gamemaster` and `player` subagent types. When the mechanic agent is spawned as `subagent_type: "gamemaster"`, it gets the gamemaster system prompt and becomes confused about its role.
**Fix needed**: Register `mechanic` as a recognized subagent type so the correct `.claude/agents/mechanic.md` prompt is loaded.

### Issue 2: Intervention only triggers through `onCardPlayed` hook
**Severity**: Major gap
**Details**: The intervention system is wired into the effect dispatcher's `onCardPlayed` hook. But many AAOTE effects trigger on **location entry** (draw_on_enter, forced_trade, reveal_hint), **turn start** (enemy_item curses), or **other hooks** — not through card plays. These effects still silently fail.
**Fix needed**: Add intervention creation to other hook points:
- `onMove` / `onEnterLocation` — for location entry effects
- `onTurnStart` — for ongoing effects like forbidden item curses
- `executeAction` fallback — for action types without handlers

### Issue 3: Most AAOTE effects handled by existing mechanics
**Observation**: The first card play (Spy/peek_hand) didn't create an intervention — likely handled by the visibility mechanic. Many effects that seem "unhandled" actually have partial handlers. Need to identify which effects truly fall through.
**Action**: Map each AAOTE effect type to its actual handler (or confirm no handler exists).

### Issue 4: Card descriptions available but not always populated
**Details**: The intervention includes `cardDescription` for the mechanic agent to reason about. AAOTE cards have `description` in their `effect` object, not directly on the card. The effect dispatcher correctly extracts it via `cardAny.description`, but some effects store description inside `effect.description` — need to also pass `card.effect.description`.

## Next Steps

1. **Register mechanic subagent type** — either via Claude Code config or by embedding the prompt directly in the Task call
2. **Expand intervention trigger points** beyond `onCardPlayed` to cover location entry, turn lifecycle, and action execution
3. **Fix card description extraction** — pass `card.effect.description` when `card.description` is absent
4. **Run validated playtest** — with properly registered mechanic agent, observe full intervention cycle
5. **Consider**: Should the mechanic agent also handle action types without engine handlers (not just effects)?

## AAOTE Effect Coverage

| Effect Type | Count | Handler | Intervention? |
|---|---|---|---|
| safe | 9 cards | None (no-op) | No (nothing to implement) |
| trade_bonus | 2 | None | Yes — location entry trigger needed |
| draw_on_enter | 2 | None | Yes — location entry trigger needed |
| forced_trade | 1 | None | Yes — location entry trigger needed |
| reveal_hint | 1 | None | Yes — location entry trigger needed |
| hide | 1 | visibility mechanic? | TBD |
| reveal | 1 | visibility mechanic? | TBD |
| enemy_only | 1 | traitor-game mechanic? | TBD |
| utility | 6 | None (passive) | No (requirement check, not effect) |
| movement_bonus | 2 | action-points? | TBD |
| collectible | 3 | None | Yes — needs collection tracking |
| currency | 3 | None (passive) | No (requirement check) |
| accusation_bonus | 1 | action-points? | TBD |
| defense | 1 | None | Yes — event interception |
| enemy_item | 3 | effects mechanic? | Yes — turn-start curse effects |
| extra_movement | 2 | None | Yes — through play_card |
| teleport_adjacent | 2 | None | Yes — through play_card |
| peek_hand | 2 | visibility mechanic | No (handled) |
| peek_objective | 1 | visibility mechanic | No (handled) |
| public_reveal | 2 | visibility mechanic? | TBD |
| block_tile | 2 | None | Yes — through play_card |
| steal_item | 2 | trading mechanic? | TBD |
| destroy_location | 1 | None | Yes — through play_card |
| force_reveal | 1 | None | Yes — through play_card |
| counter | 2 | None | Yes — event interception |
| secret_move | 2 | visibility mechanic? | TBD |
