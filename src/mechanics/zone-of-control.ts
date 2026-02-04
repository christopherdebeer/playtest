/**
 * Zone of Control Mechanic
 *
 * Units project control over adjacent spaces, blocking enemy movement.
 *
 * Config:
 *   zone_of_control:
 *     zoc_range: number          # How far ZoC extends (default 1 = adjacent)
 *     blocks_movement: boolean   # Whether ZoC blocks movement
 *     must_stop: boolean         # Must stop when entering ZoC
 *     must_attack: boolean       # Must attack unit projecting ZoC
 */

import { MechanicHooks, HookContext, MoveContext, MoveHookResult, StateChanges, CombatModifierResult, CombatHookContext } from './types.js';
import { hasZoneOfControl, getControlledZones } from './core/combat.js';

interface ZoneOfControlConfig {
  zoc_range?: number;
  blocks_movement?: boolean;
  must_stop?: boolean;
  must_attack?: boolean;
}

interface CombatUnit {
  id: string;
  position?: string;
  owner: string;
}

export const zoneOfControlMechanic: MechanicHooks = {
  slug: 'zone-of-control',
  name: 'Zone of Control',

  configSchema: {
    type: 'object',
    description: 'Units project control over adjacent spaces',
    properties: {
      zoc_range: {
        type: 'number',
        description: 'How far ZoC extends',
        default: 1
      },
      blocks_movement: {
        type: 'boolean',
        description: 'Whether ZoC blocks enemy movement',
        default: true
      },
      must_stop: {
        type: 'boolean',
        description: 'Must stop when entering enemy ZoC',
        default: true
      },
      must_attack: {
        type: 'boolean',
        description: 'Must attack unit projecting ZoC',
        default: false
      }
    }
  },

  onBeforeMove(ctx: MoveContext): MoveHookResult | null {
    const config = ctx.config.engine_mechanics?.zone_of_control as ZoneOfControlConfig | undefined;
    if (!config) return null;

    if (!config.blocks_movement) return null;

    // Check if target is in enemy ZoC
    const enemies = Object.keys(ctx.state.players).filter(pid => pid !== ctx.playerId);

    for (const enemyId of enemies) {
      if (hasZoneOfControl(ctx.state, enemyId, ctx.target)) {
        if (config.must_stop) {
          // Allow move but mark that player entered ZoC
          return {
            blocked: false
          };
        }

        if (config.blocks_movement) {
          return {
            blocked: true,
            blockReason: `Cannot move to ${ctx.target} - blocked by enemy zone of control`
          };
        }
      }
    }

    return null;
  },

  onAfterMove(ctx: { state: import('../types/game.js').GameState; playerId: string; previousState: string; newState: string; config: import('../types/game.js').GameConfig }): StateChanges | null {
    const config = ctx.config.engine_mechanics?.zone_of_control as ZoneOfControlConfig | undefined;
    if (!config) return null;

    // Check if player entered enemy ZoC
    const enemies = Object.keys(ctx.state.players).filter(pid => pid !== ctx.playerId);

    for (const enemyId of enemies) {
      if (hasZoneOfControl(ctx.state, enemyId, ctx.newState)) {
        return {
          playerStateChanges: {
            [ctx.playerId]: {
              inEnemyZoC: true,
              zocProjector: enemyId
            } as { inEnemyZoC: boolean; zocProjector: string }
          }
        };
      }
    }

    return null;
  },

  getDefenseModifiers(ctx: CombatHookContext): CombatModifierResult[] {
    const config = ctx.config.engine_mechanics?.zone_of_control as ZoneOfControlConfig | undefined;
    if (!config) return [];

    // Units defending in their ZoC get a bonus
    const defenderUnits = (ctx.state.shared.units as Record<string, CombatUnit[]>)?.[ctx.defenderId] ?? [];
    const combatLocation = ctx.territory;

    if (!combatLocation) return [];

    // Check if defender has ZoC over combat location
    const defenderHasZoC = defenderUnits.some(unit =>
      unit.position === combatLocation
    );

    if (defenderHasZoC) {
      return [{
        modifier: 1,
        reason: 'Defending in zone of control',
        source: 'zone-of-control'
      }];
    }

    return [];
  }
};
