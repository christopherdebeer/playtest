# Distributed Agent CLI: Extracting Multi-Agent Orchestration Beyond Game Design

**Status**: Exploration / Technical Outline
**Date**: 2026-02-15
**Context**: Derived from analysis of the Playtest framework's agent orchestration architecture

---

## 1. The Tension: Orchestration vs. Engine Ergonomics

The Playtest framework embeds a fundamental architectural tension that becomes visible once you look past the game-design domain. Two competing gravitational centres exist:

### 1.1 The Orchestrator's Gravity

The **Skill** (`SKILL.md`) acts as a coordinator: it calls `./playtest init`, parses the returned `instanceId` and `spawnInstructions`, then spawns background agents via the `Task` tool. This is a **centralised, system-local** pattern. The coordinator:

- Knows the full topology (how many agents, what roles)
- Controls the spawning lifecycle
- Holds the single source of truth about *who participates*

The coordinator is opinionated: it prescribes the shape of the system before any agent acts. Agents receive pre-formatted prompts containing their role, instance ID, and player assignment. They have no say in what game gets played, what role they take, or how many peers exist.

### 1.2 The Engine's Gravity

The **TypeScript engine** (`src/core/game.ts`, `src/mechanics/registry.ts`) operates on a different principle: it is a **reactive state machine** that doesn't care who is calling it. Any process that can invoke `./playtest register ... && ./playtest player:turn ...` is a valid participant. The engine:

- Accepts registrations from arbitrary callers
- Validates actions against mechanical rules, not identity proofs
- Uses file-system locks and watchers for synchronisation (process-agnostic)
- Exposes a CLI interface — the most universally accessible IPC boundary

The engine doesn't need the coordinator. An agent could discover a running instance, register itself, and participate — the engine would not object. The **ergonomic design of the engine already implies a distributed, loosely-coupled system** that the orchestration layer then constrains back into a centralised one.

### 1.3 The Mechanic Registry as a Capability System

The `MechanicRegistry` (`src/mechanics/registry.ts`) introduces a third force. Mechanics are self-registering modules with:

- **Dependency declarations** (`requires: ['cards']`)
- **Conflict declarations** (`conflicts: ['trick-taking']`)
- **Hook-based composition** (20+ hook points with `merge`, `first`, `blocking` resolution strategies)
- **Capability advertisement** (`getAvailableActions`, `getActionSchema`)

This is not a game engine pattern. This is a **capability negotiation protocol**. A mechanic declares what it needs, what it provides, and what it conflicts with. The registry resolves these into a coherent runtime configuration. Replace "mechanic" with "service" or "agent capability" and the abstraction transfers directly.

The `defines` + `requires` pattern (where a mechanic can define hooks that only its dependents implement, fired via `mechanicRegistry.fire(slug, hookName, ...)`) is essentially a **pub/sub contract system with typed interfaces**.

### 1.4 Where the Tension Breaks

The tension is most acute at three points:

**a) Agent identity is externally assigned, not self-determined.**
The coordinator assigns `player-1`, `player-2`, etc. The engine accepts this passively. But nothing in the engine *requires* pre-assignment — `register` could just as easily return a dynamically allocated slot.

**b) The game definition is monolithic.**
`RULES.md` contains the entire game specification: mechanics config, card definitions, board topology, win conditions. The engine parses this once at init time. There's no mechanism for a *participant* to contribute rules, extend mechanics, or negotiate the game definition. The definition is authored, not emergent.

**c) The lifecycle is bounded.**
A game has `init → waiting_for_players → in_progress → pending_analysis → completed`. This is a closed lifecycle. There's no concept of a persistent, evolving system where agents join and leave, where the "rules" change over time, or where the game itself is an open process.

---

## 2. Extraction: What Transfers Out of Game Design

### 2.1 The Core Abstractions (Domain-Invariant)

