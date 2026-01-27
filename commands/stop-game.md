---
name: stop-game
description: Emergency halt of active game session
argument-hint: [game-name]
allowed-tools: [Read, Write, Bash, Glob]
---

# Stop Game Command

Emergency halt an active game session and clean up state files.

## Usage

```bash
/game-playtester:stop-game [game-name]
```

**Arguments**:
- `game-name` (optional): Game to stop (default: find active game)

**Examples**:
```bash
/game-playtester:stop-game
/game-playtester:stop-game uno
```

## Implementation Steps

### 1. Find Active Game

Identify which game is currently running:

```javascript
let gameName = providedGameName;

if (!gameName) {
  // Find active game by checking for active game-state files
  const stateFiles = await Glob("games/*/state/game-state.json");

  if (stateFiles.length === 0) {
    info("No active games found");
    return;
  }

  // Check each for gameActive: true
  for (const stateFile of stateFiles) {
    const state = JSON.parse(await Read(stateFile));
    if (state.gameActive) {
      gameName = stateFile.split('/')[1];
      break;
    }
  }

  if (!gameName) {
    info("No active games found");
    return;
  }
}
```

### 2. Read Current State

Load game state for logging before stopping:

```javascript
const statePath = `games/${gameName}/state/game-state.json`;

if (!fileExists(statePath)) {
  error(`No active game found for ${gameName}`);
  return;
}

const gameState = JSON.parse(await Read(statePath));

if (!gameState.gameActive) {
  info(`Game ${gameName} is not active`);
  return;
}
```

### 3. Mark Game as Stopped

Update game state to inactive:

```javascript
gameState.gameActive = false;
gameState.stoppedAt = new Date().toISOString();
gameState.stoppedReason = "Manual stop by user";

await Write(statePath, JSON.stringify(gameState, null, 2));
```

### 4. Write Partial Log

Save incomplete game log for analysis:

```javascript
const logTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const partialLog = {
  fileType: "game-log",
  status: "stopped",
  game: gameName,
  gameId: gameState.gameId,
  startedAt: gameState.timestamp,
  stoppedAt: gameState.stoppedAt,
  stoppedReason: gameState.stoppedReason,
  completedTurns: gameState.turnNumber,
  players: gameState.players,
  finalState: gameState
};

await Write(
  `games/${gameName}/logs/game-stopped-${logTimestamp}.json`,
  JSON.stringify(partialLog, null, 2)
);
```

### 5. Clean Up State Files

Remove active state files to prevent hooks from triggering:

```bash
# Remove turn signals and player actions
rm -f games/${gameName}/state/turn-signal.json
rm -f games/${gameName}/state/player-actions/*.json

# Keep game-state.json for reference (marked inactive)

# Remove any lock files
rm -rf games/${gameName}/state/.locks/*
```

### 6. Report to User

Inform user of stopped game:

```markdown
# Game Stopped

**Game**: ${gameName}
**Game ID**: ${gameState.gameId}
**Stopped at**: Turn ${gameState.turnNumber}

## Final State

- Current player: ${gameState.currentPlayer}
- Players: ${gameState.players.map(p => `${p.id} (${p.cardCount} cards)`).join(', ')}
- Game active: false

## Cleanup

✓ Game marked as inactive
✓ Turn signal removed
✓ Player actions cleared
✓ Locks released
✓ Partial log saved

**Partial log**: games/${gameName}/logs/game-stopped-${logTimestamp}.json
**State snapshot**: games/${gameName}/state/game-state.json

The game has been stopped. No further agent coordination will occur.
```

## Key Points

- **Safe halt**: Marks game inactive before cleanup
- **Preserve state**: Saves partial log for analysis
- **Clean hooks**: Removes trigger files to stop agent spawning
- **Lock cleanup**: Releases any held locks
- **User feedback**: Clear report of what was stopped

## Use Cases

- **Debugging**: Stop game to inspect state
- **Runaway game**: Halt game stuck in infinite loop
- **Testing**: Stop after specific number of turns
- **Resource cleanup**: Stop game consuming too many tokens

## See Also

- `/game-playtester:start-game` - Start a new game
- `/game-playtester:view-results` - View partial results
