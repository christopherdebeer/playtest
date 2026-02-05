/**
 * Hidden Roles Mechanic
 *
 * Assigns secret roles to players and controls visibility.
 * Fundamental for social deduction games (Werewolf, Mafia, Secret Hitler).
 *
 * Hooks used:
 * - initPlayerState: Assign hidden roles at game start
 * - getVisibleState: Filter visible state based on roles
 * - canSeeInfo: Control who can see what information
 * - onReveal: Handle role reveals
 *
 * Config options:
 * - roles: Array of role definitions
 * - assignment: How roles are assigned ('random', 'predetermined')
 * - team_visibility: Whether teammates can see each other
 */

import {
  MechanicHooks,
  VisibilityContext,
  VisibleState,
  RevealContext,
  StateChanges,
  PlayerInitContext,
  PlayerInitResult
} from './types.js';
import { PlayerState } from '../types/game.js';
import { setHiddenRole, isSameTeam, redactPlayerState } from './core/visibility.js';

/**
 * Role definition for hidden roles mechanic
 */
export interface RoleDefinition {
  /** Unique role identifier */
  id: string;
  /** Display name */
  name: string;
  /** Role description */
  description?: string;
  /** Team this role belongs to */
  team?: string;
  /** Number of players that can have this role */
  count?: number;
  /** Whether this role is evil/traitor */
  isEvil?: boolean;
  /** Special abilities for this role */
  abilities?: string[];
  /** Win condition for this role */
  winCondition?: string;
}

/**
 * Configuration for hidden roles mechanic
 */
export interface HiddenRolesConfig {
  /** Available roles */
  roles: RoleDefinition[];
  /** How roles are assigned */
  assignment?: 'random' | 'predetermined' | 'draft';
  /** Default role if not enough specific roles */
  defaultRole?: string;
  /** Whether teammates can see each other's roles */
  teamVisibility?: boolean;
  /** Whether evil players know each other */
  evilKnowsEvil?: boolean;
  /** Role that can investigate others */
  investigatorRole?: string;
  /** Hidden info types this mechanic controls */
  hiddenInfo?: ('role' | 'team' | 'alignment')[];
}

/**
 * Shuffle array in place using Fisher-Yates
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Build a list of roles to assign based on config and player count
 */
function buildRoleAssignments(config: HiddenRolesConfig, playerCount: number): string[] {
  const roles: string[] = [];

  // Add counted roles
  for (const roleDef of config.roles) {
    const count = roleDef.count ?? 1;
    for (let i = 0; i < count; i++) {
      roles.push(roleDef.id);
    }
  }

  // Fill remaining with default role if needed
  while (roles.length < playerCount) {
    roles.push(config.defaultRole || config.roles[0]?.id || 'unknown');
  }

  // Trim if too many
  while (roles.length > playerCount) {
    roles.pop();
  }

  return roles;
}

