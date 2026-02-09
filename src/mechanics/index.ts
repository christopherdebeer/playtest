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
import { cardMatchingMechanic } from './card-matching.js';
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

// Phase 1: Additional Auction mechanics
import { auctionSealedBidMechanic } from './auction-sealed-bid.js';
import { auctionOnceAroundMechanic } from './auction-once-around.js';

// Phase 2: Additional Dice mechanics (die-icon-resolution)
import { dieIconResolutionMechanic } from './die-icon-resolution.js';

// Phase 3: Additional Turn Order mechanics
import { turnOrderAuctionMechanic } from './turn-order-auction.js';
import { turnOrderClaimMechanic } from './turn-order-claim.js';
import { turnOrderTimeTrackMechanic } from './turn-order-time-track.js';
import { turnOrderRoleMechanic } from './turn-order-role.js';

// Phase 4: Additional Visibility mechanics (deduction, memory, clues, asymmetric)
import { deductionMechanic } from './deduction.js';
import { memoryMechanic } from './memory.js';
import { targetedCluesMechanic } from './targeted-clues.js';
import { rolesAsymmetricInfoMechanic } from './roles-asymmetric-info.js';

// Phase 5: Additional Social mechanics
import { playerJudgeMechanic } from './player-judge.js';
import { iCutYouChooseMechanic } from './i-cut-you-choose.js';
import { briberyMechanic } from './bribery.js';

// Phase 6: Combat System mechanics
import { criticalHitsMechanic } from './critical-hits.js';
import { zoneOfControlMechanic } from './zone-of-control.js';
import { ratioCRTMechanic } from './ratio-crt.js';
import { forceCommitmentMechanic } from './force-commitment.js';
import { areaImpulseMechanic } from './area-impulse.js';
import { chitPullSystemMechanic } from './chit-pull-system.js';
import { secretUnitDeploymentMechanic } from './secret-unit-deployment.js';
import { killStealMechanic } from './kill-steal.js';

// Win condition mechanics
import {
  reachStateWinMechanic,
  scoreThresholdWinMechanic,
  emptyHandWinMechanic,
  eliminationWinMechanic,
  timeoutWinnerMechanic,
  raceWinMechanic,
  suddenDeathMechanic,
  endGameBonusesMechanic,
  kingOfTheHillMechanic,
  victoryPointsAsResourceMechanic,
  highestLowestScoringMechanic,
  finaleEndingMechanic,
  singleLoserGameMechanic
} from './win-conditions/index.js';

// Core mechanics (always available)
import { passMechanic } from './core/pass.js';
import { cardsMechanic } from './core/cards.js';
import { resourcesMechanic } from './core/resources-mechanic.js';
import { diceMechanic } from './core/dice-mechanic.js';
import { boardMechanic } from './core/board-mechanic.js';
import { effectsMechanic } from './core/effects-mechanic.js';
import { visibilityMechanic } from './core/visibility-mechanic.js';
import { socialMechanic } from './core/social-mechanic.js';

// Effect handling mechanics
import { locationEffectsMechanic } from './location-effects.js';
import { placedCardEffectsMechanic } from './placed-card-effects.js';
import { effectDispatcherMechanic } from './core/effect-dispatcher.js';

// Phase 7: Worker Placement mechanics
import { workersMechanic } from './core/workers-mechanic.js';
import { workerPlacementMechanic } from './worker-placement.js';

// Phase 6: Combat Core mechanic
import { combatMechanic } from './core/combat-mechanic.js';

// Multi-category expansion mechanics
import { differentWorkerTypesMechanic } from './worker-placement-different-worker-types.js';
import { auctionDutchMechanic } from './auction-dutch.js';
import { simultaneousActionSelectionMechanic } from './simultaneous-action-selection.js';
import { marketMechanic } from './market.js';
import { tableauBuildingMechanic } from './tableau-building.js';
import { actionProgrammingMechanic } from './action-programming.js';
import { cooperativeActionsMechanic } from './cooperative-actions.js';

// Economic mechanics
import { contractsMechanic } from './contracts.js';
import { loansMechanic } from './loans.js';

