# sync.parc.land: Domain-Oriented State Synchronization

**Status**: Design Proposal
**Date**: 2026-02-21
**Context**: Derived from analysis of Playtest's MechanicRegistry architecture, Beads distributed coordination, and the DISTRIBUTED_AGENT_CLI proposal

---

## 1. Executive Summary

sync.parc.land is a state synchronization service that generalizes Playtest's most powerful abstraction — the **MechanicRegistry** — into a network-accessible coordination layer. Instead of rooms as flat message channels, sync.parc.land provides **domains**: isolated state contexts with dynamically composable mechanics that evolve over time.

The key insight: Playtest's engine already solves the hard problems of multi-agent state coordination. The `MechanicRegistry` pattern — self-registering modules with dependency graphs, hook-based composition, conflict resolution, and scoped visibility — transfers directly from game mechanics to any domain of structured agent interaction. What's missing is the network transport.

This document covers:
1. What sync.parc.land needs to become (changes from the current concept)
2. How Playtest's mechanics system maps to a general-purpose sync service
3. The domain abstraction: rooms with evolving mechanics
4. Technical architecture and implementation plan

---

## 2. Playtest's Mechanics: The General-Purpose Engine

### 2.1 What the Mechanics System Actually Is

Strip away the game vocabulary and Playtest's mechanics system is a **capability-negotiated, hook-composed, state-transition engine**:

| Playtest Term | General-Purpose Term | What It Does |
|---|---|---|
| `MechanicHooks` | **Module** | Self-describing unit of behavior with typed hook implementations |
| `MechanicRegistry` | **Module Router** | Routes events to enabled modules; resolves dependencies/conflicts |
| `requires: ['cards']` | **Dependency declaration** | Module B needs Module A's hooks to exist before it can operate |
| `conflicts: ['trick-taking']` | **Mutual exclusion** | Two modules cannot coexist in the same context |
| `defines: { onCardDrawn: ... }` | **Event definition** | Module declares events that its dependents can subscribe to |
| `fire(slug, hookName, ...)` | **Scoped event dispatch** | Fire event only to modules that declared dependency on the definer |
| `resolution: 'merge'` | **Multi-responder aggregation** | Combine responses from all subscribers |
| `resolution: 'blocking'` | **Veto gate** | Any subscriber can halt the operation |
| `resolution: 'first'` | **First-responder claim** | First subscriber to respond owns the result |
| `getAvailableActions(ctx)` | **Capability advertisement** | Modules dynamically expose what operations are currently valid |
| `preValidateAction(ctx, action)` | **Pre-commit validation** | Modules can reject proposed state transitions before execution |
| `onExecuteAction(ctx)` | **Action handler** | Module claims ownership of a specific action type |
| `postExecuteAction(ctx, action)` | **Post-commit side effects** | Modules react to completed state transitions |
| `getVisibleState(ctx)` | **Projection filter** | Modules control what each participant sees |
| `StateChanges` | **Atomic state delta** | Structured diff (player state + shared state) applied atomically |
| `isMechanicEnabled(config, slug)` | **Feature flag resolution** | Dynamic enablement based on config + transitive dependencies |
| `GameConfig.engine_mechanics` | **Module configuration** | Per-module config declared in the domain definition |

### 2.2 The Three Resolution Strategies

The registry's `fire()` method supports three strategies for combining responses from multiple modules:

```
merge:    All respondents contribute. StateChanges are shallow-merged.
          Use case: Multiple modules enriching the same state transition.

blocking: Short-circuit on first { blocked: true } response.
          Use case: Validation gates. Any module can veto.

first:    First non-null response wins. Others are not called.
          Use case: Action ownership. Exactly one module handles an action.
```

These three strategies cover the vast majority of multi-module coordination patterns. They are the building blocks for sync.parc.land's domain mechanics.

### 2.3 The Composition Tree

Playtest's `defines` + `requires` pattern creates a natural hierarchy:

```
engine (global hooks: onTurnStart, preValidateAction, onCheckWin)
  |
  +-- cards (defines: onCardDrawn, onCardPlayed, ...)
  |     +-- card-matching (requires: cards)
  |     +-- hand-management (requires: cards)
  |     +-- trick-taking (requires: cards; defines: onTrickWon)
  |           +-- must-follow-suit (requires: trick-taking)
  |
  +-- resources (defines: onResourceGained, onResourceSpent)
  |     +-- income (requires: resources)
  |     +-- catch-the-leader (requires: resources)
  |
  +-- auction (defines: onBid, canBid, onAuctionEnd)
        +-- auction-english (requires: auction, resources)
        +-- auction-sealed-bid (requires: auction, resources)
```

