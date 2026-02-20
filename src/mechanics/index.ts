/**
 * Mechanics Index - Lean-first architecture
 *
 * All game mechanics are now executed via the Lean 4 formal verification engine.
 * The TypeScript engine is pure I/O orchestration; Lean computes state transitions.
 *
 * Two mechanics remain:
 * - lean-executor: Delegates all action execution to the Lean binary
 * - lean-verifier: Validates moves against formally verified rules
 */

import { mechanicRegistry } from './registry.js';

// Lean formal verification & execution
import { leanExecutorMechanic } from './lean-executor.js';
import { leanVerifierMechanic } from './lean-verifier.js';

// Register Lean execution engine (handles all action execution via the Lean binary)
mechanicRegistry.register(leanExecutorMechanic);

// Register Lean formal verification (validates moves against proven rules)
mechanicRegistry.register(leanVerifierMechanic);

// Re-export for convenience
export { mechanicRegistry, applyStateChanges, getRegisteredMechanicsMetadata, getMechanicRequires } from './registry.js';
export type { MechanicValidationError, MechanicMetadata } from './registry.js';
export type {
  MechanicHooks,
  MechanicConfigSchema,
  HookDefinition,
  HookContext,
  TurnStartContext,
  TurnEndContext,
  PlayerInitContext,
  ValidationResult,
  StateChanges,
  PlayerInitResult,
  // Win condition types
  WinCheckContext,
  WinCheckResult,
  // Action execution & registration types
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription,
  // Core operation hook types
  DrawContext,
  DrawHookResult,
  AfterDrawContext,
  DiscardContext,
  HandAddContext,
  HandAddHookResult,
  HandRemoveContext,
  // Visibility system types (Phase 4)
  VisibilityContext,
  RevealContext,
  VisibleState,
  // Dice system types (Phase 2)
  DiceRollContext,
  AfterRollContext,
  DiceRollHookResult,
  // Turn order types (Phase 3)
  TurnOrderContext,
  TurnOrderResult,
  PassPriorityResult,
  // Agnosticism types
  SharedStateInitContext,
  SharedStateInitResult,
  EffectApplicationContext,
  EffectApplicationResult,
  ActionSchema,
  // Combat system types (Phase 6)
  CombatHookContext,
  CombatModifierResult,
  CombatHookResult,
  CombatCasualties
} from './types.js';
