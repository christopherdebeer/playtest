/**
 * Memory Mechanic
 *
 * Players must remember revealed information that is then hidden again.
 *
 * Config:
 *   memory:
 *     reveal_duration: number
 *     memory_types: string[]
 *     can_take_notes: boolean
 */

import { MechanicHooks, PlayerInitContext, PlayerInitResult, RevealContext, VisibilityContext, TurnStartContext, StateChanges } from './types.js';
import { MemoryMechanicConfig, PlayerMemory, MemoryEntry } from '../types/game.js';

export const memoryMechanic: MechanicHooks = {
  slug: 'memory',
  name: 'Memory',

  configSchema: {
    type: 'object',
    description: 'Memory-based mechanics where revealed info is hidden again',
    properties: {
      reveal_duration: {
        type: 'number',
        description: 'How many turns revealed info stays accessible',
        default: 3
      },
      memory_types: {
        type: 'array',
        description: 'Types of information affected by memory',
        items: { type: 'string' }
      },
      can_take_notes: {
        type: 'boolean',
        description: 'Whether players can record permanent notes',
        default: false
      }
    }
  },

  initPlayerState(ctx: PlayerInitContext): PlayerInitResult | null {
    const config = ctx.config.engine_mechanics?.memory;
    if (!config) return null;

    return {
      memory: {
        entries: [],
        notes: {}
      } as PlayerMemory
    };
  },

  onReveal(ctx: RevealContext): StateChanges | null {
    const config = ctx.config.engine_mechanics?.memory;
    if (!config) return null;

    const revealDuration = config.reveal_duration ?? 3;
    const currentTurn = ctx.state.turnNumber;

    const targetPlayers = ctx.toPlayerIds === 'all'
      ? Object.keys(ctx.state.players)
      : ctx.toPlayerIds;

    const playerChanges: Record<string, Partial<{ memory: PlayerMemory }>> = {};

    for (const playerId of targetPlayers) {
      const player = ctx.state.players[playerId];
      const currentMemory = player.memory ?? { entries: [], notes: {} };

      const newEntry: MemoryEntry = {
        infoType: ctx.targetInfo,
        value: ctx.state.players[ctx.revealingPlayerId],
        revealedTurn: currentTurn,
        expiresOnTurn: currentTurn + revealDuration,
        source: ctx.revealingPlayerId
      };

      playerChanges[playerId] = {
        memory: {
          entries: [...currentMemory.entries, newEntry],
          notes: currentMemory.notes
        }
      };
    }

    return { playerStateChanges: playerChanges as Record<string, Partial<{ memory: PlayerMemory }>> };
  },

  canSeeInfo(ctx: VisibilityContext, infoType: string, targetPlayerId?: string): boolean | undefined {
    const config = ctx.config.engine_mechanics?.memory;
    if (!config) return undefined;

    if (config.memory_types && !config.memory_types.includes(infoType)) {
      return undefined;
    }

    const memory = ctx.state.players[ctx.viewerPlayerId].memory;
    if (!memory) return undefined;

    const currentTurn = ctx.state.turnNumber;

    const hasMemory = memory.entries.some(entry =>
      entry.infoType === infoType &&
      (!targetPlayerId || entry.source === targetPlayerId) &&
      entry.expiresOnTurn > currentTurn
    );

    if (hasMemory) {
      return true;
    }

    if (config.memory_types?.includes(infoType)) {
      return false;
    }

    return undefined;
  },

  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    const config = ctx.config.engine_mechanics?.memory;
    if (!config) return null;

    const memory = ctx.player.memory;
    if (!memory) return null;

    const currentTurn = ctx.state.turnNumber;
    const validEntries = memory.entries.filter(entry => entry.expiresOnTurn > currentTurn);

    if (validEntries.length === memory.entries.length) return null;

    return {
      playerStateChanges: {
        [ctx.playerId]: {
          memory: {
            entries: validEntries,
            notes: memory.notes
          }
        }
      }
    };
  }
};