Any module can define hooks. Any module can require another module and implement its hooks. The tree grows organically. **This is the pattern sync.parc.land domains should follow.**

### 2.4 The 21 Global Hooks

Playtest defines 21 global hooks that the engine fires to all enabled modules:

**Action lifecycle** (5): `preValidateAction`, `onExecuteAction`, `postExecuteAction`, `getAvailableActions`, `describeAction`

**Turn lifecycle** (3): `onTurnStart`, `onTurnEnd`, `shouldAutoEndTurn`

**Initialization** (3): `initPlayerState`, `initSharedState`, `getPlayerView`

**Visibility** (2): `getVisibleState`, `canSeeInfo`

**Ordering** (2): `onDetermineTurnOrder`, `onPassPriority`

**Win/completion** (1): `onCheckWin`

**Capabilities** (3): `isPlayerBlocked`, `canPlayerActNow`, `getActionSchema`

**Undo** (1): `reverseAction`

**Effects** (1): `applyEffect`

For sync.parc.land, these generalize to **domain lifecycle hooks** — a smaller, domain-agnostic subset that any domain can extend.

---

## 3. From Rooms to Domains

### 3.1 The Problem with Flat Rooms

A room as a flat message channel (join, post message, read messages) provides no structure. Agents must interpret all semantics themselves. Every consumer re-invents:

- What state exists and who can modify it
- What actions are valid in the current state
- How to resolve conflicting concurrent actions
- What each participant is allowed to see
- When the room's purpose is "complete"

This is the equivalent of having a game engine with no mechanics — just a `game.json` file and agents that write arbitrary JSON to it.

### 3.2 Domains: Rooms with Mechanics

A **domain** is a room that has opted into a composition of modules (mechanics). The domain definition specifies:

```yaml
# domain definition
name: "code-review-sprint-42"
modules:
  turn-taking:
    order: round-robin
    timeout: 300s
  voting:
    threshold: majority
    quorum: 0.6
  visibility:
    author: [own_changes, all_reviews]
    reviewer: [assigned_changes, own_reviews]
    observer: [summary_only]
  task-tracking:
    states: [open, in_review, approved, merged]
    transitions:
      - from: open, to: in_review, requires: [author]
      - from: in_review, to: approved, requires: [reviewer, reviewer]
      - from: approved, to: merged, requires: [ci_pass]
completion:
  when: all_tasks_merged
```

This is structurally identical to a Playtest game's RULES.md `engine_mechanics` block. The modules are mechanics. The domain definition is the game config.

### 3.3 Why Domains Evolve

Games are bounded: init -> play -> end. But many coordination contexts are **open-ended**. A software project's review process evolves. A research collaboration's methods shift. An ongoing negotiation introduces new constraints.

Playtest's `engine_mechanics` config is static — set at init, never changed. For sync.parc.land, domains should support:

1. **Module addition**: A new module is composed into the domain mid-lifecycle
2. **Module reconfiguration**: An existing module's parameters change
3. **Module removal**: A module is decomposed from the domain
4. **Dependent cascade**: Adding/removing a module triggers dependency resolution

This is the "Phase 6: Protocol Evolution" from the DISTRIBUTED_AGENT_CLI proposal, but designed in from the start rather than bolted on.

---

## 4. Architecture

### 4.1 Core Primitives

```
+------------------------------------------------------------------+
|                          sync.parc.land                          |
|                                                                  |
|  +-------------------+  +-------------------+  +---------------+ |
|  |     Domain        |  |     Domain        |  |    Domain     | |
|  |  "sprint-42"      |  |  "research-q3"    |  |  "chess-1"    | |
|  |                   |  |                   |  |               | |
|  |  Modules:         |  |  Modules:         |  |  Modules:     | |
|  |  - turn-taking    |  |  - freeplay       |  |  - cards      | |
|  |  - voting         |  |  - voting         |  |  - turns      | |
|  |  - task-tracking  |  |  - evidence       |  |  - board      | |
|  |  - visibility     |  |  - synthesis      |  |  - visibility | |
|  |                   |  |                   |  |               | |
|  |  Agents: 5        |  |  Agents: 3        |  |  Agents: 2    | |
|  |  State: {...}     |  |  State: {...}     |  |  State: {...} | |
|  +-------------------+  +-------------------+  +---------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |                    Module Registry                          | |
|  |  Registered: turn-taking, freeplay, voting, visibility,     | |
|  |  task-tracking, evidence, synthesis, cards, turns, board,   | |
|  |  resources, effects, auction, combat, ...                   | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |                    Transport Layer                           | |
|  |  HTTP/REST + SSE (long-poll for claim/wait)                 | |
|  |  WebSocket (optional, for real-time domains)                | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### 4.2 Data Model

```typescript
// === Core Types ===

