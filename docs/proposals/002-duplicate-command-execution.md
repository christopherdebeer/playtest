# Proposal 002: Duplicate Command Execution Investigation

**Status**: Investigation Needed
**Date**: 2026-01-30
**Observed In**: markovs-chains playtest (instance `markovs-chains-1769791889889`)

## Problem Statement

All agents (gamemaster and both players) execute every command exactly twice. This is consistent across different agent types and models (Sonnet for gamemaster, Haiku for players).

## Observed Behavior

### Agent Output Logs

**Gamemaster (Sonnet)**:
```
[Tool: Bash] register... (1)
[Tool: Bash] register... (2)
[Tool: Bash] pending... (1)
[Tool: Bash] pending... (2)
```

**Player-1 (Haiku)**:
```
[Tool: Bash] register... (1)
[Tool: Bash] register... (2)
[Tool: Bash] wait... (1)
[Tool: Bash] wait... (2)
[Tool: Bash] status... (1)
[Tool: Bash] status... (2)
[Tool: Bash] act... (1)
[Tool: Bash] act... (2)
```

**Player-2 (Haiku)**:
```
[Tool: Bash] register... (1)
[Tool: Bash] register... (2)
[Tool: Bash] wait... (1)
[Tool: Bash] wait... (2)
```

### Pattern

- Every single command is executed twice
- Consistent across all three agents
- Consistent across two different models (Sonnet, Haiku)
- Commands are identical (not retries with different parameters)

## Potential Root Causes

### Hypothesis 1: Agent Prompt Pattern

The agent prompts may contain a pattern that causes "think aloud then execute":
- Agent reasons about command
- Agent executes command
- Agent confirms by re-executing

**Investigation**: Review agent system prompts for confirmation patterns.

### Hypothesis 2: Tool Confirmation Behavior

The Task agent spawning may have implicit confirmation logic:
- First call: "planning" tool call
- Second call: "confirmed" tool call

**Investigation**: Check Task tool implementation and agent spawning code.

### Hypothesis 3: Model Behavioral Pattern

Claude models may have a tendency to:
- Announce intention (triggers tool call)
- Execute intention (triggers tool call again)

**Investigation**: Test with explicit "do not repeat commands" instruction.

### Hypothesis 4: Output Parsing Issue

Tool output may not be correctly parsed, causing agent to think command didn't execute:
- Command runs but output not received
- Agent retries

**Investigation**: Check tool output handling in agent context.

## Investigation Plan

### Step 1: Add Anti-Duplicate Instruction

Test adding explicit instruction to agent prompts:
```markdown
## IMPORTANT: Command Execution

Execute each command EXACTLY ONCE. Do not repeat commands.
After executing a command, wait for the result before proceeding.
```

### Step 2: Review Agent Spawning

Examine how Task tool spawns agents and whether there's implicit retry logic.

### Step 3: Check Tool Result Handling

Verify that tool results are properly returned to agents and visible in their context.

### Step 4: Model Comparison Test

Run same playtest with different model configurations to isolate if this is model-specific.

## Impact Assessment

### Current Impact

- **Performance**: 2x tool calls = 2x latency and cost
- **Side Effects**: For idempotent commands (register, status) - minimal
- **Side Effects**: For non-idempotent commands (act) - could cause issues

### Risk Assessment

| Command | Idempotent? | Double-Execute Risk |
|---------|-------------|---------------------|
| register | Yes (after first) | Low - second call is no-op |
| status | Yes | Low - read-only |
| wait | Yes | Low - blocking call |
| act | **No** | **High** - could submit twice |
| pending | Yes | Low - blocking call |

## Proposed Solutions

### Solution A: Explicit Anti-Duplicate Instruction

Add to agent prompts:
```markdown
## Command Discipline

1. Execute each command EXACTLY ONCE
2. Wait for the result before proceeding
3. Do NOT re-execute commands to "confirm"
4. If unsure if command ran, check status first
```

### Solution B: Engine-Side Idempotency

Make all commands idempotent:
- `act` command checks if action already taken this turn
- `register` already handles re-registration gracefully
- Add action deduplication with request IDs

### Solution C: Agent Framework Investigation

If this is a framework issue:
- File bug report with Claude Code team
- Document workaround in agent prompts

## Files to Investigate

| File | Purpose |
|------|---------|
| `.claude/agents/player.md` | Player agent prompt |
| `.claude/agents/gamemaster.md` | Gamemaster agent prompt |
| `engine/src/game.ts` | Command handlers |

## Next Steps

1. [ ] Add anti-duplicate instruction to prompts
2. [ ] Run playtest and observe behavior
3. [ ] If persists, investigate Task tool spawning
4. [ ] Consider engine-side idempotency for `act` command

## Notes

This issue is lower priority than Proposal 001 (loop ergonomics) because:
- Most commands are idempotent
- Games can still function with duplicate calls
- Performance impact is acceptable for playtesting

However, the `act` command double-execution is a potential correctness issue that needs monitoring.
