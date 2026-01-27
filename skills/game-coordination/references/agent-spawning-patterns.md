# Agent Spawning Patterns

Detailed patterns for spawning and managing dynamic agents in game coordination systems.

## Task Tool Usage

### Basic Agent Spawn

```javascript
const taskResult = await Task({
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Player 1 turn in UNO",
  prompt: `[Full game context and instructions]`,
  run_in_background: false
});
```

### Parallel Agent Spawning

For simultaneous actions or testing multiple strategies:

```javascript
// Spawn all player agents at once
const tasks = [];
for (const player of players) {
  const task = Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: `Player ${player.id} simultaneous action`,
    prompt: generatePlayerPrompt(player, gameState),
    run_in_background: true // Critical for parallel execution
  });
  tasks.push(task);
}

// Collect all results
const results = [];
for (const task of tasks) {
  const output = await TaskOutput({
    task_id: task.id,
    block: true,
    timeout: 60000 // 60 second timeout
  });
  results.push(output);
}

// Process results in parallel
for (let i = 0; i < results.length; i++) {
  processPlayerAction(players[i], results[i]);
}
```

### Sequential Agent Spawning

For turn-based games where order matters:

```javascript
for (const player of turnOrder) {
  // Wait for each player sequentially
  const taskResult = await Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: `Player ${player.id} turn ${turnNumber}`,
    prompt: generatePlayerPrompt(player, gameState),
    run_in_background: false // Wait for completion
  });

  // Process action immediately
  const action = parsePlayerAction(taskResult);
  applyAction(action, gameState);

  // Update for next player
  updateGameState(gameState, action);
}
```

## Error Handling Patterns

### Retry with Exponential Backoff

```javascript
async function spawnPlayerAgentWithRetry(player, gameState, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Task({
        subagent_type: "general-purpose",
        model: "haiku",
        description: `Player ${player.id} turn (attempt ${attempt})`,
        prompt: generatePlayerPrompt(player, gameState),
        run_in_background: false
      });

      // Validate result
      if (isValidActionFormat(result)) {
        return result;
      } else {
        throw new Error("Invalid action format");
      }
    } catch (error) {
      if (attempt === maxRetries) {
        // Final attempt failed
        handleFinalFailure(player, error);
        return null;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      await sleep(delay);
    }
  }
}
```

### Fallback Strategies

```javascript
async function getPlayerAction(player, gameState) {
  try {
    // Try to spawn player agent
    return await spawnPlayerAgent(player, gameState);
  } catch (error) {
    // Fallback strategies in order of preference:

    // 1. Retry with simplified prompt
    try {
      return await spawnPlayerAgentSimplified(player, gameState);
    } catch (retryError) {
      // 2. Make random legal move
      const legalMoves = getLegalMoves(player, gameState);
      if (legalMoves.length > 0) {
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
      }

      // 3. Force draw action
      return { action: "draw", playerId: player.id };
    }
  }
}
```

### Timeout Handling

```javascript
async function spawnPlayerAgentWithTimeout(player, gameState, timeout = 30000) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Agent timeout")), timeout)
  );

  const agentPromise = Task({
    subagent_type: "general-purpose",
    model: "haiku",
    description: `Player ${player.id} turn`,
    prompt: generatePlayerPrompt(player, gameState),
    run_in_background: false
  });

  try {
    return await Promise.race([agentPromise, timeoutPromise]);
  } catch (error) {
    if (error.message === "Agent timeout") {
      // Handle timeout specifically
      logWarning(`Player ${player.id} timed out`);
      return makeRandomLegalMove(player, gameState);
    }
    throw error;
  }
}
```

## Prompt Engineering Patterns

### Structured Prompt Template

```javascript
function generatePlayerPrompt(player, gameState, rules) {
  return `# ${rules.name} - Player ${player.id}

## Your Role
You are Player ${player.id} in a competitive game. Your goal is to WIN by ${rules.win_condition}.

## Game Rules
${rules.body}

## Current Game State

### Your Hand
${JSON.stringify(player.hand, null, 2)}

### Visible Information
- Turn: ${gameState.turnNumber}
- Current player: ${gameState.currentPlayer}
- Discard pile top: ${JSON.stringify(gameState.discardPile[0])}
- Direction: ${gameState.direction === 1 ? "Clockwise" : "Counter-clockwise"}

### Opponents
${gameState.players.filter(p => p.id !== player.id).map(p =>
  `- Player ${p.id}: ${p.cardCount} cards`
).join('\n')}

## Available Actions
${getAvailableActions(player, gameState).map(action =>
  `- ${action.name}: ${action.description}`
).join('\n')}