interface Domain {
  id: string;
  name: string;
  status: 'initializing' | 'active' | 'paused' | 'completed' | 'archived';
  config: DomainConfig;
  agents: Record<string, AgentState>;
  shared: Record<string, unknown>;       // Module-contributed shared state
  moduleConfig: Record<string, unknown>;  // Per-module configuration
  enabledModules: string[];               // Resolved module list (with deps)
  version: number;                        // Monotonic state version
  createdAt: string;
  updatedAt: string;
}

interface AgentState {
  agentId: string;
  role: string;
  capabilities: string[];                // What this agent can do
  state: Record<string, unknown>;        // Module-contributed agent state
  joinedAt: string;
  lastSeenAt: string;
}

interface DomainConfig {
  modules: Record<string, unknown>;      // Module configs (like engine_mechanics)
  visibility?: VisibilityRules;
  completion?: CompletionCriteria;
  dispute?: DisputePolicy;
  evolution?: EvolutionPolicy;           // Rules for mid-lifecycle changes
}

interface StateTransition {
  id: string;
  domainId: string;
  agentId: string;
  action: { type: string; [key: string]: unknown };
  timestamp: string;
  result: TransitionResult;
  version: number;                       // State version after this transition
}

interface TransitionResult {
  success: boolean;
  handled: boolean;
  handledBy?: string;                    // Which module handled it
  stateChanges?: StateChanges;
  error?: string;
  advanceTurn?: boolean;
  checkCompletion?: boolean;
}

// === Module Types (mirrors MechanicHooks) ===

interface ModuleHooks {
  slug: string;
  name: string;
  requires?: string[];
  conflicts?: string[];
  defines?: Record<string, HookDefinition>;
  configSchema?: ModuleConfigSchema;

  // Lifecycle hooks
  onDomainInit?(ctx: DomainContext): SharedStateInit | null;
  onAgentJoin?(ctx: AgentContext): AgentStateInit | null;
  onAgentLeave?(ctx: AgentContext): StateChanges | null;

  // Action hooks (same pattern as Playtest)
  preValidateAction?(ctx: HookContext, action: Action): ValidationResult | null;
  onExecuteAction?(ctx: ActionContext): ActionResult | null;
  postExecuteAction?(ctx: HookContext, action: Action): StateChanges | null;
  getAvailableActions?(ctx: HookContext): AvailableAction[];

  // Visibility
  getVisibleState?(ctx: VisibilityContext): VisibleState | null;

  // Completion
  onCheckCompletion?(ctx: CompletionContext): CompletionResult | null;

  // Evolution (new — not in Playtest)
  canEvolve?(ctx: EvolutionContext): boolean | null;
  onModuleAdded?(ctx: EvolutionContext, newModule: string): StateChanges | null;
  onModuleRemoved?(ctx: EvolutionContext, removedModule: string): StateChanges | null;
  onModuleReconfigured?(ctx: EvolutionContext, module: string, newConfig: unknown): StateChanges | null;

  // Arbitrary mechanic-defined hooks (same [key: string] pattern)
  [hookName: string]: unknown;
}
```

### 4.3 Module Registry

The module registry is structurally identical to Playtest's `MechanicRegistry`:

```typescript
class ModuleRegistry {
  private modules: Map<string, ModuleHooks> = new Map();

  register(module: ModuleHooks): void;
  getEnabledModules(config: DomainConfig): ModuleHooks[];
  validateDependencies(config: DomainConfig): ValidationError[];

  // Global hook routing (all enabled modules receive)
  preValidateAction(domain: Domain, agentId: string, action: Action): ValidationResult;
  executeAction(domain: Domain, agentId: string, action: Action): ActionResult | null;
  postExecuteAction(domain: Domain, agentId: string, action: Action): StateChanges;
  getAvailableActions(domain: Domain, agentId: string): AvailableAction[];
  getVisibleState(domain: Domain, viewerAgentId: string): VisibleState;

  // Scoped hook routing (only dependents receive)
  fire(definerSlug: string, hookName: string, domain: Domain, agentId: string, payload?: unknown): StateChanges | null;

  // Evolution (new)
  addModule(domain: Domain, moduleSlug: string, config: unknown): EvolutionResult;
  removeModule(domain: Domain, moduleSlug: string): EvolutionResult;
  reconfigureModule(domain: Domain, moduleSlug: string, newConfig: unknown): EvolutionResult;
}
```

### 4.4 API Surface

```
# === Domain Lifecycle ===
POST   /domains                          Create domain with module config
GET    /domains                          List domains (filterable)
GET    /domains/:id                      Get domain state (visibility-filtered)
PATCH  /domains/:id                      Update domain config / pause / resume
DELETE /domains/:id                      Archive domain

