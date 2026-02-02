/**
 * Turn Effects Mechanic Types
 *
 * Handles turn order modifications: skip, reverse, draw-N
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnEffectsConfig {
  allowStacking?: boolean; // Can draw-2 stack on draw-2?
  reverseIn2Player?: 'skip' | 'reverse'; // Reverse acts as skip in 2-player
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnEffectsGameState {
  direction: 'clockwise' | 'counterclockwise';
  pendingDraws: number; // Accumulated draw cards to be applied
  skipNextPlayer: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnEffectsPlayerState {
  mustDraw: number; // Cards this player must draw before playing
  isSkipped: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type TurnEffectsAction = AcceptDrawsAction;

export interface AcceptDrawsAction extends BaseAction {
  type: 'accept_draws';
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type TurnEffectsEffect =
  | SkipEffect
  | ReverseEffect
  | DrawNEffect
  | ClearPendingEffect;

export interface SkipEffect extends BaseEffect {
  type: 'skip';
  count?: number; // How many players to skip (default: 1)
}

export interface ReverseEffect extends BaseEffect {
  type: 'reverse';
}

export interface DrawNEffect extends BaseEffect {
  type: 'draw_n';
  count: number;
  stackable?: boolean;
}

export interface ClearPendingEffect extends BaseEffect {
  type: 'clear_pending';
}
