# Claude Code Hooks Integration Guide

## Overview

This guide explains how to use **Claude Code lifecycle hooks** to orchestrate multi-agent game playtests without manual polling.

## How Claude Code Hooks Work

Claude Code supports lifecycle hooks that run at key points in agent execution:

- **Stop Hook** - Runs when an agent completes an action or attempts to exit
- **Start Hook** - Runs when an agent is spawned (future)
- **Error Hook** - Runs when an agent encounters an error (future)

## Stop Hook for Agent Orchestration

### Location

`.claude/hooks/agent-stop-hook.sh` - Runs for all agents

OR

`.claude/hooks/{agent-role}-stop-hook.sh` - Role-specific hooks

### How It Works

```
┌─────────────┐
│   Agent     │
│ Completes   │
│   Action    │
└──────┬──────┘
       │ stop event
       ▼
┌─────────────┐
│ Stop Hook   │─── Reads game-state.json
│  Executes   │─── Checks if game completed
└──────┬──────┘
       │
       ├─► If game completed:
       │   └─► exit 0 (allow agent to exit)
       │
       └─► If game in progress:
           └─► exit 1 (prevent exit)
               Print reminder to wait for next event
```

### Agent Response

When stop hook returns `exit 1`:
- Agent sees the hook's message
- Agent follows instructions (e.g., call inotifywait)
- Agent blocks until next file event
- Cycle repeats

## Implementation

### 1. Create Stop Hooks

**Player Stop Hook** (`.claude/hooks/agent-stop-hook.sh`):

```bash
#!/bin/bash
# Detects player agents and ensures they wait for next turn

if [[ ! "$CLAUDE_AGENT_ID" =~ player- ]]; then
  exit 0  # Not a player, allow normal exit
fi

GAME_STATUS=$(jq -r '.gameStatus' games/*/state/game-state.json 2>/dev/null)

if [ "$GAME_STATUS" = "completed" ]; then
  echo "Game completed. Agent may exit."
  exit 0
fi

echo ""
echo "=== NEXT TURN COORDINATION ==="
echo "Game still in progress. Wait for your next turn:"
echo ""
echo "inotifywait -e modify,close_write -q games/*/state/turn-signal.json"
echo ""
echo "When it changes, check if it's your turn and continue."
echo ""

exit 1  # Prevent exit, agent should continue
```

**Gamemaster Stop Hook** (`.claude/hooks/gamemaster-stop-hook.sh`):

```bash
#!/bin/bash
# Detects gamemaster and ensures it waits for player actions

if [[ ! "$CLAUDE_AGENT_ID" =~ gamemaster ]]; then
  exit 0  # Not gamemaster, allow normal exit
fi

GAME_STATUS=$(jq -r '.gameStatus' games/*/state/game-state.json 2>/dev/null)

if [ "$GAME_STATUS" = "completed" ]; then
  echo "Game completed. Gamemaster may exit."
  exit 0
fi

CURRENT_PLAYER=$(jq -r '.currentPlayer' games/*/state/game-state.json)

echo ""
echo "=== WAITING FOR PLAYER ACTION ==="
echo "Turn signal written. Now waiting for $CURRENT_PLAYER to act:"
echo ""
echo "inotifywait -e create,close_write -t 120 -q \\"
echo "  games/*/state/player-actions/$CURRENT_PLAYER.json"
echo ""
echo "When action arrives, process it and write next turn signal."
echo ""

exit 1  # Prevent exit, gamemaster should continue
```

### 2. Make Hooks Executable

```bash
chmod +x .claude/hooks/*.sh
```

### 3. Enable Hooks in Settings

Add hook configuration to `.claude/settings.json`:

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

**CRITICAL**: Without this configuration, hooks won't run!

### 4. Environment Variables

Hooks receive these environment variables from Claude Code:

- `CLAUDE_AGENT_ID` - Agent identifier (e.g., "player-1", "gamemaster")
- `CLAUDE_SESSION_ID` - Current session ID
- `CLAUDE_TASK_ID` - Task ID if spawned via Task tool
- Custom vars from spawning context

