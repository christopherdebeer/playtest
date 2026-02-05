/**
 * Resources Core Mechanic
 *
 * Defines the foundational resource domain hooks that resource-related leaf mechanics implement.
 * Any mechanic that works with resources should declare `requires: ['resources']` and implement
 * the hooks defined here.
 *
 * This mechanic is always enabled. Core resource services fire these hooks
 * and only mechanics that declare `requires: ['resources']` receive them.
 *
 * Defined hooks:
 * - onResourceGained: After resources are added (merge)
 * - onResourceSpent: After resources are spent (merge)
 * - onBeforeResourceGain: Before gaining resources, can block/modify (blocking)
 * - onBeforeResourceSpend: Before spending resources, can block/modify (blocking)
 */

import { MechanicHooks, HookContext, StateChanges } from '../types.js';

// ============ Payload types for resources-defined hooks ============

export interface ResourceGainedPayload {
  /** Resource that was gained */
  resource: string;
  /** Amount gained (always positive) */
  amount: number;
  /** Amount before the gain */
  previousAmount: number;
  /** Amount after the gain */
  newAmount: number;
}

export interface ResourceSpentPayload {
  /** Resource that was spent */
  resource: string;
  /** Amount spent (always positive) */
  amount: number;
  /** Amount before spending */
  previousAmount: number;
  /** Amount after spending */
  newAmount: number;
}

export interface BeforeResourceGainPayload {
  /** Resource being gained */
  resource: string;
  /** Amount requested to gain (always positive) */
  amount: number;
  /** Current amount before gain */
  currentAmount: number;
}

export interface BeforeResourceSpendPayload {
  /** Resource being spent */
  resource: string;
  /** Amount requested to spend (always positive) */
  amount: number;
  /** Current amount before spend */
  currentAmount: number;
}

// ============ Typed interface for dependents ============

/**
 * Hook methods defined by the resources core mechanic.
 * Mechanics that declare `requires: ['resources']` can implement these.
 *
 * Use intersection typing for type safety:
 * ```typescript
 * const myMechanic: MechanicHooks & ResourcesHooks = { ... };
 * ```
 */
export interface ResourcesHooks {
  onResourceGained?(ctx: HookContext, payload: ResourceGainedPayload): StateChanges | null;
  onResourceSpent?(ctx: HookContext, payload: ResourceSpentPayload): StateChanges | null;
  onBeforeResourceGain?(ctx: HookContext, payload: BeforeResourceGainPayload): { blocked?: boolean; blockReason?: string; amount?: number } | null;
  onBeforeResourceSpend?(ctx: HookContext, payload: BeforeResourceSpendPayload): { blocked?: boolean; blockReason?: string; amount?: number } | null;
}

// ============ The mechanic itself ============

export const resourcesMechanic: MechanicHooks = {
  slug: 'resources',
  name: 'Resources Core',

  defines: {
    onBeforeResourceGain: {
      description: 'Before gaining resources. Can modify amount or block.',
      resolution: 'blocking',
    },
    onBeforeResourceSpend: {
      description: 'Before spending resources. Can modify amount or block.',
      resolution: 'blocking',
    },
    onResourceGained: {
      description: 'After resources are gained.',
      resolution: 'merge',
    },
    onResourceSpent: {
      description: 'After resources are spent.',
      resolution: 'merge',
    },
  },
};