| Playtest Concept | Generalised Concept | Why It Transfers |
|---|---|---|
| Game Instance | **Session** | A bounded context where agents interact with shared state |
| RULES.md | **Protocol Definition** | Declarative specification of valid actions, state shape, and completion criteria |
| MechanicRegistry | **Capability Registry** | Self-registering modules with dependency/conflict resolution and hook-based composition |
| `player:turn` (blocking) | **Work Claim / Turn Gate** | Agent blocks until the shared state indicates work is available for it |
| `player:act` | **State Transition Request** | Agent submits a proposed state change; engine validates and applies |
| Contest system | **Dispute Resolution** | Participants can challenge state transitions; an arbiter adjudicates |
| `game.json` on filesystem | **Shared Ledger** | Filesystem as the authoritative state store, accessible to any process |
| File locks | **Optimistic Concurrency** | No central lock server; file-level mutual exclusion |
| `PlayerView` (information hiding) | **Scoped Visibility** | Each participant sees a filtered projection of the full state |
| Gamemaster agent | **Arbiter / Validator** | A privileged participant that sees full state and resolves ambiguity |
| `gm:pending` (blocking) | **Event Subscription** | Arbiter blocks until a dispute or escalation requires attention |
| Hook resolution (merge/first/blocking) | **Consensus Strategies** | Multiple modules contribute to a decision; the system has defined strategies for combining responses |

### 2.2 What Doesn't Transfer (Domain-Specific)

- Card/deck/hand semantics (specific state shapes)
- Board topology and movement
- Dice/probability mechanics
- Win conditions and scoring
- Turn order (round-robin assumption)
- Game analysis and post-mortem

### 2.3 What's Missing for General Use

| Gap | Why It Matters |
|---|---|
| **Discovery** | Agents can't find running sessions without out-of-band coordination |
| **Network transport** | File-system IPC limits to single-host deployment |
| **Dynamic protocol** | The "rules" can't evolve during a session |
| **Agent-contributed capabilities** | Participants can't bring new mechanics/capabilities into the session |
| **Identity and trust** | No authentication; any process with filesystem access can participate |
| **Partial failure** | No handling for agents that crash mid-session (beyond timeout auto-adjudication) |
| **Observation without participation** | No read-only spectator role with live state streaming |

---

## 3. Target: A Distributed Agent CLI

### 3.1 Design Thesis

> A CLI tool that enables individual agents — running as independent processes, potentially on different machines — to participate in a shared stateful protocol. No central orchestrator required. Agents discover sessions, negotiate capabilities, submit state transitions, and dispute each other's actions through a common interface.

The key shift: **from orchestrated to organic**. Instead of a coordinator that knows the topology and spawns all agents, each agent is a standalone process that can:

1. **Discover** available sessions (or create one)
2. **Join** by registering capabilities
3. **Participate** by claiming work and submitting transitions
4. **Challenge** transitions it disagrees with
5. **Leave** gracefully or crash without halting the system

### 3.2 Architecture Sketch

```
                    ┌─────────────────────────┐
                    │    Protocol Definition   │
                    │   (YAML/TOML manifest)   │
                    │  - state schema          │
                    │  - valid transitions      │
                    │  - capability slots       │
                    │  - dispute rules          │
                    │  - completion criteria    │
                    └────────────┬──────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │   Agent A    │   │   Agent B    │   │   Agent C    │
    │  (any host)  │   │  (any host)  │   │  (any host)  │
    │              │   │              │   │              │
    │  Capabilities│   │  Capabilities│   │  Capabilities│
    │  - validate  │   │  - transform │   │  - observe   │
    │  - dispute   │   │  - submit    │   │  - report    │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                   │
           └──────────────────┼───────────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │      State Backend      │
                 │  (filesystem / Redis /  │
                 │   SQLite / S3 / git)    │
                 │                         │
                 │  - state.json           │
                 │  - transitions.jsonl    │
                 │  - disputes.jsonl       │
                 │  - capabilities.json    │
                 └─────────────────────────┘
```

### 3.3 CLI Surface

Drawing from what Playtest already provides, but generalised:

