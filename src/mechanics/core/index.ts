/**
 * Core Mechanics - Foundational services other mechanics depend on
 *
 * These are "trunk" mechanics that implement primitive operations
 * for cards, hands, and piles. Leaf mechanics hook into these.
 */

// Card pile operations (deck, discard)
export {
  drawFromDeck,
  addToDiscard,
  peekDiscard,
  hasCardsAvailable,
  getDeckSize,
  getDiscardSize,
  type DrawContext,
  type DrawResult
} from './card-piles.js';

// Hand operations
export {
  addToHand,
  removeFromHandByIndex,
  removeFromHandByName,
  removeCardsFromHand,
  findInHand,
  getHandSize,
  getHand,
  type AddToHandResult
} from './hand.js';

// Resource operations
export {
  spendResource,
  addResource,
  setResource,
  getResource,
  hasResource,
  getAllResources,
  getResourceNames,
  type ResourceChangeResult
} from './resources.js';

// Effect operations
export {
  addEffect,
  removeEffect,
  clearEffects,
  decrementEffectDurations,
  hasEffect,
  getEffect,
  getEffects,
  getEffectsByType,
  getEffectValue,
  isBlocked,
  extendEffectDuration,
  type EffectOperationResult
} from './effects.js';

// Board operations
export {
  getBoardState,
  setBoardState,
  getBoardStates,
  getStartingState,
  isValidState,
  getValidMoveTargets,
  getValidMoveTargetsForPlayer,
  isValidMove,
  getEdge,
  getMoveProbability,
  getPlayersAtState,
  hasBoard,
  getEdges,
  type MoveResult
} from './board.js';

// Turn operations
export {
  getCurrentPlayer,
  getTurnOrder,
  isPlayersTurn,
  getCurrentRound,
  getTurnNumber,
  getCurrentPlayerIndex,
  getNextPlayer,
  getPreviousPlayer,
  isLastTurnOfRound,
  getPlayerCount,
  getActivePlayers,
  isPlayerActive,
  getOpponents,
  getActiveOpponents,
  isOnlyOnePlayerRemaining,
  getLastRemainingPlayer,
  advanceTurn,
  setCurrentPlayer,
  skipTurn,
  getTurnInfo,
  // Dynamic turn order (Phase 3)
  setTurnOrder,
  shuffleTurnOrder,
  reverseTurnOrder,
  movePlayerInOrder,
  removeFromTurnOrder,
  addToTurnOrder,
  applyDynamicTurnOrder,
  sortTurnOrderByProperty,
  createSnakeDraftOrder
} from './turns.js';

// Visibility operations (Phase 4)
export {
  getVisibleStateForPlayer,
  canPlayerSeeInfo,
  revealInfo,
  getKnownRole,
  recordKnownRole,
  hasHiddenRole,
  getHiddenRole,
  setHiddenRole,
  getPlayersWithRole,
  redactPlayerState,
  redactSharedState,
  isSameTeam,
  type InfoType,
  type PlayerKnowledge,
  type VisibilityOperationResult
} from './visibility.js';

// Dice operations (Phase 2)
export {
  rollDice,
  rollSingleDie,
  rollD6,
  rollForMovement,
  rollCheck,
  rollWithAdvantage,
  rollWithDisadvantage,
  rollExploding,
  countSuccesses,
  parseDiceNotation,
  rollFromNotation,
  type DiceRollResult,
  type DiceRollOptions
} from './dice.js';

// Social operations (Phase 5)
export {
  startVoting,
  castVote,
  getActiveVotingSession,
  getVotingSession,
  hasVoted,
  getPendingVoters,
  isVotingComplete,
  getVotingResult,
  completeVoting,
  getVoteCounts,
  clearCompletedVotes,
  validateVoteAction,
  type Vote,
  type VotingSession,
  type VotingConfig,
  type VotingResult
} from './social.js';
