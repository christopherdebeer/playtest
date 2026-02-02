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
import { cardTypeRulesMechanic } from './card-type-rules.js';
import { takeThatMechanic } from './take-that.js';
import { loseATurnMechanic } from './lose-a-turn.js';

// Register all extracted mechanics
mechanicRegistry.register(actionPointsMechanic);
mechanicRegistry.register(incomeMechanic);
mechanicRegistry.register(handManagementMechanic);
mechanicRegistry.register(cardTypeRulesMechanic);
mechanicRegistry.register(takeThatMechanic);
mechanicRegistry.register(loseATurnMechanic);

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