// Player elimination process mechanic
import { playerEliminationProcessMechanic } from './player-elimination-process.js';

// Phase 8: New mechanics expansion
import { buildingMechanic } from './core/building-mechanic.js';
import { actionDraftingMechanic } from './action-drafting.js';
import { actionEventMechanic } from './action-event.js';
import { actionRetrievalMechanic } from './action-retrieval.js';
import { bettingAndBluffingMechanic } from './betting-and-bluffing.js';
import { cooperativeGameMechanic } from './cooperative-game.js';
import { alliancesMechanic } from './alliances.js';
import { networkAndRouteBuildingMechanic } from './network-and-route-building.js';
import { techTreesMechanic } from './tech-trees.js';
import { areaMajorityInfluenceMechanic } from './area-majority-influence.js';
import { teamBasedGameMechanic } from './team-based-game.js';
import { variableSetUpMechanic } from './variable-set-up.js';
import { advantageTokenMechanic } from './advantage-token.js';
import { randomProductionMechanic } from './random-production.js';
import { followMechanic } from './follow.js';
import { storytellingMechanic } from './storytelling.js';
import { tilePlacementMechanic } from './tile-placement.js';

// Experimental mechanics
import { freeplayMechanic } from './freeplay.js';

// Phase 15: Category completers
import { semiCooperativeGameMechanic } from './semi-cooperative-game.js';
import { actionQueueMechanic } from './action-queue.js';
import { actionTimerMechanic } from './action-timer.js';
import { workerPlacementDiceWorkersMechanic } from './worker-placement-dice-workers.js';
import { rolePlayingMechanic } from './role-playing.js';
import { actingMechanic } from './acting.js';
import { prisonersDilemmaMechanic } from './prisoners-dilemma.js';
import { inductionMechanic } from './induction.js';
import { patternRecognitionMechanic } from './pattern-recognition.js';
import { questionsAndAnswersMechanic } from './questions-and-answers.js';
import { elapsedRealTimeEndingMechanic } from './elapsed-real-time-ending.js';

// Phase 15: Economic mechanics
import { stockHoldingMechanic } from './stock-holding.js';
import { investmentMechanic } from './investment.js';
import { commoditySpeculationMechanic } from './commodity-speculation.js';
import { ownershipMechanic } from './ownership.js';

// Phase 15: Building mechanics
import { patternBuildingMechanic } from './pattern-building.js';
import { connectionsMechanic } from './connections.js';
import { enclosureMechanic } from './enclosure.js';
import { mapAdditionMechanic } from './map-addition.js';

// Phase 15: Auction mechanics
import { auctionCompensationMechanic } from './auction-compensation.js';
import { auctionFixedPlacementMechanic } from './auction-fixed-placement.js';
import { auctionMultipleLotMechanic } from './auction-multiple-lot.js';
import { auctionBiddingMechanic } from './auction-bidding.js';
import { auctionDutchPriorityMechanic } from './auction-dutch-priority.js';
import { auctionTurnOrderUntilPassMechanic } from './auction-turn-order-until-pass.js';

// Phase 15: Movement mechanics
import { hexagonGridMechanic } from './hexagon-grid.js';
import { rondelMechanic } from './rondel.js';
import { trackMovementMechanic } from './track-movement.js';
import { squareGridMechanic } from './square-grid.js';
import { gridCoverageMechanic } from './grid-coverage.js';

// Phase 15: Cards mechanics
import { meldingAndSplayingMechanic } from './melding-and-splaying.js';
import { commandCardsMechanic } from './command-cards.js';
import { deckConstructionMechanic } from './deck-construction.js';

// Phase 15: Other mechanics
import { pickUpAndDeliverMechanic } from './pick-up-and-deliver.js';
import { modularBoardMechanic } from './modular-board.js';
import { variablePhaseOrderMechanic } from './variable-phase-order.js';
import { tugOfWarMechanic } from './tug-of-war.js';
import { matchingMechanic } from './matching.js';
import { interruptsMechanic } from './interrupts.js';
import { scoreAndResetMechanic } from './score-and-reset.js';