```bash
# === Session Lifecycle ===
agent session create --protocol ./protocol.yaml      # Create a session
agent session list                                    # Discover sessions
agent session join <session-id> --capabilities ./caps.yaml  # Join with capabilities
agent session leave <session-id>                      # Graceful departure
agent session status <session-id>                     # Current state summary

# === Participation ===
agent claim <session-id>                              # Block until work available (≈ player:turn)
agent submit <session-id> --transition '{ ... }'      # Propose state change (≈ player:act)
agent dispute <session-id> --target <tx-id> --reason "..."  # Challenge a transition (≈ player:contest)

# === Arbitration ===
agent arbitrate <session-id>                          # Block until dispute arrives (≈ gm:pending)
agent rule <session-id> --allow|--reject --reason "..." # Adjudicate dispute (≈ gm:adjudicate)

# === Observation ===
agent watch <session-id>                              # Stream state changes
agent inspect <session-id> --scope <agent-id>         # View scoped state (≈ PlayerView)
agent log <session-id>                                # Read transition log

# === Capability ===
agent capabilities list <session-id>                  # What capabilities exist
agent capabilities register <session-id> --hook <name> --handler ./handler.sh
```

---

## 4. Technical Detail: What Needs Solving

### 4.1 State Backend Abstraction

Playtest uses filesystem (`game.json` + `game.lock`). This works for single-host. For distributed:

**Option A: Filesystem over network mount (NFS/FUSE)**
- Preserves the existing model exactly
- fs.watch semantics are unreliable over NFS
- File locking is notoriously fragile over network mounts
- Verdict: fragile

**Option B: Git as state backend**
- State file in a git repo; transitions are commits
- Agents push transitions; conflicts detected via merge
- Disputes are essentially merge conflict resolution
- Natural audit trail (commit log = transition log)
- Works over network (git remotes)
- Interesting but high latency; not suitable for real-time

**Option C: Redis/Valkey with pub/sub**
- State in a key; transitions via WATCH/MULTI/EXEC (optimistic locking)
- Pub/sub replaces fs.watch for blocking waits
- Low latency, good for real-time
- Requires infrastructure

**Option D: SQLite + Litestream (or Turso)**
- Single-file database; Litestream replicates to S3
- WAL mode for concurrent reads
- ACID transactions replace file locks
- Embeddable, no server required
- Good middle ground

**Option E: HTTP API wrapping any backend**
- Thin HTTP server in front of the state backend
- Agents use `curl` / `wget` instead of direct file access
- CLI tool wraps HTTP calls
- Most flexible; introduces a server dependency

**Recommendation**: Start with Option D (SQLite) for single-host with upgrade path. Define a `StateBackend` interface so backends are swappable:

```typescript
interface StateBackend {
  getState(sessionId: string): Promise<SessionState>;
  applyTransition(sessionId: string, tx: Transition): Promise<TransitionResult>;
  subscribe(sessionId: string, filter: EventFilter): AsyncIterableIterator<StateEvent>;
  acquireLock(sessionId: string, agentId: string, ttl: number): Promise<Lock>;
}
```

### 4.2 The Blocking Wait Problem

Playtest's `waitForTurn` uses `fs.watch` + polling interval as fallback. This is the most elegant part of the design: the CLI process blocks, the agent (which called the CLI via Bash) suspends, and the system uses zero CPU until state changes.

For distributed systems, blocking wait needs:

- **Long polling**: Agent sends HTTP request; server holds connection until event occurs or timeout
- **WebSocket**: Persistent connection for push notifications
- **Polling with backoff**: Simplest; CLI polls at increasing intervals
- **Named pipes / Unix sockets**: For local inter-process, zero-overhead blocking

The CLI approach strongly favours **long polling or simple polling**, since CLI tools shouldn't maintain persistent connections. The Playtest model of "run a command that blocks and returns when ready" maps directly to long-poll.

```bash
# This blocks for up to 30s, returns immediately when work is available
agent claim <session-id> --timeout 30s
# Exit code 0 = work available, 1 = timeout, 2 = session ended
```

### 4.3 Capability Negotiation (Extracting MechanicRegistry)

The `MechanicRegistry` pattern generalises to a **capability negotiation protocol**:

