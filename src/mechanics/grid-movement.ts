/**
 * Grid Movement Mechanic
 *
 * Tile-based movement on a grid of placed locations.
 * Players can only move to locations that have been placed.
 *
 * Hooks used:
 * - preValidateAction: Validate move target is a placed location
 * - onExecuteAction: Handle move execution with location effects
 * - getAvailableActions: Expose available move targets
 * - describeAction: Describe move action
 */

import {
  MechanicHooks,
  HookContext,
  ValidationResult,
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription,
  StateChanges,
  ActionSchema
} from './types.js';
import { GameAction, Card } from '../types/game.js';
import { getCardsState } from './core/index.js';
import { createEffectIntervention, hasMechanicAgent } from './core/effect-dispatcher.js';

interface GridConfig {
  type?: string;
  starting_tile?: string;
  adjacency?: string;
}

interface LocationCardDef {
  name: string;
  type: string;
  effect?: {
    type: string;
    value?: number;
    description?: string;
  };
}

/**
 * Look up a location card definition from the deck config.
 */
function getLocationCardDef(config: { deck?: unknown[] }, locationName: string): LocationCardDef | undefined {
  const deckConfig = (config.deck || []) as LocationCardDef[];
  return deckConfig.find(
    (cardDef) => cardDef.name === locationName && cardDef.type === 'location'
  );
}

/**
 * Get valid move targets from the current position.
 */
function getValidMoveTargets(ctx: HookContext): string[] {
  const gridConfig = ctx.config.engine_mechanics?.grid as GridConfig | undefined;
  if (!gridConfig) return [];

  const placedLocations = (ctx.state.shared.placedLocations as string[]) || [];
  const startingTile = gridConfig.starting_tile || 'origin';
  const allLocations = [startingTile, ...placedLocations];

  // Filter out current location
  return allLocations.filter(loc => loc !== ctx.player.state);
}

export const gridMovementMechanic: MechanicHooks = {
  slug: 'grid-movement',
  name: 'Grid Movement',
  requires: ['board'],

  getActionSchema(action: GameAction): ActionSchema | null {
    if (action.type !== 'move') return null;
    return {
      required: ['target'],
      fields: {
        target: { type: 'string' },
      },
    };
  },

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate move actions
    if (action.type !== 'move') return null;

    const gridConfig = ctx.config.engine_mechanics?.grid as GridConfig | undefined;
    if (!gridConfig) return null;

    const moveAction = action as { target: string };
    const placedLocations = (ctx.state.shared.placedLocations as string[]) || [];
    const startingTile = gridConfig.starting_tile || 'origin';
    const validLocations = [startingTile, ...placedLocations];

    if (!validLocations.includes(moveAction.target)) {
      return {
        valid: false,
        error: `Invalid move target "${moveAction.target}". You can only move to placed locations. Valid: ${validLocations.join(', ')}`
      };
    }

    return { valid: true };
  },

  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const { action, player, playerId, state, config } = ctx;

    if (action.type !== 'move') return null;

    const gridConfig = config.engine_mechanics?.grid as GridConfig | undefined;
    if (!gridConfig) return null;

    const moveAction = action as { target: string };
    const previousState = player.state;
    const effectsApplied: string[] = [];
    let cardsDrawn = 0;

    // Look up location card definition and apply effects
    const locationCard = getLocationCardDef(config, moveAction.target);
    if (locationCard?.effect) {
      const effect = locationCard.effect;

      // Handle structural effects that map 1:1 to engine primitives
      switch (effect.type) {
        case 'draw_on_enter': {
          // Draw cards when entering this location (universal primitive: drawFromDeck)
          const drawCount = effect.value ?? 1;
          const handLimit = (config.engine_mechanics?.hand_limit as number) ?? Infinity;

          const playerHand = player.hand ?? [];
          const cardsState = getCardsState(state);
          if (playerHand.length < handLimit && cardsState.deck.length > 0) {
            const actualDrawCount = Math.min(
              drawCount,
              handLimit - playerHand.length,
              cardsState.deck.length
            );
            if (actualDrawCount > 0) {
              const drawnCards = cardsState.deck.splice(0, actualDrawCount);
              playerHand.push(...drawnCards);
              cardsDrawn = drawnCards.length;
              effectsApplied.push(`${locationCard.name}: Drew ${cardsDrawn} card${cardsDrawn !== 1 ? 's' : ''}`);
            }
          }
          break;
        }

        case 'safe':
          // No special effect — truly a no-op
          break;

        default: {
          // All other location effects are game-specific.
          // Defer to mechanic agent if registered, otherwise log as informational.
          if (hasMechanicAgent(state)) {
            createEffectIntervention(state, 'location', effect.type, playerId, playerId, {
              effectValue: effect.value,
              locationName: moveAction.target,
              cardDescription: effect.description,
              context: `${playerId} entered location "${moveAction.target}" (${locationCard.name}). Location effect "${effect.type}" needs implementation. Description: ${effect.description || effect.type}`
            });
          } else if (effect.description) {
            effectsApplied.push(`${locationCard.name}: ${effect.description}`);
          }
        }
      }
    }

    // Track visited locations for Explorer objective
    if (!player.visitedLocations) {
      player.visitedLocations = [];
    }
    if (!player.visitedLocations.includes(moveAction.target)) {
      player.visitedLocations.push(moveAction.target);
    }

    // Update player's state
    player.state = moveAction.target;

    return {
      handled: true,
      stateChanges: {
        playerStateChanges: {
          [playerId]: {
            state: moveAction.target,
            visitedLocations: player.visitedLocations
          }
        }
      },
      advanceTurn: false, // Let action points mechanic control turn advancement
      checkWin: true, // Check win after move (e.g., Explorer objective)
      logMessage: 'player_moved',
      logData: {
        target: moveAction.target,
        previousState,
        locationEffects: effectsApplied,
        cardsDrawn,
        visitedCount: player.visitedLocations.length
      }
    };
  },

  getAvailableActions(ctx: HookContext): AvailableAction[] {
    const gridConfig = ctx.config.engine_mechanics?.grid as GridConfig | undefined;
    if (!gridConfig) return [];

    const validTargets = getValidMoveTargets(ctx);

    const examples = validTargets.slice(0, 2).map(target => ({
      type: 'move',
      target
    } as unknown as GameAction));

    return [{
      action: { type: 'move', target: validTargets[0] || '' } as unknown as GameAction,
      priority: 50,
      category: 'movement',
      enabled: validTargets.length > 0 ? undefined : false,
      reason: validTargets.length === 0 ? 'No valid move targets from current position' : undefined,
      description: 'Move to a placed location on the grid',
      required: { target: 'The location to move to' },
      optional: { reasoning: 'Explanation of your move choice' },
      examples,
      targets: validTargets,
    }];
  },

  describeAction(action: GameAction): ActionDescription | null {
    if (action.type !== 'move') return null;

    const moveAction = action as { target: string };
    return {
      type: 'move',
      label: 'Move',
      description: `Move to a location on the grid.${moveAction.target ? ` Target: ${moveAction.target}` : ''}`,
      examples: ['move target:"Ancient Ruins"', 'move target:"Forest Clearing"']
    };
  }
};