# === Agent Participation ===
POST   /domains/:id/agents               Join domain (with capabilities)
DELETE /domains/:id/agents/:agentId       Leave domain
GET    /domains/:id/agents/:agentId/view  Get visibility-filtered state for agent

# === State Transitions ===
POST   /domains/:id/actions               Submit action (validated + executed by modules)
GET    /domains/:id/actions               List transition history
GET    /domains/:id/actions/available      Get available actions for agent

# === Blocking Wait (Long-Poll / SSE) ===
GET    /domains/:id/claim?agent=:agentId&timeout=30  Block until work available
GET    /domains/:id/events?agent=:agentId             SSE stream of state changes

# === Module Evolution ===
POST   /domains/:id/modules               Add module to running domain
DELETE /domains/:id/modules/:slug         Remove module from running domain
PATCH  /domains/:id/modules/:slug         Reconfigure module

# === Dispute Resolution ===
POST   /domains/:id/disputes              Challenge a transition
GET    /domains/:id/disputes/pending       Block until dispute arrives (arbiter)
POST   /domains/:id/disputes/:id/ruling    Adjudicate dispute

# === Global Module Registry ===
GET    /modules                            List all registered modules
GET    /modules/:slug                      Get module metadata (hooks, config schema, deps)
POST   /modules                            Register custom module (runtime extension)
```

---

## 5. Domain Evolution: Mechanics That Change Over Time

### 5.1 The Evolution Problem

In Playtest, mechanics are fixed at game init. This is correct for games — the rules don't change mid-game. But for long-lived domains, evolution is essential:

- A research collaboration starts with `evidence` + `synthesis` modules, then adds `peer-review` when enough findings accumulate
- A project management domain starts with `kanban`, then adds `sprint-planning` when the team decides to adopt sprints
- A negotiation domain starts with `proposal` + `voting`, then adds `binding-agreement` when parties reach sufficient trust

### 5.2 Evolution Policy

Each domain declares its evolution rules:

```yaml
evolution:
  # Who can propose module changes
  proposer: [admin, any_agent]

  # How changes are approved
  approval: immediate | vote | arbiter

  # Constraints
  constraints:
    # Modules that can never be removed
    pinned: [visibility, turn-taking]
    # Modules that can be added without approval
    auto_approve_add: [logging, metrics]
    # Maximum modules per domain
    max_modules: 20
```

### 5.3 Evolution Mechanics

When a module is added to a running domain:

```
1. Dependency check     — Does the new module's `requires` resolve?
2. Conflict check       — Does the new module `conflict` with any enabled module?
3. Approval gate        — Per evolution policy (immediate / vote / arbiter)
4. canEvolve hook       — All enabled modules get a veto opportunity
5. Module init          — New module's onDomainInit runs (contributes shared state)
6. Agent reinit         — New module's onAgentJoin runs for all existing agents
7. onModuleAdded hook   — All enabled modules notified of the new module
8. State version bump   — Domain version increments; all agents see the change
```

When a module is removed:

```
1. Pinned check         — Is the module pinned by evolution policy?
2. Dependent check      — Do other enabled modules `require` this one?
3. Approval gate        — Per evolution policy
4. canEvolve hook       — All enabled modules get a veto opportunity
5. onModuleRemoved hook — All enabled modules notified; can clean up state
6. Module teardown      — Module's state contributions are optionally preserved or removed
7. State version bump   — Domain version increments
```

### 5.4 Example: A Domain That Grows

```
t=0  Domain created with: [turn-taking, task-tracking]
     → Simple task board. Agents take turns claiming and completing tasks.

t=1  Agent proposes adding: [voting]
     → Dependencies: none. Conflicts: none.
     → Approved immediately (auto_approve_add includes voting).
     → Now agents can vote on task priority.

t=2  Agent proposes adding: [evidence] (requires: [task-tracking])
     → Dependencies: task-tracking is enabled. OK.
     → Approved by vote (3/4 agents approve).
     → Tasks can now have evidence attachments.

t=3  Agent proposes adding: [peer-review] (requires: [evidence, voting])
     → Dependencies: evidence and voting both enabled. OK.
     → Approved by vote.
     → Evidence submissions now require peer review via voting.

t=4  Agent proposes removing: [turn-taking]
     → turn-taking is pinned. REJECTED.

t=5  Agent proposes reconfiguring: [voting] { threshold: supermajority }
     → Existing voting module reconfigured.
     → All enabled modules notified via onModuleReconfigured.
     → Votes now require 2/3 majority instead of simple majority.
