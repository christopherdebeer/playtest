/**
 * Hidden Objectives Mechanic (Proposal 012)
 *
 * Assigns secret objectives to players from the game's `objectives` config.
 * Unlike hidden-roles which uses engine_mechanics.hidden_roles config,
 * this mechanic reads from the top-level `objectives` array in RULES.md.
 *
 * Used by games like AAOTE where each player has a unique secret win condition.
 *
 * Hooks used:
 * - initPlayerState: Assign objectives at game start (shuffled)
 * - getVisibleState: Hide objectives from other players
 *
 * Config required:
 * - objectives: Array of objective definitions at top level
 * - engine_mechanics.hidden_objectives.deal_at_start: true
 */

import {
  MechanicHooks,
  VisibilityContext,
  VisibleState,
  PlayerInitContext,
  PlayerInitResult
} from './types.js';
import { PlayerState, GameConfig } from '../types/game.js';

/**
 * Objective definition from game config
 */
export interface ObjectiveDefinition {
  /** Objective name (e.g., "The Explorer", "The Enemy") */
  name: string;
  /** Number of this objective in the deck */
  count: number;
  /** Objective type (e.g., "regular", "enemy", "traitor") */
  type: string;
  /** Win condition description */
  condition: string;
}

/**
 * Hidden objectives config
 */
export interface HiddenObjectivesConfig {
  /** Deal objectives at game start */
  deal_at_start?: boolean;
  /** Reveal objective when completed */
  reveal_on_completion?: boolean;
}

/**
 * Fisher-Yates shuffle with deterministic seed based on player count
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const hiddenObjectivesMechanic: MechanicHooks = {
  slug: 'hidden-objectives',
  name: 'Hidden Objectives',
  requires: ['visibility'],

  configSchema: {
    type: 'object',
    description: 'Hidden objectives system for secret win conditions',
    properties: {
      deal_at_start: { type: 'boolean', description: 'Deal objectives at game start' },
      reveal_on_completion: { type: 'boolean', description: 'Reveal objective when completed' }
    }
  },

  /**
   * Initialize player state with a secret objective
   *
   * Uses shared._objectiveAssignments for coordinated assignment across players.
   * On first call (playerIndex 0), builds the assignment list and stores it in shared state.
   * Subsequent calls pick from the pre-built list.
   *
   * For traitor games, guarantees at least 1 enemy-type objective is included.
   */
  initPlayerState(ctx: PlayerInitContext): PlayerInitResult | null {
    const objectives = (ctx.config as { objectives?: ObjectiveDefinition[] }).objectives;
    const hiddenConfig = ctx.config.engine_mechanics?.hidden_objectives as HiddenObjectivesConfig | undefined;

    if (!objectives || !hiddenConfig?.deal_at_start) {
      return null;
    }

    // Use shared state for coordinated assignment
    const shared = ctx.shared as Record<string, unknown> | undefined;
    let assignments = shared?._objectiveAssignments as ObjectiveDefinition[] | undefined;

    if (!assignments) {
      // First player - build and store the assignment list
      // Build objective pool (expand counts)
      const objectivePool: ObjectiveDefinition[] = [];
      for (const obj of objectives) {
        for (let i = 0; i < (obj.count || 1); i++) {
          objectivePool.push(obj);
        }
      }

      // Get total player count from shared state (set by game.ts before player init)
      const totalPlayers = (shared?._numPlayers as number) || Object.keys(ctx.existingPlayers).length + 1;

      // For traitor games, guarantee at least 1 enemy-type objective
      const isTraitorGame = !!ctx.config.engine_mechanics?.traitor_game;
      const enemyObjectives = objectivePool.filter(o => o.type === 'enemy' || o.type === 'traitor');
      const regularObjectives = objectivePool.filter(o => o.type !== 'enemy' && o.type !== 'traitor');

      let selected: ObjectiveDefinition[];
      if (isTraitorGame && enemyObjectives.length > 0 && objectivePool.length > totalPlayers) {
        // Guarantee 1 enemy, fill rest with shuffled regulars
        const shuffledRegulars = shuffleArray(regularObjectives);
        const shuffledEnemies = shuffleArray(enemyObjectives);
        selected = [shuffledEnemies[0], ...shuffledRegulars.slice(0, totalPlayers - 1)];
        selected = shuffleArray(selected); // Re-shuffle so enemy isn't always first
      } else {
        // Normal: shuffle all and take first N
        selected = shuffleArray(objectivePool).slice(0, Math.max(totalPlayers, objectivePool.length));
      }

      assignments = selected;
      if (shared) {
        shared._objectiveAssignments = assignments;
      }
    }

    // Assign based on player index
    const assigned = assignments[ctx.playerIndex];
    if (!assigned) {
      return null;
    }

    // Determine team based on objective type
    const isEnemy = assigned.type === 'enemy' || assigned.type === 'traitor';
    const team = isEnemy ? 'enemy' : 'regular';

    // Initialize knowledge - player knows their own objective
    const knowledge = {
      knownRoles: { [ctx.playerId]: assigned.name } as Record<string, string>,
      knownPositions: {} as Record<string, string>,
      revealed: {} as Record<string, unknown>
    };

    return {
      objective: assigned,
      hiddenRole: assigned.name,  // Use objective name as hiddenRole for compatibility
      team,
      knowledge
    };
  },

  /**
   * Filter visible state to hide other players' objectives
   */
  getVisibleState(ctx: VisibilityContext): VisibleState | null {
    const hiddenConfig = ctx.config.engine_mechanics?.hidden_objectives as HiddenObjectivesConfig | undefined;
    if (!hiddenConfig) return null;

    const filteredPlayers: Record<string, Partial<PlayerState>> = {};
    const hiddenInfo: string[] = [];

    for (const [playerId, player] of Object.entries(ctx.state.players)) {
      // Always show full info for self
      if (playerId === ctx.viewerPlayerId) continue;

      // Hide objective from other players
      const filtered: Partial<PlayerState> = { ...player };
      if ((filtered as { objective?: ObjectiveDefinition }).objective) {
        delete (filtered as { objective?: ObjectiveDefinition }).objective;
        hiddenInfo.push(`${playerId}'s objective is hidden`);
      }

      filteredPlayers[playerId] = filtered;
    }

    if (hiddenInfo.length === 0) return null;

    return {
      players: filteredPlayers,
      visibilityMeta: {
        hiddenInfo
      }
    };
  }
};

export default hiddenObjectivesMechanic;
