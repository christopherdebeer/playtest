/**
 * Mechanics Index - Registers all extracted mechanics
 *
 * Import this module to initialize the mechanic registry with
 * all available mechanics.
 */

import { mechanicRegistry } from './registry.js';
import { actionPointsMechanic } from './action-points.js';
import { incomeMechanic } from './income.js';
import { handManagementMechanic } from './hand-management.js';

// Register all extracted mechanics
mechanicRegistry.register(actionPointsMechanic);
mechanicRegistry.register(incomeMechanic);
mechanicRegistry.register(handManagementMechanic);

// Re-export for convenience
export { mechanicRegistry, applyStateChanges } from './registry.js';
export type {
  MechanicHooks,
  HookContext,
  TurnStartContext,
  ValidationResult,
  StateChanges,
  PlayerInitResult
} from './types.js';
