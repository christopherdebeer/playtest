/**
 * Playtest Engine v2
 *
 * Lean, pluggable game engine with composable mechanics.
 */

// Core exports
export * from './core/index.js';

// Mechanics exports
export * from './mechanics/index.js';

// Convenience re-exports
export { GameEngine, loadState, saveState, logEvent } from './core/state.js';
export { MechanicRegistry, registry } from './core/registry.js';
export { defineMechanic } from './core/mechanic.js';
export { createDefaultRegistry, registerAllMechanics } from './mechanics/index.js';