```yaml
# capability.yaml - what an agent brings to a session
name: code-reviewer
version: 1.0
provides:
  - hook: onTransitionSubmitted
    resolution: blocking          # Can block transitions
    filter: { type: "code_change" }
  - hook: onDisputeRaised
    resolution: first             # Offers first-responder adjudication
requires:
  - capability: source-control    # Needs a source-control provider in the session
conflicts:
  - capability: auto-merge        # Can't coexist with auto-merge
```

The registry resolves these at join time:

```
Agent joins with capability "code-reviewer"
  → Checks: is "source-control" capability present? (dependency)
  → Checks: is "auto-merge" capability present? (conflict)
  → Registers hooks: onTransitionSubmitted (blocking), onDisputeRaised (first)
  → Capability is active
```

This is the Playtest mechanic system, verbatim, with different nouns.

### 4.4 Scoped Visibility (Extracting PlayerView)

Playtest filters state per-player: you see your hand, opponent hand *counts*, shared state. The gamemaster sees everything.

Generalised, this becomes **projection rules** in the protocol definition:

```yaml
# protocol.yaml
visibility:
  roles:
    participant:
      own_state: full
      peer_state: [name, status, public_metrics]
      shared_state: full
      transition_log: last_10
    arbiter:
      all_state: full
      transition_log: full
    observer:
      shared_state: full
      peer_state: [name, status]
      transition_log: redacted
```

The CLI `inspect` command applies these projections:

```bash
agent inspect <session-id> --as <agent-id>
# Returns: state filtered by this agent's role's visibility rules
```

### 4.5 Dispute Resolution (Extracting the Contest System)

Playtest's contest system is a two-phase commit with human (agent) adjudication:

1. **Transition applied optimistically** (player acts, state changes immediately)
2. **Challenge window** (other agents can dispute)
3. **Arbiter adjudicates** (gamemaster rules allow/reject)
4. **Rollback or confirm** (rejected actions are reversed)

For a general system, this becomes configurable per-protocol:

```yaml
dispute_policy:
  window: 60s                     # How long after transition before it's final
  auto_resolve: allow             # Default if no arbiter responds (cf. auto-adjudication)
  arbiter_selection: designated    # or: random_peer, consensus, voting
  rollback: supported             # Whether rejected transitions can be undone

  # Or: no disputes (trust all transitions)
  # dispute_policy: none
```

### 4.6 Identity, Trust, and the Filesystem Boundary

Playtest has no authentication. Any process that can read/write `game.json` is a participant. This is fine for single-host LLM agents. For distributed:

**Minimal viable trust**: Signed transitions.

```bash
# Agent signs its transition with a local key
agent submit <session-id> --transition '{ ... }' --sign ~/.agent/key.pem

# Other agents can verify
agent verify <session-id> --transition <tx-id>
```

The protocol stores the signing key's fingerprint at registration time. Transitions are verified against the registered key. This is not PKI — it's "the same entity that registered is the one submitting."

For higher trust: mutual TLS, OAuth tokens, or session-scoped bearer tokens issued at `session join` time.

### 4.7 Failure Modes

Playtest handles agent failure minimally: 60-second timeout on contest adjudication, then auto-allow. For a distributed system:

| Failure | Detection | Recovery |
|---|---|---|
| Agent crashes during participation | Heartbeat timeout or missed claim | Reclaim work, mark agent as `disconnected` |
| Agent crashes during dispute | Adjudication timeout | Auto-resolve per dispute policy |
| State backend unavailable | Connection timeout | Retry with backoff; agents buffer transitions |
| Network partition | Split-brain detection (quorum?) | Depends on consistency model |
| Malicious agent | Invalid transition / repeated disputes | Rate limiting, reputation scoring, ejection |

---

## 5. The Organic System: What Emerges

### 5.1 Agent Autonomy Spectrum

```
Orchestrated ◄────────────────────────────────────────► Organic
     │                                                      │
     │  Playtest today:                                     │
     │  - Coordinator spawns all agents                     │
     │  - Roles pre-assigned                                │
     │  - Topology fixed at init                            │
     │  - Bounded lifecycle                                 │
     │                                                      │
     │                     Target:                          │
     │                     - Agents self-discover            │
     │                     - Capabilities self-declared      │
     │                     - Topology dynamic                │
     │                     - Lifecycle open-ended            │
     │                                                      │
     │                                          Far future: │
     │                                   - Agents create    │
     │                                     sub-sessions     │
     │                                   - Protocols evolve │
     │                                   - No fixed arbiter │
     │                                   - Emergent rules   │
```

