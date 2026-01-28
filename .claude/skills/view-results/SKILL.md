---
name: view-results
description: Analyze completed game logs and display results. Use when user wants to see game results, check playtest outcomes, analyze game logs, or review game statistics.
argument-hint: [game-name] [log-file]
allowed-tools: Read, Glob, Bash
disable-model-invocation: true
---

# View Results - Game Analysis

Analyze and display results from completed game playtesting sessions.

## Arguments

- `$0` (optional): Game name to analyze. If omitted, uses most recent.
- `$1` (optional): Specific log file path. If omitted, uses latest.

## Implementation Steps

### 1. Find Log Files

```javascript
let gameName = "$0";

if (!gameName) {
  // Find most recently modified game directory
  const games = await Glob("games/*/logs/*.json");
  if (games.length === 0) {
    console.log("No completed games found");
    return;
  }
  gameName = games[0].split('/')[1];
}

// Find log file
let logPath;
if ("$1") {
  logPath = `games/${gameName}/$1`;
} else {
  const logs = await Glob(`games/${gameName}/logs/*.json`);
  logPath = logs[logs.length - 1]; // Most recent
}
```

### 2. Read and Parse Log

```javascript
const logContent = await Read(logPath);
const gameLog = JSON.parse(logContent);
```

### 3. Display Results

Present in this format:

```markdown
# {game} - Game Results

**Game ID**: {gameId}
**Completed**: {timestamp}
**Total Turns**: {totalTurns}

## Winner

{winner} wins!

## Final Standings

1. Player {id}: {score} points ({cardCount} cards)
2. ...

## Statistics

- Average turns per player: {calc}
- Longest streak: {stat}
- Most common action: {stat}

## Key Moments

- Turn {N}: {description}
- ...

---

**Log file**: {logPath}
**Live events**: games/{game}/logs/game-*-live.jsonl
**Detailed trace**: games/{game}/traces/game-*.md
```

### 4. Optional: Multiple Games Analysis

If `--all` flag provided, aggregate across all logs:
- Win rate per player position
- Average game length
- Common winning strategies
- Balance insights

## Output

Display results directly to user in readable markdown format.
