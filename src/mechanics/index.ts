/**
 * Mechanics Index - Minimal stub.
 * All mechanic execution now routes through the Lean engine.
 * This file only re-exports the stub registry for game.ts compatibility.
 */

export { mechanicRegistry, applyStateChanges, getRegisteredMechanicsMetadata, getMechanicRequires } from './registry.js';
export type { MechanicValidationError, MechanicMetadata } from './registry.js';
export type {
  ValidationResult,
  StateChanges,
  ActionExecutionResult,
  AvailableAction,
  WinCheckResult,
  ActionSchema,
  HookContext
} from './types.js';
export { isMechanicEnabled, hasExplicitConfig, setDependencyResolver } from './types.js';
