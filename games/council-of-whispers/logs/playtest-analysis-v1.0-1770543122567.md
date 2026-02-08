# Council of Whispers - Playtest Analysis

**Game ID:** council-of-whispers-1770543122567
**Version:** 1.0
**Players:** 4 (player-1 through player-4)
**Date:** 2026-02-08
**Status:** Game stalled in Prisoner's Dilemma phase after ~35 minutes
**Previous Playtest:** council-of-whispers-1770506873923 (confirmed same issues)

## Executive Summary

This playtest confirms and deepens the findings from the previous council-of-whispers run. The game **stalls during the Prisoner's Dilemma phase** due to a fundamental mismatch between the engine's turn-based architecture and the game's simultaneous/multi-phase round design. After 35+ minutes, only 11 events were logged — 4 action selections and 3 dilemma choices (with 2 forced passes). The game's 5-phase round structure (action selection, negotiation, prisoner's dilemma, voting, treasury) is **never executed as designed**. Only 2 of 14 configured mechanics were exercised.

## Role Distribution & Setup

| Player | Hidden Role | Team | Persona | Starting Gold |
|--------|------------|------|---------|---------------|
| player-1 | Loyalist | council | cheater | 10 |
| player-2 | Loyalist | council | casual | 10 |
| player-3 | Conspirator | shadow | cheater | 10 |
| player-4 | Loyalist | council | cheater | 10 |

**Issue: Role distribution for 4 players** — Rules specify 3 Loyalists + 2 Conspirators + 1 Opportunist for 6 players. With 4 players, the engine assigned 3 Loyalists + 1 Conspirator + 0 Opportunists. This creates an unbalanced game where the lone conspirator has no allies and the Opportunist role (a key game mechanic) is absent entirely.

## Game Progress

| Time | Round | Turn | Player | Action | Notes |
|------|-------|------|--------|--------|-------|
| 09:32 | - | - | - | game_init | 4 players initialized |
| 09:32 | 1 | 1 | - | game_start | All registered |
| 09:33 | 1 | 1 | P1 | select_action | Scheme (object format) |
| 09:33 | 1 | 2 | P2 | select_action | Scheme (string format) |
| 09:34 | 1 | 3 | P3 | select_action | Investigate P2 (nested obj) |
| 09:34 | 1 | 4 | P4 | select_action | Scheme (string format) |
| 09:35 | 2 | 5 | P1 | dilemma_choice | cooperate (3 waiting) |
| 09:38 | 2 | 5 | P1 | pass | Forced pass to advance turn |
| 09:43 | 2 | 6 | P2 | dilemma_choice | cooperate (2 waiting) |
| 09:43 | 2 | 6 | P2 | pass | Forced pass to advance turn |
| 09:56 | 2 | 7 | P3 | dilemma_choice | cooperate (1 waiting) |
| ... | 2 | 7 | P3 | **STALLED** | P3 hasn't passed; P4 waiting |

**Total duration at stall: ~35 minutes for 11 events.** The game never reached Phase 2 (Negotiation), Phase 4 (Voting), or Phase 5 (Treasury).

## Critical Issues Identified

### Issue 1: No Phase Management in Engine (CRITICAL)

The engine has **no concept of "phases within a round"**. It tracks `round` and `turnNumber`, where a "round" is defined as all players completing one turn cycle. The game's 5-phase structure exists only in RULES.md prose — the engine doesn't enforce or sequence phases.

**Impact:** The game design requires Phase 1 (all select actions) → Phase 2 (negotiation) → Phase 3 (PD) → Phase 4 (voting) → Phase 5 (treasury). Instead, the engine treats the entire game as a flat turn sequence. After action selection completes, the engine doesn't trigger negotiation — it just advances to the next available mechanic action (PD).

**Evidence:** In `game.json`, there is no `phase` field. The `simultaneousSelection.phase` tracks only internal mechanic state (selecting/revealing/resolving/idle), not game-level phases.

### Issue 2: Prisoner's Dilemma Sequential Bottleneck (CRITICAL)

The PD mechanic code (`prisoners-dilemma.ts:148-161`) is designed for simultaneous play via `canPlayerActNow()`, but the player-facing `player:turn` wait command only unblocks when `currentPlayer === playerId`. This creates a sequential bottleneck:

1. Player submits `dilemma_choice` → `advanceTurn: false` (turn stays on current player)
2. Current player must explicitly `pass` to advance turn
3. Next player's `player:turn` finally unblocks
4. Repeat for all players

**Result:** 4 players × 2 actions each (choice + pass) = 8 turn actions for one PD round. With agent think time + polling, this takes 10-15 minutes per PD round. The game configures 3 PD rounds, meaning ~45 minutes just for prisoner's dilemma.

**Root cause:** `canPlayerActNow()` returns `true` for players who haven't chosen, but `player:turn` (in `src/core/turns.ts:57-191`) waits for file-system changes indicating it's the player's turn in the standard turn order, ignoring the `canPlayerActNow` hook.

### Issue 3: Inconsistent Action Format Acceptance (HIGH)

Players submitted `select_action` in three different formats, all accepted by the engine:

```json
// player-1: Object with 'type' key
{"type":"select_action","selectedAction":{"type":"Scheme"}}

// player-2: String value
{"type":"select_action","selectedAction":"Scheme"}

// player-3: Object with 'action' + 'target' keys
{"type":"select_action","selectedAction":{"action":"Investigate","target":"player-2"}}
```

**Resource resolution bug:** Player-1 (format A) did NOT receive 2 gold from Scheme (stayed at 10). Players 2 and 4 (format B) correctly received 2 gold (went to 12). The engine's Scheme resolution likely checks for a string value and fails on the `{"type":"Scheme"}` object.

### Issue 4: Agent Busy-Polling Token Waste (HIGH)

All 4 player agents resort to polling loops to wait for game progression:

```bash
# Typical agent polling pattern
for i in {1..30}; do
  result=$(./playtest player:turn ...)
  sleep 1
done
```

Player-1 executed 18 commands in 35 minutes. Player-3 executed 36 commands. Player-4 executed 31 commands. Most of these are redundant polls that consume agent tokens without advancing the game.

**Root cause:** `player:turn` returns immediately with the current state rather than blocking until the player can meaningfully act. Agents don't know when to retry vs. when to wait.

### Issue 5: Negotiation, Voting, Betting, Bribery Never Triggered (HIGH)

Of the 14 mechanics configured for this game, only 2 were exercised:
- `simultaneous-action-selection` (Phase 1 only)
- `prisoners-dilemma` (partially)

The following 12 mechanics were **never triggered**:
- `voting` — No policy proposals or votes
- `negotiation` — No agreements or messages
- `bribery` — No bribes offered
- `alliances` — No alliances proposed
- `betting-and-bluffing` — No betting round
- `communication-limits` — Nothing to limit
- `semi-cooperative-game` — No treasury contributions
- `hidden-roles` — Assigned but never leveraged
- `resources` — Gold/influence tracked but barely changed
- `action-points` — 2 AP/turn but AP costs never enforced
- `turn-order-role-order` — Council positions never assigned
- `win-single-loser` — Game didn't reach end

### Issue 6: Repeated game_end Bug (from previous playtest) (MEDIUM)

The previous playtest (1770506873923) logged **53 duplicate `game_end` events** after reaching max_rounds (rounds 9-60). Agents kept calling `./playtest end` or the game end was triggered repeatedly in a loop. The game never properly terminated — it kept emitting game_end events every ~2 seconds.

### Issue 7: Player-4 Resignation Blocked (MEDIUM)

Player-4's agent attempted to resign after determining the game was stuck:
```bash
./playtest player:act ... -a '{"type":"resign","reason":"Game appears to be stuck..."}'
```
This was rejected because it wasn't player-4's turn. The resign action should be available regardless of turn order.

### Issue 8: Gamemaster Agent Idle (LOW)

The gamemaster registered and called `gm:pending`, then waited indefinitely for contests/disputes that never arrived. With no phase management, the GM has no role in orchestrating phase transitions. The GM should be responsible for advancing between phases.

### Issue 9: All Agents Share Same Agent ID (LOW)

All 4 player agents registered as `"my-agent"` and the GM as `"gm-agent"`. With identical agent IDs, debugging which agent took which action in logs is harder than necessary.

## Comparison with Previous Playtest

| Aspect | Previous (1770506873923) | Current (1770543122567) |
|--------|--------------------------|-------------------------|
| Duration | ~10 min to game_end | ~35 min, still stalled |
| Rounds reached | 8 (then 53 extra) | 2 |
| PD rounds completed | 2 of 3 | 0 of 3 |
| Mechanics used | 2 of 14 | 2 of 14 |
| Agent dropouts | 2 players (P2, P4) | 0 (all still active) |
| game_end spam | 53 duplicate events | N/A (not reached) |
| Phase transitions | None after PD | None after PD |

Same core issues persist: no phase management, sequential PD bottleneck, missing negotiation/voting/treasury.

## Recommendations

### P0 — Phase Sequencing System

Implement a phase state machine at the engine level:
```
Phase 1: simultaneous_action_selection → auto-advance when all selected
Phase 2: negotiation → time-limited or pass-to-advance
Phase 3: prisoners_dilemma → simultaneous (like action selection)
Phase 4: voting (including betting) → structured proposal + vote cycle
Phase 5: treasury_contribution → each player contributes or passes
→ Increment game round, loop back to Phase 1
```

The engine needs an explicit `gamePhase` field in game state, with the GM or engine auto-advancing between phases.

### P0 — Fix PD Simultaneous Blocking

Either:
1. Make `player:turn` respect `canPlayerActNow()` hooks when determining if a player can act, OR
2. Auto-advance turns after dilemma_choice (set `advanceTurn: true` always, let the last player's choice trigger resolution)

### P1 — Normalize Action Format

The engine should canonicalize `select_action` payloads. Whether the player submits `"Scheme"` or `{"type":"Scheme"}`, the resolution logic should handle both. Alternatively, provide strict examples in the action discovery response.

### P1 — Fix game_end Loop

After the first `game_end` event, the engine should set `status: "finished"` and reject all further actions. Agents should check for game_over status and stop.

### P2 — Reduce Polling with True Blocking

`player:turn` should block (via file watching) until the player has a meaningful action available, not just return the current state. This would eliminate busy-poll loops in agent code.

### P2 — Role Distribution Scaling

Implement proper role distribution for player counts < 6:
- 4 players: 2 Loyalists, 1 Conspirator, 1 Opportunist
- 5 players: 2 Loyalists, 2 Conspirators, 1 Opportunist

### P3 — Unique Agent IDs

Generate unique agent IDs per player (e.g., `player-1-abc123`) instead of allowing all agents to register as `"my-agent"`.

## Mechanics Scorecard

| Mechanic | Status | Notes |
|----------|--------|-------|
| simultaneous-action-selection | Partial | Phase 1 works; no orchestration after |
| prisoners-dilemma | Broken | Sequential bottleneck, stalls game |
| hidden-roles | Assigned only | Roles assigned but never leveraged |
| resources | Tracked | Gold/influence tracked, Scheme format bug |
| action-points | Unused | 2 AP/turn, costs configured but not enforced |
| voting | Never triggered | No phase to trigger it |
| negotiation | Never triggered | No phase to trigger it |
| bribery | Never triggered | No phase to trigger it |
| alliances | Never triggered | No phase to trigger it |
| betting-and-bluffing | Never triggered | No phase to trigger it |
| communication-limits | Never triggered | Nothing to limit |
| semi-cooperative-game | Never triggered | Treasury unchanged at 20 |
| turn-order-role-order | Not applied | Council positions never assigned |
| win-single-loser | Not reached | Game didn't end |

## Conclusion

Council of Whispers is an ambitious social deduction design that pushes the engine well beyond its current capabilities. The core issue is **architectural**: the engine's flat turn-based model cannot express the 5-phase round structure this game requires. Until phase sequencing is implemented at the engine level, games with complex multi-phase rounds will remain stuck after the first mechanic resolves.

The previous playtest's analysis (v1.0) already identified these issues. This playtest **confirms they persist** and adds detail on the PD sequential bottleneck, action format inconsistency, and agent polling waste.

**Priority fix path:** Phase sequencing system → PD simultaneous fix → Action format normalization → game_end loop fix.

---

*Analysis generated by coordinator agent*
*Game Instance: council-of-whispers-1770543122567*
