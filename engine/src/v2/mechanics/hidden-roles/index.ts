/**
 * Hidden Roles Mechanic
 *
 * Handles secret role/objective assignment for traitor games:
 * - Random or fixed role distribution
 * - Secret objectives per player
 * - Role reveal mechanics
 * - Victory declaration
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  ActionContext,
  ExecutionResult,
  ActionAvailability,
  EffectContext,
  EffectResult,
  WinConditionResult,
  LogEvent,
  InitContext,
  ok,
  err,
  validResult,
  invalidResult,
} from '../../core/types.js';
import { Mechanic, MechanicRegistryView, JsonSchema, defineMechanic } from '../../core/mechanic.js';
import {
  HiddenRolesConfig,
  HiddenRolesGameState,
  HiddenRolesPlayerState,
  HiddenRolesAction,
  HiddenRolesEffect,
  RoleDefinition,
  RevealRoleAction,
  UseAbilityAction,
  DeclareVictoryAction,
  ForceRevealEffect,
  PeekRoleEffect,
  UpdateProgressEffect,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function shuffleArray<T>(array: T[], random: () => number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function buildRolePool(roles: RoleDefinition[]): string[] {
  const pool: string[] = [];
  for (const role of roles) {
    for (let i = 0; i < role.count; i++) {
      pool.push(role.id);
    }
  }
  return pool;
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export const hiddenRolesMechanic = defineMechanic<
  'hidden-roles',
  HiddenRolesConfig,
  HiddenRolesGameState,
  HiddenRolesPlayerState,
  HiddenRolesAction,
  HiddenRolesEffect
>({
  slug: 'hidden-roles',
  version: '1.0.0',
  displayName: 'Hidden Roles',
  description: 'Secret role assignment for traitor and social deduction games',
  dependencies: [],
  conflicts: [],

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────

  parseConfig(raw: unknown): Result<HiddenRolesConfig, ValidationError[]> {
    const config = raw as HiddenRolesConfig;
    const errors: ValidationError[] = [];

    if (!config) {
      return err([{ message: 'Hidden roles config is required' }]);
    }

    if (!config.roles || !Array.isArray(config.roles) || config.roles.length === 0) {
      errors.push({ path: 'roles', message: 'At least one role must be defined' });
    } else {
      const ids = new Set<string>();
      for (const role of config.roles) {
        if (!role.id) {
          errors.push({ message: 'Role id is required' });
        } else if (ids.has(role.id)) {
          errors.push({ message: `Duplicate role id: ${role.id}` });
        }
        ids.add(role.id);

        if (!role.name) {
          errors.push({ path: `roles.${role.id}`, message: 'Role name is required' });
        }
        if (typeof role.count !== 'number' || role.count < 1) {
          errors.push({ path: `roles.${role.id}.count`, message: 'Role count must be positive' });
        }
      }
    }

    if (errors.length > 0) return err(errors);

    return ok({
      ...config,
      distribution: config.distribution ?? 'random',
      revealOnDeath: config.revealOnDeath ?? true,
      allowVoluntaryReveal: config.allowVoluntaryReveal ?? false,
    });
  },

  validateConfig(config: HiddenRolesConfig, registry: MechanicRegistryView): ValidationError[] {
    const errors: ValidationError[] = [];

    const totalRoles = config.roles.reduce((sum, r) => sum + r.count, 0);
    const playerCount = registry.getPlayerCount();

    if (totalRoles < playerCount) {
      errors.push({
        message: `Not enough roles (${totalRoles}) for ${playerCount} players`,
      });
    }

    return errors;
  },

  getConfigSchema(): JsonSchema {
    return {
      type: 'object',
      required: ['roles'],
      properties: {
        roles: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'type', 'count'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string', enum: ['regular', 'traitor', 'special'] },
              count: { type: 'number', minimum: 1 },
              winCondition: { type: 'string' },
              ability: { type: 'object' },
              revealTrigger: { type: 'string' },
            },
          },
        },
        distribution: { type: 'string', enum: ['random', 'fixed'], default: 'random' },
        revealOnDeath: { type: 'boolean', default: true },
        allowVoluntaryReveal: { type: 'boolean', default: false },
      },
    };
  },

  // ─────────────────────────────────────────────────────────────
  // State Initialization
  // ─────────────────────────────────────────────────────────────

  initGameState(config: HiddenRolesConfig, context: InitContext): HiddenRolesGameState {
    const rolePool = buildRolePool(config.roles);
    const shuffledRoles = config.distribution === 'random'
      ? shuffleArray(rolePool, context.random)
      : rolePool;

    // Assign roles to players, keep unused ones
    const usedCount = Math.min(shuffledRoles.length, context.playerCount);
    const availableRoles = shuffledRoles.slice(usedCount);

    return {
      availableRoles,
      revealedPlayers: [],
      traitorRevealed: false,
    };
  },

  initPlayerState(config: HiddenRolesConfig, playerId: string, context: InitContext): HiddenRolesPlayerState {
    const rolePool = buildRolePool(config.roles);
    const shuffledRoles = config.distribution === 'random'
      ? shuffleArray(rolePool, context.random)
      : rolePool;

    // Get player index to assign role
    const playerIndex = context.playerIds.indexOf(playerId);
    const roleId = shuffledRoles[playerIndex] ?? shuffledRoles[0];
    const role = config.roles.find(r => r.id === roleId)!;

    return {
      roleId: role.id,
      roleName: role.name,
      roleType: role.type,
      isRevealed: false,
      winCondition: role.winCondition ?? '',
      abilityUsesRemaining: role.ability?.usesPerGame,
      objectiveProgress: {},
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────

  getActionTypes(): readonly HiddenRolesAction['type'][] {
    return ['reveal_role', 'use_ability', 'declare_victory'] as const;
  },

  validateAction(
    ctx: ActionContext<HiddenRolesGameState, HiddenRolesPlayerState>,
    action: HiddenRolesAction
  ): ValidationResult {
    const { playerState } = ctx;
    const config = ctx.getMechanicConfig<HiddenRolesConfig>('hidden-roles')!;

    switch (action.type) {
      case 'reveal_role': {
        if (!config.allowVoluntaryReveal) {
          return invalidResult([{ message: 'Voluntary reveal is not allowed' }]);
        }
        if (playerState.isRevealed) {
          return invalidResult([{ message: 'Your role is already revealed' }]);
        }
        return validResult();
      }

      case 'use_ability': {
        const role = config.roles.find(r => r.id === playerState.roleId);
        if (!role?.ability) {
          return invalidResult([{ message: 'Your role has no ability' }]);
        }
        if (playerState.abilityUsesRemaining !== undefined && playerState.abilityUsesRemaining <= 0) {
          return invalidResult([{ message: 'No ability uses remaining' }]);
        }
        return validResult();
      }

      case 'declare_victory': {
        // Victory declaration is always allowed - GM validates
        return validResult();
      }

      default:
        return invalidResult([{ message: `Unknown action type: ${(action as any).type}` }]);
    }
  },

  executeAction(
    ctx: ActionContext<HiddenRolesGameState, HiddenRolesPlayerState>,
    action: HiddenRolesAction
  ): ExecutionResult<HiddenRolesGameState, HiddenRolesPlayerState> {
    const { gameState, playerState } = ctx;
    const config = ctx.getMechanicConfig<HiddenRolesConfig>('hidden-roles')!;

    switch (action.type) {
      case 'reveal_role': {
        const newRevealed = [...gameState.revealedPlayers, ctx.playerId];
        const traitorRevealed = gameState.traitorRevealed || playerState.roleType === 'traitor';

        return {
          success: true,
          message: `${ctx.playerId} reveals their role: ${playerState.roleName}`,
          gameStateChanges: {
            revealedPlayers: newRevealed,
            traitorRevealed,
          },
          playerStateChanges: {
            [ctx.playerId]: { isRevealed: true },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'role_revealed',
            player: ctx.playerId,
            data: {
              roleId: playerState.roleId,
              roleName: playerState.roleName,
              roleType: playerState.roleType,
              voluntary: true,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'use_ability': {
        const role = config.roles.find(r => r.id === playerState.roleId)!;
        const newUses = playerState.abilityUsesRemaining !== undefined
          ? playerState.abilityUsesRemaining - 1
          : undefined;

        return {
          success: true,
          message: `Used ${role.ability!.description}`,
          playerStateChanges: {
            [ctx.playerId]: { abilityUsesRemaining: newUses },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'ability_used',
            player: ctx.playerId,
            data: {
              roleId: playerState.roleId,
              ability: role.ability!.type,
              usesRemaining: newUses,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      case 'declare_victory': {
        return {
          success: true,
          message: `${ctx.playerId} declares victory! Gamemaster must verify.`,
          events: [{
            timestamp: ctx.timestamp,
            event: 'victory_declared',
            player: ctx.playerId,
            data: {
              roleId: playerState.roleId,
              roleName: playerState.roleName,
              winCondition: playerState.winCondition,
            },
          }],
          nextTurn: { type: 'same_player' },
        };
      }

      default:
        return {
          success: false,
          message: `Unknown action: ${(action as any).type}`,
          events: [],
          nextTurn: { type: 'same_player' },
        };
    }
  },

  getAvailableActions(
    ctx: ActionContext<HiddenRolesGameState, HiddenRolesPlayerState>
  ): ActionAvailability<HiddenRolesAction>[] {
    const { playerState } = ctx;
    const config = ctx.getMechanicConfig<HiddenRolesConfig>('hidden-roles')!;
    const actions: ActionAvailability<HiddenRolesAction>[] = [];

    // Reveal role
    if (config.allowVoluntaryReveal && !playerState.isRevealed) {
      actions.push({
        type: 'reveal_role',
        enabled: true,
        description: 'Reveal your secret role to all players',
        examples: [{ type: 'reveal_role' }],
      });
    }

    // Use ability
    const role = config.roles.find(r => r.id === playerState.roleId);
    if (role?.ability && (playerState.abilityUsesRemaining === undefined || playerState.abilityUsesRemaining > 0)) {
      actions.push({
        type: 'use_ability',
        enabled: true,
        description: role.ability.description,
        examples: [{ type: 'use_ability' }],
      });
    }

    // Declare victory (always available)
    actions.push({
      type: 'declare_victory',
      enabled: true,
      description: 'Declare that you have completed your objective',
      examples: [{ type: 'declare_victory' }],
    });

    return actions;
  },

  // ─────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────

  getEffectTypes(): readonly HiddenRolesEffect['type'][] {
    return ['force_reveal', 'peek_role', 'update_progress'] as const;
  },

  applyEffect(
    ctx: EffectContext<HiddenRolesGameState, HiddenRolesPlayerState>,
    effect: HiddenRolesEffect
  ): EffectResult<HiddenRolesGameState, HiddenRolesPlayerState> {
    const { gameState, playerState } = ctx;

    switch (effect.type) {
      case 'force_reveal': {
        const forceEffect = effect as ForceRevealEffect;
        const newRevealed = gameState.revealedPlayers.includes(ctx.playerId)
          ? gameState.revealedPlayers
          : [...gameState.revealedPlayers, ctx.playerId];
        const traitorRevealed = gameState.traitorRevealed || playerState.roleType === 'traitor';

        return {
          gameStateChanges: {
            revealedPlayers: newRevealed,
            traitorRevealed,
          },
          playerStateChanges: {
            [ctx.playerId]: { isRevealed: true },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'role_revealed',
            player: ctx.playerId,
            data: {
              roleId: playerState.roleId,
              roleName: playerState.roleName,
              roleType: playerState.roleType,
              voluntary: false,
              reason: forceEffect.reason,
            },
          }],
        };
      }

      case 'peek_role': {
        const peekEffect = effect as PeekRoleEffect;
        // This doesn't change state, just logs the peek
        return {
          events: [{
            timestamp: ctx.timestamp,
            event: 'role_peeked',
            player: peekEffect.viewingPlayer,
            data: {
              targetPlayer: ctx.playerId,
              roleId: playerState.roleId,
              roleName: playerState.roleName,
            },
          }],
        };
      }

      case 'update_progress': {
        const updateEffect = effect as UpdateProgressEffect;
        const currentProgress = playerState.objectiveProgress?.[updateEffect.objectiveKey] ?? 0;
        const newProgress = currentProgress + updateEffect.delta;

        return {
          playerStateChanges: {
            [ctx.playerId]: {
              objectiveProgress: {
                ...playerState.objectiveProgress,
                [updateEffect.objectiveKey]: newProgress,
              },
            },
          },
          events: [{
            timestamp: ctx.timestamp,
            event: 'objective_progress',
            player: ctx.playerId,
            data: {
              objectiveKey: updateEffect.objectiveKey,
              oldValue: currentProgress,
              newValue: newProgress,
            },
          }],
        };
      }

      default:
        return { events: [] };
    }
  },

  tickEffects(
    ctx: ActionContext<HiddenRolesGameState, HiddenRolesPlayerState>,
    boundary: 'turn' | 'round'
  ): EffectResult<HiddenRolesGameState, HiddenRolesPlayerState> {
    return { events: [] };
  },

  // ─────────────────────────────────────────────────────────────
  // Information Hiding
  // ─────────────────────────────────────────────────────────────

  filterGameStateForPlayer(
    state: HiddenRolesGameState,
    playerId: string
  ): Record<string, unknown> {
    return {
      revealedPlayers: state.revealedPlayers,
      traitorRevealed: state.traitorRevealed,
    };
  },

  filterPlayerStateForViewer(
    state: HiddenRolesPlayerState,
    viewerId: string,
    ownerId: string
  ): Record<string, unknown> {
    // Players see their own role, but not others' unless revealed
    if (viewerId === ownerId) {
      return {
        roleId: state.roleId,
        roleName: state.roleName,
        roleType: state.roleType,
        isRevealed: state.isRevealed,
        winCondition: state.winCondition,
        abilityUsesRemaining: state.abilityUsesRemaining,
        objectiveProgress: state.objectiveProgress,
      };
    }

    // Others only see if role is revealed
    if (state.isRevealed) {
      return {
        roleId: state.roleId,
        roleName: state.roleName,
        roleType: state.roleType,
        isRevealed: true,
      };
    }

    return {
      isRevealed: false,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // Win Conditions
  // ─────────────────────────────────────────────────────────────

  checkWinCondition(
    ctx: ActionContext<HiddenRolesGameState, HiddenRolesPlayerState>
  ): WinConditionResult | null {
    // Win conditions are typically verified by the gamemaster
    // after declare_victory action
    return null;
  },

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  getLogEventTypes(): readonly string[] {
    return [
      'role_revealed',
      'role_peeked',
      'ability_used',
      'victory_declared',
      'objective_progress',
    ];
  },
});

export default hiddenRolesMechanic;
export * from './types.js';
