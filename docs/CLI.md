---
title: CLI Reference
category: reference
status: stable
---

# CLI Command Reference

Complete reference for the `./playtest` CLI tool. The playtest CLI provides commands for managing game instances, player actions, and gamemaster operations in the agentic playtesting framework.

## Overview

The `./playtest` command-line interface orchestrates parallel Claude agents (gamemaster + players) to playtest board and card games. Commands are organized into several categories:

- **Game Lifecycle**: Initialize, start, and end games
- **Agent Registration**: Register gamemasters and players
- **Player Commands**: Wait for turns, submit actions, contest moves
- **Gamemaster Commands**: Adjudicate contests, analyze games, manage state
- **Game Mechanics**: Roll dice, draw cards, play cards
- **Monitoring**: Status checks, logs, and debugging
- **Utilities**: Validation, cleanup, hints

## Global Options

```
./playtest [options] [command]
```

**Options:**
- `--debug` - Enable debug logging
- `-V, --version` - Output version number
- `-h, --help` - Display help

## Game Lifecycle

### init

Initialize a new game instance with specified number of players.

```bash
./playtest init <game> --players <n>
```

**Arguments:**
- `<game>` - Game name (must have corresponding `games/<game>/RULES.md`)

**Options:**
- `--players <n>` - Number of players (required)
- `--instance-id <id>` - Custom instance ID (optional, auto-generated if not provided)

**Example:**
```bash
./playtest init markovs-chains --players 2
```

### start

Start the game, transitioning from `waiting_for_players` to `in_progress` state.

```bash
./playtest start <game>
```

**Arguments:**
- `<game>` - Game name or instance ID

### cancel

Cancel an active game without declaring a winner. Releases all waiting agents.

```bash
./playtest cancel <game> --reason <text>
```

**Options:**
- `--reason <text>` - Reason for cancellation (optional)

### reset

Reset game state, clean up files, and optionally reinitialize.

```bash
./playtest reset <game> --force
```

**Options:**
- `--force` - Skip confirmation prompt
- `--reinit` - Reinitialize after reset

## Agent Registration

### register

Register an agent as gamemaster or player. Returns game rules on successful registration.

```bash
./playtest register <game> --role <role> --agent-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--role <role>` - Agent role: `gamemaster` or `player` (required)
- `--agent-id <id>` - Unique agent identifier (required)
- `--player-id <id>` - Player ID (auto-assigned if not provided)

**Example:**
```bash
./playtest register markovs-chains --role player --agent-id agent-123
```

## Player Commands

Player commands are namespaced with `player:` prefix to distinguish them from gamemaster operations.

### player:wait

Block until it's your turn. Used for turn-based coordination.

```bash
./playtest player:wait <game> --player-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Your player ID (required)
- `--timeout <ms>` - Wait timeout in milliseconds (default: 300000)

### player:turn

Optimized command that waits for turn and returns available actions in one call.

```bash
./playtest player:turn <game> --player-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Your player ID (required)
- `--timeout <ms>` - Wait timeout in milliseconds

### player:act

Execute an action directly in a contest-based system. The action is queued and other players can contest it.

```bash
./playtest player:act <game> --player-id <id> --action <json>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Your player ID (required)
- `--action <json>` - Action as JSON object (required)

**Example:**
```bash
./playtest player:act uno --player-id p1 --action '{"type":"play","card":"red-7"}'
```

### player:contest

Contest the previous player's action. Must be done within the contest window.

```bash
./playtest player:contest <game> --player-id <id> --reason <text>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Your player ID (required)
- `--reason <text>` - Reason for contesting (required)

### player:actions

Get available actions for the current game state (procedurally generated based on rules).