```

The domain's behavior evolves organically as agents add modules. The dependency graph ensures coherence. The evolution policy ensures governance.

---

## 6. Mapping Playtest Mechanics to sync.parc.land Modules

### 6.1 Direct Transfers (Game-Agnostic Core)

These Playtest mechanics transfer directly as sync.parc.land modules with minimal renaming:

| Playtest Mechanic | sync.parc.land Module | Behavior |
|---|---|---|
| `turns` (core) | `turn-taking` | Round-robin, claim-based, or free participation ordering |
| `freeplay` | `freeplay` | Any agent can act at any time (parallel participation) |
| `pass` | `pass` | Agent explicitly passes their turn |
| `visibility` (core) | `visibility` | Per-role state projection filters |
| `hidden-roles` | `hidden-roles` | Agents don't know each other's roles |
| `social` (core) | `voting` | Structured voting with quorum, tally, completion |
| `negotiation` | `negotiation` | Free-form offers and counteroffers |
| `resources` (core) | `resources` | Typed quantities that agents earn, spend, trade |
| `trading` | `trading` | Resource exchange between agents |
| `effects` (core) | `effects` | Temporary state modifiers with duration/expiry |
| `action-points` | `action-budget` | Agents have limited actions per turn/round |
| `auction-*` (11 variants) | `auction-*` | Competitive bidding on scarce items |
| `communication-limits` | `communication-limits` | Restrict what agents can say to whom |
| `cooperative-game` | `cooperative` | Agents share a common goal |
| `team-based-game` | `teams` | Agents are grouped into teams |
| `alliances` | `alliances` | Dynamic team formation |
| `voting` | `structured-voting` | Topic-based voting with resolution |
| `betting-and-bluffing` | `betting` | Wager-based interactions |
| `prisoner's-dilemma` | `simultaneous-choice` | Agents choose simultaneously, revealed together |

### 6.2 New Modules (Not in Playtest)

These are needed for non-game domains:

| Module | Purpose | Hooks Defined |
|---|---|---|
| `task-tracking` | Kanban-style task states and transitions | `onTaskCreated`, `onTaskTransitioned`, `onTaskAssigned` |
| `evidence` | Structured evidence/artifact attachments | `onEvidenceSubmitted`, `onEvidenceRefuted` |
| `peer-review` | Review workflow with approve/reject/revise | `onReviewRequested`, `onReviewCompleted` |
| `synthesis` | Combining multiple inputs into conclusions | `onSynthesisProposed`, `onSynthesisAccepted` |
| `escalation` | Escalate unresolved items to arbiter | `onEscalated`, `onEscalationResolved` |
| `deadline` | Time-based constraints and triggers | `onDeadlineApproaching`, `onDeadlinePassed` |
| `logging` | Append-only event log with structured entries | `onLogEntry` |
| `metrics` | Quantitative tracking of domain activity | `onMetricRecorded` |
| `binding-agreement` | Formal commitments between agents | `onAgreementProposed`, `onAgreementSigned` |
| `gate` (from Beads) | External condition wait (CI, approval, timer) | `onGateOpened`, `onGateClosed` |

### 6.3 The Module Composition Tree for sync.parc.land

```
engine (global hooks: preValidateAction, onExecuteAction, getVisibleState, ...)
  |
  +-- turn-taking (defines: onTurnStart, onTurnEnd)
  |     +-- action-budget (requires: turn-taking)
  |     +-- pass (requires: turn-taking)
  |
  +-- freeplay (conflicts: turn-taking)
  |
  +-- visibility (defines: onBeforeReveal, onInfoRevealed)
  |     +-- hidden-roles (requires: visibility)
  |     +-- communication-limits (requires: visibility)
  |
  +-- voting (defines: onVoteCast, onVoteTallied, onVoteCompleted)
  |     +-- structured-voting (requires: voting)
  |     +-- peer-review (requires: voting, evidence)
  |
  +-- resources (defines: onResourceGained, onResourceSpent)
  |     +-- trading (requires: resources)
  |     +-- auction-* (requires: resources)
  |     +-- binding-agreement (requires: resources)
  |
  +-- effects (defines: onEffectAdded, onEffectRemoved)
  |     +-- deadline (requires: effects)
  |
  +-- task-tracking (defines: onTaskCreated, onTaskTransitioned)
  |     +-- evidence (requires: task-tracking)
  |     +-- escalation (requires: task-tracking)
  |
  +-- gate (defines: onGateOpened, onGateClosed)
        +-- deadline (requires: gate, effects)
```

---

## 7. Concrete Domain Archetypes

### 7.1 Game Domain (Playtest Compatibility)

sync.parc.land can host Playtest games directly. The game's `engine_mechanics` config maps 1:1 to domain modules:

