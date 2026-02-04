# Proposal 011: Agent ID to Role Mapping

**Status**: Draft (Speculative)
**Category**: Agent Architecture
**Priority**: Medium
**Created**: 2026-02-04
**Last Updated**: 2026-02-04

## Problem Statement

Currently, agents self-identify their roles when interacting with the playtest engine. This creates several issues:

1. **No verification** - Agents claim to be "player-1" with no verification
2. **Race conditions** - Hooks search transcripts that may not exist yet
3. **Fragile instance detection** - Hooks poll for "INSTANCE:" pattern in transcripts
4. **Self-registration required** - Agents must call `register` before playing

### Current Flow

```
1. playtest init game --players 2
   → Creates instance, returns spawn instructions

2. Coordinator spawns agents
   → Claude assigns agent_id (e.g., "a3936c4")
   → SubagentStart hook fires with {agent_id, agent_type}

3. Hook searches transcript for "INSTANCE:" pattern
   → Race condition: transcript may not exist yet
   → No agent_id → role mapping created

4. Agent self-identifies:
   → playtest register INSTANCE -r player -a my-agent -p player-1
   → playtest player:turn INSTANCE -p player-1
   → Agent claims to be "player-1" with no verification
```

### Evidence from Playtest

From hook-invocations.log, we can see SubagentStart provides agent_id:
```json
{
  "session_id": "337fdfba-f745-485b-aca0-5b9b548d941c",
  "transcript_path": "/root/.claude/projects/.../session.jsonl",
  "hook_event_name": "SubagentStart",
  "agent_id": "a3936c4",
  "agent_type": "player"
}
```

This `agent_id` is currently unused. Instead, hooks search transcripts for instance IDs, which is error-prone.

SubagentStop also provides agent_id, enabling detection of which player disconnected:
```json
{
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "a3936c4",
  "agent_transcript_path": "/root/.claude/.../subagents/agent-a3936c4.jsonl"
}
```

## Proposed Solution

### Overview

Use Claude-assigned `agent_id` to create explicit role mappings, eliminating self-identification.

### Proposed Flow

```
1. playtest init game --players 2
   → Creates instance
   → Returns spawn instructions WITH role assignments:
     {
       "instanceId": "uno-123456",
       "agents": [
         {"role": "gamemaster", "agentType": "gamemaster"},
         {"role": "player-1", "agentType": "player", "persona": "aggressive"},
         {"role": "player-2", "agentType": "player", "persona": "casual"}
       ]
     }

2. Coordinator spawns agents in order
   → Passes role in prompt: "ROLE: player-1"

3. SubagentStart hook fires with {agent_id: "a3936c4"}
   → Hook extracts ROLE from prompt (or assigns next available)
   → Hook calls: playtest assign INSTANCE --agent a3936c4 --role player-1
   → Creates mapping in game state: agentMapping[a3936c4] = "player-1"

4. All subsequent commands use --agent-id:
   → playtest player:turn INSTANCE --agent-id a3936c4
   → Engine looks up: agentMapping["a3936c4"] → "player-1"
   → No self-identification needed
```

### New CLI Command: `playtest assign`

```typescript
program
  .command('assign <game>')
  .description('Assign agent ID to a role')
  .requiredOption('--agent <id>', 'Claude agent ID')
  .requiredOption('--role <role>', 'Role: gamemaster, player-1, player-2, etc.')
  .action((game: string, options: { agent: string; role: string }) => {
    const state = loadState(game);
    state.agentMapping = state.agentMapping || {};
    state.agentMapping[options.agent] = options.role;
    saveState(state);
    console.log(JSON.stringify({
      success: true,
      agentId: options.agent,
      role: options.role,
      instanceId: state.gameId
    }));
  });
```

### State Schema Addition

```typescript
interface GameState {
  // ... existing fields
  agentMapping: Record<string, string>;  // agent_id → role
}
```

### Modified CLI Commands

Replace `--player` with `--agent-id` (or support both for backwards compatibility):

