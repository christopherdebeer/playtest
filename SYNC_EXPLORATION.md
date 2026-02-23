# sync.parc.land — Multi-Agent Exploration Report

**Room:** `playtest-explore-sync` | **Dashboard:** https://sync.parc.land/?room=playtest-explore-sync
**Method:** 7 concurrent agents explored the API, coordinating through the system itself
**Agents:** explorer-a (state), explorer-b (wait/CEL), explorer-c (messages), explorer-d (errors), explorer-e (coordination), claude-opus (protocol), coordinator (orchestration)

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
- **Scoped state** provides clean agent/shared/view separation
- **Atomic increments** via `"increment": true` avoid version conflicts for counters
- **Issues:** Values stored as strings not native types. No partial update/merge. Missing-value writes return 500.

### Wait Conditions (Explorer-B)
- **Blocking wait is the core primitive** — CEL conditions evaluated server-side
- **Agent status visible during wait** — `waiting_on` shows the expression, observable by others
- **Include param** bundles state/agents to avoid extra round-trips
- **25s max timeout** fits HTTP keep-alive windows well
- **Issues:** ~1s polling granularity. No webhook/push alternative.

### CEL Expressions (Explorer-B + Coordinator)
- **Learnable from examples** — agents construct expressions without prior CEL knowledge
- **Rich operators** — ternary, string ops, boolean logic, numeric comparisons, `in` for maps
- **Error messages are excellent** — caret points to the error in the expression
- **`has()` uses macro syntax** — `has(obj.field)` not `has(obj, "field")`
- **Issues:** Quote escaping in CEL within JSON is awkward for LLMs. No dynamic agent enumeration.

### Computed Views (Claude-Opus)
- **`_view` scope stores CEL expressions** that resolve on read
- **Referenceable** in waits, writes, and other expressions
- **Creates reactive derived state** without polling — elegant

### Messages & Tasks (Explorer-C)
- **Atomic claiming** prevents races — 409 if already claimed
- **Arbitrary `kind` values** accepted (task, result, info, any custom string)
- **Threading via `reply_to`** — multiple replies, nested replies, cross-agent replies all work
- **`from`/`to` fields** exist but query filters for them are ignored server-side
- **Issues:** Must filter client-side for from/to/reply_to. No unclaim for failed tasks. No message deletion/expiry. `messages` in CEL is summary only (`{count, unclaimed}`), not queryable.

### Error Handling (Explorer-D)
- **409 for CAS conflicts** includes current state — enables clean retry
- **409 for precondition failures** includes the failed expression
- **CEL errors** have source-pointed messages with caret
- **Issues:** Duplicate room creation returns 500 (sqlite constraint) instead of 409. Some malformed input gives 500 instead of 400.

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

1. **Idempotent room creation** — `PUT /rooms/:id` upsert instead of 500 on duplicate
2. **Native types** — return numbers as numbers, not strings
3. **Dynamic agent enumeration** — `agents.list` or `"id" in agents` CEL function
4. **Message query filters** — fix `from`, `to`, `reply_to` filters (currently ignored)
5. **Task release** — unclaim mechanism for failed/abandoned tasks
6. **CEL introspection** — `/context` endpoint that dumps the full CEL context for debugging
