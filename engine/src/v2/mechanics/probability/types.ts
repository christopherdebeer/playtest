/**
 * Probability Mechanic Types
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ProbabilityConfig {
  board: BoardDefinition;
  startState?: string;
  victoryState?: string;
  allowBoosts?: boolean;
  maxBoost?: number;
  minProbability?: number;
}

export interface BoardDefinition {
  states: string[];
  edges: EdgeDefinition[];
}

export interface EdgeDefinition {
  from: string | string[];
  to: string | string[];
  probability: number;
  bidirectional?: boolean;
}

// Internal normalized edge
export interface NormalizedEdge {
  from: string;
  to: string;
  probability: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ProbabilityGameState {
  board: {
    states: string[];
    edges: NormalizedEdge[];
    adjacency: Record<string, NormalizedEdge[]>;
  };
  placedEffects: PlacedEffect[];
}

export interface PlacedEffect {
  id: string;
  state: string;
  effect: ProbabilityModifierEffect;
  placedBy: string;
  targetMode: 'owner' | 'opponents' | 'all';
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ProbabilityPlayerState {
  currentState: string;
  activeEffects: ActiveEffect[];
  moveHistory: string[];
}

export interface ActiveEffect {
  id: string;
  effect: ProbabilityModifierEffect;
  remainingTurns?: number;
  source: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ProbabilityAction = MoveAction | PlaceEffectAction;

export interface MoveAction extends BaseAction {
  type: 'move';
  target: string;
}

export interface PlaceEffectAction extends BaseAction {
  type: 'place_effect';
  state: string;
  effect: ProbabilityModifierEffect;
  targetMode: 'owner' | 'opponents' | 'all';
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type ProbabilityEffect =
  | ProbabilityBoostEffect
  | ProbabilityPenaltyEffect
  | AutoSuccessEffect
  | BlockMoveEffect;

export type ProbabilityModifierEffect =
  | ProbabilityBoostEffect
  | ProbabilityPenaltyEffect
  | AutoSuccessEffect
  | BlockMoveEffect;

export interface ProbabilityBoostEffect extends BaseEffect {
  type: 'probability_boost';
  value: number;
}

export interface ProbabilityPenaltyEffect extends BaseEffect {
  type: 'probability_penalty';
  value: number;
}

export interface AutoSuccessEffect extends BaseEffect {
  type: 'auto_success';
}

export interface BlockMoveEffect extends BaseEffect {
  type: 'block_move';
}
