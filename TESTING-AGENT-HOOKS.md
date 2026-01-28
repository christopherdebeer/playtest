# Testing Agent Hooks - Session Continuation Guide

**Date**: 2026-01-28
**Status**: Ready for testing after session restart

## Background: What We Discovered

During the previous session, we identified that **SubagentStop hooks were not receiving environment variables** when spawning agents via ad-hoc `Task()` calls. The hooks were firing but receiving:

```bash
CLAUDE_AGENT_ID="unknown"
CLAUDE_TASK_ID=""
CLAUDE_SESSION_ID="unknown"
```

This caused all hooks to skip execution, preventing the multi-agent game coordination system from working.

### Root Cause Hypothesis

**Ad-hoc Task-spawned agents** (using `subagent_type: "general-purpose"`) may not provide environment variables to hooks.

**Properly defined agents** (in `.claude/agents/*.md` with `Stop` hooks in frontmatter) should receive proper environment variables.

## Test Setup (Completed)

### 1. Test Agent Created

**Location**: `.claude/agents/test-player.md`

```yaml
---
name: test-player
description: Test player agent to verify hook environment variables
model: haiku
tools: Read, Bash
hooks:
  Stop:
    - hooks:
        - type: command
          command: "hooks/test/test-player-stop-hook.sh"
---
```

**Behavior**: Reads game rules, waits 5 seconds, exits.

### 2. Test Hook Created

**Location**: `hooks/test/test-player-stop-hook.sh` (executable)

**What it does**:
- Captures ALL environment variables
- Logs them to `hooks/test/test-player-stop-hook.log`
- Displays key CLAUDE_* variables to console
- Allows agent to exit (exit 0)

### 3. Game Agents Created

**Location**: `.claude/agents/gamemaster.md` and `.claude/agents/player.md`

Both have the same test hook configured for validation. Once test passes, these will be updated with proper game-loop hooks.

## How to Run the Test

### Step 1: Restart Claude Code Session

**CRITICAL**: Agents are loaded at session start. You must restart for the new agents to be available.

```bash
# Exit current session, then restart
claude
```

### Step 2: Verify Agents Loaded

```bash
/agents
```

You should see `test-player`, `gamemaster`, and `player` in the list.

### Step 3: Run Test Agent

```
Use the test-player subagent to verify hook environment variables
```

Or:

```
Task: test-player - read game rules and test hooks
```

### Step 4: Check Results

```bash
cat hooks/test/test-player-stop-hook.log
```

## Expected Results

### ✅ Success Case (Hooks Working)

**Console output from hook:**
```
✅ Test hook executed successfully!
Agent ID: a1b2c3d (or "test-player")
Task ID: a1b2c3d
Agent Type: test-player
```

**Log file shows:**
```
SPECIFIC CLAUDE VARIABLES:
  CLAUDE_AGENT_ID: test-player (or task ID)
  CLAUDE_TASK_ID: a1b2c3d
  CLAUDE_SESSION_ID: xyz123
  CLAUDE_AGENT_TYPE: test-player
```

### ❌ Failure Case (Hooks Still Broken)

**Console output:**
```
✅ Test hook executed successfully!
Agent ID: NOT_SET
Task ID: NOT_SET
Agent Type: NOT_SET
```

**Log file shows:**
```
SPECIFIC CLAUDE VARIABLES:
  CLAUDE_AGENT_ID: NOT_SET
  CLAUDE_TASK_ID: NOT_SET
  CLAUDE_SESSION_ID: NOT_SET
  CLAUDE_AGENT_TYPE: NOT_SET
```

## Next Steps Based on Results

### If Test PASSES (Env Vars Present)

This confirms properly defined agents receive environment variables in hooks!

**Action Items**:
1. ✅ Update `gamemaster.md` and `player.md` with proper game-loop hooks
2. ✅ Modify `start-game` skill to use custom agents instead of `general-purpose`
3. ✅ Implement proper Stop hooks that:
   - Check game state (`gameStatus`)
   - Block exit if game is `in_progress`
   - Instruct agents to continue game loop
   - Allow exit only when `gameStatus: "completed"`
4. ✅ Add SessionStart hooks to pass game rules/context at agent startup
5. ✅ Test full game playthrough with 3 players

### If Test FAILS (Env Vars Missing)

This means even properly defined agents don't receive environment variables in hooks.

**Possible causes**:
1. Bug in Claude Code platform (report to Anthropic)
2. Configuration issue in how hooks are invoked
3. Different mechanism needed for agent lifecycle control

**Alternative approaches to explore**:
1. Use `PreToolUse` hooks instead of `Stop` hooks
2. Use agent-to-agent messaging via files (current file-based protocol)
3. Use `SubagentStart` hooks in `settings.json` to set up game context
4. Investigate if hooks work differently in production vs development

## File Locations Summary

```
.claude/agents/
├── test-player.md          # Test agent (haiku, simple task)
├── gamemaster.md           # Game coordinator (sonnet, complex)
└── player.md               # Game player (haiku, strategic)

hooks/test/
├── test-player-stop-hook.sh    # Hook script (executable)
└── test-player-stop-hook.log   # Results (created after test)

games/markovs-chains/
├── RULES.md                # Game rules (used by test)
└── state/                  # Game state (from previous failed run)
```

## Key Documentation References

- **Subagent Hooks**: https://code.claude.com/docs/en/sub-agents.md#define-hooks-for-subagents
- **Hook Types**: https://code.claude.com/docs/en/hooks
- **Agent Definitions**: https://code.claude.com/docs/en/sub-agents.md#write-subagent-files

## Previous Session Summary

**What worked**:
- ✅ Gamemaster initialized game correctly
- ✅ File-based coordination protocol (turn signals, action files)
- ✅ Timeout handling with forced passes
- ✅ State management and logging

**What failed**:
- ❌ All 3 player agents exited prematurely (within 2 minutes)
- ❌ Hooks didn't prevent exits (no env vars)
- ❌ Player-1 went rogue and created competing game
- ❌ Gamemaster played alone until giving up

**Root cause identified**:
- Ad-hoc Task() calls with `subagent_type: "general-purpose"` don't provide environment variables to hooks
- Need to use properly defined agents with hooks in frontmatter

## Quick Test Command

After restarting session:

```bash
# Run test
Use the test-player subagent

# Check results immediately
cat hooks/test/test-player-stop-hook.log | grep "CLAUDE_"
```

If you see actual values (not "NOT_SET"), the test passed! 🎉
