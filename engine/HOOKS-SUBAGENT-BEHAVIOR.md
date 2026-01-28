# Hook Behavior with Subagents

## Questions to Answer

### A. Do hooks run for subagents and main session?

**Expected behavior**: Hooks configured in `.claude/settings.json` should apply to:
- Main session (when you run commands directly)
- Subagents spawned via Task tool

**How hooks distinguish context**: Environment variables
- `CLAUDE_AGENT_ID` - Identifier for the agent (set by Task tool)
- `CLAUDE_TASK_ID` - Task ID if spawned via Task
- `CLAUDE_SESSION_ID` - Session ID

**In our hooks**:
```bash
# .claude/hooks/agent-stop-hook.sh
AGENT_ID="${CLAUDE_AGENT_ID}"

# Only run for player agents
if [[ ! "$AGENT_ID" =~ player- ]]; then
  exit 0  # Skip for non-player agents
fi
```

**Context detection**:
- If `CLAUDE_TASK_ID` is set → Running in subagent
- If `CLAUDE_AGENT_ID` matches pattern → Specific agent type
- Main session might not have these vars (or has different values)

### B. Do subagents inherit hooks?

**Expected behavior**:
- Project-level hooks (`.claude/settings.json`) are inherited by subagents
- No need to configure hooks per-task
- Task tool has no `hooks` parameter in its schema

**Verification needed**: We should test this!

## Testing Hook Behavior

### Test 1: Hook Runs in Main Session

```bash
# In main session, do something that triggers stop hook
echo "test" > /tmp/test.txt
# Check if hook executes
```

**Expected**: Hook should run but skip if not matching agent pattern

### Test 2: Hook Runs in Subagent

Spawn a test agent:
```javascript
Task({
  subagent_type: "general-purpose",
  description: "Test agent",
  prompt: "Echo 'hello' and complete",
  run_in_background: false
})
```

**Expected**: Hook should run when agent completes

### Test 3: Hook Can Distinguish Context

Our hooks check `CLAUDE_AGENT_ID`:
```bash
if [[ ! "$CLAUDE_AGENT_ID" =~ player- ]]; then
  exit 0  # Not a player, skip
fi
```

**Expected**:
- Player agents trigger the hook logic
- Gamemaster triggers gamemaster hook
- Other agents skip gracefully

## Potential Issues

### Issue 1: Hooks Run in Main Session Too

If hooks run in main session, they might interfere with normal operations.

**Solution**: Add guards in hooks:
```bash
# Only run if in a Task context
if [ -z "$CLAUDE_TASK_ID" ]; then
  exit 0  # Not a subagent, skip
fi
```

### Issue 2: Hook Inheritance Not Working

If subagents don't inherit hooks, we'd need to:
- Configure hooks per-task (if Task tool supports it - doesn't appear to)
- Use a different orchestration mechanism
- Run hooks externally (watch agent output files)

### Issue 3: Multiple Hooks Firing

With two hook scripts configured:
```json
"scripts": [
  ".claude/hooks/agent-stop-hook.sh",
  ".claude/hooks/gamemaster-stop-hook.sh"
]
```

**Behavior**: Both scripts run, but each should skip if not matching:
- `agent-stop-hook.sh` checks for `player-*` pattern
- `gamemaster-stop-hook.sh` checks for `gamemaster` pattern

**Order**: Scripts run in array order

## Recommended Hook Pattern

### Pattern 1: Agent-Type Detection

```bash
#!/bin/bash
# Detect what type of agent this is

AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"
TASK_ID="${CLAUDE_TASK_ID:-main}"

# Only run in subagent context
if [ "$TASK_ID" = "main" ]; then
  exit 0
fi

# Match specific agent type
if [[ "$AGENT_ID" =~ player- ]]; then
  # Player logic here
  echo "Player agent detected"
elif [[ "$AGENT_ID" =~ gamemaster ]]; then
  # Gamemaster logic here
  echo "Gamemaster detected"
else
  # Not our agent, skip
  exit 0
fi
```

### Pattern 2: Separate Hook Scripts (Current)

```bash
# agent-stop-hook.sh - Only for players
if [[ ! "$CLAUDE_AGENT_ID" =~ player- ]]; then
  exit 0
fi

# gamemaster-stop-hook.sh - Only for gamemaster
if [[ ! "$CLAUDE_AGENT_ID" =~ gamemaster ]]; then
  exit 0
fi
```

**Pros**: Clear separation, easy to maintain
**Cons**: Multiple hook files

## Environment Variable Debugging

Add to hooks for debugging:

```bash
#!/bin/bash
# Debug: Log all environment variables
exec 1>> /tmp/hook-debug-${CLAUDE_TASK_ID:-main}.log 2>&1

echo "=== Hook Execution ==="
echo "Time: $(date)"
echo "CLAUDE_AGENT_ID: ${CLAUDE_AGENT_ID:-unset}"
echo "CLAUDE_TASK_ID: ${CLAUDE_TASK_ID:-unset}"
echo "CLAUDE_SESSION_ID: ${CLAUDE_SESSION_ID:-unset}"
echo "PWD: $PWD"
echo ""

# Rest of hook logic...
```

Check logs:
```bash
cat /tmp/hook-debug-*.log
```

## Task Tool Behavior

Looking at Task tool parameters, there's no `hooks` option:
- `subagent_type` - Agent type
- `prompt` - Task prompt
- `model` - Model to use
- `run_in_background` - Background mode
- `allowed_tools` - Tool permissions
- `max_turns` - Turn limit
- `resume` - Resume from previous

**Conclusion**: Hooks are not configurable per-task, suggesting they're inherited from project settings.

## Action Items

1. **Test hook execution** in subagents
2. **Add debug logging** to hooks temporarily
3. **Verify environment variables** are set correctly
4. **Update hooks** with context guards if needed
5. **Document actual behavior** after testing

## Updated Hook Template (With Guards)

```bash
#!/bin/bash
# Stop hook with context guards

# Only run in subagent context
if [ -z "$CLAUDE_TASK_ID" ]; then
  exit 0  # Main session, skip
fi

# Detect agent type
AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"

# Only run for player agents
if [[ ! "$AGENT_ID" =~ player- ]]; then
  exit 0  # Not a player, skip
fi

# Get game state
GAME_NAME="${GAME_NAME:-markovs-chains}"
GAME_STATE_FILE="games/$GAME_NAME/state/game-state.json"

# Rest of hook logic...
```

This guards against:
- Running in main session
- Running for wrong agent types
- Missing environment variables
