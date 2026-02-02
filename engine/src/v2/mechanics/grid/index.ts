/**
 * Grid Mechanic
 *
 * Handles tile-based grids with placement and movement.
 * Supports:
 * - Infinite or fixed-size grids
 * - Orthogonal or diagonal adjacency
 * - Tile placement expanding the world
 * - Movement between adjacent tiles
 * - Entry requirements (items needed)
 * - Position visibility/hiding
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  ActionContext,
  ExecutionResult,
  ActionAvailability,
  EffectContext,
  EffectResult,
  WinConditionResult,
  LogEvent,
  InitContext,
  ok,
  err,
  validResult,
  invalidResult,
} from '../../core/types.js';
import { Mechanic, MechanicRegistryView, JsonSchema, defineMechanic } from '../../core/mechanic.js';
import {
  GridConfig,
  GridGameState,
  GridPlayerState,
  GridAction,
  GridEffect,
  PlacedTile,
  Position,
  MoveGridAction,
  PlaceTileAction,
  TileDefinition,
  TeleportEffect,
  BlockTileEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function getAdjacentPositions(pos: Position, adjacency: 'orthogonal' | 'diagonal' | 'all'): Position[] {
  const positions: Position[] = [];

  // Orthogonal (N, S, E, W)
  if (adjacency === 'orthogonal' || adjacency === 'all') {
    positions.push(
      { x: pos.x, y: pos.y - 1 }, // North
      { x: pos.x, y: pos.y + 1 }, // South
      { x: pos.x + 1, y: pos.y }, // East
      { x: pos.x - 1, y: pos.y }  // West
    );
  }

  // Diagonal (NE, NW, SE, SW)
  if (adjacency === 'diagonal' || adjacency === 'all') {
    positions.push(
      { x: pos.x + 1, y: pos.y - 1 }, // NE
      { x: pos.x - 1, y: pos.y - 1 }, // NW
      { x: pos.x + 1, y: pos.y + 1 }, // SE
      { x: pos.x - 1, y: pos.y + 1 }  // SW
    );
  }

  return positions;
}

function isAdjacent(pos1: Position, pos2: Position, adjacency: 'orthogonal' | 'diagonal' | 'all'): boolean {
  const adjacent = getAdjacentPositions(pos1, adjacency);
  return adjacent.some(p => p.x === pos2.x && p.y === pos2.y);
}

function hasAdjacentTile(pos: Position, tiles: Record<string, PlacedTile>, adjacency: 'orthogonal' | 'diagonal' | 'all'): boolean {
  const adjacent = getAdjacentPositions(pos, adjacency);
  return adjacent.some(p => tiles[posKey(p.x, p.y)] !== undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const gridMechanic = defineMechanic<
  'grid',
  GridConfig,
  GridGameState,
  GridPlayerState,
  GridAction,
  GridEffect
>({
  slug: 'grid',
  version: '1.0.0',
  displayName: 'Grid',
  description: 'Tile-based grid with placement and movement',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<GridConfig, ValidationError[]> {
    const config = raw as GridConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Grid config is required' }]);
    }

    if (!config.type || !['infinite', 'fixed'].includes(config.type)) {
      errors.push({ path: 'type', message: 'type must be "infinite" or "fixed"' });
    }

    if (config.type === 'fixed') {
      if (!config.width || config.width < 1) {
        errors.push({ path: 'width', message: 'width is required for fixed grids' });
      }
      if (!config.height || config.height < 1) {
        errors.push({ path: 'height', message: 'height is required for fixed grids' });
      }
    }

    if (!config.adjacency || !['orthogonal', 'diagonal', 'all'].includes(config.adjacency)) {
      errors.push({ path: 'adjacency', message: 'adjacency must be "orthogonal", "diagonal", or "all"' });
    }

    if (errors.length > 0) return err(errors);
    return ok({
      ...config,
      requireConnection: config.requireConnection ?? true,
    });
  },

  validateConfig(config: GridConfig, registry: MechanicRegistryView): ValidationError[] {
    return [];
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['type', 'adjacency'],
      properties: {
        type: { type: 'string', enum: ['infinite', 'fixed'] },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        adjacency: { type: 'string', enum: ['orthogonal', 'diagonal', 'all'] },
        startingTile: { type: 'object' },
        requireConnection: { type: 'boolean', default: true },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: GridConfig, context: InitContext): GridGameState {
    const tiles: Record<string, PlacedTile> = {};

    // Place starting tile at origin
    if (config.startingTile) {
      tiles['0,0'] = {
        x: 0,
        y: 0,
        tile: config.startingTile,
      };
    }

    return { tiles, blockedTiles: {} };
  },

  initPlayerState(config: GridConfig, playerId: string, context: InitContext): GridPlayerState {
    return {
      position: { x: 0, y: 0 }, // All players start at origin
      visitedTiles: ['0,0'],
      hidden: false,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly GridAction['type'][] {
    return ['move_grid', 'place_tile'] as const;
  },

  validateAction(
    ctx: ActionContext<GridGameState, GridPlayerState>,
    action: GridAction
  ): ValidationResult {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<GridConfig>('grid')!;

    switch (action.type) {
      case 'move_grid': {
        const moveAction = action as MoveGridAction;
        const target = moveAction.target;
        const targetKey = posKey(target.x, target.y);

        // Check if target tile exists
        const targetTile = gameState.tiles[targetKey];
        if (!targetTile) {
          return invalidResult([{
            code: 'NO_TILE',
            message: `No tile at position (${target.x}, ${target.y})`,
            suggestion: 'Place a tile first using place_tile action',
          }]);
        }

        // Check if adjacent
        if (!isAdjacent(playerState.position, target, config.adjacency)) {
          return invalidResult([{
            code: 'NOT_ADJACENT',
            message: `Position (${target.x}, ${target.y}) is not adjacent`,
          }]);
        }

        // Check if blocked
        if (gameState.blockedTiles[targetKey]) {
          return invalidResult([{
            code: 'TILE_BLOCKED',
            message: `Tile at (${target.x}, ${target.y}) is blocked`,
          }]);
        }

        // Check entry requirements
        const entryReqs = targetTile.tile.entryRequirements;
        if (entryReqs && entryReqs.length > 0) {
          // Check if player has required items (via cards mechanic)
          const cardsState = ctx.getMechanicPlayerState<{ hand: Array<{ name: string }> }>('cards', ctx.playerId);
          if (cardsState) {
            const itemNames = cardsState.hand.map(c => c.name);
            const missing = entryReqs.filter(req => !itemNames.includes(req));
            if (missing.length > 0) {
              return invalidResult([{
                code: 'MISSING_ITEMS',
                message: `Missing required items: ${missing.join(', ')}`,
              }]);
            }
          }
        }

        return validResult();
      }

      case 'place_tile': {
        const placeAction = action as PlaceTileAction;
        const pos = placeAction.position;
        const posKey_ = posKey(pos.x, pos.y);

        // Check if position already has a tile
        if (gameState.tiles[posKey_]) {
          return invalidResult([{
            code: 'TILE_EXISTS',
            message: `Tile already exists at (${pos.x}, ${pos.y})`,
          }]);
        }

        // Check bounds for fixed grids
        if (config.type === 'fixed') {
          if (pos.x < 0 || pos.x >= config.width! || pos.y < 0 || pos.y >= config.height!) {
            return invalidResult([{
              code: 'OUT_OF_BOUNDS',
              message: `Position (${pos.x}, ${pos.y}) is outside grid bounds`,
            }]);
          }
        }

        // Check connection requirement
        if (config.requireConnection) {
          const hasTiles = Object.keys(gameState.tiles).length > 0;
          if (hasTiles && !hasAdjacentTile(pos, gameState.tiles, config.adjacency)) {
            return invalidResult([{
              code: 'NOT_CONNECTED',
              message: 'New tiles must connect to existing tiles',
            }]);
          }
        }

        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<GridGameState, GridPlayerState>,
    action: GridAction
  ): ExecutionResult<GridGameState, GridPlayerState> {
    const { gameState, playerState } = ctx;

    switch (action.type) {
      case 'move_grid': {
        const moveAction = action as MoveGridAction;
        const target = moveAction.target;
        const targetKey = posKey(target.x, target.y);
        const targetTile = gameState.tiles[targetKey];

        const newVisited = playerState.visitedTiles.includes(targetKey)
          ? playerState.visitedTiles
          : [...playerState.visitedTiles, targetKey];

        const effects: GridEffect[] = [];

        // Trigger tile entry effect
        if (targetTile.tile.effect) {
          const effect = targetTile.tile.effect;
          if (effect.type === 'draw_on_enter') {
            effects.push({ type: 'draw_cards', count: effect.value || 1 } as any);
          }
        }

        return {
          success: true,
          message: `Moved to ${targetTile.tile.name} at (${target.x}, ${target.y})`,
          playerStateChanges: {
            [ctx.playerId]: {
              position: target,
              visitedTiles: newVisited,
            },
          },
          effects,
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'player_moved',
              player: ctx.playerId,
              data: { from: playerState.position, to: target, tile: targetTile.tile.name },
            },
          ],
          nextTurn: { type: 'same_player' }, // Movement doesn't end turn
        };
      }

      case 'place_tile': {
        const placeAction = action as PlaceTileAction;
        const pos = placeAction.position;
        const posKey_ = posKey(pos.x, pos.y);

        // Create tile definition (in real implementation, this would come from player's hand)
        const tile: TileDefinition = {
          id: placeAction.tileId,
          name: placeAction.tileId,
        };

        const newTiles = {
          ...gameState.tiles,
          [posKey_]: {
            x: pos.x,
            y: pos.y,
            tile,
            placedBy: ctx.playerId,
            placedAt: ctx.timestamp,
          },
        };

        return {
          success: true,
          message: `Placed ${tile.name} at (${pos.x}, ${pos.y})`,
          gameStateChanges: { tiles: newTiles },
          events: [
            {
              timestamp: ctx.timestamp,
              event: 'tile_placed',
              player: ctx.playerId,
              data: { position: pos, tile: tile.name },
            },
          ],
          nextTurn: { type: 'same_player' }, // Placement doesn't end turn
        };
      }

      default:
        return {
          success: false,
          message: `Unknown action: ${(action as any).type}`,
          events: [],
          nextTurn: { type: 'same_player' },
        };
    }
  },

  getAvailableActions(
    ctx: ActionContext<GridGameState, GridPlayerState>
  ): ActionAvailability<GridAction>[] {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<GridConfig>('grid')!;
    const actions: ActionAvailability<GridAction>[] = [];

    // Movement options
    const adjacentPositions = getAdjacentPositions(playerState.position, config.adjacency);
    const movablePositions = adjacentPositions.filter(pos => {
      const key = posKey(pos.x, pos.y);
      return gameState.tiles[key] && !gameState.blockedTiles[key];
    });

    if (movablePositions.length > 0) {
      actions.push({
        type: 'move_grid',
        enabled: true,
        description: `Move to an adjacent tile`,
        examples: movablePositions.slice(0, 3).map(pos => ({
          type: 'move_grid' as const,
          target: pos,
        })),
      });
    } else {
      actions.push({
        type: 'move_grid',
        enabled: false,
        description: 'No adjacent tiles to move to',
        reason: 'Place tiles to create destinations',
        examples: [],
      });
    }

    // Tile placement options
    const validPlacements = getAdjacentPositions(playerState.position, config.adjacency)
      .filter(pos => {
        const key = posKey(pos.x, pos.y);
        if (gameState.tiles[key]) return false;
        if (config.type === 'fixed') {
          if (pos.x < 0 || pos.x >= config.width! || pos.y < 0 || pos.y >= config.height!) {
            return false;
          }
        }
        return true;
      });

    if (validPlacements.length > 0) {
      actions.push({
        type: 'place_tile',
        enabled: true,
        description: 'Place a location tile from your hand',
        examples: validPlacements.slice(0, 2).map(pos => ({
          type: 'place_tile' as const,
          position: pos,
          tileId: 'location_from_hand',
        })),
      });
    }

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly GridEffect['type'][] {
    return ['teleport', 'block_tile', 'reveal_positions', 'hide_position'] as const;
  },

  applyEffect(
    ctx: EffectContext<GridGameState, GridPlayerState>,
    effect: GridEffect
  ): EffectResult<GridGameState, GridPlayerState> {
    const { gameState, playerState } = ctx;

    switch (effect.type) {
      case 'teleport': {
        const teleportEffect = effect as TeleportEffect;
        const dest = teleportEffect.destination;
        const destKey = posKey(dest.x, dest.y);

        // Check if destination exists
        if (!gameState.tiles[destKey]) {
          return {
            events: [{
              timestamp: ctx.timestamp,
              event: 'teleport_failed',
              player: ctx.playerId,
              data: { reason: 'No tile at destination' },
            }],
          };
        }

        const newVisited = playerState.visitedTiles.includes(destKey)
          ? playerState.visitedTiles
          : [...playerState.visitedTiles, destKey];

        return {
          playerStateChanges: {
            [ctx.playerId]: {
              position: dest,
              visitedTiles: newVisited,
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'player_teleported',
            player: ctx.playerId,
            data: { to: dest },
          }],
        };
      }

      case 'block_tile': {
        const blockEffect = effect as BlockTileEffect;
        const pos = blockEffect.blockPosition;
        const key = posKey(pos.x, pos.y);

        return {
          gameStateChanges: {
            blockedTiles: {
              ...gameState.blockedTiles,
              [key]: {
                blockedBy: ctx.playerId,
                turnsRemaining: blockEffect.blockDuration,
              },
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'tile_blocked',
            data: { position: pos, duration: blockEffect.blockDuration },
          }],
        };
      }

      case 'reveal_positions': {
        // This effect reveals all player positions to the viewer
        // The information is exposed through filterPlayerStateForViewer
        return {
          events: [{
            timestamp: ctx.timestamp,
            event: 'positions_revealed',
            player: ctx.playerId,
          }],
        };
      }

      case 'hide_position': {
        return {
          playerStateChanges: {
            [ctx.playerId]: { hidden: true },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'position_hidden',
            player: ctx.playerId,
          }],
        };
      }

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<GridGameState, GridPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<GridGameState, GridPlayerState> {
    if (boundary !== 'turn') return { events: [] };

    const { gameState } = ctx;
    const events: LogEvent[] = [];
    const updatedBlocked: Record<string, any> = {};

    // Decrement block durations
    for (const [key, info] of Object.entries(gameState.blockedTiles)) {
      if (info.turnsRemaining !== undefined) {
        const remaining = info.turnsRemaining - 1;
        if (remaining > 0) {
          updatedBlocked[key] = { ...info, turnsRemaining: remaining };
        } else {
          events.push({
            timestamp: ctx.timestamp,
            event: 'tile_unblocked',
            data: { position: parseKey(key) },
          });
        }
      } else {
        updatedBlocked[key] = info;
      }
    }

    return {
      gameStateChanges: { blockedTiles: updatedBlocked },
      events,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: GridGameState,
    playerId: string
  ): Record<string, unknown> {
    // Grid state is public knowledge
    return {
      tiles: state.tiles,
      blockedTiles: state.blockedTiles,
    };
  },

  filterPlayerStateForViewer(
    state: GridPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    // Own position is always visible to self
    if (viewerId === ownerId) {
      return {
        position: state.position,
        visitedTiles: state.visitedTiles,
        hidden: state.hidden,
      };
    }

    // Hidden players don't reveal position
    if (state.hidden) {
      return {
        hidden: true,
        visitedCount: state.visitedTiles.length,
      };
    }

    return {
      position: state.position,
      visitedCount: state.visitedTiles.length,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<GridGameState, GridPlayerState>
  ): WinConditionResult | null {
    // Grid mechanic doesn't have its own win condition
    // Win conditions are typically handled by game config
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'player_moved',
      'tile_placed',
      'tile_blocked',
      'tile_unblocked',
      'player_teleported',
      'teleport_failed',
      'positions_revealed',
      'position_hidden',
    ];
  },
});

export default gridMechanic;
export * from './types.js';
