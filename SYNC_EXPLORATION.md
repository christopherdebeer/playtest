# sync.parc.land — Multi-Agent Exploration Report

**Room:** `playtest-explore-sync` | **Dashboard:** https://sync.parc.land/?room=playtest-explore-sync
**Method:** 8 agents explored the API concurrently, coordinating through the system itself
**Agents:** explorer-a (state), explorer-b (wait/CEL), explorer-c (messages), explorer-d (errors), explorer-e (coordination), claude-opus (protocol), coordinator (orchestration), + 1 anonymous (auto-registered by explorer-d)
**Stats:** 48 messages, 10 state scopes, 8 computed views, ~200+ API calls

## Verdict

**Production-quality coordination layer for LLM agents.** REST + CEL maps perfectly to tool-calling patterns. The `wait → read → act → advance` loop is the universal agent primitive.

## What It Is

A coordination service for multi-agent collaboration through shared rooms with:
- **Versioned state** with optimistic concurrency (CAS via `if_version`)
- **Scoped state** — `_shared` (global), agent-scoped (private), `_view` (computed)
- **CEL expressions** — non-Turing-complete, side-effect free, guaranteed to terminate
- **Blocking waits** with CEL predicates
- **Write gates** — preconditions on writes (`if` for CEL, `if_version` for CAS)
- **Message threading** with atomic task claiming
- **Agent presence** tracking via heartbeats

## API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rooms` | POST | Create room |
| `/rooms/:id/agents` | POST | Register agent |
| `/rooms/:id/state` | PUT | Write with preconditions |
| `/rooms/:id/state/batch` | PUT | Atomic multi-write |
| `/rooms/:id/wait` | GET | Block until CEL condition fires |
| `/rooms/:id/eval` | POST | Debug CEL expressions |
| `/rooms/:id/messages` | GET/POST | Query/post messages |
| `/rooms/:id/messages/:id/claim` | POST | Atomically claim task |
| `/rooms/:id/agents/:id/heartbeat` | POST | Update presence |

## Findings by Area

### State Management (Explorer-A)
- **CAS works excellently** — conflict responses include current state for retry
- **`if_version: 0`** acts as "create only if not exists" — useful primitive
- **Scoped state** provides clean agent/shared/view separation with no ACLs (any agent can write any scope)
- **Atomic increments** via `"increment": true` avoid version conflicts for counters
- **Batch writes are NOT truly atomic** — partial-success semantics; conflicting writes silently skipped while others succeed, response still `ok: true`
- **Issues:** Values stored as strings not native types. No partial update/merge. Missing-value writes return 500 with leaked sqlite trace. Non-numeric values treated as 0 for increments.

### Wait Conditions (Explorer-B)
- **Blocking wait is the core primitive** — CEL conditions evaluated server-side
- **Agent status visible during wait** — `waiting_on` shows the expression, observable by others
- **Include param** bundles state/agents to avoid extra round-trips; **values are properly typed** (numbers, arrays, objects) in wait responses
- **25s max timeout** fits HTTP keep-alive windows well
- **Timeout responses are bare** — `include` data only returned when `triggered=true`
- **Issues:** ~1s polling granularity. No webhook/push alternative.

### CEL Expressions (Explorer-B + Coordinator)
- **Learnable from examples** — agents construct expressions without prior CEL knowledge
- **Rich operators** — `==`, `!=`, `<`, `>`, `&&`, `||`, `!`, `+`, `-`, `*`, `%`, ternary `?:`, `in`, `.`, `[]`
- **Collection functions work** — `size()`, `filter()`, `map()`, `exists()`, `exists_one()`, `all()`
- **String functions** — `startsWith()`, `endsWith()`, `contains()`, `matches()` (regex)
- **Type functions** — `has()` (dot-notation only), `int()`, `double()`, `string()`, `timestamp()`
- **Error messages are excellent** — caret points to the error in the expression
- **Every eval response includes `context_keys`** — shows available scopes, agents, message counts (great for debugging)
- **Gotcha: double/int mismatch** — `state._shared.counter + 1` fails; must use `+ 1.0` or `int(val) + 1`
- **Gotcha: `has()` limitation** — `has(map["key"])` errors; must use `"key" in map` instead
- **Bug: list concat crashes server** — `[1,2] + [3,4]` returns 500 (BigInt serialization error)
- **Bug: `type()`, `duration()` return `{}`** — not JSON-serializable
- **Issues:** Quote escaping in CEL within JSON is awkward for LLMs. No dynamic agent enumeration.

### Computed Views (Claude-Opus + Explorer-B)
- **`_view` scope stores CEL expressions** that resolve on read — stored as `{_cel_expr: "..."}`, response includes `resolved_value`
- **Referenceable** in waits, writes, and other expressions — `state._view.view_name` resolves dynamically
- **Composable** — views can reference other views (meta-views)
- **Creates reactive derived state** without polling — elegant
- **Use case:** Perfect for derived conditions like "all players ready", "game over", multi-scope checks

### Messages & Tasks (Explorer-C)
- **Atomic claiming** prevents races — 409 if already claimed
- **Arbitrary `kind` values** accepted (task, result, info, any custom string)
- **Threading via `reply_to`** — multiple replies, nested replies, cross-agent replies all work
- **`from`/`to` fields** exist but query filters for them are ignored server-side
- **Issues:** Must filter client-side for from/to/reply_to. No unclaim for failed tasks. No message deletion/expiry. `messages` in CEL is summary only (`{count, unclaimed}`), not queryable.

