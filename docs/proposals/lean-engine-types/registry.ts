/**
 * Mechanic Registry
 *
 * The registry is responsible for:
 * - Registering available mechanics
 * - Composing mechanics for a specific game
 * - Routing actions and effects to the correct mechanic
 * - Validating mechanic compatibility
 *
 * This is the "glue" that brings all mechanics together.
 */

import {
  Result,
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
} from './core';
import {
  Mechanic,
  InitContext,
  MechanicRegistryView,
} from './mechanic';

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MechanicInfo {
  slug: string;
  version: string;
  displayName: string;
  description: string;
  dependencies: readonly string[];
  conflicts: readonly string[];
  actionTypes: readonly string[];
  effectTypes: readonly string[];
}

export interface ComposedMechanicsResult {
  /**
   * Initialize all mechanic game states.
   */
  initGameState(context: InitContext): Record<string, unknown>;

  /**
   * Initialize all mechanic player states.
   */
  initPlayerState(playerId: string, context: InitContext): Record<string, unknown>;

  /**
   * Call onGameStart for all mechanics.
   */
  onGameStart(state: CoreGameState): ExecutionResult<any, any>[];

  /**
   * Get all available actions for a player.
   */
  getAvailableActions(ctx: ActionContext): ActionAvailability[];

  /**
   * Validate an action.
   */
  validateAction(ctx: ActionContext, action: BaseAction): Result<void, ValidationError[]>;

  /**
   * Execute an action.
   */
  executeAction(ctx: ActionContext, action: BaseAction): ExecutionResult;

  /**
   * Apply an effect.
   */
  applyEffect(ctx: EffectContext, effect: BaseEffect): EffectResult;

  /**
   * Tick effects at turn/round boundaries.
   */
  tickEffects(ctx: ActionContext, boundary: 'turn' | 'round'): EffectResult;

  /**
   * Get player view (filtered state).
   */
  getPlayerView(state: CoreGameState, playerId: string): PlayerView;

  /**
   * Check all win conditions.
   */
  checkWinConditions(ctx: ActionContext): { triggered: boolean; winner?: string; reason?: string } | null;