```typescript
// Old
.command('player:turn <game>')
.requiredOption('-p, --player <id>', 'Player ID')

// New
.command('player:turn <game>')
.requiredOption('-a, --agent-id <id>', 'Agent ID')
// OR support both:
.option('-p, --player <id>', 'Player ID (legacy)')
.option('-a, --agent-id <id>', 'Agent ID (preferred)')
```

Internal lookup:
```typescript
function resolvePlayerId(state: GameState, options: { player?: string; agentId?: string }): string {
  if (options.agentId) {
    const role = state.agentMapping?.[options.agentId];
    if (!role) throw new Error(`Unknown agent ID: ${options.agentId}`);
    return role;
  }
  return options.player!;  // Legacy fallback
}
```

### Hook Enhancement

```typescript
// SubagentStart hook
if (inputJson.agent_id && instanceId) {
  // Extract role from prompt or assign next available
  const role = extractRoleFromPrompt(transcriptContent)
            || assignNextAvailableRole(instanceId, inputJson.agent_type);

  // Create mapping
  assignAgentToRole(instanceId, inputJson.agent_id, role);

  log(`Assigned agent ${inputJson.agent_id} to role ${role}`);
}
```

### Enhanced Init Output

```typescript
// playtest init game --players 2
{
  "success": true,
  "instanceId": "uno-123456",
  "gameName": "uno",
  "spawnInstructions": [
    {
      "agentType": "gamemaster",
      "role": "gamemaster",
      "prompt": "INSTANCE: uno-123456\nROLE: gamemaster\n..."
    },
    {
      "agentType": "player",
      "role": "player-1",
      "persona": "aggressive",
      "prompt": "INSTANCE: uno-123456\nROLE: player-1\nPERSONA: aggressive\n..."
    },
    {
      "agentType": "player",
      "role": "player-2",
      "persona": "casual",
      "prompt": "INSTANCE: uno-123456\nROLE: player-2\nPERSONA: casual\n..."
    }
  ]
}
```

## Benefits

1. **No self-identification** - Agents can't claim wrong roles
2. **Hook-driven mapping** - Engine knows agent→role from start
3. **Cleaner commands** - `--agent-id` instead of `--player`
4. **Automatic registration** - No separate `register` step needed
5. **Stop hook reliability** - Can use agent_id to detect which player disconnected
6. **Respawn support** - Can reassign roles to new agents if one terminates

## Open Questions

1. **Custom vs Claude IDs** - Should `--agent-id` use Claude-assigned IDs exclusively, or allow custom IDs?
2. **Agent respawning** - How to handle same role with new agent_id after termination?
3. **Backwards compatibility** - Support both `--agent-id` and `--player` during transition?
4. **Multi-instance agents** - Can one agent play in multiple game instances?

## Implementation Plan

### Phase 1: State Schema (Low Risk)
- Add `agentMapping` field to GameState
- No breaking changes

### Phase 2: Assign Command (Low Risk)
- Add `playtest assign` command
- Can be used immediately by hooks

### Phase 3: Hook Enhancement (Medium Risk)
- Update SubagentStart hook to call `assign`
- Extract ROLE from prompt or auto-assign

### Phase 4: Command Migration (Higher Risk)
- Add `--agent-id` option to player commands
- Deprecate `--player` (keep for backwards compatibility)
- Update agent definitions to use new parameter

## Alternatives Considered

### A: Keep Self-Identification
- Pros: No changes needed
- Cons: No verification, race conditions persist

### B: Token-Based Authentication
- Pros: Cryptographically secure
- Cons: Overkill for single-machine playtesting

### C: Instance-Scoped Agent IDs
- Generate playtest-specific agent IDs at init time
- Pros: More control over IDs
- Cons: Doesn't leverage Claude's built-in agent_id

## References

- SubagentStart/SubagentStop hook documentation
- Current hook implementation: `src/cli/index.ts:2053`
- Registration flow: `src/core/game.ts:703`
