# Claude Code Hook Behavior with Subagents

## Quick Answers

### A. Do hooks run for subagents and main session?

**Yes, hooks run for both**, but you can distinguish context:

- **Main session**: Hooks configured in `.claude/settings.json` run when you execute commands
- **Subagents**: Same hooks also run when subagents (spawned via Task tool) complete actions

**How to distinguish**:
```bash
TASK_ID="${CLAUDE_TASK_ID:-}"

if [ -z "$TASK_ID" ]; then
  # Running in main session
else
  # Running in subagent
fi
```

**Environment variables provided**:
- `CLAUDE_AGENT_ID` - Agent identifier (e.g., "player-1", "gamemaster")
- `CLAUDE_TASK_ID` - Task ID (set for subagents, empty for main)
- `CLAUDE_SESSION_ID` - Current session ID

### B. Do subagents inherit hooks?

**Yes, subagents inherit project-level hooks automatically**.

- Hooks in `.claude/settings.json` apply to all subagents
- No per-task hook configuration needed
- Task tool has no `hooks` parameter - inheritance is automatic

**Evidence**:
1. Task tool parameters don't include hook configuration
2. Environment variables (`CLAUDE_AGENT_ID`, `CLAUDE_TASK_ID`) are provided to hooks
3. Hook scripts can detect and filter by agent type

## Hook Design Pattern

### Pattern: Guard Against Wrong Context

```bash
#!/bin/bash
# Stop hook with context guards

# Get context
AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"
TASK_ID="${CLAUDE_TASK_ID:-}"

# Guard 1: Only run in subagent context
if [ -z "$TASK_ID" ]; then
  exit 0  # Main session, skip this hook
fi

# Guard 2: Only run for specific agent type
if [[ ! "$AGENT_ID" =~ player- ]]; then
  exit 0  # Not a player agent, skip
fi

# Hook logic here...
echo "Player agent $AGENT_ID in task $TASK_ID"
```

### Why This Matters

Without guards, hooks would:
- Run in your main session (interfering with normal use)
- Run for all subagents (even non-game agents)
- Print confusing messages in wrong contexts

With guards:
- Hooks only activate for intended agents
- Main session unaffected
- Clean separation of concerns

## Our Implementation

We use **two separate hook files** with guards:

**`.claude/hooks/agent-stop-hook.sh`**
- Checks: `TASK_ID` is set (subagent only)
- Checks: `AGENT_ID` matches `player-*` pattern
- Logic: Guide player to wait for next turn

**`.claude/hooks/gamemaster-stop-hook.sh`**
- Checks: `TASK_ID` is set (subagent only)
- Checks: `AGENT_ID` matches `gamemaster` pattern
- Logic: Guide gamemaster to wait for player action

**Settings configuration**:
```json
{
  "hooks": {
    "stop": {
      "enabled": true,
      "scripts": [
        ".claude/hooks/agent-stop-hook.sh",
        ".claude/hooks/gamemaster-stop-hook.sh"
      ]
    }
  }
}
```

**Execution order**:
1. Both scripts run for every stop event
2. Each script checks its guards
3. Only matching script executes logic
4. Non-matching scripts exit 0 (skip)

## Hook Execution Flow

```
┌─────────────────────────────────────┐
│ Agent completes action              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Claude Code triggers stop hooks     │
└────────────┬────────────────────────┘
             │
             ├─────────────────────────────────┐
             ▼                                 ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ agent-stop-hook.sh       │  │ gamemaster-stop-hook.sh  │
├──────────────────────────┤  ├──────────────────────────┤
│ Check: TASK_ID set?      │  │ Check: TASK_ID set?      │
│ Check: player-* pattern? │  │ Check: gamemaster?       │
│                          │  │                          │
│ If yes: Run logic        │  │ If yes: Run logic        │
│ If no:  Exit 0 (skip)    │  │ If no:  Exit 0 (skip)    │
└────────────┬─────────────┘  └──────────┬───────────────┘
             │                           │
             └───────────┬───────────────┘
                         ▼
             ┌───────────────────────┐
             │ Hooks complete        │
             │ Agent sees output     │
             │ Agent follows guidance│
             └───────────────────────┘
```

## Advantages of This Design

1. **Single configuration** - All agents use same `.claude/settings.json`
2. **Automatic inheritance** - No need to configure each task
3. **Flexible filtering** - Hooks decide who they apply to
4. **No interference** - Guards prevent unwanted activation
5. **Easy testing** - Can test hooks in isolation

## Testing Hook Behavior

### Test 1: Verify Guards Work

```bash
# Test in main session (should skip)
export CLAUDE_AGENT_ID=""
export CLAUDE_TASK_ID=""
bash .claude/hooks/agent-stop-hook.sh
echo "Exit code: $?"  # Should be 0 (skipped)
```

### Test 2: Verify Agent Detection

```bash
# Test as player agent
export CLAUDE_AGENT_ID="player-1"
export CLAUDE_TASK_ID="task-123"
bash .claude/hooks/agent-stop-hook.sh
echo "Exit code: $?"  # Should be 1 (game in progress) or 0 (game done)
```

### Test 3: Verify Wrong Agent Skips

```bash
# Test gamemaster hook with player ID (should skip)
export CLAUDE_AGENT_ID="player-1"
export CLAUDE_TASK_ID="task-123"
bash .claude/hooks/gamemaster-stop-hook.sh
echo "Exit code: $?"  # Should be 0 (skipped - not gamemaster)
```

## Environment Variable Reference

### Available in Hooks

| Variable | Set In | Example Value | Purpose |
|----------|--------|---------------|---------|
| `CLAUDE_AGENT_ID` | Subagent | `player-1` | Identify agent type |
| `CLAUDE_TASK_ID` | Subagent | `a781109` | Detect subagent context |
| `CLAUDE_SESSION_ID` | Both | `6706eba4...` | Current session |
| `GAME_NAME` | Custom | `markovs-chains` | Game being played |
| `PWD` | Shell | `/home/user/playtest` | Working directory |

### How to Pass Custom Variables

When spawning agents, you might want to pass game context:

```javascript
// Note: This is hypothetical - actual Task tool may not support env vars
Task({
  subagent_type: "general-purpose",
  description: "Player-1",
  prompt: playerPrompt,
  // If supported:
  env: {
    GAME_NAME: "markovs-chains",
    PLAYER_ID: "player-1"
  }
})
```

**Current workaround**: Use defaults in hooks (`${GAME_NAME:-markovs-chains}`)

## Conclusion

✅ **Hooks DO run for subagents and main session**
  - Use `CLAUDE_TASK_ID` to detect subagent context

✅ **Subagents DO inherit hooks automatically**
  - No per-task configuration needed
  - Project `.claude/settings.json` applies to all

✅ **Hooks CAN distinguish context**
  - Environment variables identify agent type
  - Guards prevent unwanted activation

✅ **Our implementation uses guards**
  - Skip main session (check `TASK_ID`)
  - Skip wrong agent types (check `AGENT_ID` pattern)
  - Only activate for intended agents
