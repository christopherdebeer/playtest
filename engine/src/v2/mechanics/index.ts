/**
 * Mechanics Index
 *
 * Exports all available mechanics and provides registration helpers.
 */

import { MechanicRegistry } from '../core/registry.js';
import { cardsMechanic } from './cards/index.js';
import { probabilityMechanic } from './probability/index.js';
import { actionPointsMechanic } from './action-points/index.js';
import { turnEffectsMechanic } from './turn-effects/index.js';
import { gridMechanic } from './grid/index.js';
import { deckStacksMechanic } from './deck-stacks/index.js';
import { tradingMechanic } from './trading/index.js';
import { hiddenRolesMechanic } from './hidden-roles/index.js';

// Export all mechanics
export { cardsMechanic } from './cards/index.js';
export { probabilityMechanic } from './probability/index.js';
export { actionPointsMechanic } from './action-points/index.js';
export { turnEffectsMechanic } from './turn-effects/index.js';
export { gridMechanic } from './grid/index.js';
export { deckStacksMechanic } from './deck-stacks/index.js';
export { tradingMechanic } from './trading/index.js';
export { hiddenRolesMechanic } from './hidden-roles/index.js';

// All built-in mechanics
export const allMechanics = [
  cardsMechanic,
  probabilityMechanic,
  actionPointsMechanic,
  turnEffectsMechanic,
  gridMechanic,
  deckStacksMechanic,
  tradingMechanic,
  hiddenRolesMechanic,
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
