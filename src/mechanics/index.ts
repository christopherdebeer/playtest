/**
 * Mechanics Index - Registers all extracted mechanics
 *
 * Import this module to initialize the mechanic registry with
 * all available mechanics.
 */

import { mechanicRegistry } from './registry.js';
import { actionPointsMechanic } from './action-points.js';

// Register all extracted mechanics
mechanicRegistry.register(actionPointsMechanic);

// Re-export for convenience
export { mechanicRegistry, applyStateChanges } from './registry.js';
export type {
  MechanicHooks,
  HookContext,
  ValidationResult,
  StateChanges,
  PlayerInitResult
} from './types.js';