## Your Task

1. Analyze the current situation
2. Consider your available legal moves
3. Choose the optimal action to maximize your chance of winning
4. Write your decision to: games/${rules.name.toLowerCase()}/state/player-actions/${player.id}.json

## Output Format

Use the Write tool to create the action file with this exact structure:

\`\`\`json
{
  "playerId": "${player.id}",
  "turnNumber": ${gameState.turnNumber},
  "action": "play" | "draw",
  "card": { "color": "Red", "value": "7" },
  "reasoning": "Brief explanation of your strategic choice"
}
\`\`\`

Make your move now!`;
}
```

### Prompt Variations for Testing

```javascript
const promptStrategies = {
  aggressive: {
    prefix: "You are an AGGRESSIVE player. Use action cards immediately to disrupt opponents.",
    scoring: "Prioritize disrupting opponents over hand management."
  },

  defensive: {
    prefix: "You are a DEFENSIVE player. Save powerful cards for crucial moments.",
    scoring: "Prioritize protecting yourself and managing your hand carefully."
  },

  random: {
    prefix: "You are a RANDOM player. Make unpredictable choices.",
    scoring: "Choose actions randomly from available legal moves."
  },

  optimal: {
    prefix: "You are an OPTIMAL player. Calculate the best mathematical play.",
    scoring: "Analyze probabilities and expected values for each action."
  }
};

function generatePlayerPromptWithStrategy(player, gameState, rules, strategy) {
  const basePrompt = generatePlayerPrompt(player, gameState, rules);
  const strategyConfig = promptStrategies[strategy];

  return `${strategyConfig.prefix}

${basePrompt}

## Strategic Guidance
${strategyConfig.scoring}`;
}
```

## Agent Lifecycle Management

### Tracking Active Agents

```javascript
class AgentManager {
  constructor() {
    this.activeAgents = new Map(); // playerId -> taskId
    this.completedAgents = new Set();
  }

  async spawnAgent(player, gameState) {
    // Check if agent already active
    if (this.activeAgents.has(player.id)) {
      throw new Error(`Agent for player ${player.id} already active`);
    }

    const task = await Task({
      subagent_type: "general-purpose",
      model: "haiku",
      description: `Player ${player.id} turn`,
      prompt: generatePlayerPrompt(player, gameState),
      run_in_background: true
    });

    this.activeAgents.set(player.id, task.id);
    return task;
  }

  async waitForAgent(playerId, timeout = 30000) {
    const taskId = this.activeAgents.get(playerId);
    if (!taskId) {
      throw new Error(`No active agent for player ${playerId}`);
    }

    try {
      const result = await TaskOutput({
        task_id: taskId,
        block: true,
        timeout: timeout
      });

      this.activeAgents.delete(playerId);
      this.completedAgents.add(playerId);

      return result;
    } catch (error) {
      this.activeAgents.delete(playerId);
      throw error;
    }
  }

  isAgentActive(playerId) {
    return this.activeAgents.has(playerId);
  }

  getActiveAgentCount() {
    return this.activeAgents.size;
  }
}
```

### Clean Shutdown

```javascript
async function shutdownAllAgents(agentManager) {
  const activeAgents = Array.from(agentManager.activeAgents.entries());

  for (const [playerId, taskId] of activeAgents) {
    try {
      // Try to get result with short timeout
      await TaskOutput({
        task_id: taskId,
        block: true,
        timeout: 5000
      });
    } catch (error) {
      // Agent didn't complete in time
      logWarning(`Agent for player ${playerId} did not complete before shutdown`);
    }
  }

  agentManager.activeAgents.clear();
}
```

## Model Selection Patterns

### Dynamic Model Selection

```javascript
function selectModelForPlayer(player, gameState, complexity) {
  // Use Haiku for simple/repetitive decisions
  if (complexity === "simple" || gameState.turnNumber < 10) {
    return "haiku";
  }

  // Use Sonnet for complex strategic decisions
  if (complexity === "complex" || isEndgame(gameState)) {
    return "sonnet";
  }

  // Use Opus for critical decisions (testing only)
  if (complexity === "critical") {
    return "opus";
  }

  return "haiku"; // Default to fast and cheap
}
```

### Cost Optimization

```javascript
// Track costs across game
class CostTracker {
  constructor() {
    this.costs = {
      haiku: { input: 0, output: 0, count: 0 },
      sonnet: { input: 0, output: 0, count: 0 },
      opus: { input: 0, output: 0, count: 0 }
    };
  }

  recordAgentUsage(model, inputTokens, outputTokens) {
    this.costs[model].input += inputTokens;
    this.costs[model].output += outputTokens;
    this.costs[model].count += 1;
  }