### 5.2 Session Archetypes (Beyond Games)

The extracted system supports diverse multi-agent patterns:

**Code Review Pipeline**
```yaml
protocol: code-review
roles:
  author: { submits: [code_change], max: 1 }
  reviewer: { submits: [approval, rejection, comment], min: 2 }
  ci: { submits: [test_result, lint_result], max: 1 }
completion: { requires: [2_approvals, ci_pass] }
dispute_policy: { arbiter_selection: designated_maintainer }
```

**Distributed Data Processing**
```yaml
protocol: map-reduce
roles:
  coordinator: { submits: [work_unit, final_result], max: 1 }
  worker: { submits: [partial_result], min: 1 }
completion: { requires: [all_work_units_processed] }
dispute_policy: none  # Workers are trusted
visibility:
  worker: { sees: own_work_unit_only }
```

**Multi-Agent Research**
```yaml
protocol: research-synthesis
roles:
  researcher: { submits: [finding, hypothesis, refutation], min: 2 }
  synthesiser: { submits: [synthesis, conclusion], max: 1 }
  critic: { submits: [critique, endorsement], min: 1 }
completion: { requires: [synthesis_endorsed_by_critic] }
dispute_policy: { arbiter_selection: voting, window: 300s }
```

**Consensus Building**
```yaml
protocol: proposal-consensus
roles:
  proposer: { submits: [proposal, amendment] }
  voter: { submits: [vote_for, vote_against, abstain] }
completion: { requires: [supermajority_vote] }
dispute_policy: { arbiter_selection: consensus }
```

### 5.3 The CLI as Universal Agent Boundary

The most transferable insight from Playtest: **the CLI is the agent interface**.

Agents are not libraries. They are not microservices. They are not function calls. They are **processes that invoke CLI commands**. This means:

- Any language, any runtime, any host can participate
- Agent internals are opaque to the system (an LLM agent and a bash script are equivalent)
- The CLI is the contract — stdin/stdout/stderr + exit codes
- Testing is trivial: mock the CLI, get deterministic agent behaviour
- Composition is natural: pipe, redirect, wrap, alias

The Playtest player agent is defined entirely by which `./playtest` subcommands it can call (tool restrictions in the agent definition: `Bash(./playtest player:*), Bash(./playtest register *), Bash(./playtest status *)`). This is an access control list expressed as a CLI command whitelist. Generalised:

```yaml
# Agent's allowed commands (capability-based security)
allowed_commands:
  - "agent claim *"
  - "agent submit *"
  - "agent dispute *"
  - "agent inspect *"
denied_commands:
  - "agent session create *"    # Can't create sessions
  - "agent rule *"              # Can't adjudicate
```

---

## 6. Implementation Phases

### Phase 0: Extract and Rename
- Factor Playtest's engine into domain-agnostic core
- Rename: `GameState` → `SessionState`, `PlayerState` → `AgentState`, `GameAction` → `Transition`
- Preserve: file-based state, CLI interface, blocking waits, contest system
- Test: can a non-game protocol run on the extracted engine?

### Phase 1: State Backend Interface
- Define `StateBackend` trait/interface
- Implement filesystem backend (current behaviour)
- Implement SQLite backend
- Wire up backend selection via config/env

### Phase 2: Capability Negotiation
- Extract `MechanicRegistry` into `CapabilityRegistry`
- Define capability manifest format (YAML)
- Implement join-time dependency/conflict resolution
- Fire hooks through capability registry

### Phase 3: Network Transport
- Add HTTP/REST transport layer for remote state access
- Implement long-polling for `claim` / `arbitrate` blocking commands
- Support both local (filesystem) and remote (HTTP) mode from same CLI

### Phase 4: Discovery and Dynamic Topology
- Session advertisement (mDNS for LAN, registry service for WAN)
- Dynamic agent join/leave without coordinator
- Capability-based role assignment (agent brings capabilities; protocol assigns role)

