# Proposal 010: Configurable Default Winner

**Status**: Draft
**Category**: Engine Mechanics
**Priority**: Medium
**Discovered**: AAOTE Playtest v0.1 (2026-01-31)

## Problem Statement

When a game reaches `max_turns` without a winner, the engine assigns victory to a player based on generic logic (highest score, or first player). This doesn't account for game-specific rules like "The Enemy wins by default if no one else wins."

### Evidence from Playtest

```json
{
  "event": "game_end",
  "turn": 41,
  "data": {
    "winner": "player-1",
    "reason": "Max turns (40) reached. player-1 wins with 0 points."
  }
}
```

According to AAOTE rules:
> "Time Limit: If turn 40 is reached with no winner, The Enemy wins by default."

The engine should have identified The Enemy player and awarded them the victory, not player-1.

### Root Cause

The engine's default win logic doesn't know about hidden roles:

```typescript
// Current implementation (simplified)
if (state.turn >= config.max_turns) {
  // Pick winner by score, or first player if tied
  const winner = players.sort((a, b) => b.score - a.score)[0];
  endGame(state, winner.id, `Max turns reached. ${winner.id} wins with ${winner.score} points.`);
}
```

## Proposed Solution

### Configuration

Add `timeout_winner` configuration option:

```yaml
# AAOTE RULES.md
engine_mechanics:
  timeout_winner:
    type: "role"           # or "highest_score", "specific_player", "no_winner"
    role: "enemy"          # The role that wins on timeout
    reveal_role: true      # Reveal the winner's hidden role

  # Alternative: specific player wins
  # timeout_winner:
  #   type: "specific_player"
  #   player_condition: "has_objective:The Enemy"

  # Alternative: no winner (draw)
  # timeout_winner:
  #   type: "no_winner"
  #   reason: "Time ran out with no victor"
```

### Implementation

```typescript
function determineTimeoutWinner(state: GameState): TimeoutResult {
  const config = state.config.engine_mechanics?.timeout_winner;

  if (!config) {
    // Default behavior: highest score
    return defaultTimeoutWinner(state);
  }

  switch (config.type) {
    case 'role':
      // Find player with specified role/objective
      const enemyPlayer = Object.entries(state.players).find(([id, player]) => {
        return player.objective?.type === config.role ||
               player.objective?.name === config.role_name;
      });

      if (enemyPlayer) {
        return {
          winner: enemyPlayer[0],
          reason: `Time limit reached. The ${config.role} wins by default.`,
          revealRole: config.reveal_role
        };
      }
      break;

    case 'specific_player':
      // Evaluate condition to find winner
      const winner = evaluatePlayerCondition(state, config.player_condition);
      if (winner) {
        return {
          winner: winner,
          reason: `Time limit reached. ${winner} wins by condition.`,
          revealRole: false
        };
      }
      break;

    case 'no_winner':
      return {
        winner: null,
        reason: config.reason || 'Game ended in a draw.',
        revealRole: false
      };

    case 'highest_score':
    default:
      return defaultTimeoutWinner(state);
  }

  // Fallback
  return defaultTimeoutWinner(state);
}

function defaultTimeoutWinner(state: GameState): TimeoutResult {
  const sorted = Object.entries(state.players)
    .sort(([, a], [, b]) => (b.score || 0) - (a.score || 0));

  return {
    winner: sorted[0][0],
    reason: `Max turns reached. ${sorted[0][0]} wins with ${sorted[0][1].score || 0} points.`,
    revealRole: false
  };
}
```

### Hidden Objectives Integration

The solution requires knowing which player has which objective:

```typescript
interface PlayerState {
  // existing fields...
  objective?: {
    name: string;       // "The Enemy", "The Collector", etc.
    type: string;       // "enemy", "regular"
    condition: string;  // Win condition text
    revealed: boolean;  // Whether objective is public knowledge
  };
}
```

During game init, objectives are dealt and tracked:

```typescript
function dealObjectives(state: GameState) {
  const objectives = shuffle(state.config.objectives);
  const players = Object.keys(state.players);

  players.forEach((playerId, index) => {
    state.players[playerId].objective = {
      ...objectives[index],
      revealed: false
    };
  });
}
```

## Implementation Details

### New Types

```typescript
interface TimeoutWinnerConfig {
  type: 'role' | 'highest_score' | 'specific_player' | 'no_winner';
  role?: string;
  role_name?: string;
  player_condition?: string;
  reveal_role?: boolean;
  reason?: string;
}

interface TimeoutResult {
  winner: string | null;
  reason: string;
  revealRole: boolean;
}
```

### Files to Modify

1. `engine/src/types.ts` - Add config types
2. `engine/src/game.ts` - Add `determineTimeoutWinner()` function
3. `engine/src/game.ts` - Update game end logic to use new function
4. `engine/src/game.ts` - Track objectives in player state

### Game End Event Update

```typescript
// When game ends by timeout
const result = determineTimeoutWinner(state);

logEvent(state, {
  event: 'game_end',
  turn: state.turn,
  data: {
    winner: result.winner,
    reason: result.reason,
    endType: 'timeout',
    revealedRoles: result.revealRole ? getRevealedRoles(state, result.winner) : undefined
  }
});
```

## Migration

### AAOTE RULES.md Update

```yaml
engine_mechanics:
  # Add timeout winner configuration
  timeout_winner:
    type: "role"
    role: "enemy"
    reveal_role: true

  # Existing mechanics...
  hidden_objectives:
    deal_at_start: true
    reveal_on_completion: true
```

### Backwards Compatibility

- Games without `timeout_winner` use highest score (current behavior)
- No breaking changes to existing games

## Testing

1. Game timeout with role-based winner - Enemy wins
2. Game timeout with score-based winner - Highest score wins
3. Game timeout with no_winner - Draw result
4. Game timeout reveals hidden role correctly
5. Game with no Enemy player reaches timeout - Fallback works

## Open Questions

1. Should timeout winner be announced differently than regular victory?
2. How to handle ties in score-based timeout?
3. Should there be a "sudden death" option instead of timeout winner?
4. How to communicate role reveals to agents?

---

*Proposal created based on AAOTE playtest findings*