### Error Handling (Explorer-D) — Grade: B-
13 tests across 8 categories. Conflict handling is production-quality; input validation has gaps.

**Strengths:**
- **409 for CAS conflicts** includes current state — enables clean retry
- **409 for precondition failures** includes the failed expression
- **409 for claim conflicts** reveals current claimant
- **CEL errors** have source-pointed messages with caret

**Issues (by severity):**
- **P1:** 3 endpoints leak raw SQLite stack traces as 500s (missing value, missing body, foreign key violations)
- **P1:** Malformed JSON parse error silently swallowed (returns `400 "key is required"` instead of "invalid JSON")
- **P1:** List concatenation in CEL (`[1,2] + [3,4]`) crashes server (BigInt serialization)
- **P2:** Duplicate agent registration silently overwrites (UPSERT, no conflict detection)
- **P2:** Heartbeat succeeds for nonexistent agents (creates phantom records)
- **P2:** Nonexistent room reads return 200 with empty array (should be 404)
- **P3:** Re-claiming own task returns 409 (not idempotent)

### Coordination Patterns (Explorer-E)
6 experiments testing multi-agent coordination primitives:

- **Turn-taking works perfectly** — write gates (`if` param) enforce turns without a referee. Out-of-turn writes get `409 precondition_failed` with clear error.
- **Wait-for-state-change** works well — 0.4–1.6s latency after condition becomes true (~1s polling). Fires immediately if condition already true. Gotcha: URL-encode CEL in query params (`--data-urlencode`).
- **Consensus voting** works with workaround — agent-scoped votes + views to aggregate. `has()` fails with bracket notation; use `in` operator.
- **Cascading waits on views** work — views re-evaluated each poll cycle, same latency as direct waits.
- **Heartbeat presence** — changes are immediate and observable via CEL by other agents.
- **Include param sizing** — `include=agents` is lightweight (~1KB); `include=state` returns full room state (~25KB); combining both ~25KB with ~3s latency.

**Ergonomic assessment:** Turn-taking, voting, presence, and basic waits are easy. CEL string escaping and URL encoding are medium friction. Nothing was hard to express.

## Discovered Protocol

Emergent minimal agent loop (learned by the agents through using the system):

```
1. Orient  — GET state + messages, understand where things are
2. Register — POST agent with role and capabilities
3. Contribute — PUT state in your own scope (no permission needed)
4. Coordinate — POST messages with structured body
5. Gate — Use 'if' on writes when you need consensus
6. Wait — GET /wait when you depend on another agent's action
7. Signal — PUT _shared state when your work changes group context
```

**Anti-patterns:**
- Don't impersonate other agents (no auth, but protocol should prevent it)
- Don't poll in a tight loop — use `/wait` with CEL conditions
- Don't overwrite `_shared` without a gate — use `if` or `if_version`
- Don't treat messages as state — they're an append-only log

## Playtest Integration Sketch

| Sync Concept | Game Mapping |
|-------------|-------------|
| Room | Game session |
| Agents | Players + referee |
| `_shared` state | Board state, turn counter, phase |
| Agent-scoped state | Hidden hand, private info |
| `_view` | Win conditions, valid moves, scores |
| Messages | Move submissions, challenges, chat |
| Write gates (`if`) | Rule enforcement via CEL |
| CAS (`if_version`) | Prevents double-moves |
| Wait | Player turn loop — block until `currentPlayer == me` |
| Claims | Draft/auction mechanics |

**Key idea:** Playtest compiles `RULES.md` into CEL expressions that become write gates — the sync layer *enforces* game rules, not just stores state.

## Emergent Insights

1. **The room IS the collaboration artifact** — state and messages ARE the shared understanding
2. **REST + CEL maps perfectly to LLM tool-calling** — each endpoint is a natural tool
3. **Scoped state creates information hiding without ACLs** — agents can't accidentally overwrite each other
4. **Completion is emergent consensus, not a checklist** — the room stays useful as long as agents find value
5. **Messages are signals, not a database** — reasonable design tradeoff for agent coordination

## Recommendations

### P1 — Input Validation
1. **Add validation layer** before DB — catch missing `value`/`body` fields with 400, not sqlite 500
2. **Reject malformed JSON** instead of silently parsing as empty object
3. **Return 404 for nonexistent rooms** instead of 200-empty or 500-foreign-key

### P2 — API Ergonomics
4. **Idempotent room creation** — `PUT /rooms/:id` upsert instead of 500 on duplicate
5. **Native types** — return numbers as numbers, not strings
6. **Fix message query filters** — `from`, `to`, `reply_to` filters are silently ignored
7. **Conflict-aware agent registration** — return 409 on duplicate instead of silent overwrite
8. **Task release** — unclaim mechanism for failed/abandoned tasks

### P3 — Power Features
9. **Dynamic agent enumeration** — `agents.list` or iterable agents in CEL
10. **CEL introspection** — `/context` endpoint that dumps the full CEL context for debugging
11. **Batch write atomicity** — option for all-or-nothing semantics (currently partial-success)
12. **Message `messages.size()` fix** — returns 2 (object keys) instead of message count; confusing
13. **Fix list concat** — `[1,2] + [3,4]` should work, currently crashes with BigInt serialization error
14. **Fix `type()` / `duration()` serialization** — currently return `{}` instead of JSON-representable values
15. **Timeout responses should include state** — `include` data only returned when `triggered=true`
