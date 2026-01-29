# Hook Context Injection Fix

| Field | Value |
|-------|-------|
| **Date** | 2026-01-29 |
| **Status** | Draft |
| **Author** | Claude |
| **Priority** | Critical |

## Summary

Fix the SubagentStart hook timing issue where game context cannot be extracted from the agent transcript because the prompt hasn't been written yet when the hook fires.

## Problem Statement

### Current Behavior

The `player-start-hook.sh` and `gamemaster-start-hook.sh` hooks attempt to inject game rules by:

1. Reading the transcript file path from hook input JSON
2. Parsing the transcript to find the user message containing `GAME: <name>`
3. Fetching rules via `npx playtest rules <game>`
4. Outputting rules to be injected into agent context

### Failure Mode

The hook receives this input:
```json
{
  "session_id": "3b7ef90c-4f64-45c8-87e2-8010ba54b088",
  "transcript_path": "/root/.claude/projects/.../session.jsonl",
  "cwd": "/home/user/playtest",
  "hook_event_name": "SubagentStart",
  "agent_id": "a62d759",
  "agent_type": "player"
}
```

But when the hook parses the transcript, **the agent's initial prompt hasn't been written yet**:

```
Extracted agent prompt:

Extracted GAME: ''
Warning: Could not extract game name from prompt
```

### Impact

- Agents must manually call `npx playtest rules <game>` (adds ~5s latency per agent)
- Rules are not pre-loaded into agent context
- Inconsistent agent initialization experience
- Wasted hook execution with no benefit

### Evidence

From `logs/hooks/player-start-hook.log`:
```
=== HOOK START ===
Timestamp: 2026-01-29T17:22:04.023Z
Hook: player-start-hook
Working Dir: /home/user/playtest

Received input JSON:
{"session_id":"...","transcript_path":"...","agent_id":"a62d759","agent_type":"player"}
Transcript path: /root/.claude/projects/-home-user-playtest/....jsonl
Extracted agent prompt:


Extracted GAME: ''
Warning: Could not extract game name from prompt
```

## Proposed Solutions

### Option A: Pass Game Context in Task Tool Call (Recommended)

Modify the coordinator (start-game skill) to pass game context directly to the Task tool, which then passes it to hooks via the input JSON.

**Coordinator change:**
```javascript
Task({
  subagent_type: "player",
  description: `player-1 for ${GAME_NAME}`,
  prompt: `GAME: ${GAME_NAME}\nYOUR ID: player-1\n\nBegin playing now.`,
  run_in_background: true,
  // NEW: Pass metadata for hooks
  metadata: {
    game: GAME_NAME,
    player_id: "player-1"
  }
});
```

**Hook receives:**
```json
{
  "session_id": "...",
  "transcript_path": "...",
  "agent_id": "a62d759",
  "agent_type": "player",
  "metadata": {
    "game": "markovs-chains",
    "player_id": "player-1"
  }
}
```

**Hook change:**
```bash
# Extract game from metadata (not transcript)
GAME=$(echo "$INPUT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('metadata', {}).get('game', ''))
")
```

**Pros:**
- Clean separation of concerns
- No race condition
- Hook input is self-contained

**Cons:**
- Requires Claude Code SDK change to support `metadata` field
- Coordinator must explicitly pass context

### Option B: Environment Variable Injection

Set environment variables before spawning agents that hooks can read.

**Coordinator change:**
```bash
export PLAYTEST_GAME="markovs-chains"
export PLAYTEST_PLAYER_ID="player-1"
```

**Hook change:**
```bash
GAME="${PLAYTEST_GAME:-}"
if [ -z "$GAME" ]; then
  # Fallback to transcript parsing
  ...
fi
```

**Pros:**
- Simple implementation
- No SDK changes needed
- Backwards compatible

**Cons:**
- Environment pollution
- May not survive across process boundaries
- Less explicit

### Option C: Delayed Hook Execution

