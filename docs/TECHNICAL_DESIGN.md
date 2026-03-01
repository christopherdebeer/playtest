# Playtest: Technical Design Document

> A comprehensive technical design and narrative document for the Playtest framework — a game-agnostic agentic playtesting system that uses parallel Claude agents to playtest board and card games.

**Version**: 3.0.0
**Last Updated**: 2026-03-01

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [The TypeScript Engine](#3-the-typescript-engine)
4. [The Mechanics System](#4-the-mechanics-system)
5. [Multi-Agent Orchestration](#5-multi-agent-orchestration)
6. [Game Definitions](#6-game-definitions)
7. [The CLI Interface](#7-the-cli-interface)
8. [State Management & Concurrency](#8-state-management--concurrency)
9. [The Hook System](#9-the-hook-system)
10. [The Skill System](#10-the-skill-system)
11. [Testing Strategy](#11-testing-strategy)
12. [The Static Site](#12-the-static-site)
13. [Evolutionary History](#13-evolutionary-history)
14. [Design Proposals & Future Direction](#14-design-proposals--future-direction)
15. [Codebase Statistics](#15-codebase-statistics)

---

## 1. Executive Summary

Playtest is a framework where AI agents play board games against each other. The core thesis is simple: define a game's rules in a markdown file, spin up a gamemaster and some player agents, and let them play. The engine handles state, randomization, and turn management. The agents handle decision-making and rule interpretation.

The system is built on three design principles:

1. **Engine owns state** — All game state, randomization, and deck management lives in a TypeScript engine. Agents never touch state directly.
2. **Agents make decisions** — The gamemaster interprets rules and adjudicates disputes. Players choose actions and compete to win.
3. **Games are data, not code** — A new game is a `RULES.md` file with YAML configuration and natural-language rules. No TypeScript changes required.

The result is a system where 18 different games — from UNO to hidden-role social deduction — run on the same engine with the same agent architecture, differentiated only by their rules files and which mechanics they enable.

### What exists today

| Dimension | Scale |
|-----------|-------|
| TypeScript source | 190 files, ~51,000 lines |
| Composable mechanics | 176 (138 leaf + 24 core + 14 win conditions) |
| Playable games | 18 |
| Mechanic reference library | 192 entries across 19 categories |
| Test suite | 5 test files, ~3,100 lines |
| Design proposals | 16 documents |
| Agent personas | 6 behavioral profiles |

---

## 2. System Architecture

### High-Level Topology

```
┌──────────────────────────────────────────────────────────┐
│                    Claude Code Session                    │
│                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ Coordinator  │   │ Coordinator  │   │ Coordinator  │   │
│  │   (Skill)    │   │   (Skill)    │   │   (Skill)    │   │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   │
│         │                  │                  │           │
│    ┌────┴────┐        ┌────┴────┐        ┌────┴────┐     │
│    │ Game A  │        │ Game B  │        │ Game C  │     │
│    │Instance │        │Instance │        │Instance │     │
│    └────┬────┘        └────┬────┘        └────┬────┘     │
│         │                  │                  │           │
│  ┌──────┴──────────────────┴──────────────────┴───────┐  │
│  │              TypeScript Engine (CLI)                │  │
│  │  ┌────────┐ ┌──────┐ ┌───────┐ ┌──────────────┐   │  │
│  │  │ State  │ │ Turn │ │ Rules │ │  Mechanics   │   │  │
│  │  │Manager │ │Mgr   │ │Parser │ │  Registry    │   │  │
│  │  └────────┘ └──────┘ └───────┘ └──────────────┘   │  │
│  └────────────────────────┬───────────────────────────┘  │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐  │
│  │                   File System                      │  │
│  │  games/{name}/state/{instanceId}/game.json         │  │
│  │  games/{name}/logs/{instanceId}.jsonl              │  │
│  │  games/{name}/RULES.md                             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │   Gamemaster     │  │   Player Agents (N)          │  │
│  │   (Sonnet)       │  │   (Haiku)                    │  │
│  │   Adjudicates    │  │   Compete to win             │  │
│  └──────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Key Architectural Boundaries

**Engine ↔ Agents**: Agents interact with the engine exclusively through CLI commands. No shared memory, no direct file access. The CLI returns JSON. This boundary is the central invariant of the system.

**Engine ↔ Games**: Games are defined as RULES.md files with YAML frontmatter. The engine reads the config, enables the appropriate mechanics, and runs the game. The engine has no hardcoded knowledge of any specific game.

**Gamemaster ↔ Players**: These agents never communicate directly. All coordination flows through the engine's state. The gamemaster is only invoked for disputes (contests, resignations, victory claims) — not for every turn.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Engine | TypeScript 5.3, Node.js 18+ (ESM) |
| CLI | Commander.js 12 |
| Rules parsing | YAML (yaml 2.3) + Markdown (marked 17) |
| Testing | Vitest 4.0 |
| Static site | React 18, Vite 5, React Router 6 |
| Deployment | Vercel |
| Agent runtime | Claude Code (Sonnet for GM, Haiku for players) |

---

## 3. The TypeScript Engine

The engine is the authoritative source of truth for all game state. It lives in `src/` and compiles to `dist/`.

### Source Layout

```
src/
├── index.ts                    # Public API (6 lines, barrel export)
├── cli/index.ts                # CLI entry point (3,044 lines)
├── core/
│   ├── game.ts                 # State management & action pipeline (2,063 lines)
│   ├── turns.ts                # Blocking wait system (204 lines)
│   ├── rules.ts                # RULES.md parser & config normalization (291 lines)
│   ├── validate.ts             # Multi-layer validation (839 lines)
│   ├── validate-schema.ts      # Schema constants & section definitions (190 lines)
│   └── cleanup.ts              # Log archival & cleanup (464 lines)
├── types/
│   ├── game.ts                 # Core type definitions (2,719 lines)
│   ├── logs.ts                 # Event log types (270 lines)
│   └── index.ts                # Type barrel export
└── mechanics/
    ├── index.ts                # Registration hub (520 lines)
    ├── registry.ts             # Hook routing engine (1,135 lines)
    ├── types.ts                # Hook interfaces (966 lines)
    ├── core/                   # 24 core mechanic files
    └── win-conditions/         # 14 win condition files
    └── [138 leaf mechanic files]
```

### The Action Execution Pipeline

Every player action flows through a single pipeline in `core/game.ts`:

```
Player submits action via CLI
         │
         ▼
┌─ 1. Schema validation (stateless) ──────────────────────┐
│  validateActionSchema(action)                            │
│  Checks: required fields, type correctness               │
└──────────────────────────────────────────┬───────────────┘
                                           │
┌─ 2. State validation ───────────────────┐│
│  validateAction(state, playerId, action) ││
│  Checks:                                 ││
│  - Is it this player's turn?             ││
│  - Is the game in_progress?              ││
│  - Is there a pending contest blocking?  ││
│  - Has player already acted this round?  ││
│  - Mechanic preValidateAction hooks      ││
└──────────────────────────────────────────┘│
                                           │
┌─ 3. Mechanic execution ─────────────────┐│
│  registry.executeAction(state, ...)      ││
│  First mechanic to return handled=true   ││
│  owns the action                         ││
└──────────────────────────────────────────┘│
                                           │
┌─ 4. Post-execution hooks ───────────────┐│
│  registry.postExecuteAction(state, ...)  ││
│  All mechanics get notified (merged)     ││
│  - Deduct action points                  ││
│  - Update scores                         ││
│  - Trigger effects                       ││
└──────────────────────────────────────────┘│
                                           │
┌─ 5. Win condition check ────────────────┐│
│  registry.checkAllWinConditions(state)   ││
│  If mechanic signals checkWin=true       ││
│  First win condition to return won=true  ││
│  triggers game end                       ││
└──────────────────────────────────────────┘│
                                           │
┌─ 6. Turn advancement ──────────────────┐ │
│  maybeAdvanceTurn(state)                │ │
│  If advanceTurn=true OR auto-end        │ │
│  Calls onTurnEnd for current player     │ │
│  Rotates to next player                 │ │
│  Calls onTurnStart for next player      │ │
│  Checks round boundary (new round?)     │ │
└─────────────────────────────────────────┘ │
                                           │
         ▼
   Return result to CLI → JSON to agent
```

### The Contest & Adjudication System

Not every action is unambiguously valid. When a player believes another's action violated the rules, they file a contest:

```
Player A executes action
         │
    ┌────┴────┐
    │ Normal  │ ← No contest filed
    │ Flow    │   Action stands
    └─────────┘
         │
    ┌────┴─────────────────────────┐
    │ Player B files contest       │
    │ ./playtest player:contest    │
    │ State: contest_pending       │
    │ All actions blocked          │
    └────┬─────────────────────────┘
         │
    ┌────┴─────────────────────────┐
    │ Gamemaster adjudicates       │
    │ ./playtest gm:adjudicate     │
    │                              │
    │ --allow: Action stands       │
    │ --reject: reverseAction()    │
    │          called on mechanics │
    └────┬─────────────────────────┘
         │
    ┌────┴─────────────────────────┐
    │ Auto-adjudication            │
    │ 60-second timeout            │
    │ Default: allow (prevent      │
    │ deadlock if GM unresponsive) │
    └──────────────────────────────┘
```

The same pattern handles resignations (player wants to quit) and victory claims (player declares they've won, GM verifies).

### Information Hiding

The engine enforces a strict information boundary between agents:

| Requester | Own Hand | Others' Hands | Deck Contents | Full State |
|-----------|----------|---------------|---------------|-----------|
| Player    | Yes      | Count only    | No            | No        |
| Gamemaster| All      | All           | Yes           | Yes       |

`getPlayerView(state, playerId)` produces a filtered state object. Each mechanic can contribute additional visible state through `getPlayerView` hooks, and the visibility core mechanic handles hidden roles, fog of war, and knowledge tracking.

---

## 4. The Mechanics System

The mechanics system is the heart of the framework's extensibility. It answers the question: *how do you make a single engine run UNO, a hidden-role social deduction game, a worker-placement economic sim, and a probability-based racing game?*

### Architecture: Registry + Hooks

The answer is a plugin registry with typed hooks. Each mechanic is a TypeScript object that declares:
- **What it's called** (`slug`)
- **What it depends on** (`requires: ['cards', 'resources']`)
- **What it conflicts with** (`conflicts: ['auction-english', 'auction-sealed']`)
- **Whether it needs configuration** (`configSchema`)
- **Which hooks it implements** (from ~50 available hook points)

```typescript
// Simplified example: action-points mechanic
export const actionPointsMechanic: MechanicHooks = {
  slug: 'action-points',
  name: 'Action Points',
  requires: ['resources'],
  configSchema: {
    type: 'object',
    properties: {
      points_per_turn: { type: 'number' },
      action_costs: { type: 'object' },
      rollover: { type: 'boolean' }
    }
  },

  initPlayerState(ctx) {
    return { actionPoints: ctx.config.points_per_turn, actionPointsUsed: 0 };
  },

  preValidateAction(ctx, action) {
    const cost = getCost(ctx.config, action);
    if (ctx.player.actionPoints < cost) {
      return { valid: false, error: `Need ${cost} AP, have ${ctx.player.actionPoints}` };
    }
    return { valid: true };
  },

  postExecuteAction(ctx) {
    const cost = getCost(ctx.config, ctx.action);
    return { playerStateChanges: {
      [ctx.playerId]: { actionPointsUsed: ctx.player.actionPointsUsed + cost }
    }};
  },

  onTurnStart(ctx) {
    return { playerStateChanges: {
      [ctx.playerId]: { actionPoints: ctx.config.points_per_turn, actionPointsUsed: 0 }
    }};
  },

  shouldAutoEndTurn(ctx) {
    return ctx.player.actionPoints <= 0;
  }
};
```

### Three Tiers of Mechanics

#### Tier 1: Core Services (24 files in `mechanics/core/`)

These are always-available infrastructure that other mechanics build on. They come in pairs: a **service file** providing stateful operations, and a **mechanic file** defining the domain's hook contracts.

| Service | Mechanic | What it provides |
|---------|----------|-----------------|
| `cards.ts` | `cards` | Deck, draw, play, hand management |
| `board.ts` | `board-mechanic.ts` | Board state, movement, adjacency |
| `resources.ts` | `resources-mechanic.ts` | Currency/resource CRUD |
| `dice.ts` | `dice-mechanic.ts` | Seeded dice rolling, modifiers |
| `effects.ts` | `effects-mechanic.ts` | Buff/debuff lifecycle |
| `visibility.ts` | `visibility-mechanic.ts` | Hidden information, fog of war |
| `social.ts` | `social-mechanic.ts` | Voting sessions |
| `hand.ts` | — | Hand add/remove operations |
| `card-piles.ts` | — | Deck/discard pile management |
| `turns.ts` | — | Turn order, round advancement |
| `pass.ts` | — | Pass/end-turn action + victory declarations |
| `effect-dispatcher.ts` | — | Routes card effects to handlers |
| — | `combat-mechanic.ts` | Combat hooks |
| — | `auction-mechanic.ts` | Auction hooks |
| — | `workers-mechanic.ts` | Worker placement hooks |
| — | `building-mechanic.ts` | Building/construction hooks |

Core services define **domain hooks** — named extension points that leaf mechanics subscribe to. For example, the cards domain defines:

- `onBeforeCardDraw` (blocking — can prevent draws)
- `onCardDrawn` (merge — all subscribers notified)
- `onBeforeCardPlay` (blocking — can prevent plays)
- `onCardPlayed` (merge — all subscribers notified)
- `filterPlayableCards` (first — first response wins)

#### Tier 2: Leaf Mechanics (138 files)

These implement specific game mechanics by composing core service hooks. Examples:

| Mechanic | Requires | What it does |
|----------|----------|-------------|
| `action-points` | resources | AP economy per turn |
| `income` | resources | Automatic resource generation |
| `hand-management` | cards | Hand limits, draw/discard rules |
| `catch-the-leader` | resources | Penalize leaders, reward trailers |
| `stock-holding` | resources | Buy/sell stocks, dividends |
| `hidden-roles` | visibility | Secret role assignment |
| `worker-placement` | workers | Place/retrieve workers at locations |
| `auction-english` | auction | Ascending bid auctions |
| `deck-building` | cards | Personal deck construction |
| `push-your-luck` | dice | Risk/reward dice rolling |
| `once-per-game-abilities` | resources | Unique player powers |
| `action-queue` | — | Queue actions for combo execution |

#### Tier 3: Win Conditions (14 files in `mechanics/win-conditions/`)

Win conditions are mechanics too — composable and configurable:

| Win Condition | Trigger |
|---------------|---------|
| `reach-state` | Player reaches a board position |
| `score-threshold` | Player hits a score target |
| `empty-hand` | Player empties their hand |
| `elimination` | Last player standing |
| `race` | First to complete objective |
| `timeout-winner` | Highest score at turn/round limit |
| `sudden-death` | Triggered event ends game |
| `king-of-the-hill` | Hold position for N turns |
| `end-game-bonuses` | Score bonuses applied at game end |
| `finale-ending` | Special final round |

### Hook Resolution Strategies

When multiple mechanics implement the same hook, the registry uses one of three resolution strategies:

| Strategy | Behavior | Used for |
|----------|----------|----------|
| **Blocking** | First non-null response wins. If `blocked=true`, short-circuit. | Validation, permission checks |
| **Merge** | All responses accumulated. State changes combined. | Side effects, notifications |
| **First** | First non-null response returned. | Custom logic, tally functions |

### Dependency Resolution

The registry resolves mechanics in two phases:

1. **Explicit**: Mechanics listed in the game's config + `alwaysEnabled` mechanics
2. **Auto-enable**: Infrastructure mechanics (those with no `configSchema`) are automatically enabled when their `requires` are satisfied

This means writing `requires: ['cards']` in a leaf mechanic ensures the cards core service is available without the game designer explicitly listing it.

---

## 5. Multi-Agent Orchestration

### Agent Roles

**Gamemaster** (Claude Sonnet — higher reasoning capability)
- Registers with the engine, receives full rules
- Enters a blocking wait loop (`gm:pending`)
- Only wakes for: contests, resignations, victory claims, analysis requests
- Adjudicates disputes by reading full game state and rules
- Writes post-game analysis (required before exit)
- Tool access: Bash (playtest commands only), Read

**Player** (Claude Haiku — faster, cheaper)
- Registers with the engine, receives rules + persona
- Enters a turn loop: wait → analyze → act → repeat
- Optimized single-command turn: `player:turn` blocks AND returns available actions
- Competes to win according to its persona
- Can file contests and declare victory
- Tool access: Bash (only `./playtest player:*`, `register`, `status`)

### Persona System

Six personas modify player behavior without changing the underlying agent prompt:

| Persona | Risk | Contest Rate | Strategy |
|---------|------|-------------|----------|
| `strategic` | Medium | Low (clear violations) | Optimal 2-3 turn lookahead |
| `aggressive` | High | High (anything suspicious) | Maximum pressure, win at all costs |
| `casual` | Low | Rare (obvious cheating only) | Fun-focused, quick decisions |
| `rule-lawyer` | Low | Very high (any violation) | Strict by-the-book, cites rules |
| `cheater` | High | Never (avoids attention) | Intentionally bends/breaks rules |
| `chaotic` | Variable | Random (~30%) | Unpredictable, random decisions |

Personas are markdown files in `.claude/agents/personas/`. They're injected into the player's prompt at registration time, modifying decision-making heuristics, risk tolerance, and contesting behavior.

### Spawn Coordination

The `/playtest` skill orchestrates the full lifecycle:

```
/playtest markovs-chains 2
         │
         ▼
  1. ./playtest init markovs-chains --players 2
     Returns: instanceId + spawnInstructions (pre-formatted prompts)
         │
         ▼
  2. Spawn all agents in a SINGLE Task batch (parallel):
     ┌─ Task(gamemaster, sonnet, spawnInstructions.gamemaster.prompt)
     ├─ Task(player-1, haiku, spawnInstructions.players[0].prompt)
     └─ Task(player-2, haiku, spawnInstructions.players[1].prompt)
         │
         ▼
  3. Each agent independently:
     - Registers with engine
     - Engine auto-starts game when all registered
     - Enters its game loop
     - Exits when game ends
         │
         ▼
  4. Coordinator reports results
```

The critical design choice: agents are spawned in parallel in a single message. The engine handles synchronization through blocking waits and file-based state — no agent-to-agent communication exists.

---

## 6. Game Definitions

### RULES.md Format

Every game is a directory in `games/` containing a `RULES.md` file. The file has two parts: YAML frontmatter (machine-readable configuration) and Markdown body (human-readable rules for the gamemaster and players).

```yaml
---
name: "Markov's Chains"
version: "2.3"
players: "2-4"
win_condition: "First player to reach Victory state"
max_rounds: 25

mechanics:
  board:
    states: ["Start", "A", "B", "C", "Checkpoint-X", "Checkpoint-Y", "Victory"]
    edges:
      - { from: "Start", to: "A", probability: 0.55 }
      - { from: "A", to: "Checkpoint-X", probability: 0.40 }
      # ...
    starting_state: "Start"

  cards:
    starting_hand: 5
    max_hand_size: 7
    deck:
      - { name: "Boost Card", count: 6, type: "boost", effect: { type: "probability_boost", value: 0.15 } }
      - { name: "Interference", count: 10, type: "interference", effect: { type: "probability_penalty", value: -0.20, target: "opponents" } }
      # ...

  probability-movement: {}
  victory-declaration: {}
  hand-management: {}
  win-reach-state: { target_state: "Victory" }
---

# Markov's Chains - Rules

## Overview
A probability-based racing game where players navigate a Markov chain...

## Setup
Each player starts at the "Start" state with 5 cards...

## Gameplay
On your turn, you may: Move, Play a Card, or Draw...

## Winning
First player to reach the "Victory" state wins.

## Gamemaster Notes
The engine handles all probability rolls...
```

### Config Normalization

The engine normalizes the unified format (`mechanics: { slug: config }`) into internal representation:

```
RULES.md mechanics: { "action-points": { points_per_turn: 3 } }
                              │
                              ▼
engine_mechanics: { action_points: { points_per_turn: 3 } }
mechanics: ["action-points"]
```

Slug (kebab-case) maps to config key (snake_case). The mechanics array lists enabled slugs. The engine_mechanics object holds per-mechanic configuration.

### The 18 Games

The game library spans a broad range of mechanics and complexity:

| Game | Players | Key Mechanics | Complexity |
|------|---------|---------------|-----------|
| **UNO** | 2-4 | Card matching, action cards | Low |
| **Markov's Chains** | 2-4 | Probability movement, state cards | Low-Medium |
| **Treasure Hunters** | 2-4 | Set collection, action points | Low-Medium |
| **Fortune Seekers** | 2-4 | Push-your-luck, drafting, variable powers | Medium |
| **Parallel Race** | 2-4 | Simultaneous movement, interference | Medium |
| **Draft Duel** | 2-4 | Closed drafting, catch-up mechanics | Medium |
| **Road Rally** | 2-4 | Trick-taking, point-to-point racing | Medium |
| **Alliance** | 2-4 | Semi-cooperative, threat escalation | Medium |
| **Dice Dynasties** | 2-4 | Dice, commodity speculation, loans | Medium-High |
| **Battle Forge** | 2-4 | Worker placement, dynamic market | Medium-High |
| **Engine Masters** | 2-4 | Deck building, auto-resource growth, chaining | Medium-High |
| **Spellbook Showdown** | 2-4 | Simultaneous selection, action queue, multi-use cards | Medium-High |
| **Rondel Express** | 2-4 | Rondel wheel, pick-up-and-deliver, contracts | Medium-High |
| **Grand Bazaar** | 3-5 | Three auction types, stock holding, contracts | High |
| **Arcane Assembly** | 2-4 | Pattern building, tech tree, worker placement | High |
| **Shadow Operations** | 2-4 | Area majority, hidden movement, combat | High |
| **Council of Whispers** | 4-6 | Voting, hidden roles, prisoner's dilemma | High |
| **AAOTE** | 3-5 | Social deduction, hidden objectives, traitor | High |

---

## 7. The CLI Interface

The CLI (`src/cli/index.ts`, 3,044 lines) is the sole interface between agents and the engine. Every command returns JSON.

### Command Namespaces

**Game Lifecycle**
```
init <game> --players <n>          Create instance, return spawn instructions
register <instance> -r <role>      Agent claims role, receives rules
status <instance>                  Current game state
list [--game <name>]               List games and instances
start <instance>                   Begin game (usually auto-triggered)
end <instance> -w <winner>         Declare winner
cancel <instance>                  Cancel game
```

**Player Commands** (prefixed `player:`)
```
player:turn <inst> -p <id>         Block until turn + return available actions
player:act <inst> -p <id> -a JSON  Execute action
player:contest <inst> -p <id>      Challenge previous action
player:actions <inst> -p <id>      Get available actions without blocking
```

**Gamemaster Commands** (prefixed `gm:`)
```
gm:pending <inst>                  Block until event (contest/resignation/victory)
gm:adjudicate <inst> --allow       Rule on contest
gm:state <inst>                    Full state (all hidden info)
gm:analyze <inst> -v <ver>         Submit post-game analysis
gm:end <inst> -w <winner>          End game with winner
```

**Direct Action Commands** (shortcuts)
```
draw <inst> -p <id>                Draw card
play-card <inst> -p <id> -c <name> Play card
roll <inst> -p <id> --prob <n>     Probability roll
pass <inst> -p <id>                End turn
trade, bid, spend, collect-set, draft, move, place-card...
```

**Utility**
```
hook --name <start|stop> --agent <type>    Agent lifecycle hooks
hook-event --event <name>                  System event hooks
cleanup [--archive] [--force]              Log cleanup
validate <game>                            Validate RULES.md
```

### The `player:turn` Optimization

A critical performance optimization: `player:turn` combines blocking wait AND action discovery into a single command. Without this, agents would need two round-trips per turn (wait, then query actions). The combined command returns:

```json
{
  "status": "your_turn",
  "actions": [
    { "type": "move", "targets": ["A", "B"], "example": {"type": "move", "target": "A"} },
    { "type": "play_card", "cards": ["Boost Card"], "example": {"type": "play_card", "card": "Boost Card"} },
    { "type": "draw", "example": {"type": "draw"} },
    { "type": "pass", "example": {"type": "pass"} }
  ],
  "hand": [...],
  "state": { "position": "Start", "score": 0 },
  "lastAction": { "player": "player-2", "action": {...} }
}
```

---

## 8. State Management & Concurrency

### File-Based Persistence

All state lives on the filesystem:

```
games/markovs-chains/
├── RULES.md                                    # Game definition (versioned)
├── state/
│   └── markovs-chains-1769802054779/
│       └── game.json                           # Authoritative game state
├── logs/
│   ├── markovs-chains-1769802054779.jsonl       # Event log
│   ├── gamemaster-transcript-1769802054779.jsonl # GM agent transcript
│   ├── player1-transcript-1769802054779.jsonl   # Player 1 transcript
│   └── player2-transcript-1769802054779.jsonl   # Player 2 transcript
└── POSTER.png                                   # Game artwork
```

### Instance Isolation

Each game run gets a unique instance ID: `{gameName}-{timestamp}` (13-digit millisecond timestamp). This allows:
- Multiple concurrent games of the same type
- Clean separation of state and logs
- Instance-specific file paths

The engine resolves game references flexibly — you can pass either a game name (resolves to most recent instance) or a full instance ID.

### File Locking

Concurrent agent access is managed through file locking:

```
acquireLock(instancePath)
  └─ Create lock file atomically
  └─ Retry every 10ms for up to 5 seconds
  └─ Stale lock detection: locks older than 2 seconds are forcibly cleared
  └─ Returns lock handle

releaseLock(handle)
  └─ Remove lock file
```

**Lock-free reads**: `loadStateReadOnly()` skips locking entirely. Since JSON writes are atomic at the OS level (write to temp → rename), readers always see a consistent state. This is critical for the polling-based wait system.

### Instance Caching

To reduce filesystem I/O during polling, the engine maintains a 2-second TTL cache for instance resolution. When a player is calling `player:turn` in a tight loop, the instance lookup hits cache instead of scanning the filesystem.

### Event Logging

All significant events are appended to a JSONL log file:

```json
{"timestamp":"2026-01-30T19:40:54.783Z","event":"game_init","data":{"gameId":"markovs-chains-1769802054779","playerCount":2}}
{"timestamp":"2026-01-30T19:40:57.283Z","event":"game_start","turn":1,"data":{"players":["player-1","player-2"]}}
{"timestamp":"2026-01-30T19:42:00.391Z","event":"action_executed","turn":1,"player":"player-1","data":{"type":"move","target":"A","reasoning":"Moving to A for higher probability path"}}
{"timestamp":"2026-01-30T19:43:30.501Z","event":"game_end","turn":3,"data":{"winner":"player-2","reason":"reached Victory state"}}
```

Event types include: `game_init`, `game_start`, `game_end`, `action_executed`, `contest_filed`, `contest_adjudicated`, `resignation_submitted`, `victory_claimed`, `hook_invoked`, `mechanic_response`, and more.

The `action_executed` event requires a `reasoning` field — this is the agent's explanation of why it chose the action, which is invaluable for playtest analysis.

---

## 9. The Hook System

The Claude Code plugin hook system bridges agent lifecycle events with the engine. Hooks are configured in `.claude-plugin/plugin.json` and `.claude/settings.json`.

### Hook Flow

```
Session Start
     │
     ▼
┌─ SessionStart ──────────────────────┐
│ ./playtest hook-event --event       │
│ SessionStart                        │
│ Injects: active game context (if    │
│ any) into session                   │
└─────────────────────────────────────┘
     │
     ▼
User calls /playtest skill
     │
     ▼
Skill spawns agents via Task
     │
     ├──── For each agent ────────────┐
     ▼                                │
┌─ SubagentStart ─────────────────┐   │
│ ./playtest hook --name start    │   │
│ --agent {player|gamemaster}     │   │
│                                 │   │
│ Polls transcript for INSTANCE:  │   │
│ marker (up to 10 seconds)       │   │
│                                 │   │
│ Loads game state                │   │
│ Outputs rules JSON to stdout    │   │
│ → Injected into agent context   │   │
└─────────────────────────────────┘   │
     │                                │
     ▼                                │
Agent plays game...                   │
     │                                │
     ▼                                │
┌─ SubagentStop ──────────────────┐   │
│ ./playtest hook --name stop     │   │
│ --agent {player|gamemaster}     │   │
│                                 │   │
│ Checks game status              │   │
│ Backs up transcript to          │   │
│ games/{game}/logs/ if game done │   │
│ Blocks exit if game in progress │   │
└─────────────────────────────────┘   │
     │                                │
     └────────────────────────────────┘
```

### Hook Logging

All hook invocations are logged to `logs/hooks/`:
- `hook-trace.log` — All events with timestamps
- `hook-invocations.log` — Invocation counts and patterns
- `{agentType}-{hookType}-hook.log` — Per-agent hook details

This logging is essential for debugging agent coordination issues.

---

## 10. The Skill System

Three skills provide different interaction modes:

### `/playtest` — Autonomous Playtesting
The primary skill. Initializes a game instance, spawns agents, and lets them play autonomously. The coordinator reports the instance ID and monitoring commands, then the agents operate independently.

**Usage**: `/playtest markovs-chains 2`

### `/playtest-manual` — Interactive Step-by-Step Testing
Registers placeholder agents and steps through the game turn by turn. Claude (or the user) controls all decisions directly. Useful for debugging specific scenarios, testing rule edge cases, and regression testing.

**Usage**: `/playtest-manual council-of-whispers 4`

### `/game-mechanic` — Game Design Assistant
Not a playtesting skill — this helps design games. Commands include:
- `explore` — Browse the 192-mechanic library by category
- `suggest` — AI-powered mechanic recommendations
- `analyze` — Understand a game's mechanic composition
- `author` — Scaffold a new RULES.md
- `validate` — Check rules for errors
- `refine` — Suggest improvements from playtest data

**Usage**: `/game-mechanic explore auction`

---

## 11. Testing Strategy

### Three-Layer Testing

The test suite (`tests/`, ~3,100 lines) uses three complementary layers:

**Layer 1: Core Service Unit Tests** (`core-services.test.ts`, 880 lines)
Tests game-agnostic mechanic APIs with hand-crafted GameState objects. Covers: resources, effects, hand operations, card piles, dice (with seeded PRNG), and voting.

**Layer 2: Registry Hook Routing** (`registry.test.ts`, 556 lines)
Tests the MechanicRegistry's `fire()` method across resolution strategies (merge, first, blocking). Validates dependency filtering, disabled mechanic handling, and hook chaining.

**Layer 3: Integration Tests** (3 files, ~1,630 lines)
- `markovs-chains.test.ts` — Probability racing lifecycle
- `council-of-whispers.test.ts` — Simultaneous action selection + prisoner's dilemma
- `cross-game.test.ts` — Treasure Hunters, Fortune Seekers, Engine Masters

### Test Harness

The `GameTestHarness` (`harness.ts`, 424 lines) provides:

```typescript
// Create a deterministic game instance
const h = GameTestHarness.create('markovs-chains', 2, { seed: 42 });
h.start();

// Execute individual actions
h.step('player-1', { type: 'draw' });
h.step('player-1', { type: 'move', target: 'A' });

// Or replay from a real playtest log
const { harness, steps } = GameTestHarness.fromLog(
  'games/markovs-chains/logs/markovs-chains-1769802054779.jsonl',
  { seed: 42 }
);

// Cleanup restores Math.random
h.cleanup();
```

**Seeded PRNG**: The harness uses Mulberry32 to replace `Math.random()` during tests, making all randomization deterministic. This enables exact replay of logged games.

### Test Configuration

```typescript
// vitest.config.ts
{
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    sequence: { concurrent: false }  // Sequential — tests share filesystem
  }
}
```

---

## 12. The Static Site

A React + Vite static site provides a browsable interface for games, mechanics, logs, and documentation. Deployed to Vercel.

### Pages

| Page | Content |
|------|---------|
| Home | Game catalog with posters and mechanic highlights |
| Game Detail | Rules, mechanics breakdown, playtest summaries |
| Logs | Playtest log browser with filtering |
| Log Detail | Turn-by-turn replay with agent transcripts |
| Mechanics | 192-mechanic library browser |
| Mechanic Detail | Description, games using it, implementation status |
| Docs | Architecture documentation and proposals |

### Build Pipeline

```bash
npm run build:site
  ├── generate-games.ts       # Extract game metadata from RULES.md files
  ├── generate-mechanics-data.ts  # Build mechanic registry data
  ├── generate-logs.js        # Process playtest logs + link transcripts
  ├── generate-docs.js        # Build documentation index
  └── vite build              # Compile React app
```

Generated data files land in `site/src/data/` and `site/public/data/`, providing the site with structured JSON for all games, mechanics, and logs.

---

## 13. Evolutionary History

The git history (74 commits on the visible branch) reveals a clear evolutionary arc. Reading the commits chronologically tells the story of a system that grew through iterative playtesting.

### Phase 1: Mechanics Expansion

The earliest visible commits focus on building out the mechanics library:

```
c0caf6e  feat: implement 26 new mechanics across 10 categories (Phase 14)
8486402  feat: implement 40 new mechanics completing 11 categories (Phase 15)
6539c8b  feat: add 7 new games showcasing 65+ previously unused mechanics
```

This was a period of breadth — building out the 192-mechanic library and creating games to exercise those mechanics.

### Phase 2: First Contact with Reality

The first full-catalog playtest revealed that theory and practice diverge sharply:

```
3a1b728  playtest: run initial playtests for all 18 games
37979a0  docs: add comprehensive playtest review for all 18 games (2026-02-07)
```

The review documented that **no game completed** — all stalled due to agent turn-limit exhaustion. Registration time emerged as the strongest predictor of success: games with large rule files consumed too much agent context budget during registration.

### Phase 3: The Bug Fix Sprint

The playtest findings triggered an intensive fix cycle. The 2026-02-09 review identified 118 issues across 16 games. Six were critical systemic bugs:

```
c1e489a  fix: resolve 6 critical systemic playtest issues
f6c5c61  fix: resolve 10 high/medium priority playtest issues + validate
```

Key fixes:
- `highest_score` win condition was triggering on first turn (any score > 0 won)
- Action points only allowed one action per turn regardless of AP budget
- Card effects were never dispatched to handlers
- `player.state` desynchronized from `player.currentNode` in race games
- Simultaneous selection leaked information between players
- Hidden role distribution was broken

### Phase 4: The Great Extraction

With bugs fixed, the focus shifted to architectural health. The monolithic `game.ts` was too large and tangled. A systematic extraction began:

```
d931ef2  refactor: extract resources init from game.ts to resources mechanic
1b9f52a  refactor: extract effect duration decrement to effects mechanic onTurnEnd
a3d77b7  refactor: extract hand references from game.ts to cards mechanic
b333877  refactor: extract board state references from game.ts to mechanics
199ebd1  refactor: extract play_card fully from game.ts to cards mechanic
469ea34  refactor: consolidate win conditions from game.ts to mechanic hooks
884299b  refactor: fully extract draw from game.ts, audit remaining leaks
e596e48  fix: extract draw/pass from game.ts, fix 40 test failures, transitive deps
```

This was a **strangler fig pattern** — each extraction moved logic from the monolithic core into composable mechanic hooks. The test suite broke and was repaired repeatedly (40 test failures in one commit). Each extraction was validated with manual playtests:

```
575088c  test: add manual playtest log from hand extraction validation
5591f08  test: add manual playtest logs from play_card extraction validation
ad3d857  test: add manual playtest validation logs for mechanic fixes
```

### Phase 5: Specific Game Hardening

With the architecture stabilized, attention turned to making specific complex games work:

```
1de4f07  fix: resolve council-of-whispers playtest blocking bugs
1b6d890  fix: enable mechanic-driven simultaneous play and fix action resolution
dda1c9d  fix: restrict pass to currentPlayer only, preventing out-of-turn pass spam
f907fdc  feat: board agnosticism + playtest-manual skill + AAOTE fix
```

Council of Whispers (simultaneous action selection + hidden roles) and AAOTE (social deduction + traitor mechanic) were the hardest games to get working, requiring changes to core assumptions about turn order and visibility.

### Phase 6: Architecture Reflection

The most recent commits turn reflective — documenting what was learned and exploring where the architecture could go:

```
91ad72f  feat: add auction core mechanic with 5 defined hooks
8388ef4  docs: add distributed agent CLI exploration document
```

The distributed agent CLI document explores extracting Playtest's engine into a general-purpose multi-agent coordination framework — recognizing that the patterns (state management, turn-taking, dispute resolution, hook-based extensibility) generalize beyond games.

---

## 14. Design Proposals & Future Direction

The `docs/proposals/` directory contains 16 design documents spanning implemented features, open investigations, and speculative futures.

### Implemented Proposals

| Proposal | Summary |
|----------|---------|
| **005: Turn Semantics** | Disambiguated `turn` into `round` (full cycle) and `turnNumber` (absolute counter) |
| **006: AP Cost Per Card** | Action costs multiply by quantity (draw 5 = 5 AP, not 1 AP) |
| **007: Grid Movement** | Validate movement against placed tiles, not just abstract edges |
| **008: Hand Limits** | Enforce max hand size with configurable overflow policy |
| **009: Agent Recovery** | `--wait` flag on resignation prevents premature agent exit |
| **010: Default Winner** | Configurable timeout winner (role-based, score-based, or draw) |
| **012: AAOTE Fixes** | Victory claim routing, objective distribution, hand limit hooks |

### Open Investigations

| Proposal | Summary |
|----------|---------|
| **001: Agent Loop Ergonomics** | Agents exit prematurely instead of maintaining game loop. Solution: stronger prompt engineering with explicit exit conditions |
| **002: Duplicate Command Execution** | All agents execute every command exactly twice. Root cause unclear (model behavior vs. confirmation pattern) |
| **003: Automatic Win Detection** | Engine should auto-detect wins from structured `win_conditions` config instead of relying on agent declaration |
| **004: Gamemaster Lifecycle** | GM gets stuck polling after undetected win. Solution: heartbeat with status check |
| **011: Agent ID Mapping** | Replace self-identified roles with Claude-assigned agent IDs for verified identity |
| **002-Hook: Hook Context Injection** | Game context unavailable at SubagentStart time. Workaround: environment variables |

### Speculative Futures

| Proposal | Summary |
|----------|---------|
| **001-Contest: Contest-Based Adjudication** | Players execute directly against engine; GM only invoked on contest. Projected: 60% faster turns, 95% fewer GM invocations, 90% cost reduction |
| **DISTRIBUTED_AGENT_CLI** | Extract Playtest's engine into a general multi-agent coordination framework. GameState → SessionState, PlayerState → AgentState, MechanicRegistry → capability negotiation. Applications: code review, research synthesis, consensus building |

The distributed agent CLI proposal is particularly significant — it recognizes that the patterns developed for game playtesting (file-based state, blocking waits, hook-based extensibility, dispute resolution) are domain-invariant and applicable to any multi-agent coordination problem.

---

## 15. Codebase Statistics

### Source Code

| Category | Files | Lines |
|----------|-------|-------|
| CLI | 1 | 3,044 |
| Core engine | 6 | 4,051 |
| Types | 3 | 2,993 |
| Mechanics registry + types | 3 | 2,621 |
| Core mechanics | 24 | ~5,000 |
| Leaf mechanics | 138 | ~25,000 |
| Win conditions | 14 | ~3,000 |
| Mechanics index | 1 | 520 |
| **Total TypeScript** | **190** | **~51,000** |

### Tests

| File | Lines | Coverage |
|------|-------|----------|
| `core-services.test.ts` | 880 | Core mechanic services |
| `registry.test.ts` | 556 | Hook routing |
| `markovs-chains.test.ts` | 330 | Probability racing |
| `council-of-whispers.test.ts` | 592 | Simultaneous play |
| `cross-game.test.ts` | 709 | Multi-game integration |
| `harness.ts` | 424 | Test infrastructure |
| **Total** | **~3,100** | |

### Games

| Metric | Count |
|--------|-------|
| Playable games | 18 |
| Mechanic categories | 19 |
| Mechanic reference entries | 192 |
| Implemented engine mechanics | 176 |
| Player personas | 6 |
| Design proposals | 16 |

### Playtest Data

| Metric | Value |
|--------|-------|
| Total log data across all games | ~170 MB |
| Most playtested game | markovs-chains (62 log files) |
| Largest log corpus | aaote (49 log files, 15 MB) |

### Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview and setup |
| `CLAUDE.md` | Agent-facing instructions |
| `docs/ENGINE_ARCHITECTURE.md` | System design |
| `docs/CLI.md` | Command reference |
| `docs/EXTENSION-GUIDE.md` | Adding games and mechanics |
| `docs/MECHANICS.md` | Mechanics reference |
| `docs/MECHANIC_EXPANSION_ROADMAP.md` | Future mechanics planning |
| `docs/MECHANIC_EXTRACTION_ROADMAP.md` | Extraction progress tracking |
| `docs/MECHANICS_GENERATION.md` | Auto-generation system |
| `docs/proposals/` | 16 design proposals |

---

*This document reflects the state of the Playtest framework as of commit `8388ef4` on the `main` branch.*