// Register all extracted mechanics
mechanicRegistry.register(actionPointsMechanic);
mechanicRegistry.register(incomeMechanic);
mechanicRegistry.register(handManagementMechanic);
mechanicRegistry.register(cardTypeRulesMechanic);
mechanicRegistry.register(cardMatchingMechanic);
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

// Register Phase 1: Additional Auction mechanics
mechanicRegistry.register(auctionSealedBidMechanic);
mechanicRegistry.register(auctionOnceAroundMechanic);

// Register Phase 2: Additional Dice mechanics
mechanicRegistry.register(dieIconResolutionMechanic);

// Register Phase 3: Additional Turn Order mechanics
mechanicRegistry.register(turnOrderAuctionMechanic);
mechanicRegistry.register(turnOrderClaimMechanic);
mechanicRegistry.register(turnOrderTimeTrackMechanic);
mechanicRegistry.register(turnOrderRoleMechanic);

// Register Phase 4: Additional Visibility mechanics
mechanicRegistry.register(deductionMechanic);
mechanicRegistry.register(memoryMechanic);
mechanicRegistry.register(targetedCluesMechanic);
mechanicRegistry.register(rolesAsymmetricInfoMechanic);

// Register Phase 5: Additional Social mechanics
mechanicRegistry.register(playerJudgeMechanic);
mechanicRegistry.register(iCutYouChooseMechanic);
mechanicRegistry.register(briberyMechanic);

// Register Phase 6: Combat System mechanics
mechanicRegistry.register(criticalHitsMechanic);
mechanicRegistry.register(zoneOfControlMechanic);
mechanicRegistry.register(ratioCRTMechanic);
mechanicRegistry.register(forceCommitmentMechanic);
mechanicRegistry.register(areaImpulseMechanic);
mechanicRegistry.register(chitPullSystemMechanic);
mechanicRegistry.register(secretUnitDeploymentMechanic);
mechanicRegistry.register(killStealMechanic);

// Register win condition mechanics
mechanicRegistry.register(reachStateWinMechanic);
mechanicRegistry.register(scoreThresholdWinMechanic);
mechanicRegistry.register(emptyHandWinMechanic);
mechanicRegistry.register(eliminationWinMechanic);
mechanicRegistry.register(timeoutWinnerMechanic);
mechanicRegistry.register(raceWinMechanic);
mechanicRegistry.register(suddenDeathMechanic);
mechanicRegistry.register(endGameBonusesMechanic);
mechanicRegistry.register(kingOfTheHillMechanic);
mechanicRegistry.register(victoryPointsAsResourceMechanic);
mechanicRegistry.register(highestLowestScoringMechanic);
mechanicRegistry.register(finaleEndingMechanic);
mechanicRegistry.register(singleLoserGameMechanic);

// Register core mechanics (always available)
mechanicRegistry.register(cardsMechanic);
mechanicRegistry.register(resourcesMechanic);
mechanicRegistry.register(diceMechanic);
mechanicRegistry.register(boardMechanic);
mechanicRegistry.register(effectsMechanic);
mechanicRegistry.register(visibilityMechanic);
mechanicRegistry.register(socialMechanic);
mechanicRegistry.register(passMechanic);

// Register effect handling mechanics
mechanicRegistry.register(locationEffectsMechanic);
mechanicRegistry.register(placedCardEffectsMechanic);
// Effect dispatcher: catch-all for card effects not handled by specialized mechanics
mechanicRegistry.register(effectDispatcherMechanic);

// Register Phase 7: Worker Placement mechanics
mechanicRegistry.register(workersMechanic);
mechanicRegistry.register(workerPlacementMechanic);

// Register Phase 6: Combat Core mechanic
mechanicRegistry.register(combatMechanic);

// Register multi-category expansion mechanics
mechanicRegistry.register(differentWorkerTypesMechanic);
mechanicRegistry.register(auctionDutchMechanic);
mechanicRegistry.register(simultaneousActionSelectionMechanic);
mechanicRegistry.register(marketMechanic);
mechanicRegistry.register(tableauBuildingMechanic);
mechanicRegistry.register(actionProgrammingMechanic);
mechanicRegistry.register(cooperativeActionsMechanic);