```yaml
name: "markovs-chains-game-1"
modules:
  turn-taking: { order: round-robin }
  cards: { starting_hand: 5, deck: [...] }
  board: { states: [...], edges: [...] }
  visibility: { player: [own_hand, shared], gamemaster: [all] }
  board-state: true
  probability-movement: true
  reach-state: { target: "Victory" }
completion:
  when: module_signals  # reach-state signals completion
```

### 7.2 Code Review Domain

```yaml
name: "review-pr-4521"
modules:
  freeplay: true  # No turn-taking — anyone reviews anytime
  task-tracking:
    states: [pending_review, in_review, changes_requested, approved, merged]
  evidence:
    types: [code_diff, test_result, lint_result]
  peer-review:
    required_approvals: 2
    self_review: false
  gate:
    - type: ci_pass
      condition: all_checks_green
  visibility:
    author: [own_changes, all_reviews, ci_results]
    reviewer: [assigned_changes, own_reviews]
    observer: [summary, approval_status]
completion:
  when: all_tasks_state_is(merged)
evolution:
  proposer: [admin]
  approval: immediate
  pinned: [task-tracking, visibility]
```

### 7.3 Research Collaboration Domain

```yaml
name: "research-q3-safety"
modules:
  freeplay: true
  evidence:
    types: [paper, dataset, experiment, observation]
  voting:
    threshold: majority
    quorum: 0.5
  resources:
    types: { credibility: { initial: 10 }, attention: { per_round: 5 } }
  action-budget:
    per_round: 3
    actions: [submit_evidence, vote, synthesize]
  synthesis:
    requires_evidence: 3
    requires_vote: true
  visibility:
    researcher: [all_evidence, own_votes, synthesis_proposals]
    observer: [accepted_evidence, completed_syntheses]
completion:
  when: synthesis_accepted
evolution:
  proposer: [any_agent]
  approval: vote
  pinned: [evidence, visibility]
  auto_approve_add: [logging, metrics]
```

### 7.4 Negotiation Domain (Evolving)

```yaml
name: "contract-negotiation-2026"
modules:
  turn-taking: { order: round-robin, timeout: 600s }
  resources:
    types: { goodwill: { initial: 100 }, concessions: { initial: 0 } }
  visibility:
    party_a: [own_state, shared_proposals, party_b_public]
    party_b: [own_state, shared_proposals, party_a_public]
    mediator: [all]
  communication-limits:
    private_channels: [party_a_mediator, party_b_mediator]
    public_channel: true
completion:
  when: binding_agreement_signed | timeout(30d)
evolution:
  proposer: [mediator]
  approval: vote
  pinned: [visibility, communication-limits]
  # Mediator can add binding-agreement module when parties are ready
```

This domain starts simple and the mediator adds `binding-agreement` when trust is established — a concrete example of mechanics evolving over time.

---

## 8. Technical Implementation

### 8.1 What Needs Building

| Component | Description | Complexity | Priority |
|---|---|---|---|
| **Module Registry** | Port of MechanicRegistry with network-aware hooks | Medium | P0 |
| **Domain Manager** | CRUD + lifecycle for domains (create, join, leave, archive) | Medium | P0 |
| **Action Pipeline** | validate -> execute -> post-execute -> state-change | Low | P0 |
| **Visibility Layer** | Per-agent state projection via module hooks | Low | P0 |
| **REST API** | Express/Hono HTTP server with the API surface above | Medium | P0 |
| **SSE/Long-Poll** | Event streaming for `claim` and `events` endpoints | Medium | P1 |
| **Evolution Engine** | Add/remove/reconfigure modules on running domains | High | P1 |
| **Dispute System** | Challenge + adjudicate transitions | Medium | P2 |
| **Persistence** | SQLite backend for domain state (not just in-memory) | Low | P2 |
| **Custom Modules** | Runtime module registration via API | High | P3 |
| **CLI Client** | `sync` CLI tool wrapping the HTTP API | Low | P3 |

### 8.2 State Backend

Start with in-memory + SQLite persistence (matching DISTRIBUTED_AGENT_CLI recommendation):

```typescript
interface StateBackend {
  getDomain(id: string): Promise<Domain | null>;
  saveDomain(domain: Domain): Promise<void>;
  appendTransition(tx: StateTransition): Promise<void>;
  getTransitions(domainId: string, since?: number): Promise<StateTransition[]>;
  subscribe(domainId: string, agentId: string): AsyncIterableIterator<DomainEvent>;
}
```

### 8.3 Module Loading

Modules can be:
1. **Built-in**: Shipped with sync.parc.land (the Playtest-derived set)
2. **Registered at startup**: Loaded from a modules directory
3. **Registered at runtime**: Posted via the `/modules` API (P3)