```bash
./playtest player:actions <game> --player-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Your player ID (required)

## Gamemaster Commands

Gamemaster commands are namespaced with `gm:` prefix and are restricted to registered gamemaster agents.

### gm:pending

Wait for pending events that require gamemaster attention (contests, resignations, victory claims, or analysis needed).

```bash
./playtest gm:pending <game> --agent-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--agent-id <id>` - Gamemaster agent ID (required)
- `--timeout <ms>` - Wait timeout in milliseconds

### gm:adjudicate

Adjudicate a pending contest, resignation, or victory claim.

```bash
./playtest gm:adjudicate <game> --agent-id <id> --ruling <json>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--agent-id <id>` - Gamemaster agent ID (required)
- `--ruling <json>` - Adjudication ruling as JSON (required)

**Example:**
```bash
./playtest gm:adjudicate uno --agent-id gm-1 --ruling '{"valid":true,"reason":"Valid move"}'
```

### gm:state

Get full game state including all player hands and private information.

```bash
./playtest gm:state <game> --agent-id <id>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--agent-id <id>` - Gamemaster agent ID (required)

### gm:end

End the game and declare a winner.

```bash
./playtest gm:end <game> --winner <id> --reason <text>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--winner <id>` - Winner's player ID (required)
- `--reason <text>` - Reason for game end (optional)

### gm:analyze

Submit post-game analysis markdown. Transitions game from `pending_analysis` to `completed`.

```bash
./playtest gm:analyze <game> --analysis <markdown>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--analysis <markdown>` - Post-game analysis as markdown (required)

### gm:skip-analysis

Skip analysis phase and mark game as completed directly.

```bash
./playtest gm:skip-analysis <game>
```

**Arguments:**
- `<game>` - Game name or instance ID

## Game Mechanics

These commands provide common game mechanics that work across different game types.

### roll

Roll a probability check (dice, coin flip, etc.).

```bash
./playtest roll <game> --probability <p>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--probability <p>` - Success probability (0.0 to 1.0, required)
- `--label <text>` - Description of what's being rolled (optional)

**Example:**
```bash
./playtest roll dnd --probability 0.65 --label "Dexterity saving throw"
```

### draw

Draw cards from the deck.

```bash
./playtest draw <game> --player-id <id> --count <n>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Player ID drawing cards (required)
- `--count <n>` - Number of cards to draw (required)

### discard

Discard a card from hand.

```bash
./playtest discard <game> --player-id <id> --card <name>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Player ID (required)
- `--card <name>` - Card name to discard (required)

### play

Play a card by name. Removes card from hand and adds to discard pile.

```bash
./playtest play <game> --player-id <id> --card <name>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Player ID (required)
- `--card <name>` - Card name to play (required)

## Monitoring & Status

### status

Get current game status including state, active player, turn count, and recent actions.

```bash
./playtest status <game> [options]
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--files` - Include file paths (logs, transcripts, analysis) - for operators only

**Example:**
```bash
# Basic status (safe for players)
./playtest status uno-1234

# With file paths (for operators)
./playtest status uno-1234 --files
```

**Output fields:**
- `instanceId`, `gameName`, `status`, `round`, `turnNumber`
- `currentPlayer`, `players`, `winner`
- `files` (only with --files): `log`, `state`, `analysis`, `transcripts`

### list

List games and instances. Default shows games summary with instance counts by status.

```bash
./playtest list [options]
```

**Options:**
- `-g, --game <game>` - Filter to specific game
- `-s, --status <status>` - Filter by status (in_progress, completed, waiting_for_players, pending_analysis, cancelled)
- `-i, --instances` - Show individual instances instead of games summary
- `--since <time>` - Filter instances created since (e.g., "1h", "30m", "2d") - implies --instances
- `--updated-within <time>` - Filter instances updated within (e.g., "5m", "1h") - implies --instances
- `--stalled` - Show only stalled instances (no recent activity) - implies --instances
- `--threshold <time>` - Stall threshold (default: "5m")
- `--sort-by <field>` - Sort by: turns, updated, created, name
- `--format <format>` - Output format: json, table (default: table)
- `--validate` - Include validation status for games
- `--files` - Include file paths in instance mode (logs, transcripts) - for operators only

**Examples:**
```bash
# Default: games summary with instance counts by status
./playtest list

# Filter to specific game
./playtest list --game uno

# Show only games with waiting instances
./playtest list --status waiting_for_players

# Show individual instances
./playtest list --instances

# Show instances for a specific game
./playtest list --game uno --instances

# Show completed instances from last hour
./playtest list --status completed --since 1h

# Show stalled instances
./playtest list --stalled

# Include validation info
./playtest list --validate

# JSON output
./playtest list --format json

# Include file paths (for operators)
./playtest list --instances --files --format json
```

## Game Rules & Validation

### rules

Get the game rules markdown content.

```bash
./playtest rules <game>
```

**Arguments:**
- `<game>` - Game name

**Example:**
```bash
./playtest rules markovs-chains
```

