/**
 * Board Core Mechanic
 *
 * Defines the foundational board/movement domain hooks that board-related leaf mechanics implement.
 * Any mechanic that works with board positions or movement should declare `requires: ['board']`
 * and implement the hooks defined here.
 *
 * This mechanic is always enabled. It fires domain-specific hooks alongside the existing
 * global board hooks (onBeforeMove, onAfterMove) as part of the strangler fig migration.
 *
 * Defined hooks:
 * - onPlayerMoved: After a player moves to a new state (merge)
 * - onBeforePlayerMove: Before moving, can block/modify target (blocking)
 */

import { MechanicHooks, HookContext, StateChanges } from '../types.js';

// ============ Payload types for board-defined hooks ============

export interface PlayerMovedPayload {
  /** State the player moved from */
  fromState: string;
  /** State the player moved to */
  toState: string;
}

export interface BeforePlayerMovePayload {
  /** Current state */
  fromState: string;
  /** Requested target state */
  toState: string;
}

// ============ Typed interface for dependents ============

/**
 * Hook methods defined by the board core mechanic.
 * Mechanics that declare `requires: ['board']` can implement these.
 */
export interface BoardHooks {
  onPlayerMoved?(ctx: HookContext, payload: PlayerMovedPayload): StateChanges | null;
  onBeforePlayerMove?(ctx: HookContext, payload: BeforePlayerMovePayload): { blocked?: boolean; blockReason?: string; target?: string } | null;
}

// ============ The mechanic itself ============

export const boardMechanic: MechanicHooks = {
  slug: 'board',
  name: 'Board Core',

  defines: {
    onBeforePlayerMove: {
      description: 'Before a player moves. Can modify target or block.',
      resolution: 'blocking',
    },
    onPlayerMoved: {
      description: 'After a player moves to a new board state.',
      resolution: 'merge',
    },
  },
};