Pass game context when spawning agents:

```javascript
Task({
  subagent_type: "general-purpose",
  description: "Player-1 agent",
  prompt: playerPrompt,
  // These become environment variables in hooks
  env: {
    GAME_NAME: "markovs-chains",
    PLAYER_ID: "player-1"
  }
})
```

## Agent Template Pattern

### Gamemaster Pattern

```markdown
## Initialize Game

1. Create game state
2. Write turn-signal.json
3. **Complete initialization** ← Stop hook triggers here

## Turn Loop

**Stop hook reminds you**: Wait for player action

Call inotifywait as instructed:
```bash
inotifywait -e close_write -t 120 -q player-actions/player-1.json
```

When file appears:
1. Process action
2. Update state
3. Write next turn signal
4. **Complete turn** ← Stop hook triggers again

Repeat until game ends.
```

### Player Pattern

```markdown
## Game Loop

**Stop hook reminds you**: Wait for your turn

Call inotifywait as instructed:
```bash
inotifywait -e modify -q turn-signal.json
```

When signal changes:
1. Check if your turn
2. If not, go back to waiting
3. If yes, make decision
4. Submit action
5. **Complete turn** ← Stop hook triggers

Repeat until game ends.
```

## Benefits of Hook-Based Orchestration

| Aspect | Manual Code | Hook-Orchestrated |
|--------|------------|-------------------|
| **Coordination Logic** | Inside agent | External hook |
| **Polling** | Agent sleeps repeatedly | inotifywait blocks |
| **API Calls While Waiting** | Many | Zero |
| **Error Recovery** | Agent must handle | Hook guides agent |
| **Testability** | Hard to test | Easy to test hooks |
| **Separation of Concerns** | Mixed | Clear separation |

## Advanced: Role-Specific Hooks

Instead of one hook checking agent type, create separate hooks:

```
.claude/hooks/
├── player-stop-hook.sh      # Auto-runs for player agents
├── gamemaster-stop-hook.sh  # Auto-runs for gamemaster
└── agent-stop-hook.sh       # Fallback for all agents
```

Claude Code determines which hook to run based on agent role/ID.

## Debugging Hooks

### Enable Hook Logging

```bash
# In hook script
exec 1>> /tmp/hook-debug.log 2>&1
echo "[$(date)] Hook executed for $CLAUDE_AGENT_ID"
```

### Test Hook Manually

```bash
# Simulate hook environment
export CLAUDE_AGENT_ID="player-1"
bash .claude/hooks/agent-stop-hook.sh
echo "Exit code: $?"
```

### Bypass Hook (Emergency)

If hook is causing issues:

```bash
# Temporarily disable
chmod -x .claude/hooks/agent-stop-hook.sh

# Or delete
rm .claude/hooks/agent-stop-hook.sh
```

## Migration from Polling to Hooks

### Before (Polling in Agent Code)

```markdown
# Agent template
while true; do
  sleep 1  # API call waste!
  if [ -f turn-signal.json ]; then
    # Process turn
    break
  fi
done
```

### After (Hook-Orchestrated)

```markdown
# Agent template
# Make decision, submit action, complete turn
# Hook will guide you to wait

# Then follow hook's instructions:
inotifywait -e modify turn-signal.json  # No API calls!
```

**Result**: Zero polling overhead, cleaner agent code, external orchestration.

## Complete Example

See `engine/templates/gamemaster-hook-orchestrated.md` and `player-hook-orchestrated.md` for complete working examples.

## Testing the System

1. **Create hooks**: `.claude/hooks/agent-stop-hook.sh`
2. **Make executable**: `chmod +x .claude/hooks/*.sh`
3. **Spawn agents** with environment variables
4. **Observe**: Hooks guide agents through coordination
5. **Verify**: Check game logs to confirm proper turn sequence

## Future Enhancements

- **Start hooks**: Guide agent initialization
- **Error hooks**: Handle failed actions, timeouts
- **Turn hooks**: Trigger on specific game events
- **Dynamic hooks**: Hooks that change behavior based on game state