### Phase 5: Trust and Identity
- Agent key generation and registration
- Signed transitions
- Capability-based access control (command whitelist per role)

### Phase 6: Protocol Evolution
- Versioned protocol definitions
- Mid-session protocol upgrades (with agent consent)
- Agent-contributed capability injection

---

## 7. Open Questions

1. **Consistency model**: Playtest uses last-writer-wins with file locks. What consistency guarantee does a distributed version need? Linearisability? Causal consistency? Eventual?

2. **Arbiter bootstrapping**: If no coordinator exists, who creates the session and defines the protocol? First-agent-wins? Pre-shared protocol definition?

3. **Agent liveness**: How to distinguish a slow agent from a dead one? Playtest uses 60s timeout. Distributed systems need heartbeats or lease-based detection.

4. **State size**: Playtest's `game.json` is small (KB). If shared state grows to MB/GB, the "read full state, write full state" model breaks. Need incremental transitions / CRDT-like merge.

5. **Multi-session agents**: Can one agent participate in multiple sessions simultaneously? Playtest agents are single-session. A distributed CLI would naturally support multi-session via separate process invocations.

6. **Human-in-the-loop**: Playtest agents are LLMs. The generalised system should support human participants using the same CLI. The blocking `claim` command already works for this — a human runs `agent claim`, reads the output, thinks, runs `agent submit`.

7. **Observability**: Playtest has JSONL event logs. Distributed systems need distributed tracing (correlation IDs across agent transitions), metrics (transition latency, dispute rate), and dashboards.

---

## 8. Prior Art and Differences

| System | Similarity | Key Difference |
|---|---|---|
| **Temporal.io** | Workflow orchestration with durable state | Server-centric; agents are "workers" that poll. No peer dispute. |
| **NATS/JetStream** | Message-based multi-agent | Pub/sub not request-response. No shared state. No dispute resolution. |
| **Raft/Paxos** | Distributed consensus | Low-level consensus primitive, not agent-level protocol. |
| **Actor model (Erlang/Akka)** | Independent agents with message passing | Requires shared runtime. Not CLI-native. |
| **Git (multi-user)** | Distributed state with merge conflicts | Offline-first; not real-time. Conflict resolution is manual. |
| **Blockchain/DAOs** | Distributed state + dispute + trust | Heavyweight. Consensus overhead. Not CLI-ergonomic. |
| **Unix pipes** | Process composition via stdin/stdout | Point-to-point, not multi-agent shared state. |
| **MCP (Model Context Protocol)** | Tool exposure for LLM agents | Client-server, not peer-to-peer. No shared state or dispute. |
| **Claude Agent SDK** | Agent orchestration | Centralised orchestrator spawns subagents. Not distributed. |

The proposed system sits in an underexplored niche: **CLI-native, shared-state, multi-agent coordination with dispute resolution**. It's more structured than message queues, lighter than workflow engines, and more accessible than distributed consensus protocols.

---

## 9. Summary

The Playtest framework accidentally built a distributed agent coordination protocol, then constrained it to single-host game simulation. The engine's design — CLI interface, file-based shared state, blocking waits, capability registry, contest-based dispute resolution, scoped visibility — is domain-invariant. The game-specific layer (cards, boards, dice, win conditions) is a thin veneer over a general-purpose multi-agent participation protocol.

The extraction path is clear: factor out the domain-specific types, define a state backend interface, add network transport, and let agents discover and join sessions organically rather than being spawned by a coordinator. The CLI remains the universal agent boundary — any process that can shell out to `agent claim && agent submit` is a participant.

The hardest unsolved problem is not technical but philosophical: **how much structure should the protocol impose?** Playtest's answer — a game definition authored in advance, with mechanical validation — produces reliable, bounded interactions. A fully organic system — where agents negotiate protocols, contribute capabilities, and evolve rules mid-session — is more powerful but harder to reason about. The phased approach lets both coexist: start structured (Phase 0-2), add dynamism (Phase 3-5), enable emergence (Phase 6).