// Register economic mechanics
mechanicRegistry.register(contractsMechanic);
mechanicRegistry.register(loansMechanic);

// Register player elimination process mechanic
mechanicRegistry.register(playerEliminationProcessMechanic);

// Register Phase 8: New mechanics expansion
mechanicRegistry.register(buildingMechanic);
mechanicRegistry.register(actionDraftingMechanic);
mechanicRegistry.register(actionEventMechanic);
mechanicRegistry.register(actionRetrievalMechanic);
mechanicRegistry.register(bettingAndBluffingMechanic);
mechanicRegistry.register(cooperativeGameMechanic);
mechanicRegistry.register(alliancesMechanic);
mechanicRegistry.register(networkAndRouteBuildingMechanic);
mechanicRegistry.register(techTreesMechanic);
mechanicRegistry.register(areaMajorityInfluenceMechanic);
mechanicRegistry.register(teamBasedGameMechanic);
mechanicRegistry.register(variableSetUpMechanic);
mechanicRegistry.register(advantageTokenMechanic);
mechanicRegistry.register(randomProductionMechanic);
mechanicRegistry.register(followMechanic);
mechanicRegistry.register(storytellingMechanic);
mechanicRegistry.register(tilePlacementMechanic);

// Register experimental mechanics
mechanicRegistry.register(freeplayMechanic);

// Register Phase 15: Category completers
mechanicRegistry.register(semiCooperativeGameMechanic);
mechanicRegistry.register(actionQueueMechanic);
mechanicRegistry.register(actionTimerMechanic);
mechanicRegistry.register(workerPlacementDiceWorkersMechanic);
mechanicRegistry.register(rolePlayingMechanic);
mechanicRegistry.register(actingMechanic);
mechanicRegistry.register(prisonersDilemmaMechanic);
mechanicRegistry.register(inductionMechanic);
mechanicRegistry.register(patternRecognitionMechanic);
mechanicRegistry.register(questionsAndAnswersMechanic);
mechanicRegistry.register(elapsedRealTimeEndingMechanic);

// Register Phase 15: Economic mechanics
mechanicRegistry.register(stockHoldingMechanic);
mechanicRegistry.register(investmentMechanic);
mechanicRegistry.register(commoditySpeculationMechanic);
mechanicRegistry.register(ownershipMechanic);

// Register Phase 15: Building mechanics
mechanicRegistry.register(patternBuildingMechanic);
mechanicRegistry.register(connectionsMechanic);
mechanicRegistry.register(enclosureMechanic);
mechanicRegistry.register(mapAdditionMechanic);

// Register Phase 15: Auction mechanics
mechanicRegistry.register(auctionCompensationMechanic);
mechanicRegistry.register(auctionFixedPlacementMechanic);
mechanicRegistry.register(auctionMultipleLotMechanic);
mechanicRegistry.register(auctionBiddingMechanic);
mechanicRegistry.register(auctionDutchPriorityMechanic);
mechanicRegistry.register(auctionTurnOrderUntilPassMechanic);

// Register Phase 15: Movement mechanics
mechanicRegistry.register(hexagonGridMechanic);
mechanicRegistry.register(rondelMechanic);
mechanicRegistry.register(trackMovementMechanic);
mechanicRegistry.register(squareGridMechanic);
mechanicRegistry.register(gridCoverageMechanic);

// Register Phase 15: Cards mechanics
mechanicRegistry.register(meldingAndSplayingMechanic);
mechanicRegistry.register(commandCardsMechanic);
mechanicRegistry.register(deckConstructionMechanic);

// Register Phase 15: Other mechanics
mechanicRegistry.register(pickUpAndDeliverMechanic);
mechanicRegistry.register(modularBoardMechanic);
mechanicRegistry.register(variablePhaseOrderMechanic);
mechanicRegistry.register(tugOfWarMechanic);
mechanicRegistry.register(matchingMechanic);
mechanicRegistry.register(interruptsMechanic);
mechanicRegistry.register(scoreAndResetMechanic);

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