export const hiddenRolesMechanic: MechanicHooks = {
  slug: 'hidden-roles',
  name: 'Hidden Roles',
  requires: ['visibility'],

  initPlayerState(ctx: PlayerInitContext): PlayerInitResult | null {
    const hiddenRolesConfig = ctx.config.engine_mechanics?.hidden_roles as HiddenRolesConfig | undefined;
    if (!hiddenRolesConfig) return null;

    // Get player count from config
    const playersConfig = ctx.config.players;
    const playerCount = typeof playersConfig === 'number'
      ? playersConfig
      : (playersConfig as { min: number; max: number })?.max ?? 4;

    // Build role assignments for all players
    let roleAssignments: string[];

    if (hiddenRolesConfig.assignment === 'predetermined') {
      // Predetermined: use roles in order
      roleAssignments = hiddenRolesConfig.roles.map(r => r.id);
    } else {
      // Random: shuffle roles
      roleAssignments = buildRoleAssignments(hiddenRolesConfig, playerCount);
      roleAssignments = shuffleArray(roleAssignments);
    }

    // Assign role based on player index
    const roleId = roleAssignments[ctx.playerIndex] || hiddenRolesConfig.defaultRole || 'unknown';
    const roleDef = hiddenRolesConfig.roles.find(r => r.id === roleId);

    // Initialize player knowledge
    const knowledge = {
      knownRoles: {} as Record<string, string>,
      knownPositions: {} as Record<string, string>,
      revealed: {} as Record<string, unknown>
    };

    // Player always knows their own role
    knowledge.knownRoles[ctx.playerId] = roleId;

    // If evil knows evil, add known roles from existing players
    if (hiddenRolesConfig.evilKnowsEvil && roleDef?.isEvil) {
      for (const [existingPlayerId, existingPlayer] of Object.entries(ctx.existingPlayers)) {
        const existingRole = existingPlayer.hiddenRole;
        if (existingRole) {
          const existingRoleDef = hiddenRolesConfig.roles.find(r => r.id === existingRole);
          if (existingRoleDef?.isEvil) {
            knowledge.knownRoles[existingPlayerId] = existingRole;
          }
        }
      }
    }

    // If team visibility, add team members from existing players
    if (hiddenRolesConfig.teamVisibility && roleDef?.team) {
      for (const [existingPlayerId, existingPlayer] of Object.entries(ctx.existingPlayers)) {
        const existingRole = existingPlayer.hiddenRole;
        if (existingRole) {
          const existingRoleDef = hiddenRolesConfig.roles.find(r => r.id === existingRole);
          if (existingRoleDef?.team === roleDef.team) {
            knowledge.knownRoles[existingPlayerId] = existingRole;
          }
        }
      }
    }

    return {
      hiddenRole: roleId,
      team: roleDef?.team,
      knowledge
    };
  },

  getVisibleState(ctx: VisibilityContext): VisibleState | null {
    const hiddenRolesConfig = ctx.config.engine_mechanics?.hidden_roles as HiddenRolesConfig | undefined;
    if (!hiddenRolesConfig) return null;

    const viewer = ctx.state.players[ctx.viewerPlayerId];
    if (!viewer) return null;

    const hiddenInfo = hiddenRolesConfig.hiddenInfo || ['role', 'team'];
    const filteredPlayers: Record<string, Partial<PlayerState>> = {};
    const hiddenPlayers: string[] = [];

    for (const [playerId, player] of Object.entries(ctx.state.players)) {
      // Player can always see their own info
      if (playerId === ctx.viewerPlayerId) {
        continue;
      }

      // Check if viewer knows this player's role
      const knownRole = viewer.knowledge?.knownRoles[playerId];

      if (!knownRole) {
        // Hide role and team info
        const redacted: Partial<PlayerState> = {};

        if (hiddenInfo.includes('role')) {
          redacted.hiddenRole = undefined;
        }
        if (hiddenInfo.includes('team')) {
          redacted.team = undefined;
        }

        filteredPlayers[playerId] = redacted;
        hiddenPlayers.push(playerId);
      }
    }

    return {
      players: filteredPlayers,
      visibilityMeta: {
        hiddenPlayers,
        hiddenInfo
      }
    };
  },

  canSeeInfo(ctx: VisibilityContext, infoType: string, targetPlayerId?: string): boolean | undefined {
    const hiddenRolesConfig = ctx.config.engine_mechanics?.hidden_roles as HiddenRolesConfig | undefined;
    if (!hiddenRolesConfig) return undefined;

    // Only handle role/team/alignment info types
    if (!['role', 'team', 'alignment'].includes(infoType)) {
      return undefined;
    }

    // No target means general query - defer
    if (!targetPlayerId) return undefined;

    const viewer = ctx.state.players[ctx.viewerPlayerId];
    if (!viewer) return false;

    // Player always sees their own info
    if (targetPlayerId === ctx.viewerPlayerId) {
      return true;
    }

    // Check if viewer knows this player's role
    if (viewer.knowledge?.knownRoles[targetPlayerId]) {
      return true;
    }

    // Check team visibility
    if (hiddenRolesConfig.teamVisibility) {
      if (isSameTeam(ctx.state, ctx.viewerPlayerId, targetPlayerId)) {
        return true;
      }
    }

    // Check evil knows evil
    if (hiddenRolesConfig.evilKnowsEvil) {
      const viewerRole = viewer.hiddenRole;
      const targetRole = ctx.state.players[targetPlayerId]?.hiddenRole;

      if (viewerRole && targetRole) {
        const viewerDef = hiddenRolesConfig.roles.find(r => r.id === viewerRole);
        const targetDef = hiddenRolesConfig.roles.find(r => r.id === targetRole);

        if (viewerDef?.isEvil && targetDef?.isEvil) {
          return true;
        }
      }
    }

    // Default: cannot see
    return false;
  },

  onReveal(ctx: RevealContext): StateChanges | null {
    const hiddenRolesConfig = ctx.config.engine_mechanics?.hidden_roles as HiddenRolesConfig | undefined;
    if (!hiddenRolesConfig) return null;

    // Only handle role reveals
    if (ctx.targetInfo !== 'role') return null;

    const revealingPlayer = ctx.state.players[ctx.revealingPlayerId];
    if (!revealingPlayer?.hiddenRole) return null;

    const playerStateChanges: Record<string, Partial<PlayerState>> = {};

    // Update knowledge for all receiving players
    const recipients = ctx.toPlayerIds === 'all'
      ? Object.keys(ctx.state.players)
      : ctx.toPlayerIds;

    for (const recipientId of recipients) {
      if (recipientId === ctx.revealingPlayerId) continue;

      const recipient = ctx.state.players[recipientId];
      if (!recipient) continue;

      // Initialize knowledge if needed
      const currentKnowledge = recipient.knowledge || {
        knownRoles: {},
        knownPositions: {},
        revealed: {}
      };

      playerStateChanges[recipientId] = {
        knowledge: {
          ...currentKnowledge,
          knownRoles: {
            ...currentKnowledge.knownRoles,
            [ctx.revealingPlayerId]: revealingPlayer.hiddenRole
          }
        }
      };
    }

    return { playerStateChanges };
  },

  configSchema: {
    type: 'object',
    description: 'Assigns secret roles to players, enabling social deduction mechanics.',
    properties: {
      roles: {
        type: 'array',
        description: 'Array of role definitions',
        required: true
      },
      assignment: {
        type: 'string',
        description: 'How roles are assigned',
        enum: ['random', 'predetermined', 'draft'],
        default: 'random'
      },
      defaultRole: {
        type: 'string',
        description: 'Default role if not enough specific roles'
      },
      teamVisibility: {
        type: 'boolean',
        description: 'Whether teammates can see each other\'s roles',
        default: false
      },
      evilKnowsEvil: {
        type: 'boolean',
        description: 'Whether evil players know each other',
        default: true
      }
    }
  }
};
