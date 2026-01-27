---
name: start-game
description: Initialize and run a game playtesting session with AI agents
argument-hint: <game-name> [num-players]
allowed-tools: [Read, Write, Task, Bash, Glob]
---

# Start Game Command

Initialize and run a complete game playtesting session using the gamemaster and player agent coordination system.

## Usage

```bash
/game-playtester:start-game <game-name> [num-players]
```

**Arguments**:
- `game-name` (required): Name of the game to play (must have `games/<game-name>/RULES.md`)
- `num-players` (optional): Number of players (default from rules file)

**Examples**:
```bash
/game-playtester:start-game uno
/game-playtester:start-game uno 4
```

## Implementation Steps

Follow these steps to initialize and run a game session:

### 1. Validate Game Configuration

Check that the game exists and has valid configuration:

```javascript
// Read game rules
const rulesPath = `games/${gameName}/RULES.md`;
if (!fileExists(rulesPath)) {
  error(`Game rules not found: ${rulesPath}`);
  return;
}

const rulesContent = await Read(rulesPath);

// Parse YAML frontmatter
const frontmatterMatch = rulesContent.match(/^---\n([\s\S]*?)\n---/);
if (!frontmatterMatch) {
  error("Invalid rules file: missing YAML frontmatter");
  return;
}

const config = parseYAML(frontmatterMatch[1]);

// Validate required fields
if (!config.name || !config.players || !config.win_condition) {
  error("Invalid game config: missing required fields");
  return;
}
```

### 2. Set Up Game Directories

Create necessary directories for game state:

```bash
mkdir -p games/${gameName}/state/player-actions
mkdir -p games/${gameName}/state/.locks
mkdir -p games/${gameName}/logs
mkdir -p games/${gameName}/traces
```

### 3. Spawn Gamemaster Agent

Create a gamemaster agent to orchestrate the game:

```javascript
// Use game-coordination skill patterns
await Task({
  subagent_type: "general-purpose",
  model: "sonnet", // Gamemaster needs reasoning ability
  description: `Gamemaster for ${gameName}`,
  prompt: `# Gamemaster Agent - ${gameName}

## Your Role

You are the GAMEMASTER for a game of ${gameName}. Your responsibilities:

1. **Enforce rules impartially**: You do not play to win. You ensure all players follow the rules fairly.
2. **Manage game state**: Maintain the authoritative game state in files.
3. **Coordinate players**: Signal turns to trigger player agents via hooks.
4. **Determine outcomes**: Detect win conditions and conclude games.

## Game Rules

${rulesContent}

## Configuration

- Players: ${numPlayers}
- Win condition: ${config.win_condition}

## Your Tasks

### Phase 1: Initialize Game

1. Create game ID: \`${gameName}-\${Date.now()}\`
2. Initialize deck according to rules
3. Deal ${config.cards_per_player} cards to each player
4. Create initial game state in \`games/${gameName}/state/game-state.json\` with:
   - Game metadata (gameId, timestamp, game name)
   - Player list with IDs (player-1, player-2, etc.)
   - Deck and discard pile
   - Turn order and direction
   - Game active status
5. Write initial turn signal to \`games/${gameName}/state/turn-signal.json\`:
   - currentPlayer: "player-1"
   - turnNumber: 1
   - availableActions: based on rules
   - visibleState: what player-1 can see

**IMPORTANT**: When you write the turn-signal.json file, a hook will automatically trigger to spawn the player agent. You do not need to spawn player agents yourself.

### Phase 2: Process Actions

After writing the turn signal, wait for the player to make their move. The workflow is:

1. Hook detects turn-signal.json → spawns player agent
2. Player agent writes action to \`games/${gameName}/state/player-actions/<player-id>.json\`
3. Hook detects action file → triggers you to process it

When you receive notification of a player action:
1. Read the action file
2. Validate action is legal
3. Apply action effects to game state
4. Check win condition
5. If game continues: Write next turn signal
6. If game ends: Write final game log and trace

### Phase 3: Conclude Game

When a player meets the win condition:
1. Calculate final scores
2. Write game log to \`games/${gameName}/logs/game-\${timestamp}.json\` with:
   - Game metadata
   - All players and final scores
   - Winner
   - Total turns
   - Duration
3. Write detailed trace to \`games/${gameName}/traces/game-\${timestamp}.md\` with:
   - Turn-by-turn breakdown
   - All player actions
   - Rule validations
   - Strategic insights
4. Clean up state directory
5. Report results to user

## Tools Available

- **Read**: Load rules, read player actions, check state
- **Write**: Create/update game state, signal turns, write logs
- **Bash**: Create directories, clean up files

## Begin

Initialize the game now and write the first turn signal.`,
  run_in_background: false
});
```

### 4. Monitor Game Progress

The hooks will automatically coordinate the game:
- Turn signals trigger player agents
- Player actions trigger gamemaster validation
- Game continues until win condition met

Inform the user that the game is running:

```markdown
Game session started for **${gameName}**!

**Configuration**:
- Players: ${numPlayers}
- Rules: games/${gameName}/RULES.md

**Game State**: games/${gameName}/state/
**Logs**: games/${gameName}/logs/

The gamemaster and player agents will coordinate automatically via hooks. The game will conclude when a player meets the win condition.

You can monitor progress by checking the state files or use \`/game-playtester:view-results\` when complete.
```

## Key Points

- **Hook coordination**: Player agents spawn automatically when turn-signal.json is written
- **Gamemaster role**: Enforce rules, validate actions, update state, signal turns
- **Player role**: Analyze state, make decision, write action file
- **File-based sync**: All coordination happens through JSON files
- **Automatic**: Once started, agents coordinate without user intervention

## Troubleshooting

**Game doesn't start**:
- Check rules file exists and has valid YAML frontmatter
- Verify required fields in config
- Check directory permissions

**Agents not responding**:
- Verify hooks are configured correctly
- Check hook logs with `claude --debug`
- Ensure state files are being written

**Invalid actions**:
- Check game rules are clear
- Review player agent prompts
- Add more validation in gamemaster

## See Also

- `/game-playtester:view-results` - Analyze completed games
- `/game-playtester:stop-game` - Emergency halt
- Skills: game-coordination, file-protocol, hook-sync
