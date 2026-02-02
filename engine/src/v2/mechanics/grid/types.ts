/**
 * Grid Mechanic Types
 *
 * Handles tile-based grids with placement and movement.
 */

import { BaseAction, BaseEffect, EffectDuration } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GridConfig {
  type: 'infinite' | 'fixed';
  width?: number; // For fixed grids
  height?: number;
  adjacency: 'orthogonal' | 'diagonal' | 'all'; // 4, 4, or 8 directions
  startingTile?: TileDefinition;
  requireConnection?: boolean; // Must new tiles connect to existing?
}

export interface TileDefinition {
  id: string;
  name: string;
  terrain?: string;
  effect?: TileEffect;
  connections?: number; // Number of connections allowed
  entryRequirements?: string[]; // Items needed to enter
}

export interface TileEffect {
  type: string;
  value?: number;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface GridGameState {
  tiles: Record<string, PlacedTile>; // Key: "x,y"
  blockedTiles: Record<string, BlockedInfo>; // Temporarily blocked tiles
}

export interface PlacedTile {
  x: number;
  y: number;
  tile: TileDefinition;
  placedBy?: string;
  placedAt?: string;
}

export interface BlockedInfo {
  blockedBy: string;
  expiresAt?: string;
  turnsRemaining?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface GridPlayerState {
  position: Position;
  visitedTiles: string[]; // List of "x,y" keys
  hidden?: boolean; // Is position hidden from others?
}

export interface Position {
  x: number;
  y: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type GridAction = MoveGridAction | PlaceTileAction;

export interface MoveGridAction extends BaseAction {
  type: 'move_grid';
  target: Position;
}

export interface PlaceTileAction extends BaseAction {
  type: 'place_tile';
  position: Position;
  cardName: string; // Name of location card from player's hand
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type GridEffect =
  | TeleportEffect
  | BlockTileEffect
  | RevealPositionsEffect
  | HidePositionEffect;

export interface TeleportEffect extends BaseEffect {
  type: 'teleport';
  destination: Position; // Using 'destination' to avoid BaseEffect.target conflict
}

export interface BlockTileEffect extends BaseEffect {
  type: 'block_tile';
  blockPosition: Position;
  blockDuration: number;
}

export interface RevealPositionsEffect extends BaseEffect {
  type: 'reveal_positions';
}

export interface HidePositionEffect extends BaseEffect {
  type: 'hide_position';
  hideDuration?: number;
}
