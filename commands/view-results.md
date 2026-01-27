---
name: view-results
description: Analyze completed game logs and display results
argument-hint: [game-name] [log-file]
allowed-tools: [Read, Glob, Bash]
---

# View Results Command

Analyze and display results from completed game playtesting sessions.

## Usage

```bash
/game-playtester:view-results [game-name] [log-file]
```

**Arguments**:
- `game-name` (optional): Game to analyze (default: most recent)
- `log-file` (optional): Specific log file (default: latest)

**Examples**:
```bash
/game-playtester:view-results
/game-playtester:view-results uno
/game-playtester:view-results uno logs/game-2024-01-27.json
```

## Implementation Steps

### 1. Find Log Files

Locate game logs to analyze:

```javascript
// If game name provided, use it; otherwise find most recent
const gamesDir = "games";
let gameName = providedGameName;

if (!gameName) {
  // Find most recently modified game directory
  const games = await Glob("games/*/logs/*.json");
  if (games.length === 0) {
    error("No completed games found");
    return;
  }
  // Extract game name from most recent log
  gameName = games[0].split('/')[1];
}

// Find log file
let logPath;
if (providedLogFile) {
  logPath = `games/${gameName}/${providedLogFile}`;
} else {
  // Get most recent log
  const logs = await Glob(`games/${gameName}/logs/*.json`);
  if (logs.length === 0) {
    error(`No logs found for ${gameName}`);
    return;
  }
  logPath = logs[logs.length - 1]; // Most recent
}
```

### 2. Read and Parse Log

Load the game log data:

```javascript
const logContent = await Read(logPath);
const gameLog = JSON.parse(logContent);

// Validate log structure
if (!gameLog.gameId || !gameLog.players || !gameLog.winner) {
  error("Invalid log file format");
  return;
}
```

### 3. Display Results

Present game results in a clear format:

```markdown
# ${gameLog.game} - Game Results

**Game ID**: ${gameLog.gameId}
**Completed**: ${gameLog.timestamp}
**Total Turns**: ${gameLog.totalTurns}
**Duration**: ${gameLog.duration || 'N/A'}

## Winner

🏆 **${gameLog.winner}** wins!

## Final Standings

${gameLog.players.map((p, i) =>
  `${i + 1}. Player ${p.id}: ${p.finalScore} points (${p.finalCardCount} cards)`
).join('\n')}

## Statistics

- Average turns per player: ${(gameLog.totalTurns / gameLog.players.length).toFixed(1)}
- Longest streak: ${gameLog.stats?.longestStreak || 'N/A'}
- Most common action: ${gameLog.stats?.mostCommonAction || 'N/A'}

## Key Moments

${gameLog.keyMoments?.map(m => `- Turn ${m.turn}: ${m.description}`).join('\n') || 'No key moments recorded'}

---

**Log file**: ${logPath}
**Detailed trace**: games/${gameName}/traces/${path.basename(logPath, '.json')}.md
```

### 4. Optional Analysis

If user wants deeper analysis, provide insights:

```javascript
// Analyze player strategies
const playerStats = analyzePlayerStrategies(gameLog);

// Display strategic insights
```

Display:
- Player decision patterns
- Effective strategies
- Rule interaction frequency
- Balance insights

## Multiple Games Analysis

If analyzing multiple games from same configuration:

```bash
# Find all logs for a game
/game-playtester:view-results uno --all
```

Aggregate statistics across games:
- Win rate per player position
- Average game length
- Common winning strategies
- Rule balance insights

## Key Points

- **Single game**: Show winner, scores, key moments
- **Multiple games**: Aggregate statistics and patterns
- **Traces**: Point user to detailed trace files for turn-by-turn analysis
- **Insights**: Identify balance issues or dominant strategies

## Output Format

Display results directly to user in readable markdown format. Include:
- Game metadata
- Winner and standings
- Statistics
- References to detailed logs

## See Also

- `/game-playtester:start-game` - Start a new game session
- Skills: game-coordination (for understanding game flow)