  /**
   * Get all log event types.
   */
  getLogEventTypes(): readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MECHANIC REGISTRY IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class MechanicRegistry {
  private mechanics = new Map<string, Mechanic>();
  private actionRoutes = new Map<string, string>();  // action type -> mechanic slug
  private effectRoutes = new Map<string, string>();  // effect type -> mechanic slug

  // ─────────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────────

  /**
   * Register a mechanic with the registry.
   */
  register<M extends Mechanic>(mechanic: M): void {
    if (this.mechanics.has(mechanic.slug)) {
      throw new Error(`Mechanic "${mechanic.slug}" is already registered`);
    }

    this.mechanics.set(mechanic.slug, mechanic);

    // Register action routes
    for (const actionType of mechanic.getActionTypes()) {
      if (this.actionRoutes.has(actionType)) {
        throw new Error(
          `Action type "${actionType}" is already registered by mechanic "${this.actionRoutes.get(actionType)}"`
        );
      }
      this.actionRoutes.set(actionType, mechanic.slug);
    }

    // Register effect routes
    for (const effectType of mechanic.getEffectTypes()) {
      if (this.effectRoutes.has(effectType)) {
        throw new Error(
          `Effect type "${effectType}" is already registered by mechanic "${this.effectRoutes.get(effectType)}"`
        );
      }
      this.effectRoutes.set(effectType, mechanic.slug);
    }
  }

  /**
   * Register multiple mechanics at once.
   */
  registerAll(mechanics: Mechanic[]): void {
    for (const mechanic of mechanics) {
      this.register(mechanic);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Lookup
  // ─────────────────────────────────────────────────────────────

  /**
   * Get a mechanic by slug, or undefined if not found.
   */
  get(slug: string): Mechanic | undefined {
    return this.mechanics.get(slug);
  }

  /**
   * Get a mechanic by slug, throwing if not found.
   */
  getRequired(slug: string): Mechanic {
    const mechanic = this.mechanics.get(slug);
    if (!mechanic) {
      throw new Error(`Mechanic "${slug}" is not registered`);
    }
    return mechanic;
  }

  /**
   * Check if a mechanic is registered.
   */
  has(slug: string): boolean {
    return this.mechanics.has(slug);
  }

  /**
   * List all registered mechanics.
   */
  listAll(): MechanicInfo[] {
    return Array.from(this.mechanics.values()).map(m => ({
      slug: m.slug,
      version: m.version,
      displayName: m.displayName,
      description: m.description,
      dependencies: m.dependencies,
      conflicts: m.conflicts,
      actionTypes: m.getActionTypes(),
      effectTypes: m.getEffectTypes(),
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Routing
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the mechanic that handles a given action type.
   */
  getMechanicForAction(actionType: string): Mechanic | undefined {
    const slug = this.actionRoutes.get(actionType);
    return slug ? this.mechanics.get(slug) : undefined;
  }

  /**
   * Get the mechanic that handles a given effect type.
   */
  getMechanicForEffect(effectType: string): Mechanic | undefined {
    const slug = this.effectRoutes.get(effectType);
    return slug ? this.mechanics.get(slug) : undefined;
  }

  // ─────────────────────────────────────────────────────────────
  // Composition
  // ─────────────────────────────────────────────────────────────

  /**
   * Validate that a set of mechanics can be composed together.
   */
  validateCompatibility(slugs: string[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const enabledSet = new Set(slugs);

    for (const slug of slugs) {
      const mechanic = this.mechanics.get(slug);
      if (!mechanic) {
        errors.push({ message: `Mechanic "${slug}" is not registered` });
        continue;
      }

      // Check dependencies
      for (const dep of mechanic.dependencies) {
        if (!enabledSet.has(dep)) {
          errors.push({
            message: `Mechanic "${slug}" requires "${dep}" which is not enabled`,
            suggestion: `Add "${dep}" to the mechanics list`,
          });
        }
      }

      // Check conflicts
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

  /**
   * Resolve dependencies and return mechanics in topological order.
   */
  resolveDependencies(slugs: string[]): string[] {
    const enabledSet = new Set(slugs);
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();  // For cycle detection

    const visit = (slug: string) => {
      if (visited.has(slug)) return;
      if (visiting.has(slug)) {
        throw new Error(`Circular dependency detected involving "${slug}"`);
      }

      visiting.add(slug);

      const mechanic = this.mechanics.get(slug);
      if (mechanic) {
        for (const dep of mechanic.dependencies) {
          if (enabledSet.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(slug);
      visited.add(slug);
      result.push(slug);
    };

    for (const slug of slugs) {
      visit(slug);
    }

    return result;
  }

  /**
   * Compose a set of mechanics into a unified interface for a game.
   */
  compose(
    mechanicConfigs: MechanicConfigEntry[],
    playerCount: number
  ): Result<ComposedMechanicsResult, ValidationError[]> {
    const slugs = mechanicConfigs.map(c => c.slug);

    // Validate compatibility
    const compatErrors = this.validateCompatibility(slugs);
    if (compatErrors.length > 0) {
      return { ok: false, error: compatErrors };
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
        for (const err of parseResult.error) {
          configErrors.push({
            path: `mechanics[${entry.slug}].${err.path}`,
            message: err.message,
          });
        }
      } else {
        parsedConfigs.set(entry.slug, parseResult.value);
      }
    }

    if (configErrors.length > 0) {
      return { ok: false, error: configErrors };
    }

    // Cross-validate configs
    const registryView = this.createRegistryView(slugs, parsedConfigs, playerCount);

    for (const slug of orderedSlugs) {
      const mechanic = this.getRequired(slug);
      const config = parsedConfigs.get(slug)!;
      const errors = mechanic.validateConfig(config, registryView);

      for (const err of errors) {
        configErrors.push({
          path: `mechanics[${slug}].${err.path ?? ''}`,
          message: err.message,
        });
      }
    }

    if (configErrors.length > 0) {
      return { ok: false, error: configErrors };
    }

    // Create composed result
    const composed = this.createComposedMechanics(
      orderedSlugs,
      parsedConfigs,
      playerCount
    );

    return { ok: true, value: composed };
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
      get: (slug: string) => this.mechanics.get(slug),
      isEnabled: (slug: string) => enabledSet.has(slug),
      getConfig: <T>(slug: string) => configs.get(slug) as T | undefined,
      getEnabled: () => enabledSlugs,
      getPlayerCount: () => playerCount,
    };
  }

  private createComposedMechanics(
    orderedSlugs: string[],
    configs: Map<string, unknown>,
    playerCount: number
  ): ComposedMechanicsResult {
    const self = this;
    const mechanics = orderedSlugs.map(slug => this.getRequired(slug));

    return {
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

      onGameStart(state: CoreGameState): ExecutionResult[] {
        const results: ExecutionResult[] = [];

        for (const mechanic of mechanics) {
          if (mechanic.onGameStart) {
            const config = configs.get(mechanic.slug)!;
            const ctx = createActionContext(state, mechanic.slug, configs, state.currentPlayer!);
            results.push(mechanic.onGameStart(config, ctx));
          }
        }

        return results;
      },

      getAvailableActions(ctx: ActionContext): ActionAvailability[] {
        const actions: ActionAvailability[] = [];

        for (const mechanic of mechanics) {
          const mechanicCtx = enrichContext(ctx, mechanic.slug, configs);
          const mechanicActions = mechanic.getAvailableActions(mechanicCtx);
          actions.push(...mechanicActions);
        }

        return actions;
      },

      validateAction(ctx: ActionContext, action: BaseAction): Result<void, ValidationError[]> {
        const mechanic = self.getMechanicForAction(action.type);

        if (!mechanic) {
          return {
            ok: false,
            error: [{
              code: 'UNKNOWN_ACTION',
              message: `Unknown action type: "${action.type}"`,
              suggestion: `Valid action types: ${Array.from(self.actionRoutes.keys()).join(', ')}`,
            }],
          };
        }

        const mechanicCtx = enrichContext(ctx, mechanic.slug, configs);
        const result = mechanic.validateAction(mechanicCtx, action);

        if (!result.valid) {
          return { ok: false, error: result.errors };
        }

        return { ok: true, value: undefined };
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

        const mechanicCtx = enrichContext(ctx, mechanic.slug, configs);
        return mechanic.executeAction(mechanicCtx, action);
      },

      applyEffect(ctx: EffectContext, effect: BaseEffect): EffectResult {
        const mechanic = self.getMechanicForEffect(effect.type);

        if (!mechanic) {
          console.warn(`No mechanic registered for effect type: "${effect.type}"`);
          return { events: [] };
        }

        const mechanicCtx = enrichContext(ctx, mechanic.slug, configs) as EffectContext;
        return mechanic.applyEffect(mechanicCtx, effect);
      },

      tickEffects(ctx: ActionContext, boundary: 'turn' | 'round'): EffectResult {
        const combinedResult: EffectResult = {
          gameStateChanges: {},
          playerStateChanges: {},
          events: [],
          expiredEffects: [],
        };

        for (const mechanic of mechanics) {
          const mechanicCtx = enrichContext(ctx, mechanic.slug, configs);
          const result = mechanic.tickEffects(mechanicCtx, boundary);

          // Merge results
          if (result.gameStateChanges) {
            combinedResult.gameStateChanges = {
              ...combinedResult.gameStateChanges,
              ...result.gameStateChanges,
            };
          }
          if (result.playerStateChanges) {
            for (const [playerId, changes] of Object.entries(result.playerStateChanges)) {
              combinedResult.playerStateChanges![playerId] = {
                ...combinedResult.playerStateChanges![playerId],
                ...changes,
              };
            }
          }
          combinedResult.events.push(...result.events);
          if (result.expiredEffects) {
            combinedResult.expiredEffects!.push(...result.expiredEffects);
          }
        }

        return combinedResult;
      },

      getPlayerView(state: CoreGameState, playerId: string): PlayerView {
        // Build filtered shared state
        const shared: Record<string, unknown> = {};

        for (const mechanic of mechanics) {
          const mechanicState = state.mechanicState[mechanic.slug];
          if (mechanicState) {
            shared[mechanic.slug] = mechanic.filterGameStateForPlayer(
              mechanicState as any,
              playerId
            );
          }
        }

        // Build my state
        const myMechanicState: Record<string, unknown> = {};
        const myPlayerState = state.players[playerId];

        for (const mechanic of mechanics) {
          const mechanicPlayerState = myPlayerState?.mechanicState?.[mechanic.slug];
          if (mechanicPlayerState) {
            myMechanicState[mechanic.slug] = mechanic.filterPlayerStateForViewer(
              mechanicPlayerState as any,
              playerId,
              playerId
            );
          }
        }

        // Build opponent views
        const opponents = Object.entries(state.players)
          .filter(([id]) => id !== playerId)
          .map(([id, player]) => {
            const opponentMechanicState: Record<string, unknown> = {};

            for (const mechanic of mechanics) {
              const mechanicPlayerState = player.mechanicState?.[mechanic.slug];
              if (mechanicPlayerState) {
                opponentMechanicState[mechanic.slug] = mechanic.filterPlayerStateForViewer(
                  mechanicPlayerState as any,
                  playerId,
                  id
                );
              }
            }

            return {
              playerId: id,
              isActive: player.isActive,
              mechanicState: opponentMechanicState,
            };
          });

        return {
          gameId: state.gameId,
          gameName: state.gameName,
          status: state.status,
          round: state.round,
          turnNumber: state.turnNumber,
          currentPlayer: state.currentPlayer,
          turnOrder: state.turnOrder,
          me: {
            playerId,
            isActive: myPlayerState?.isActive ?? false,
            mechanicState: myMechanicState,
          },
          opponents,
          shared,
          winCondition: state.config.winCondition,
          lastAction: state.adjudication.lastAction,
        };
      },

      checkWinConditions(ctx: ActionContext) {
        for (const mechanic of mechanics) {
          const mechanicCtx = enrichContext(ctx, mechanic.slug, configs);
          const result = mechanic.checkWinCondition(mechanicCtx);

          if (result?.triggered) {
            return result;
          }
        }

        return null;
      },

      getLogEventTypes(): readonly string[] {
        const types: string[] = [];
        for (const mechanic of mechanics) {
          types.push(...mechanic.getLogEventTypes());
        }
        return types;
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function createActionContext(
  state: CoreGameState,
  currentMechanicSlug: string,
  configs: Map<string, unknown>,
  playerId: string
): ActionContext {
  return {
    state,
    playerId,
    timestamp: new Date().toISOString(),
    getMechanicGameState: <T>(slug: string) => state.mechanicState[slug] as T | undefined,
    getMechanicPlayerState: <T>(slug: string, pid: string) =>
      state.players[pid]?.mechanicState?.[slug] as T | undefined,
    getMechanicConfig: <T>(slug: string) => configs.get(slug) as T | undefined,
    gameState: state.mechanicState[currentMechanicSlug],
    playerState: state.players[playerId]?.mechanicState?.[currentMechanicSlug],
  };
}

function enrichContext(
  ctx: ActionContext,
  mechanicSlug: string,
  configs: Map<string, unknown>
): ActionContext {
  return {
    ...ctx,
    getMechanicConfig: <T>(slug: string) => configs.get(slug) as T | undefined,
    gameState: ctx.state.mechanicState[mechanicSlug],
    playerState: ctx.state.players[ctx.playerId]?.mechanicState?.[mechanicSlug],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Global mechanic registry.
 * Mechanics register themselves on import.
 */
export const registry = new MechanicRegistry();

// Auto-register core mechanics
// import { cardsMechanic } from './mechanics/cards';
// import { probabilityMechanic } from './mechanics/probability';
// registry.register(cardsMechanic);
// registry.register(probabilityMechanic);
