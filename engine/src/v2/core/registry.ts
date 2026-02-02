/**
 * Mechanic Registry
 *
 * Responsible for:
 * - Registering available mechanics
 * - Composing mechanics for a specific game
 * - Routing actions and effects to the correct mechanic
 * - Validating mechanic compatibility
 */

import {
  Result,
  ValidationResult,
  ValidationError,
  BaseAction,
  BaseEffect,
  CoreGameState,
  PlayerView,
  ActionAvailability,
  ActionContext,
  ExecutionResult,
  EffectContext,
  EffectResult,
  LogEvent,
  MechanicConfigEntry,
  InitContext,
  ok,
  err,
  validResult,
} from './types.js';
import { Mechanic, MechanicRegistryView, MechanicInfo, getMechanicInfo } from './mechanic.js';

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSED MECHANICS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface ComposedMechanics {
  readonly enabledSlugs: readonly string[];
  readonly actionTypes: readonly string[];
  readonly effectTypes: readonly string[];

  initGameState(context: InitContext): Record<string, unknown>;
  initPlayerState(playerId: string, context: InitContext): Record<string, unknown>;
  onGameStart(state: CoreGameState): Array<ExecutionResult & { mechanicSlug: string }>;
  getAvailableActions(ctx: ActionContext): ActionAvailability[];
  /** Validates action, including all preValidateAction hooks from all mechanics */
  validateAction(ctx: ActionContext, action: BaseAction): Result<void, ValidationError[]>;
  /** Executes action and runs all postExecuteAction hooks, returning combined result */
  executeAction(ctx: ActionContext, action: BaseAction): ExecutionResult;
  applyEffect(ctx: EffectContext, effect: BaseEffect): EffectResult;
  tickEffects(ctx: ActionContext, boundary: 'turn' | 'round'): EffectResult;
  getPlayerView(state: CoreGameState, playerId: string): PlayerView;
  checkWinConditions(ctx: ActionContext): { triggered: boolean; winner?: string | null; reason?: string } | null;
  /** Check if any mechanic wants to auto-end the turn (e.g., AP depleted) */
  shouldAutoEndTurn(ctx: ActionContext): { shouldEnd: boolean; reason?: string };
  getLogEventTypes(): readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export class MechanicRegistry {
  private mechanics = new Map<string, Mechanic>();
  private actionRoutes = new Map<string, string>();
  private effectRoutes = new Map<string, string>();

  // ─────────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────────

  register<M extends Mechanic>(mechanic: M): void {
    if (this.mechanics.has(mechanic.slug)) {
      throw new Error(`Mechanic "${mechanic.slug}" is already registered`);
    }

    this.mechanics.set(mechanic.slug, mechanic);

    for (const actionType of mechanic.getActionTypes()) {
      if (this.actionRoutes.has(actionType)) {
        throw new Error(
          `Action type "${actionType}" already registered by "${this.actionRoutes.get(actionType)}"`
        );
      }
      this.actionRoutes.set(actionType, mechanic.slug);
    }

    for (const effectType of mechanic.getEffectTypes()) {
      if (this.effectRoutes.has(effectType)) {
        throw new Error(
          `Effect type "${effectType}" already registered by "${this.effectRoutes.get(effectType)}"`
        );
      }
      this.effectRoutes.set(effectType, mechanic.slug);
    }
  }

  registerAll(mechanics: Mechanic[]): void {
    for (const m of mechanics) {
      this.register(m);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Lookup
  // ─────────────────────────────────────────────────────────────

  get(slug: string): Mechanic | undefined {
    return this.mechanics.get(slug);
  }

  getRequired(slug: string): Mechanic {
    const m = this.mechanics.get(slug);
    if (!m) throw new Error(`Mechanic "${slug}" not registered`);
    return m;
  }

  has(slug: string): boolean {
    return this.mechanics.has(slug);
  }

  listAll(): MechanicInfo[] {
    return Array.from(this.mechanics.values()).map(getMechanicInfo);
  }

  getMechanicForAction(actionType: string): Mechanic | undefined {
    const slug = this.actionRoutes.get(actionType);
    return slug ? this.mechanics.get(slug) : undefined;
  }

  getMechanicForEffect(effectType: string): Mechanic | undefined {
    const slug = this.effectRoutes.get(effectType);
    return slug ? this.mechanics.get(slug) : undefined;
  }

  // ─────────────────────────────────────────────────────────────
  // Composition
  // ─────────────────────────────────────────────────────────────

  validateCompatibility(slugs: string[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const enabledSet = new Set(slugs);

    for (const slug of slugs) {
      const mechanic = this.mechanics.get(slug);
      if (!mechanic) {
        errors.push({ message: `Mechanic "${slug}" is not registered` });
        continue;
      }

      for (const dep of mechanic.dependencies) {
        if (!enabledSet.has(dep)) {
          errors.push({
            message: `Mechanic "${slug}" requires "${dep}" which is not enabled`,
            suggestion: `Add "${dep}" to the mechanics list`,
          });
        }
      }

      for (const conflict of mechanic.conflicts) {
        if (enabledSet.has(conflict)) {
          errors.push({
            message: `Mechanic "${slug}" conflicts with "${conflict}"`,
            suggestion: `Remove one of these mechanics`,
          });
        }
      }
    }

    return errors;
  }

  resolveDependencies(slugs: string[]): string[] {
    const enabledSet = new Set(slugs);
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (slug: string) => {
      if (visited.has(slug)) return;
      if (visiting.has(slug)) {
        throw new Error(`Circular dependency detected involving "${slug}"`);
      }

      visiting.add(slug);
      const mechanic = this.mechanics.get(slug);
      if (mechanic) {
        for (const dep of mechanic.dependencies) {
          if (enabledSet.has(dep)) visit(dep);
        }
      }
      visiting.delete(slug);
      visited.add(slug);
      result.push(slug);
    };

    for (const slug of slugs) visit(slug);
    return result;
  }

  compose(
    mechanicConfigs: MechanicConfigEntry[],
    playerCount: number
  ): Result<ComposedMechanics, ValidationError[]> {
    const slugs = mechanicConfigs.map(c => c.slug);

    // Validate compatibility
    const compatErrors = this.validateCompatibility(slugs);
    if (compatErrors.length > 0) {
      return err(compatErrors);
    }

    // Resolve dependency order
    const orderedSlugs = this.resolveDependencies(slugs);

    // Parse and validate configs
    const parsedConfigs = new Map<string, unknown>();
    const configErrors: ValidationError[] = [];

    for (const entry of mechanicConfigs) {
      const mechanic = this.getRequired(entry.slug);
      const parseResult = mechanic.parseConfig(entry.config);

      if (!parseResult.ok) {
        for (const e of parseResult.error) {
          configErrors.push({
            path: `mechanics[${entry.slug}].${e.path ?? ''}`,
            message: e.message,
          });
        }
      } else {
        parsedConfigs.set(entry.slug, parseResult.value);
      }
    }

    if (configErrors.length > 0) {
      return err(configErrors);
    }

    // Cross-validate configs
    const registryView = this.createRegistryView(slugs, parsedConfigs, playerCount);

    for (const slug of orderedSlugs) {
      const mechanic = this.getRequired(slug);
      const config = parsedConfigs.get(slug)!;
      const errors = mechanic.validateConfig(config, registryView);

      for (const e of errors) {
        configErrors.push({
          path: `mechanics[${slug}].${e.path ?? ''}`,
          message: e.message,
        });
      }
    }

    if (configErrors.length > 0) {
      return err(configErrors);
    }

    return ok(this.createComposedMechanics(orderedSlugs, parsedConfigs, playerCount));
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  private createRegistryView(
    enabledSlugs: string[],
    configs: Map<string, unknown>,
    playerCount: number
  ): MechanicRegistryView {
    const enabledSet = new Set(enabledSlugs);
    return {
      get: (slug) => this.mechanics.get(slug),
      isEnabled: (slug) => enabledSet.has(slug),
      getConfig: <T>(slug: string) => configs.get(slug) as T | undefined,
      getEnabled: () => enabledSlugs,
      getPlayerCount: () => playerCount,
    };
  }

  private createComposedMechanics(
    orderedSlugs: string[],
    configs: Map<string, unknown>,
    playerCount: number
  ): ComposedMechanics {
    const self = this;
    const mechanics = orderedSlugs.map(slug => this.getRequired(slug));

    // Collect all action and effect types
    const actionTypes: string[] = [];
    const effectTypes: string[] = [];
    for (const m of mechanics) {
      actionTypes.push(...m.getActionTypes());
      effectTypes.push(...m.getEffectTypes());
    }

    const createContext = (
      state: CoreGameState,
      mechanicSlug: string,
      playerId: string
    ): ActionContext => ({
      state,
      playerId,
      timestamp: new Date().toISOString(),
      getMechanicGameState: <T>(slug: string) => state.mechanicState[slug] as T | undefined,
      getMechanicPlayerState: <T>(slug: string, pid: string) =>
        state.players[pid]?.mechanicState?.[slug] as T | undefined,
      getMechanicConfig: <T>(slug: string) => configs.get(slug) as T | undefined,
      gameState: state.mechanicState[mechanicSlug],
      playerState: state.players[playerId]?.mechanicState?.[mechanicSlug],
      random: Math.random,
    });

    return {
      enabledSlugs: orderedSlugs,
      actionTypes,
      effectTypes,

      initGameState(context: InitContext): Record<string, unknown> {
        const state: Record<string, unknown> = {};
        for (const slug of orderedSlugs) {
          const mechanic = self.getRequired(slug);
          const config = configs.get(slug)!;
          state[slug] = mechanic.initGameState(config, context);
        }
        return state;
      },

      initPlayerState(playerId: string, context: InitContext): Record<string, unknown> {
        const state: Record<string, unknown> = {};
        for (const slug of orderedSlugs) {
          const mechanic = self.getRequired(slug);
          const config = configs.get(slug)!;
          state[slug] = mechanic.initPlayerState(config, playerId, context);
        }
        return state;
      },

      onGameStart(state: CoreGameState): Array<ExecutionResult & { mechanicSlug: string }> {
        const results: Array<ExecutionResult & { mechanicSlug: string }> = [];
        for (const mechanic of mechanics) {
          if (mechanic.onGameStart) {
            const config = configs.get(mechanic.slug)!;
            const ctx = createContext(state, mechanic.slug, state.currentPlayer || state.turnOrder[0]);
            const result = (mechanic.onGameStart as any)(config, ctx);
            results.push({ ...result, mechanicSlug: mechanic.slug });
          }
        }
        return results;
      },

      getAvailableActions(ctx: ActionContext): ActionAvailability[] {
        const actions: ActionAvailability[] = [];
        for (const mechanic of mechanics) {
          const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
          actions.push(...(mechanic.getAvailableActions as any)(mCtx));
        }
        return actions;
      },

      validateAction(ctx: ActionContext, action: BaseAction): Result<void, ValidationError[]> {
        const allErrors: ValidationError[] = [];

        // Run preValidateAction hooks from ALL mechanics (e.g., action-points checking AP cost)
        for (const m of mechanics) {
          if (m.preValidateAction) {
            const mCtx = { ...ctx, gameState: ctx.state.mechanicState[m.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[m.slug] };
            const hookResult = (m.preValidateAction as any)(mCtx, action);
            if (!hookResult.valid) {
              allErrors.push(...hookResult.errors);
            }
          }
        }

        // If any pre-validation hooks failed, return errors before main validation
        if (allErrors.length > 0) {
          return err(allErrors);
        }

        // Find the mechanic that handles this action
        const mechanic = self.getMechanicForAction(action.type);
        if (!mechanic) {
          return err([{
            code: 'UNKNOWN_ACTION',
            message: `Unknown action type: "${action.type}"`,
            suggestion: `Valid types: ${actionTypes.join(', ')}`,
          }]);
        }

        // Run the main validation for this action
        const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
        const result = (mechanic.validateAction as any)(mCtx, action);
        return result.valid ? ok(undefined) : err(result.errors);
      },

      executeAction(ctx: ActionContext, action: BaseAction): ExecutionResult {
        const mechanic = self.getMechanicForAction(action.type);
        if (!mechanic) {
          return {
            success: false,
            message: `Unknown action type: "${action.type}"`,
            events: [],
            nextTurn: { type: 'same_player' },
          };
        }

        // Execute the main action
        const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
        const result = (mechanic.executeAction as any)(mCtx, action);

        // Run postExecuteAction hooks from ALL mechanics (e.g., action-points deducting AP cost)
        // Only run hooks if the action was successful
        if (result.success) {
          // Initialize crossMechanicState for hook results (keyed by mechanic slug)
          result.crossMechanicState = result.crossMechanicState || { game: {}, player: {} };

          for (const m of mechanics) {
            if (m.postExecuteAction) {
              const hookCtx = { ...ctx, gameState: ctx.state.mechanicState[m.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[m.slug] };
              const hookResult = (m.postExecuteAction as any)(hookCtx, action, result);

              // Store hook's state changes under the hook's mechanic slug (NOT the action's mechanic)
              if (hookResult.gameStateChanges) {
                result.crossMechanicState.game![m.slug] = {
                  ...(result.crossMechanicState.game![m.slug] || {}),
                  ...hookResult.gameStateChanges,
                };
              }
              if (hookResult.playerStateChanges) {
                for (const [pid, changes] of Object.entries(hookResult.playerStateChanges)) {
                  result.crossMechanicState.player![pid] = result.crossMechanicState.player![pid] || {};
                  result.crossMechanicState.player![pid][m.slug] = {
                    ...(result.crossMechanicState.player![pid][m.slug] || {}),
                    ...(changes as object),
                  };
                }
              }
              if (hookResult.events && hookResult.events.length > 0) {
                result.events = [...result.events, ...hookResult.events];
              }
            }
          }
        }

        return result;
      },

      applyEffect(ctx: EffectContext, effect: BaseEffect): EffectResult {
        const mechanic = self.getMechanicForEffect(effect.type);
        if (!mechanic) {
          console.warn(`No mechanic for effect type: "${effect.type}"`);
          return { events: [] };
        }

        const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
        return (mechanic.applyEffect as any)(mCtx, effect);
      },

      tickEffects(ctx: ActionContext, boundary: 'turn' | 'round'): EffectResult {
        const combined: EffectResult = { events: [], gameStateChanges: {}, playerStateChanges: {} };

        for (const mechanic of mechanics) {
          const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
          const result = (mechanic.tickEffects as any)(mCtx, boundary);

          if (result.gameStateChanges) {
            combined.gameStateChanges = { ...combined.gameStateChanges, ...result.gameStateChanges };
          }
          if (result.playerStateChanges) {
            for (const [pid, changes] of Object.entries(result.playerStateChanges)) {
              combined.playerStateChanges![pid] = { ...(combined.playerStateChanges![pid] as object || {}), ...(changes as object) };
            }
          }
          combined.events.push(...result.events);
          if (result.expiredEffects) {
            combined.expiredEffects = [...(combined.expiredEffects || []), ...result.expiredEffects];
          }
        }

        return combined;
      },

      getPlayerView(state: CoreGameState, playerId: string): PlayerView {
        const shared: Record<string, unknown> = {};
        for (const mechanic of mechanics) {
          const ms = state.mechanicState[mechanic.slug];
          if (ms) shared[mechanic.slug] = mechanic.filterGameStateForPlayer(ms as any, playerId);
        }

        const myMechanicState: Record<string, unknown> = {};
        const myPlayer = state.players[playerId];
        for (const mechanic of mechanics) {
          const ps = myPlayer?.mechanicState?.[mechanic.slug];
          if (ps) myMechanicState[mechanic.slug] = mechanic.filterPlayerStateForViewer(ps as any, playerId, playerId);
        }

        const opponents = Object.entries(state.players)
          .filter(([id]) => id !== playerId)
          .map(([id, player]) => {
            const oppMechanicState: Record<string, unknown> = {};
            for (const mechanic of mechanics) {
              const ps = player.mechanicState?.[mechanic.slug];
              if (ps) oppMechanicState[mechanic.slug] = mechanic.filterPlayerStateForViewer(ps as any, playerId, id);
            }
            return { playerId: id, isActive: player.isActive, mechanicState: oppMechanicState };
          });

        return {
          gameId: state.gameId,
          gameName: state.gameName,
          status: state.status,
          round: state.round,
          turnNumber: state.turnNumber,
          currentPlayer: state.currentPlayer,
          turnOrder: state.turnOrder,
          me: { playerId, isActive: myPlayer?.isActive ?? false, mechanicState: myMechanicState },
          opponents,
          shared,
          winCondition: state.config.winCondition,
          lastAction: state.adjudication.lastAction,
        };
      },

      checkWinConditions(ctx: ActionContext) {
        for (const mechanic of mechanics) {
          const mCtx = { ...ctx, gameState: ctx.state.mechanicState[mechanic.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanic.slug] };
          const result = (mechanic.checkWinCondition as any)(mCtx);
          if (result?.triggered) return result;
        }
        return null;
      },

      shouldAutoEndTurn(ctx: ActionContext): { shouldEnd: boolean; reason?: string } {
        // Check all mechanics for shouldAutoEndTurn hook
        for (const m of mechanics) {
          if (m.shouldAutoEndTurn) {
            const mCtx = { ...ctx, gameState: ctx.state.mechanicState[m.slug], playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[m.slug] };
            const shouldEnd = (m.shouldAutoEndTurn as any)(mCtx);
            if (shouldEnd) {
              return { shouldEnd: true, reason: `${m.slug} triggered auto-end` };
            }
          }
        }
        return { shouldEnd: false };
      },

      getLogEventTypes(): readonly string[] {
        const types: string[] = [];
        for (const m of mechanics) types.push(...m.getLogEventTypes());
        return types;
      },
    };
  }
}

// Global registry instance
export const registry = new MechanicRegistry();
