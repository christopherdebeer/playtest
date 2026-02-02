/**
 * Mechanics Index
 *
 * Exports all available mechanics and provides registration helpers.
 */

import { MechanicRegistry } from '../core/registry.js';
import { cardsMechanic } from './cards/index.js';
import { probabilityMechanic } from './probability/index.js';

// Export all mechanics
export { cardsMechanic } from './cards/index.js';
export { probabilityMechanic } from './probability/index.js';

// All built-in mechanics
export const allMechanics = [
  cardsMechanic,
  probabilityMechanic,
];

/**
 * Register all built-in mechanics with a registry.
 */
export function registerAllMechanics(registry: MechanicRegistry): void {
  registry.registerAll(allMechanics);
}

/**
 * Create a registry with all built-in mechanics already registered.
 */
export function createDefaultRegistry(): MechanicRegistry {
  const registry = new MechanicRegistry();
  registerAllMechanics(registry);
  return registry;
}
