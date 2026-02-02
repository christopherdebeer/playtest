/**
 * Action Points Mechanic Types
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionPointsConfig {
  pointsPerTurn: number;
  actionCosts: Record<string, number>;
  rollover?: boolean;
  maxPoints?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionPointsGameState {
  // Global state if needed
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionPointsPlayerState {
  currentPoints: number;
  maxPoints: number;
  usedThisTurn: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ActionPointsAction = EndTurnAction;

export interface EndTurnAction extends BaseAction {
  type: 'end_turn';
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type ActionPointsEffect =
  | SpendPointsEffect
  | GainPointsEffect
  | ResetPointsEffect;

export interface SpendPointsEffect extends BaseEffect {
  type: 'spend_points';
  cost: number;
  actionType: string;
}

export interface GainPointsEffect extends BaseEffect {
  type: 'gain_points';
  amount: number;
}

export interface ResetPointsEffect extends BaseEffect {
  type: 'reset_points';
}