### validate

Validate game rules file structure and content.

```bash
./playtest validate <game> --strict
```

**Arguments:**
- `<game>` - Game name

**Options:**
- `--strict` - Enable strict validation mode

### mechanic

Look up a game mechanic by slug, ID, name, or search query.

```bash
./playtest mechanic [query] --slug <slug>
```

**Arguments:**
- `[query]` - Search query (optional)

**Options:**
- `--slug <slug>` - Exact mechanic slug
- `--id <id>` - Mechanic ID
- `--name <name>` - Mechanic name

**Example:**
```bash
./playtest mechanic "card draw"
./playtest mechanic --slug card-drawing
```

## Utilities

### hint

Inject an operator hint to help unblock agents during a game.

```bash
./playtest hint <game> --message <text>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--message <text>` - Hint message (required)
- `--target <agent-id>` - Target specific agent (optional)

### cleanup

Clean up incomplete game logs and orphaned files.

```bash
./playtest cleanup --dry-run
```

**Options:**
- `--dry-run` - Show what would be cleaned without deleting
- `--game <name>` - Clean up specific game only
- `--force` - Skip confirmation prompts

### submit

Submit a player action for gamemaster validation (queue-based system, less common than `player:act`).

```bash
./playtest submit <game> --player-id <id> --action <json>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Player ID (required)
- `--action <json>` - Action as JSON object (required)

### update

Update player state directly (gamemaster only, for manual corrections).

```bash
./playtest update <game> --player-id <id> --state <json>
```

**Arguments:**
- `<game>` - Game name or instance ID

**Options:**
- `--player-id <id>` - Player ID to update (required)
- `--state <json>` - New state as JSON (required)

### advance

Advance to next player turn manually (gamemaster only, for debugging).

```bash
./playtest advance <game>
```

**Arguments:**
- `<game>` - Game name or instance ID

## Hook Integration

### hook

Handle agent session hooks for Claude Code integration (reads JSON from stdin).

```bash
./playtest hook --event <event-type>
```

**Options:**
- `--event <event-type>` - Hook event type (required)

### hook-event

Universal hook event handler (reads JSON from stdin).

```bash
./playtest hook-event --type <type>
```

**Options:**
- `--type <type>` - Event type (required)

## Logs & Files

Use `--files` flag to get file paths from the CLI:

```bash
# Get file paths for a specific instance
./playtest status uno-1234 --files

# List instances with file paths
./playtest list --instances --files --format json
```

**Files returned:**
- `log` - Game event log (JSONL format)
- `state` - State directory
- `analysis` - Post-game analysis (if exists)
- `transcripts` - Agent transcripts with role and path

Game logs are newline-delimited JSON. Each line represents a game event:

```json
{"type":"game_start","timestamp":"2026-02-02T10:30:00Z","players":["p1","p2"]}
{"type":"turn_start","timestamp":"2026-02-02T10:30:01Z","player":"p1"}
{"type":"action","timestamp":"2026-02-02T10:30:05Z","player":"p1","action":{"type":"play","card":"red-7"}}
```

## Examples

### Start a new game with the skill

```bash
/playtest markovs-chains 2
```

### Check game status

```bash
./playtest status mc-1234
```

### View game files

```bash
# Get file paths
./playtest status mc-1234 --files

# Then use the returned paths to view logs
cat $(./playtest status mc-1234 --files | jq -r '.files.log') | jq '.'
```

### Manually test player actions

```bash
# Register as player
./playtest register uno --role player --agent-id test-player

# Wait for turn
./playtest player:wait uno --player-id p1

# Execute action
./playtest player:act uno --player-id p1 --action '{"type":"play","card":"blue-5"}'
```

### Clean up old games

```bash
./playtest cleanup --dry-run
./playtest cleanup --game uno --force
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Game not found
- `4` - Permission denied
- `5` - Timeout

## Environment Variables

- `PLAYTEST_DEBUG=1` - Enable debug logging (same as `--debug` flag)
- `PLAYTEST_TIMEOUT=<ms>` - Default timeout for blocking operations
- `CLAUDE_API_KEY` - Required for agent orchestration

## See Also

- [Game Development Guide](/docs/game-development) - Create your own games
- [Architecture Overview](/docs/architecture) - System design and agent coordination
- [Mechanics Reference](/mechanics) - Available game mechanics
