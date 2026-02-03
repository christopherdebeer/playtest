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
import { gridMovementMechanic } from './grid-movement.js';
import { placeLocationMechanic } from './place-location.js';
import { boardStateMechanic } from './board-state.js';
import { placeCardMechanic } from './place-card.js';
import { tradingMechanic } from './trading.js';
import { openDraftingMechanic } from './open-drafting.js';
import { setCollectionMechanic } from './set-collection.js';
import { pushYourLuckMechanic } from './push-your-luck.js';
import { auctionEnglishMechanic } from './auction-english.js';
import { variablePlayerPowersMechanic } from './variable-player-powers.js';

// Register all extracted mechanics
mechanicRegistry.register(actionPointsMechanic);
mechanicRegistry.register(incomeMechanic);
mechanicRegistry.register(handManagementMechanic);
mechanicRegistry.register(cardTypeRulesMechanic);
mechanicRegistry.register(takeThatMechanic);
mechanicRegistry.register(loseATurnMechanic);
mechanicRegistry.register(gridMovementMechanic);
mechanicRegistry.register(placeLocationMechanic);
mechanicRegistry.register(boardStateMechanic);
mechanicRegistry.register(placeCardMechanic);
mechanicRegistry.register(tradingMechanic);
mechanicRegistry.register(openDraftingMechanic);
mechanicRegistry.register(setCollectionMechanic);
mechanicRegistry.register(pushYourLuckMechanic);
mechanicRegistry.register(auctionEnglishMechanic);
mechanicRegistry.register(variablePlayerPowersMechanic);

// Re-export for convenience
export { mechanicRegistry, applyStateChanges } from './registry.js';
export type {
  MechanicHooks,
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
  // Core operation hook types
  DrawContext,
  DrawHookResult,
  AfterDrawContext,
  DiscardContext,
  HandAddContext,
  HandAddHookResult,
  HandRemoveContext
} from './types.js';