```typescript
// Built-in module registration (mirrors src/mechanics/index.ts)
import { turnTakingModule } from './modules/core/turn-taking.js';
import { freeplayModule } from './modules/core/freeplay.js';
import { votingModule } from './modules/core/voting.js';
import { visibilityModule } from './modules/core/visibility.js';
import { resourcesModule } from './modules/core/resources.js';
import { effectsModule } from './modules/core/effects.js';
import { taskTrackingModule } from './modules/task-tracking.js';

moduleRegistry.register(turnTakingModule);
moduleRegistry.register(freeplayModule);
moduleRegistry.register(votingModule);
// ...
```

### 8.4 Relationship to Playtest

sync.parc.land does **not** replace Playtest. The relationship is:

```
Playtest (CLI, file-based, single-host, game-focused)
    |
    | extracts general patterns into
    |
    v
sync.parc.land (HTTP API, persistent, network-accessible, domain-agnostic)
    |
    | can host game domains via
    |
    v
Playtest game modules (cards, board, dice, etc.)
```

Playtest continues to work as-is for local AI playtesting. sync.parc.land provides the network layer when you need distributed agents, persistent state, or non-game domains. Playtest's game mechanics can be registered as sync.parc.land modules for network-accessible game hosting.

### 8.5 Relationship to Beads

Beads and sync.parc.land occupy different niches:

| Aspect | Beads | sync.parc.land |
|---|---|---|
| **Transport** | Git (offline-first) | HTTP (online-first) |
| **State model** | Issues with 81 fields | Domains with module-contributed state |
| **Merge strategy** | Field-level LWW/union/append | Module-defined resolution (merge/first/blocking) |
| **Coordination** | Gates, molecules, wisps | Module composition, evolution, disputes |
| **Target** | AI coding agent memory | Multi-agent structured interaction |
| **Schema** | Fixed (bead schema) | Dynamic (module-defined) |

The key borrowing from Beads: **gates** (external condition waits) and the general principle that AI agents need structured coordination primitives, not just message passing.

---

## 9. Implementation Phases

### Phase 0: Core Engine (Week 1)
- Port `MechanicRegistry` -> `ModuleRegistry` (rename types, strip game-specific hooks)
- Implement `Domain` CRUD with in-memory storage
- Implement action pipeline: validate -> execute -> post-execute
- Implement visibility filtering
- REST API with Express/Hono
- Port 5 core modules: `turn-taking`, `freeplay`, `visibility`, `resources`, `voting`

### Phase 1: Participation (Week 2)
- Agent join/leave with capability declaration
- Long-poll `claim` endpoint (blocking wait)
- SSE `events` endpoint (state streaming)
- Port 5 more modules: `effects`, `action-budget`, `pass`, `trading`, `communication-limits`

### Phase 2: Evolution (Week 3)
- Evolution engine: add/remove/reconfigure modules on running domains
- Evolution policy enforcement
- `canEvolve` hook on all modules
- Cascade resolution (dependency/conflict checks on evolution)

### Phase 3: Persistence + Disputes (Week 4)
- SQLite backend for domain state
- Transition log persistence
- Dispute system: challenge, adjudicate, rollback
- Domain archival and cleanup

### Phase 4: Game Module Bridge (Week 5)
- Register Playtest mechanics as sync.parc.land modules
- Adapter layer: `MechanicHooks` -> `ModuleHooks`
- Host a Playtest game as a sync.parc.land domain
- Verify round-trip compatibility

### Phase 5: Runtime Extension (Week 6+)
- Runtime module registration via API
- Module sandboxing (untrusted module execution)
- CLI client tool
- Module marketplace / discovery

---

## 10. Key Design Decisions

### 10.1 Why Not Just Extend Playtest?

Playtest's design is optimized for local, CLI-based, file-system-backed game simulation. Adding HTTP transport, persistent storage, and domain evolution would compromise its simplicity. Better to extract the general patterns into a purpose-built service and keep Playtest lean.

### 10.2 Why Modules, Not Middleware?

Middleware (Express-style) is a linear pipeline. Modules are a **dependency graph with typed hooks and resolution strategies**. The graph structure enables:
- Scoped event dispatch (only dependents receive hooks)
- Conflict detection (mutual exclusion)
- Transitive enablement (auto-enable infrastructure modules)
- Evolution safety (dependency checks before add/remove)

Middleware can't do any of these.

### 10.3 Why Evolution Over Versioning?

Protocol versioning (v1, v2, v3) requires all agents to agree on a version at join time. Evolution allows incremental, negotiated changes. This matches how real coordination contexts work — you don't restart a project to add a new process; you evolve the process in place.

