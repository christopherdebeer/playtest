# Proposal 007: Grid Movement Validation

**Status**: Implemented
**Category**: Engine Mechanics
**Priority**: Critical
**Discovered**: AAOTE Playtest v0.1 (2026-01-31)

## Problem Statement

The engine validates movement actions only when a `board` configuration exists, but games using `grid` configuration (like AAOTE) have no movement validation at all. This allows players to move to non-existent locations.

### Evidence from Playtest

```
Turn 9, player-1: {"type":"move","target":"Fake Location","placedCardEffects":[]}
```

Player-1 successfully moved to "Fake Location" - a location that doesn't exist in the game. The engine accepted this without error.

### Root Cause

In `engine/src/game.ts` at line 2142:

```typescript
case 'move': {
  // For board games - check if target is valid
  if (state.config.board) {  // <-- Only checks 'board', not 'grid'
    const validStates = state.config.board.states || [];
    const moveAction = action as { target: string };
    if (!validStates.includes(moveAction.target)) {
      errors.push(`Invalid move target "${moveAction.target}".`);
    }
  }
  break;
}
```

Games using `grid` configuration bypass this check entirely.

## Proposed Solution

### Grid State Tracking

Add runtime grid state tracking to know which tiles have been placed:

```typescript
interface GridState {
  tiles: Map<string, PlacedTile>;  // coordinate -> tile
  playerPositions: Map<string, string>;  // playerId -> coordinate
}

interface PlacedTile {
  name: string;
  coordinate: { x: number; y: number };
  placedBy: string;
  placedTurn: number;
}
```

### Movement Validation for Grid Games

```typescript
case 'move': {
  if (state.config.board) {
    // Existing board validation
    const validStates = state.config.board.states || [];
    if (!validStates.includes(moveAction.target)) {
      errors.push(`Invalid move target "${moveAction.target}".`);
    }
  } else if (state.config.engine_mechanics?.grid) {
    // NEW: Grid validation
    const gridState = state.gridState || { tiles: new Map() };
    const validTiles = Array.from(gridState.tiles.keys());

    // Check if target is a placed tile
    if (!validTiles.includes(moveAction.target)) {
      errors.push(`Invalid move target "${moveAction.target}". Tile not placed on grid.`);
    }

    // Check adjacency based on grid config
    const gridConfig = state.config.engine_mechanics.grid;
    if (gridConfig.adjacency === 'orthogonal') {
      // Validate orthogonal adjacency
      const currentPos = gridState.playerPositions.get(playerId);
      if (!isOrthogonallyAdjacent(currentPos, moveAction.target, gridState)) {
        errors.push(`Cannot move to "${moveAction.target}". Not adjacent to current position.`);
      }
    }
  }
  break;
}
```

### Place Location Action

Track placed tiles when location cards are played:

```typescript
case 'place_location': {
  const placeAction = action as PlaceLocationAction;

  // Validate placement position
  if (state.config.engine_mechanics?.grid) {
    const gridState = state.gridState || initGridState(state.config);

    // Check adjacency requirement
    if (!isValidPlacement(placeAction.position, gridState)) {
      errors.push(`Cannot place at ${placeAction.position}. Must be adjacent to existing tile.`);
    }

    // Record the placement
    gridState.tiles.set(placeAction.position, {
      name: placeAction.card,
      coordinate: parseCoordinate(placeAction.position),
      placedBy: playerId,
      placedTurn: state.turn
    });
  }
  break;
}
```

## Implementation Details

### New Types

```typescript
// engine/src/types.ts

interface GridConfig {
  type: 'infinite' | 'bounded';
  starting_tile: string;
  adjacency: 'orthogonal' | 'diagonal' | 'hexagonal';
  bounds?: { width: number; height: number };
}

interface GridState {
  tiles: Record<string, PlacedTile>;
  playerPositions: Record<string, string>;
  origin: string;
}

interface PlacedTile {
  name: string;
  x: number;
  y: number;
  placedBy: string;
  turn: number;
  effects?: CardEffect[];
}
```

### Coordinate System

Use string coordinates for simplicity:

```typescript
// "0,0" is origin
// "1,0" is one tile east
// "0,1" is one tile north

function parseCoordinate(coord: string): { x: number; y: number } {
  const [x, y] = coord.split(',').map(Number);
  return { x, y };
}

function isOrthogonallyAdjacent(from: string, to: string): boolean {
  const f = parseCoordinate(from);
  const t = parseCoordinate(to);
  const dx = Math.abs(f.x - t.x);
  const dy = Math.abs(f.y - t.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}
```

### Game State Changes

Add `gridState` to persisted game state:

```typescript
interface GameState {
  // existing fields...
  gridState?: GridState;
}
```

### Files to Modify

1. `engine/src/types.ts` - Add grid types
2. `engine/src/game.ts` - Add grid validation in `validateAction()`
3. `engine/src/game.ts` - Track placements in `executeAction()`
4. `engine/src/game.ts` - Initialize grid in `initGame()`

## Migration

### RULES.md Changes

Games using grid mechanics should update placement actions:

```yaml
# Before
engine_mechanics:
  grid:
    type: "infinite"
    starting_tile: "origin"
    adjacency: "orthogonal"

# After (no change needed - engine will track automatically)
```

### Action Format Changes

Placement actions need coordinates:

```json
// Before
{ "type": "play_card", "card": "Forest Clearing" }

// After
{ "type": "place_location", "card": "Forest Clearing", "position": "1,0" }
```

Or auto-placement with adjacency hint:

```json
{ "type": "place_location", "card": "Forest Clearing", "adjacent_to": "0,0" }
```

## Testing

1. Unit test: Valid orthogonal move
2. Unit test: Invalid diagonal move (orthogonal grid)
3. Unit test: Move to non-existent tile
4. Unit test: Place tile at valid position
5. Unit test: Place tile at invalid position (not adjacent)
6. Integration test: Full game with tile placement and movement

## Open Questions

1. Should players see the full grid or only explored areas?
2. How to handle coordinate input in natural language ("move north")?
3. Should movement reveal hidden information about tiles?
4. How to represent grid state to player agents?

---

*Proposal created based on AAOTE playtest findings*
