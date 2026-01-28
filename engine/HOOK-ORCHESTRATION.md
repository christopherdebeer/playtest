# Hook-Based Agent Orchestration

## Concept

Use **Claude Code lifecycle hooks** to orchestrate agent coordination externally, removing the need for manual polling or complex file watching inside agent code.

## How It Works

```
┌──────────────┐
│   Agent      │
│  Makes       │
│  Decision    │
└──────┬───────┘
       │ completes turn
       ▼
┌──────────────┐
│  Stop Hook   │◄─── Triggered by Claude Code
│  Checks      │
│  Game State  │
└──────┬───────┘
       │
       ├─► Game completed? → Allow agent to exit
       │
       └─► Game in progress? → Prompt agent to wait for next turn
                                   │
                                   ▼
                          ┌──────────────┐
                          │   Agent      │
                          │ Calls        │
                          │ inotifywait  │
                          └──────┬───────┘
                                 │ BLOCKS (no API calls)
                                 ▼
                          ┌──────────────┐
                          │ Turn Signal  │
                          │  Changes     │
                          └──────┬───────┘
                                 │ Wakes immediately
                                 ▼
                          ┌──────────────┐
                          │   Agent      │
                          │   Checks     │
                          │  If My Turn  │
                          └──────────────┘
```

## Agent Flow

### Player Agent Flow

1. **Spawned** by coordinator
2. **Waits** for turn using `inotifywait` (blocking)
3. **Wakes** when turn-signal.json changes
4. **Checks** if it's their turn
5. **Makes decision** and submits action
6. **Stop hook triggers** → Checks game status
7. **If game continues** → Loop back to step 2
8. **If game ends** → Exit

### Gamemaster Agent Flow

1. **Initializes** game state
2. **Writes** turn-signal.json
3. **Stop hook triggers** → Reminds to wait
4. **Waits** for player action using `inotifywait` (blocking)
5. **Wakes** when action file appears
6. **Processes** action, updates state
7. **Writes** next turn-signal.json
8. **Loop** back to step 3

## Hook Implementation

### Player Stop Hook

Location: `.claude/hooks/agent-stop-hook.sh`

Checks:
- Is this a player agent?
- Is game completed?
- If not, remind to wait for next turn

```bash
#!/bin/bash
if [[ "$AGENT_ID" =~ player- ]]; then
  GAME_STATUS=$(jq -r '.gameStatus' game-state.json)

  if [ "$GAME_STATUS" != "completed" ]; then
    echo "Game in progress - wait for next turn:"
    echo "inotifywait -e modify turn-signal.json"
    exit 1  # Prevent exit
  fi
fi
```

### Gamemaster Stop Hook

Location: `.claude/hooks/gamemaster-stop-hook.sh`

Checks:
- Is this the gamemaster agent?
- Is game completed?
- If not, remind to wait for player action

```bash
#!/bin/bash
if [[ "$AGENT_ID" =~ gamemaster ]]; then
  GAME_STATUS=$(jq -r '.gameStatus' game-state.json)

  if [ "$GAME_STATUS" != "completed" ]; then
    CURRENT_PLAYER=$(jq -r '.currentPlayer' game-state.json)
    echo "Waiting for $CURRENT_PLAYER action:"
    echo "inotifywait -e create player-actions/$CURRENT_PLAYER.json"
    exit 1  # Prevent exit
  fi
fi
```

## Agent Templates

### Gamemaster Template (Hook-Orchestrated)

```markdown
# Gamemaster Agent - Hook-Orchestrated

You are the gamemaster for {{GAME_NAME}}.

## Main Loop

### Phase 1: Initialize Game
- Create deck, deal cards
- Write initial game-state.json
- Write first turn-signal.json

### Phase 2: Turn Loop

After writing turn-signal.json, your stop hook will remind you to wait.

**Wait for player action**:
```bash
inotifywait -e close_write -t 120 -q \
  games/{{GAME_NAME}}/state/player-actions/{{currentPlayer}}.json
```

When file appears:
1. Read and validate action
2. Apply action to game state
3. Check win condition
4. If game continues: Write next turn-signal.json, loop
5. If game ends: Write final summary, exit

### Phase 3: Game End

Write summary, clean up files, exit.
Your stop hook will see game is completed and allow exit.
```

### Player Template (Hook-Orchestrated)

```markdown
# Player Agent - {{PLAYER_ID}}

You are {{PLAYER_ID}} in {{GAME_NAME}}.

## Main Loop

After submitting an action, your stop hook will remind you to wait.

**Wait for your turn**:
```bash
inotifywait -e modify,close_write -q \
  games/{{GAME_NAME}}/state/turn-signal.json

# Check if it's your turn
CURRENT=$(jq -r '.currentPlayer' turn-signal.json)
if [ "$CURRENT" != "{{PLAYER_ID}}" ]; then
  # Not my turn, loop back to wait
  continue
fi

# It's my turn!
GAME_STATUS=$(jq -r '.gameStatus' game-state.json)
if [ "$GAME_STATUS" = "completed" ]; then
  exit 0
fi

# Read state, make decision, submit action
# ...
```

Loop continues until game ends.
```

## Benefits

✅ **External orchestration** - Hooks manage coordination, not agents
✅ **No manual polling** - Agents use inotifywait for blocking
✅ **Clean separation** - Agent logic separate from orchestration
✅ **Zero API waste** - Blocking happens in bash
✅ **Automatic recovery** - Hooks prevent premature exit
✅ **Clear state machine** - Hooks enforce turn-based flow

## Configuration

Enable hooks in `.claude/settings.json`:

```json
{
  "hooks": {
    "agent-stop": {
      "enabled": true,
      "script": ".claude/hooks/agent-stop-hook.sh"
    }
  },
  "env": {
    "GAME_NAME": "markovs-chains"
  }
}
```

## Testing

1. Spawn gamemaster agent
2. Hook triggers after initialization → reminds to wait
3. Agent calls `inotifywait` on player action file
4. Spawn player agent
5. Hook triggers after action → reminds to wait
6. Player calls `inotifywait` on turn signal
7. Cycle continues until game ends

## Comparison to Manual Orchestration

| Aspect | Manual Polling | inotifywait | Hook-Orchestrated |
|--------|---------------|-------------|-------------------|
| Coordination | Agent code | Agent code | External hooks |
| API waste | High (polling) | Zero | Zero |
| Error recovery | Manual | Manual | Automatic |
| Code complexity | High | Medium | Low |
| Testability | Hard | Medium | Easy |

## Migration

To migrate existing agents:

1. Add stop hooks to `.claude/hooks/`
2. Update agent templates to use inotifywait
3. Hooks will automatically guide agents to wait correctly
4. Agents become simpler - just decision logic + blocking waits
