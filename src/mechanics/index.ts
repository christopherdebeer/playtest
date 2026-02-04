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

// New mechanics (Phase 1 expansion)
import { closedDraftingMechanic } from './closed-drafting.js';
import { trickTakingMechanic } from './trick-taking.js';
import { movementPointsMechanic } from './movement-points.js';
import { automaticResourceGrowthMechanic } from './automatic-resource-growth.js';
import { eventsMechanic } from './events.js';
import { ladderClimbingMechanic } from './ladder-climbing.js';
import { oncePerGameAbilitiesMechanic } from './once-per-game-abilities.js';
import { chainingMechanic } from './chaining.js';
import { catchTheLeaderMechanic } from './catch-the-leader.js';
import { areaMovementMechanic } from './area-movement.js';
import { deckBuildingMechanic } from './deck-building.js';
import { multiUseCardsMechanic } from './multi-use-cards.js';
import { pointToPointMovementMechanic } from './point-to-point-movement.js';

// Phase 4: Visibility System mechanics
import { hiddenRolesMechanic } from './hidden-roles.js';
import { traitorGameMechanic } from './traitor-game.js';
import { hiddenVictoryPointsMechanic } from './hidden-victory-points.js';

// Phase 2: Dice System mechanics
import { diceRollingMechanic } from './dice-rolling.js';
import { rerollingAndLockingMechanic } from './re-rolling-and-locking.js';

// Phase 3: Dynamic Turn Order mechanics
import { turnOrderRandomMechanic } from './turn-order-random.js';
import { turnOrderStatBasedMechanic } from './turn-order-stat-based.js';
import { turnOrderProgressiveMechanic } from './turn-order-progressive.js';

// Phase 5: Voting & Social mechanics
import { votingMechanic } from './voting.js';
import { negotiationMechanic } from './negotiation.js';
import { communicationLimitsMechanic } from './communication-limits.js';

// Phase 2: Additional Dice mechanics
import { rollSpinAndMoveMechanic } from './roll-spin-and-move.js';
import { differentDiceMovementMechanic } from './different-dice-movement.js';

// Phase 3: Additional Turn Order mechanics
import { turnOrderPassOrderMechanic } from './turn-order-pass-order.js';

// Phase 4: Additional Visibility mechanics
import { hiddenMovementMechanic } from './hidden-movement.js';
import { hiddenObjectivesMechanic } from './hidden-objectives.js';

// Win condition mechanics
import {
  reachStateWinMechanic,
  scoreThresholdWinMechanic,
  emptyHandWinMechanic,
  eliminationWinMechanic,
  timeoutWinnerMechanic,
  raceWinMechanic,
  suddenDeathMechanic
} from './win-conditions/index.js';

// Core mechanics (always available)
import { passMechanic } from './core/pass.js';

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

// Register new mechanics (Phase 1 expansion)
mechanicRegistry.register(closedDraftingMechanic);
mechanicRegistry.register(trickTakingMechanic);
mechanicRegistry.register(movementPointsMechanic);
mechanicRegistry.register(automaticResourceGrowthMechanic);
mechanicRegistry.register(eventsMechanic);
mechanicRegistry.register(ladderClimbingMechanic);
mechanicRegistry.register(oncePerGameAbilitiesMechanic);
mechanicRegistry.register(chainingMechanic);
mechanicRegistry.register(catchTheLeaderMechanic);
mechanicRegistry.register(areaMovementMechanic);
mechanicRegistry.register(deckBuildingMechanic);
mechanicRegistry.register(multiUseCardsMechanic);
mechanicRegistry.register(pointToPointMovementMechanic);

// Register Phase 4: Visibility System mechanics
mechanicRegistry.register(hiddenRolesMechanic);
mechanicRegistry.register(traitorGameMechanic);
mechanicRegistry.register(hiddenVictoryPointsMechanic);

// Register Phase 2: Dice System mechanics
mechanicRegistry.register(diceRollingMechanic);
mechanicRegistry.register(rerollingAndLockingMechanic);

// Register Phase 3: Dynamic Turn Order mechanics
mechanicRegistry.register(turnOrderRandomMechanic);
mechanicRegistry.register(turnOrderStatBasedMechanic);
mechanicRegistry.register(turnOrderProgressiveMechanic);

// Register Phase 5: Voting & Social mechanics
mechanicRegistry.register(votingMechanic);
mechanicRegistry.register(negotiationMechanic);
mechanicRegistry.register(communicationLimitsMechanic);

// Register Phase 2: Additional Dice mechanics
mechanicRegistry.register(rollSpinAndMoveMechanic);
mechanicRegistry.register(differentDiceMovementMechanic);

// Register Phase 3: Additional Turn Order mechanics
mechanicRegistry.register(turnOrderPassOrderMechanic);

// Register Phase 4: Additional Visibility mechanics
mechanicRegistry.register(hiddenMovementMechanic);
mechanicRegistry.register(hiddenObjectivesMechanic);

// Register win condition mechanics
mechanicRegistry.register(reachStateWinMechanic);
mechanicRegistry.register(scoreThresholdWinMechanic);
mechanicRegistry.register(emptyHandWinMechanic);
mechanicRegistry.register(eliminationWinMechanic);
mechanicRegistry.register(timeoutWinnerMechanic);
mechanicRegistry.register(raceWinMechanic);
mechanicRegistry.register(suddenDeathMechanic);

// Register core mechanics (always available)
mechanicRegistry.register(passMechanic);

// Re-export for convenience
export { mechanicRegistry, applyStateChanges, getRegisteredMechanicsMetadata } from './registry.js';
export type { MechanicValidationError, MechanicMetadata } from './registry.js';
export type {
  MechanicHooks,
  MechanicConfigSchema,
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
  ActionSchema
} from './types.js';