### 10.4 Why Three Resolution Strategies, Not Arbitrary Consensus?

Playtest proved that `merge`, `first`, and `blocking` cover the vast majority of multi-module coordination patterns. Adding more strategies (weighted voting, quorum-based, etc.) can be done later as specialized modules that implement their own resolution on top of the base three.

### 10.5 State Owned by Modules, Not by Agents

Like Playtest's "engine owns state" principle, sync.parc.land's modules own state. Agents propose actions; modules validate, execute, and produce state changes. This prevents:
- Agents writing arbitrary state (no free-form mutation)
- State corruption from concurrent writes (modules serialize through the action pipeline)
- Visibility violations (modules filter what agents see)

---

## 11. Summary

sync.parc.land is the network-accessible generalization of Playtest's MechanicRegistry. Its core innovation is the **domain** — a room with composable, evolvable modules that define what state exists, what actions are valid, how conflicts are resolved, and what each participant can see.

The design is directly derived from Playtest's proven patterns:
- **Module composition** from `MechanicHooks` + `requires` + `conflicts` + `defines`
- **Hook routing** from `MechanicRegistry.fire()` with merge/first/blocking resolution
- **Action pipeline** from `preValidateAction` -> `onExecuteAction` -> `postExecuteAction`
- **Visibility filtering** from `getVisibleState` + `canSeeInfo`
- **State ownership** from "engine owns state, agents make decisions"

What sync.parc.land adds:
- **Network transport** (HTTP API + SSE/long-poll)
- **Domain evolution** (add/remove/reconfigure modules mid-lifecycle)
- **Persistent state** (SQLite backend)
- **Non-game modules** (task-tracking, evidence, peer-review, gates)
- **Runtime module registration** (extend the system without redeployment)

The dependency graph from Playtest's `defines`/`requires` pattern is the architectural backbone. It ensures that domains remain coherent as modules are composed and evolved, that events reach the right subscribers, and that conflicts are detected before they corrupt state.

---

## Appendix A: Playtest Hook -> sync.parc.land Hook Mapping

| Playtest Hook | sync.parc.land Hook | Change |
|---|---|---|
| `preValidateAction` | `preValidateAction` | Identical |
| `onExecuteAction` | `onExecuteAction` | Identical |
| `postExecuteAction` | `postExecuteAction` | Identical |
| `getAvailableActions` | `getAvailableActions` | Identical |
| `getActionSchema` | `getActionSchema` | Identical |
| `describeAction` | `describeAction` | Identical |
| `getVisibleState` | `getVisibleState` | Identical |
| `canSeeInfo` | `canSeeInfo` | Identical |
| `initSharedState` | `onDomainInit` | Renamed for clarity |
| `initPlayerState` | `onAgentJoin` | Renamed; also fires on join, not just init |
| `onTurnStart` | Module-defined | Not a global hook; turn-taking module defines it |
| `onTurnEnd` | Module-defined | Not a global hook; turn-taking module defines it |
| `onCheckWin` | `onCheckCompletion` | Renamed; generalized beyond "winning" |
| `isPlayerBlocked` | `isAgentBlocked` | Renamed |
| `canPlayerActNow` | `canAgentActNow` | Renamed |
| `reverseAction` | `reverseAction` | Identical |
| `applyEffect` | `applyEffect` | Identical |
| — | `canEvolve` | **New**: Evolution veto hook |
| — | `onModuleAdded` | **New**: Evolution notification |
| — | `onModuleRemoved` | **New**: Evolution notification |
| — | `onModuleReconfigured` | **New**: Evolution notification |
| — | `onAgentLeave` | **New**: Graceful departure handling |

## Appendix B: Resolution Strategy Examples

### merge — Multiple modules enrich a state transition

```
Agent submits: { type: "complete_task", taskId: "T-42" }

task-tracking module:  → { sharedStateChanges: { tasks.T-42.status: "completed" } }
metrics module:        → { sharedStateChanges: { completedCount: 8 } }
resources module:      → { agentStateChanges: { agent-1: { xp: 150 } } }

Result: All three state changes are merged and applied atomically.
```

### blocking — Any module can veto

```
Agent submits: { type: "merge_pr", prId: "4521" }

peer-review module:    → { valid: true }  (2 approvals present)
gate module:           → { valid: false, error: "CI checks not passing" }

Result: Action rejected. Gate module's veto stops execution.
```

### first — First handler owns the action

```
Agent submits: { type: "bid", amount: 500 }

auction-english module: → { handled: true, stateChanges: { currentBid: 500, highBidder: "agent-1" } }
auction-sealed module:  (never called — first handler won)

Result: auction-english owns the bid action.
```
