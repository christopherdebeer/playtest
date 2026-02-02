/**
 * Hidden Roles Mechanic Types
 *
 * Handles secret role/objective assignment for traitor games.
 */

import { BaseAction, BaseEffect } from '../../core/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface HiddenRolesConfig {
  roles: RoleDefinition[];
  distribution: 'random' | 'fixed';  // How roles are assigned
  revealOnDeath?: boolean;           // Show role when eliminated
  allowVoluntaryReveal?: boolean;    // Can players reveal themselves
}

export interface RoleDefinition {
  id: string;
  name: string;
  type: 'regular' | 'traitor' | 'special';
  count: number;                     // How many of this role exist
  winCondition?: string;             // Description of win condition
  ability?: RoleAbility;             // Special power
  revealTrigger?: string;            // What causes forced reveal
}

export interface RoleAbility {
  type: string;
  description: string;
  usesPerGame?: number;
  passive?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface HiddenRolesGameState {
  availableRoles: string[];          // Role IDs not yet assigned
  revealedPlayers: string[];         // Players whose roles are public
  traitorRevealed: boolean;          // Has any traitor been exposed
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface HiddenRolesPlayerState {
  roleId: string;
  roleName: string;
  roleType: 'regular' | 'traitor' | 'special';
  isRevealed: boolean;
  winCondition: string;
  abilityUsesRemaining?: number;
  objectiveProgress?: Record<string, number>;  // Track progress toward objectives
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export type HiddenRolesAction =
  | RevealRoleAction
  | UseAbilityAction
  | DeclareVictoryAction;

export interface RevealRoleAction extends BaseAction {
  type: 'reveal_role';
}

export interface UseAbilityAction extends BaseAction {
  type: 'use_ability';
  targetPlayer?: string;
}

export interface DeclareVictoryAction extends BaseAction {
  type: 'declare_victory';
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type HiddenRolesEffect =
  | ForceRevealEffect
  | PeekRoleEffect
  | UpdateProgressEffect;

export interface ForceRevealEffect extends BaseEffect {
  type: 'force_reveal';
  reason: string;
}

export interface PeekRoleEffect extends BaseEffect {
  type: 'peek_role';
  viewingPlayer: string;
}

export interface UpdateProgressEffect extends BaseEffect {
  type: 'update_progress';
  objectiveKey: string;
  delta: number;
}
