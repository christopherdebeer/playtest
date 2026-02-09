---
name: playtest-manual
description: Interactive manual playtest for step-by-step game testing. Use when the user wants to "manually test a game", "step through a game", "debug game mechanics", "play interactively", or wants direct control over player actions without autonomous agents.
argument-hint: <game-name> [num-players]
allowed-tools: Bash(./playtest *), Read
---

# Manual Playtest - Interactive Step-by-Step Testing

This skill provides an interactive manual playtest experience where you control all player actions directly, without spawning autonomous agents. Useful for:
- Debugging game mechanics
- Testing specific scenarios
- Understanding game flow
- Verifying rule implementations

## Arguments

- `$0`: Game name (e.g., "uno", "markovs-chains")
- `$1`: Number of players (optional, default: 2)

## Workflow

### Step 1: Initialize Game

```bash
GAME_NAME="$0"
NUM_PLAYERS="${1:-2}"

# Initialize game instance
./playtest init "$GAME_NAME" --players "$NUM_PLAYERS"
```

Parse the `instanceId` from the JSON output.

### Step 2: Register Manual "Agents"

Register placeholder agents to start the game. Use simple IDs like `manual-gm`, `manual-p1`, etc.

```bash
INSTANCE_ID="<from step 1>"

# Register gamemaster
./playtest register "$INSTANCE_ID" --role gamemaster --agent-id manual-gm

# Register players
./playtest register "$INSTANCE_ID" --role player --agent-id manual-p1
./playtest register "$INSTANCE_ID" --role player --agent-id manual-p2
# ... repeat for additional players
```

After all agents register, the game auto-starts.

### Step 3: Game Loop - Interactive Turn Execution

For each turn, show the user the current state and available actions, then ask what action to take.

#### 3a. Get Current Player's Turn Info

```bash
# Get available actions for current player
./playtest player:turn "$INSTANCE_ID" --player "$CURRENT_PLAYER"
```

This returns:
- `status`: "your_turn" or "waiting"
- `gameState.myState`: Current player's state, hand, effects
- `gameState.opponents`: Other players' visible state
- `actions`: Array of available actions with descriptions and examples
- `currentState`: Player's board position (for board games)

#### 3b. Make Strategic Decisions (Default) or Ask User

**Default behavior**: Play semi-realistically, making reasonable strategic decisions for all players. Show the action taken and result after each turn. This allows rapid testing of game flow without user input on every turn.

**Only ask user if**:
- User specified a testing goal (e.g., "test what happens when player reaches Victory")
- User wants to control a specific player
- A critical decision point is reached

When playing automatically, briefly explain the reasoning for each move.

#### 3c. Execute the Chosen Action

```bash
# Execute player action
./playtest player:act "$INSTANCE_ID" --player "$CURRENT_PLAYER" --action '<JSON>'
```

Example actions:
```json
{"type": "move", "target": "A"}
{"type": "play_card", "card": "Block", "target": "player-2"}
{"type": "draw"}
{"type": "pass"}
```

#### 3d. Show Result and Continue

After each action, show:
- Action result (success/failure)
- Updated game state
- Next player's turn

Loop back to 3a for the next player.

### Step 4: Game End

When `gameStatus` becomes `pending_analysis` or `completed`, show:
- Winner
- End reason
- Final scores (if applicable)

## CLI Quick Reference

| Command | Purpose |
|---------|---------|
| `./playtest init <game> -p <n>` | Create game instance |
| `./playtest register <id> -r <role> -a <agentId>` | Register agent |
| `./playtest status <id>` | Get game status |
| `./playtest player:turn <id> -p <player>` | Get turn info + actions |
| `./playtest player:act <id> -p <player> -a '<json>'` | Execute action |
| `./playtest gm:state <id>` | Full game state (GM view) |
| `./playtest gm:end <id> -w <winner> -r '<reason>'` | End game manually |
| `./playtest cancel <id> -r '<reason>'` | Cancel game |

## Example Session

```
User: /playtest-manual markovs-chains 2

Claude: Initializing markovs-chains with 2 players...

Game Instance: markovs-chains-1234567890123
Status: in_progress
Round: 1, Turn: 1
Current Player: player-1

**player-1's State:**
- Board Position: Start
- Hand: [Catalyst, Block, Sabotage, Momentum, Hazard]
- Effects: none

**Opponents:**
- player-2: Start (5 cards)

**Available Actions:**
1. **move** - Move to adjacent state (targets: A, B, C)
2. **play_card** - Play a card (playable: Catalyst, Block, Sabotage, Momentum)
3. **draw** - Draw a card from deck
4. **pass** - Skip turn

What action should player-1 take?

User: move to A

Claude: Executing: {"type": "move", "target": "A"}

Result: Success! Moved to A (probability roll succeeded)

Turn advanced to player-2...
```

## Cleanup

When done testing, clean up the instance:

```bash
./playtest reset "$INSTANCE_ID" --force
# Or just leave it - instances are isolated
```

## Notes

- This skill does NOT spawn autonomous agents
- You (the operator) control all player decisions
- Useful for regression testing specific game scenarios
- Can be combined with `./playtest gm:state` to see hidden info