  getTotalCost() {
    // Approximate costs (update with current pricing)
    const prices = {
      haiku: { input: 0.25 / 1000000, output: 1.25 / 1000000 },
      sonnet: { input: 3.00 / 1000000, output: 15.00 / 1000000 },
      opus: { input: 15.00 / 1000000, output: 75.00 / 1000000 }
    };

    let total = 0;
    for (const [model, usage] of Object.entries(this.costs)) {
      total += usage.input * prices[model].input;
      total += usage.output * prices[model].output;
    }

    return total;
  }
}
```

## Performance Optimization

### Prompt Caching

```javascript
// Cache common prompt components
const promptCache = new Map();

function getCachedRules(gameName) {
  if (!promptCache.has(gameName)) {
    const rules = readGameRules(gameName);
    promptCache.set(gameName, rules);
  }
  return promptCache.get(gameName);
}

function generateOptimizedPrompt(player, gameState) {
  // Use cached rules (static)
  const rules = getCachedRules(gameState.gameName);

  // Generate dynamic content only
  const dynamicContext = {
    hand: player.hand,
    visibleState: getVisibleState(gameState, player.id),
    turnNumber: gameState.turnNumber
  };

  return buildPrompt(rules, dynamicContext);
}
```

### Parallel Processing

```javascript
async function runParallelGameSimulations(gameConfig, count = 10) {
  // Spawn multiple games in parallel
  const gameTasks = [];

  for (let i = 0; i < count; i++) {
    const task = Task({
      subagent_type: "general-purpose",
      model: "haiku",
      description: `Run game simulation ${i + 1}`,
      prompt: `Act as gamemaster and run a complete game of ${gameConfig.name}.
      Initialize, play through, and report results.`,
      run_in_background: true
    });
    gameTasks.push(task);
  }

  // Collect all results
  const results = await Promise.all(
    gameTasks.map(task => TaskOutput({ task_id: task.id, timeout: 300000 }))
  );

  // Aggregate statistics
  return aggregateGameResults(results);
}
```

## Debugging Patterns

### Agent Trace Logging

```javascript
function logAgentSpawn(player, gameState, prompt) {
  const trace = {
    timestamp: new Date().toISOString(),
    event: "agent_spawn",
    playerId: player.id,
    turnNumber: gameState.turnNumber,
    promptLength: prompt.length,
    gameState: {
      turnNumber: gameState.turnNumber,
      activePlayer: gameState.currentPlayer,
      playerCardCount: player.cardCount
    }
  };

  appendToTraceLog(gameState.gameName, trace);
}

function logAgentCompletion(player, gameState, action, duration) {
  const trace = {
    timestamp: new Date().toISOString(),
    event: "agent_complete",
    playerId: player.id,
    turnNumber: gameState.turnNumber,
    action: action,
    durationMs: duration,
    success: true
  };

  appendToTraceLog(gameState.gameName, trace);
}
```

### Prompt Debugging

```javascript
function savePromptForDebug(player, gameState, prompt) {
  const filename = `games/${gameState.gameName}/traces/prompts/turn-${gameState.turnNumber}-player-${player.id}.md`;
  writeFile(filename, prompt);
}

function comparePrompts(prompt1, prompt2) {
  // Highlight differences for debugging
  const diff = {
    lengthDiff: prompt1.length - prompt2.length,
    commonPrefix: longestCommonPrefix(prompt1, prompt2),
    differences: findDifferences(prompt1, prompt2)
  };
  return diff;
}
```

## Best Practices

### Agent Spawning

✅ **DO:**
- Use Haiku for repetitive decisions
- Set appropriate timeouts
- Handle failures gracefully
- Log all agent interactions
- Cache static prompt content

❌ **DON'T:**
- Spawn unlimited concurrent agents
- Use Opus for simple decisions
- Ignore timeout errors
- Retry infinitely
- Include redundant context

### Error Handling

✅ **DO:**
- Implement retry logic with backoff
- Have fallback strategies
- Log errors with context
- Validate agent outputs
- Set reasonable timeouts

❌ **DON'T:**
- Let errors crash the game
- Retry without delays
- Ignore validation failures
- Use silent failures
- Have infinite timeouts

### Performance

✅ **DO:**
- Run agents in parallel when possible
- Cache static content
- Monitor costs
- Optimize prompt length
- Reuse successful patterns

❌ **DON'T:**
- Block on sequential agents unnecessarily
- Regenerate static content
- Ignore cost tracking
- Send excessive context
- Over-engineer premature optimizations