Wait for transcript to be written before extracting context.

**Hook change:**
```bash
# Wait for transcript to have content
MAX_WAIT=5
WAIT_INTERVAL=0.2
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  AGENT_PROMPT=$(... extract from transcript ...)
  if [ -n "$AGENT_PROMPT" ]; then
    break
  fi
  sleep $WAIT_INTERVAL
  ELAPSED=$(echo "$ELAPSED + $WAIT_INTERVAL" | bc)
done
```

**Pros:**
- No external changes needed
- Works with current architecture

**Cons:**
- Adds latency (up to 5s)
- Fragile timing dependency
- May still fail under load

### Option D: Agent Definition Metadata

Store game context in the agent definition files themselves.

**Agent definition (`.claude/agents/player.md`):**
```yaml
---
name: player
# ... existing fields ...
hook_context:
  extract_from_prompt:
    - pattern: "^GAME:\\s*(\\S+)"
      key: "game"
    - pattern: "^YOUR ID:\\s*(\\S+)"
      key: "player_id"
---
```

**Hook behavior:**
The hook system would parse the agent's initial prompt (passed directly, not via transcript) using patterns from the definition.

**Pros:**
- Self-documenting
- Per-agent-type configuration

**Cons:**
- Requires hook system enhancement
- More complex implementation

## Recommendation

**Implement Option B (Environment Variables)** as an immediate fix, with **Option A** as the long-term solution when SDK support is available.

### Phase 1: Environment Variables (Immediate)

1. Modify `skills/start-game/SKILL.md` to document env var usage
2. Update hooks to read from env vars first, fallback to transcript parsing
3. Document the pattern for other skills

### Phase 2: SDK Metadata Support (Future)

1. Propose `metadata` field addition to Task tool
2. Update hooks to prefer metadata when available
3. Deprecate environment variable approach

## Implementation

### Hook Changes (hooks/player-start-hook.sh)

```bash
#!/bin/bash
# Player start hook - injects game rules into agent context

# ... logging setup ...

INPUT_JSON=$(cat)

# Priority 1: Check for game in environment
GAME="${PLAYTEST_GAME:-}"

# Priority 2: Check for game in hook metadata (future SDK support)
if [ -z "$GAME" ]; then
  GAME=$(echo "$INPUT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('metadata', {}).get('game', ''))
" 2>/dev/null)
fi

# Priority 3: Fallback to transcript parsing (unreliable)
if [ -z "$GAME" ]; then
  # ... existing transcript parsing logic ...
  echo "Warning: Falling back to transcript parsing (may fail)" >> "$LOG_FILE"
fi

if [ -z "$GAME" ]; then
  echo "Error: Could not determine game name" >> "$LOG_FILE"
  exit 0  # Don't block agent, just skip injection
fi

# Fetch and output rules
RULES=$(npx playtest rules "$GAME" 2>&1)
if [ -n "$RULES" ]; then
  echo "## Game Rules for $GAME"
  echo ""
  echo "$RULES"
fi
```

### Coordinator Changes

Document in `skills/start-game/SKILL.md`:

```markdown
## Environment Setup

Before spawning agents, set these environment variables:

```bash
export PLAYTEST_GAME="$GAME_NAME"
```

The start hooks will use these to inject rules without transcript parsing.
```

## Testing

1. Start a game with env vars set
2. Verify hooks extract game name from env
3. Verify rules are injected into agent context
4. Confirm agents don't need to manually fetch rules

## Success Metrics

- [ ] Hook logs show "game from environment: markovs-chains"
- [ ] Agents receive rules in initial context
- [ ] No "Warning: Could not extract game name" in logs
- [ ] Agent startup latency reduced by ~5s

## References

- Hook logs: `logs/hooks/player-start-hook.log`
- Current hooks: `hooks/player-start-hook.sh`, `hooks/gamemaster-start-hook.sh`
- Start game skill: `skills/start-game/SKILL.md`
