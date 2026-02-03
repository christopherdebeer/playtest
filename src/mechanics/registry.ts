/**
 * Mechanic Registry - Manages registered mechanics and routes hooks
 *
 * This is intentionally minimal to avoid adding complexity.
 * Mechanics register themselves, and the registry routes hook calls
 * to all enabled mechanics.
 */

import {
  MechanicHooks,
  HookContext,
  TurnStartContext,
  TurnEndContext,
  ValidationResult,
  StateChanges,
  PlayerInitResult,
  PlayerInitContext,
  DrawContext,
  DrawHookResult,
  AfterDrawContext,
  DiscardContext,
  HandAddContext,
  HandAddHookResult,
  HandRemoveContext,
  WinCheckContext,
  WinCheckResult,
  ActionExecutionContext,
  ActionExecutionResult,
  AvailableAction,
  ActionDescription,
  ResourceChangeContext,
  ResourceChangeHookResult,
  AfterResourceChangeContext,
  EffectContext,
  EffectAddHookResult,
  EffectRemoveHookResult,
  MoveContext,
  MoveHookResult,
  AfterMoveContext,
  VisibilityContext,
  RevealContext,
  VisibleState,
  DiceRollContext,
  AfterRollContext,
  DiceRollHookResult,
  TurnOrderContext,
  TurnOrderResult,
  PassPriorityResult,
  VoteContext,
  VoteCastResult,
  VoteTallyContext,
  VoteTallyResult,
  isMechanicEnabled
} from './types.js';
import { Effect } from '../types/game.js';
import { GameState, GameConfig, GameAction, PlayerState, Card } from '../types/game.js';
import { logEvent } from '../core/game.js';

/**
 * Error returned when validating mechanic dependencies/conflicts
 */
export interface MechanicValidationError {
  mechanic: string;
  type: 'missing_dependency' | 'conflict';
  message: string;
}

/**
 * Metadata for a registered mechanic (for export/documentation)
 */
export interface MechanicMetadata {
  slug: string;
  name: string;
  configKey: string;
  description?: string;
  configSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    description?: string;
  };
  dependencies?: string[];
  conflicts?: string[];
  hooks: string[];
}

class MechanicRegistry {
  private mechanics: Map<string, MechanicHooks> = new Map();

  /**
   * Register a mechanic's hooks
   */
  register(mechanic: MechanicHooks): void {
    if (this.mechanics.has(mechanic.slug)) {
      throw new Error(`Mechanic '${mechanic.slug}' is already registered`);
    }
    this.mechanics.set(mechanic.slug, mechanic);
  }

  /**
   * Get all registered mechanic slugs
   */
  getRegisteredSlugs(): string[] {
    return Array.from(this.mechanics.keys());
  }

  /**
   * Get mechanics enabled for a game config
   */
  getEnabledMechanics(config: GameConfig): MechanicHooks[] {
    return Array.from(this.mechanics.values())
      .filter(m => isMechanicEnabled(config, m.slug));
  }

  /**
   * Get a specific mechanic by slug
   */
  getMechanic(slug: string): MechanicHooks | undefined {
    return this.mechanics.get(slug);
  }

  /**
   * Validate mechanic dependencies and conflicts for a game config.
   * Returns array of validation errors, empty if valid.
   */
  validateDependencies(config: GameConfig): MechanicValidationError[] {
    const enabled = this.getEnabledMechanics(config);
    const enabledSlugs = new Set(enabled.map(m => m.slug));
    const errors: MechanicValidationError[] = [];

    for (const mechanic of enabled) {
      // Check dependencies
      if (mechanic.dependencies) {
        for (const dep of mechanic.dependencies) {
          if (!enabledSlugs.has(dep)) {
            errors.push({
              mechanic: mechanic.slug,
              type: 'missing_dependency',
              message: `Mechanic '${mechanic.slug}' requires '${dep}' but it is not enabled`
            });
          }
        }
      }

      // Check conflicts
      if (mechanic.conflicts) {
        for (const conflict of mechanic.conflicts) {
          if (enabledSlugs.has(conflict)) {
            errors.push({
              mechanic: mechanic.slug,
              type: 'conflict',
              message: `Mechanic '${mechanic.slug}' conflicts with '${conflict}' which is also enabled`
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Get metadata for all registered mechanics (for export/documentation)
   */
  getAllMechanicsMetadata(): MechanicMetadata[] {
    const result: MechanicMetadata[] = [];

    for (const mechanic of this.mechanics.values()) {
      // Derive config key from slug (e.g., 'action-points' -> 'action_points')
      const configKey = mechanic.slug.replace(/-/g, '_');

      // Collect which hooks are implemented
      const hooks: string[] = [];
      const hookNames = [
        'preValidateAction', 'postExecuteAction', 'shouldAutoEndTurn',
        'initPlayerState', 'onTurnStart', 'onTurnEnd', 'onCheckWin',
        'onExecuteAction', 'getAvailableActions', 'describeAction',
        'onBeforeDraw', 'onAfterDraw', 'onDiscard',
        'onBeforeAddToHand', 'onAfterAddToHand', 'onAfterRemoveFromHand',
        'onBeforeResourceChange', 'onAfterResourceChange',
        'onBeforeAddEffect', 'onAfterAddEffect', 'onBeforeRemoveEffect', 'onEffectExpired',
        'onBeforeMove', 'onAfterMove',
        // Visibility System (Phase 4)
        'getVisibleState', 'onReveal', 'canSeeInfo',
        // Dice System (Phase 2)
        'onBeforeRoll', 'onAfterRoll',
        // Dynamic Turn Order (Phase 3)
        'onDetermineTurnOrder', 'onPassPriority'
      ];

      for (const hookName of hookNames) {
        if (hookName in mechanic && (mechanic as unknown as Record<string, unknown>)[hookName] !== undefined) {
          hooks.push(hookName);
        }
      }

      result.push({
        slug: mechanic.slug,
        name: mechanic.name,
        configKey,
        description: mechanic.configSchema?.description,
        configSchema: mechanic.configSchema,
        dependencies: mechanic.dependencies,
        conflicts: mechanic.conflicts,
        hooks
      });
    }

    return result.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  /**
   * Create hook context from game state
   */
  private createContext(state: GameState, playerId: string): HookContext {
    const player = state.players[playerId];
    if (!player) {
      throw new Error(`Player ${playerId} not found in state`);
    }
    return {
      state,
      playerId,
      player,
      config: state.config
    };
  }

  /**
   * Run preValidateAction hooks for all enabled mechanics.
   * Returns first validation failure, or { valid: true } if all pass.
   */
  preValidateAction(state: GameState, playerId: string, action: GameAction): ValidationResult {
    const telemetryEnabled = state.config.engine_debug?.hook_telemetry;
    const startTime = telemetryEnabled ? performance.now() : 0;

    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const respondingMechanics: string[] = [];
    let finalResult: ValidationResult = { valid: true };

    for (const mechanic of enabledMechanics) {
      if (mechanic.preValidateAction) {
        const mechanicStart = telemetryEnabled ? performance.now() : 0;
        const result = mechanic.preValidateAction(ctx, action);

        if (result) {
          respondingMechanics.push(mechanic.slug);

          if (telemetryEnabled) {
            logEvent(state, {
              event: 'mechanic_response',
              player: playerId,
              data: {
                mechanic: mechanic.slug,
                hook: 'preValidateAction',
                response_type: result.valid ? 'allowed' : 'blocked',
                duration_ms: performance.now() - mechanicStart,
                response_data: result
              }
            });
          }

          if (!result.valid) {
            finalResult = result;
            break;
          }
        }
      }
    }

    // Only log telemetry if mechanics are enabled (avoid noise from 0/0 mechanics)
    if (telemetryEnabled && enabledMechanics.length > 0) {
      logEvent(state, {
        event: 'hook_invoked',
        player: playerId,
        data: {
          hook: 'preValidateAction',
          action_type: action.type,
          enabled_mechanics: enabledMechanics.map(m => m.slug),
          responding_mechanics: respondingMechanics,
          duration_ms: performance.now() - startTime,
          result: finalResult.valid ? 'allowed' : 'blocked'
        }
      });
    }

    return finalResult;
  }

  /**
   * Run postExecuteAction hooks for all enabled mechanics.
   * Collects and merges all state changes.
   */
  postExecuteAction(state: GameState, playerId: string, action: GameAction): StateChanges {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.postExecuteAction) {
        const changes = mechanic.postExecuteAction(ctx, action);
        if (changes) {
          // Merge player state changes
          if (changes.playerStateChanges) {
            mergedChanges.playerStateChanges = mergedChanges.playerStateChanges || {};
            for (const [pid, pchanges] of Object.entries(changes.playerStateChanges)) {
              mergedChanges.playerStateChanges[pid] = {
                ...mergedChanges.playerStateChanges[pid],
                ...pchanges
              };
            }
          }
          // Merge shared state changes
          if (changes.sharedStateChanges) {
            mergedChanges.sharedStateChanges = {
              ...mergedChanges.sharedStateChanges,
              ...changes.sharedStateChanges
            };
          }
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Check if any enabled mechanic wants to auto-end turn.
   */
  shouldAutoEndTurn(state: GameState, playerId: string): boolean {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.shouldAutoEndTurn) {
        if (mechanic.shouldAutoEndTurn(ctx)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Collect player state from all enabled mechanics during registration.
   * Passes existing players for cross-player coordination (e.g., unique power assignment).
   */
  initPlayerState(
    config: GameConfig,
    playerId: string,
    playerIndex: number,
    existingPlayers: Record<string, Partial<PlayerState>>
  ): PlayerInitResult {
    const enabledMechanics = this.getEnabledMechanics(config);
    const merged: PlayerInitResult = {};

    const ctx: PlayerInitContext = {
      config,
      playerId,
      playerIndex,
      existingPlayers
    };

    for (const mechanic of enabledMechanics) {
      if (mechanic.initPlayerState) {
        const result = mechanic.initPlayerState(ctx);
        if (result) {
          Object.assign(merged, result);
        }
      }
    }

    return merged;
  }

  /**
   * Run onTurnStart hooks for all enabled mechanics.
   */
  onTurnStart(state: GameState, playerId: string, isNewRound: boolean = false): StateChanges {
    const baseCtx = this.createContext(state, playerId);
    const ctx: TurnStartContext = { ...baseCtx, isNewRound };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onTurnStart) {
        const changes = mechanic.onTurnStart(ctx);
        if (changes) {
          if (changes.playerStateChanges) {
            mergedChanges.playerStateChanges = mergedChanges.playerStateChanges || {};
            for (const [pid, pchanges] of Object.entries(changes.playerStateChanges)) {
              mergedChanges.playerStateChanges[pid] = {
                ...mergedChanges.playerStateChanges[pid],
                ...pchanges
              };
            }
          }
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onTurnEnd hooks for all enabled mechanics.
   */
  onTurnEnd(state: GameState, playerId: string, nextPlayerId: string, isRoundEnd: boolean = false): StateChanges {
    const baseCtx = this.createContext(state, playerId);
    const ctx: TurnEndContext = { ...baseCtx, nextPlayerId, isRoundEnd };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onTurnEnd) {
        const changes = mechanic.onTurnEnd(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onCheckWin hooks for a specific player.
   * Returns first winning result, or null if no win.
   */
  onCheckWin(state: GameState, playerId: string, trigger: string): WinCheckResult | null {
    const baseCtx = this.createContext(state, playerId);
    const ctx: WinCheckContext = { ...baseCtx, trigger };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onCheckWin) {
        const result = mechanic.onCheckWin(ctx);
        if (result?.won) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Check win conditions for all active players.
   * Returns { playerId, reason } of first winner, or null.
   */
  checkAllWinConditions(state: GameState, trigger: string): { playerId: string; reason: string } | null {
    const activePlayers = Object.entries(state.players)
      .filter(([_, p]) => p.state !== 'eliminated' && !p.effects?.some(e => e.type === 'eliminated'));

    for (const [playerId] of activePlayers) {
      const result = this.onCheckWin(state, playerId, trigger);
      if (result?.won) {
        return { playerId, reason: result.reason || 'Win condition met' };
      }
    }

    return null;
  }

  // ============ Action Execution & Registration ============

  /**
   * Execute an action through mechanics.
   * Returns the first mechanic's result that handles the action, or null.
   */
  executeAction(state: GameState, playerId: string, action: GameAction): ActionExecutionResult | null {
    const telemetryEnabled = state.config.engine_debug?.hook_telemetry;
    const startTime = telemetryEnabled ? performance.now() : 0;

    const baseCtx = this.createContext(state, playerId);
    const ctx: ActionExecutionContext = { ...baseCtx, action };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const respondingMechanics: string[] = [];
    let handlerResult: ActionExecutionResult | null = null;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onExecuteAction) {
        const mechanicStart = telemetryEnabled ? performance.now() : 0;
        const result = mechanic.onExecuteAction(ctx);

        if (result) {
          respondingMechanics.push(mechanic.slug);

          if (telemetryEnabled && result.handled) {
            logEvent(state, {
              event: 'mechanic_response',
              player: playerId,
              data: {
                mechanic: mechanic.slug,
                hook: 'onExecuteAction',
                response_type: 'state_changes',
                duration_ms: performance.now() - mechanicStart,
                response_data: { handled: true, advanceTurn: result.advanceTurn, checkWin: result.checkWin }
              }
            });
          }

          if (result.handled) {
            handlerResult = result;
            break;
          }
        }
      }
    }

    // Only log telemetry if mechanics are enabled (avoid noise from 0/0 mechanics)
    if (telemetryEnabled && enabledMechanics.length > 0) {
      logEvent(state, {
        event: 'hook_invoked',
        player: playerId,
        data: {
          hook: 'onExecuteAction',
          action_type: action.type,
          enabled_mechanics: enabledMechanics.map(m => m.slug),
          responding_mechanics: respondingMechanics,
          duration_ms: performance.now() - startTime,
          result: handlerResult ? 'modified' : 'no_response'
        }
      });
    }

    return handlerResult;
  }

  /**
   * Collect available actions from all enabled mechanics.
   * Returns actions sorted by priority (highest first).
   */
  getAvailableActions(state: GameState, playerId: string): AvailableAction[] {
    const ctx = this.createContext(state, playerId);
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const actions: AvailableAction[] = [];

    for (const mechanic of enabledMechanics) {
      if (mechanic.getAvailableActions) {
        const mechanicActions = mechanic.getAvailableActions(ctx);
        actions.push(...mechanicActions);
      }
    }

    // Sort by priority (higher first), then by type
    return actions.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.action.type.localeCompare(b.action.type);
    });
  }

  /**
   * Get description for an action from the owning mechanic.
   */
  describeAction(state: GameState, action: GameAction): ActionDescription | null {
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.describeAction) {
        const description = mechanic.describeAction(action);
        if (description) {
          return description;
        }
      }
    }

    return null;
  }

  // ============ Core Operation Hook Routing ============

  /**
   * Run onBeforeDraw hooks. Returns merged result with possibly modified count.
   * If any mechanic blocks, returns blocked: true.
   */
  onBeforeDraw(state: GameState, playerId: string, requestedCount: number): DrawHookResult {
    const ctx: DrawContext = {
      state,
      playerId,
      requestedCount,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let finalCount = requestedCount;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeDraw) {
        const result = mechanic.onBeforeDraw(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.count !== undefined) {
            finalCount = result.count;
          }
        }
      }
    }

    return { count: finalCount };
  }

  /**
   * Run onAfterDraw hooks. Returns merged state changes.
   */
  onAfterDraw(
    state: GameState,
    playerId: string,
    requestedCount: number,
    drawnCards: Card[],
    reshuffled: boolean
  ): StateChanges {
    const ctx: AfterDrawContext = {
      state,
      playerId,
      requestedCount,
      drawnCards,
      reshuffled,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterDraw) {
        const changes = mechanic.onAfterDraw(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onDiscard hooks. Returns merged state changes.
   */
  onDiscard(state: GameState, cards: Card[], playerId?: string): StateChanges {
    const ctx: DiscardContext = {
      state,
      playerId,
      cards,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onDiscard) {
        const changes = mechanic.onDiscard(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onBeforeAddToHand hooks. Returns possibly filtered cards or blocked.
   */
  onBeforeAddToHand(state: GameState, playerId: string, cards: Card[]): HandAddHookResult {
    const ctx: HandAddContext = {
      state,
      playerId,
      cards,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let filteredCards = cards;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeAddToHand) {
        const result = mechanic.onBeforeAddToHand(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.cards !== undefined) {
            filteredCards = result.cards;
          }
        }
      }
    }

    return { cards: filteredCards };
  }

  /**
   * Run onAfterAddToHand hooks. Returns merged state changes.
   */
  onAfterAddToHand(state: GameState, playerId: string, cards: Card[]): StateChanges {
    const ctx: HandAddContext = {
      state,
      playerId,
      cards,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterAddToHand) {
        const changes = mechanic.onAfterAddToHand(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onAfterRemoveFromHand hooks. Returns merged state changes.
   */
  onAfterRemoveFromHand(state: GameState, playerId: string, cards: Card[]): StateChanges {
    const ctx: HandRemoveContext = {
      state,
      playerId,
      cards,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterRemoveFromHand) {
        const changes = mechanic.onAfterRemoveFromHand(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  // ============ Resource Operation Hook Routing ============

  /**
   * Run onBeforeResourceChange hooks. Returns possibly modified amount or blocked.
   */
  onBeforeResourceChange(
    state: GameState,
    playerId: string,
    resource: string,
    amount: number
  ): ResourceChangeHookResult {
    const ctx: ResourceChangeContext = {
      state,
      playerId,
      resource,
      amount,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let finalAmount = Math.abs(amount); // Use absolute for hook processing

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeResourceChange) {
        const result = mechanic.onBeforeResourceChange(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.amount !== undefined) {
            finalAmount = result.amount;
          }
        }
      }
    }

    return { amount: finalAmount };
  }

  /**
   * Run onAfterResourceChange hooks. Returns merged state changes.
   */
  onAfterResourceChange(
    state: GameState,
    playerId: string,
    resource: string,
    amount: number,
    newAmount: number
  ): StateChanges {
    const ctx: AfterResourceChangeContext = {
      state,
      playerId,
      resource,
      amount,
      newAmount,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterResourceChange) {
        const changes = mechanic.onAfterResourceChange(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  // ============ Effect Operation Hook Routing ============

  /**
   * Run onBeforeAddEffect hooks. Returns possibly modified effect or blocked.
   */
  onBeforeAddEffect(state: GameState, playerId: string, effect: Effect): EffectAddHookResult {
    const ctx: EffectContext = {
      state,
      playerId,
      effect,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let finalEffect = effect;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeAddEffect) {
        const result = mechanic.onBeforeAddEffect(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.effect !== undefined) {
            finalEffect = result.effect;
          }
        }
      }
    }

    return { effect: finalEffect };
  }

  /**
   * Run onAfterAddEffect hooks. Returns merged state changes.
   */
  onAfterAddEffect(state: GameState, playerId: string, effect: Effect): StateChanges {
    const ctx: EffectContext = {
      state,
      playerId,
      effect,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterAddEffect) {
        const changes = mechanic.onAfterAddEffect(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Run onBeforeRemoveEffect hooks. Returns possibly blocked.
   */
  onBeforeRemoveEffect(state: GameState, playerId: string, effect: Effect): EffectRemoveHookResult {
    const ctx: EffectContext = {
      state,
      playerId,
      effect,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeRemoveEffect) {
        const result = mechanic.onBeforeRemoveEffect(ctx);
        if (result?.blocked) {
          return { blocked: true, blockReason: result.blockReason };
        }
      }
    }

    return {};
  }

  /**
   * Run onEffectExpired hooks. Returns merged state changes.
   */
  onEffectExpired(state: GameState, playerId: string, effect: Effect): StateChanges {
    const ctx: EffectContext = {
      state,
      playerId,
      effect,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onEffectExpired) {
        const changes = mechanic.onEffectExpired(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  // ============ Board Movement Hook Routing ============

  /**
   * Run onBeforeMove hooks. Returns possibly modified target or blocked.
   */
  onBeforeMove(state: GameState, playerId: string, target: string): MoveHookResult {
    const ctx: MoveContext = {
      state,
      playerId,
      target,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let finalTarget = target;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeMove) {
        const result = mechanic.onBeforeMove(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.target !== undefined) {
            finalTarget = result.target;
          }
        }
      }
    }

    return { target: finalTarget };
  }

  /**
   * Run onAfterMove hooks. Returns merged state changes.
   */
  onAfterMove(
    state: GameState,
    playerId: string,
    previousState: string,
    newState: string
  ): StateChanges {
    const ctx: AfterMoveContext = {
      state,
      playerId,
      previousState,
      newState,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterMove) {
        const changes = mechanic.onAfterMove(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  // ============ Visibility System Hook Routing (Phase 4) ============

  /**
   * Run getVisibleState hooks. Returns merged visible state.
   * Mechanics can filter what a viewer can see about game state.
   */
  getVisibleState(state: GameState, viewerPlayerId: string): VisibleState {
    const ctx: VisibilityContext = {
      state,
      viewerPlayerId,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedVisible: VisibleState = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.getVisibleState) {
        const result = mechanic.getVisibleState(ctx);
        if (result) {
          // Merge visibility results (more restrictive wins)
          if (result.players) {
            mergedVisible.players = mergedVisible.players || {};
            for (const [pid, pstate] of Object.entries(result.players)) {
              mergedVisible.players[pid] = {
                ...mergedVisible.players[pid],
                ...pstate
              };
            }
          }
          if (result.shared) {
            mergedVisible.shared = {
              ...mergedVisible.shared,
              ...result.shared
            };
          }
          if (result.visibilityMeta) {
            mergedVisible.visibilityMeta = {
              ...mergedVisible.visibilityMeta,
              ...result.visibilityMeta
            };
          }
        }
      }
    }

    return mergedVisible;
  }

  /**
   * Run onReveal hooks when hidden information is revealed.
   * Returns merged state changes.
   */
  onReveal(
    state: GameState,
    revealingPlayerId: string,
    targetInfo: string,
    toPlayerIds: string[] | 'all'
  ): StateChanges {
    const ctx: RevealContext = {
      state,
      revealingPlayerId,
      targetInfo,
      toPlayerIds,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onReveal) {
        const changes = mechanic.onReveal(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  /**
   * Check if a player can see specific information.
   * Returns true if any mechanic grants visibility, false if any denies.
   * Returns undefined if no mechanics have an opinion (default: visible).
   */
  canSeeInfo(
    state: GameState,
    viewerPlayerId: string,
    infoType: string,
    targetPlayerId?: string
  ): boolean | undefined {
    const ctx: VisibilityContext = {
      state,
      viewerPlayerId,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    let hasOpinion = false;
    let anyDenied = false;

    for (const mechanic of enabledMechanics) {
      if (mechanic.canSeeInfo) {
        const result = mechanic.canSeeInfo(ctx, infoType, targetPlayerId);
        if (result !== undefined) {
          hasOpinion = true;
          if (result === false) {
            anyDenied = true;
          }
        }
      }
    }

    if (!hasOpinion) return undefined;
    return !anyDenied;
  }

  // ============ Dice System Hook Routing (Phase 2) ============

  /**
   * Run onBeforeRoll hooks. Returns merged result with possibly modified dice.
   * If any mechanic blocks, returns blocked: true.
   */
  onBeforeRoll(
    state: GameState,
    playerId: string,
    ctx: DiceRollContext
  ): DiceRollHookResult {
    const enabledMechanics = this.getEnabledMechanics(state.config);
    let finalDiceCount = ctx.diceCount;
    let finalDiceSides = ctx.diceSides;
    let totalModifier = 0;

    for (const mechanic of enabledMechanics) {
      if (mechanic.onBeforeRoll) {
        const result = mechanic.onBeforeRoll(ctx);
        if (result) {
          if (result.blocked) {
            return { blocked: true, blockReason: result.blockReason };
          }
          if (result.diceCount !== undefined) {
            finalDiceCount = result.diceCount;
          }
          if (result.diceSides !== undefined) {
            finalDiceSides = result.diceSides;
          }
          if (result.modifier !== undefined) {
            totalModifier += result.modifier;
          }
        }
      }
    }

    return {
      diceCount: finalDiceCount,
      diceSides: finalDiceSides,
      modifier: totalModifier !== 0 ? totalModifier : undefined
    };
  }

  /**
   * Run onAfterRoll hooks. Returns merged state changes.
   */
  onAfterRoll(
    state: GameState,
    playerId: string,
    ctx: AfterRollContext
  ): StateChanges {
    const enabledMechanics = this.getEnabledMechanics(state.config);
    const mergedChanges: StateChanges = {};

    for (const mechanic of enabledMechanics) {
      if (mechanic.onAfterRoll) {
        const changes = mechanic.onAfterRoll(ctx);
        if (changes) {
          this.mergeStateChanges(mergedChanges, changes);
        }
      }
    }

    return mergedChanges;
  }

  // ============ Dynamic Turn Order Hook Routing (Phase 3) ============

  /**
   * Run onDetermineTurnOrder hooks. Returns new turn order if any mechanic provides one.
   * First mechanic to return a non-null order wins.
   */
  onDetermineTurnOrder(
    state: GameState,
    reason: 'round_start' | 'mid_round' | 'claim' | 'pass'
  ): TurnOrderResult | null {
    const ctx: TurnOrderContext = {
      state,
      config: state.config,
      currentOrder: state.turnOrder,
      reason
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onDetermineTurnOrder) {
        const result = mechanic.onDetermineTurnOrder(ctx);
        if (result?.order) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Run onPassPriority hooks. Returns next player or removal instruction.
   * First mechanic to return a result wins.
   */
  onPassPriority(state: GameState, playerId: string): PassPriorityResult | null {
    const ctx: HookContext = {
      state,
      playerId,
      player: state.players[playerId],
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onPassPriority) {
        const result = mechanic.onPassPriority(ctx);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  // ============ Voting & Social Hooks (Phase 5) ============

  /**
   * Route onVoteCast to all enabled mechanics
   */
  onVoteCast(
    state: GameState,
    playerId: string,
    topic: string,
    voteId: string,
    choice: string | number | null
  ): VoteCastResult | null {
    const ctx: VoteContext = {
      state,
      playerId,
      topic,
      voteId,
      choice,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onVoteCast) {
        const result = mechanic.onVoteCast(ctx);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Route onVoteTally to all enabled mechanics
   */
  onVoteTally(
    state: GameState,
    topic: string,
    voteId: string,
    votes: Record<string, string | number | null>
  ): VoteTallyResult | null {
    const ctx: VoteTallyContext = {
      state,
      topic,
      voteId,
      votes,
      config: state.config
    };
    const enabledMechanics = this.getEnabledMechanics(state.config);

    for (const mechanic of enabledMechanics) {
      if (mechanic.onVoteTally) {
        const result = mechanic.onVoteTally(ctx);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Helper to merge state changes
   */
  private mergeStateChanges(target: StateChanges, source: StateChanges): void {
    if (source.playerStateChanges) {
      target.playerStateChanges = target.playerStateChanges || {};
      for (const [pid, pchanges] of Object.entries(source.playerStateChanges)) {
        target.playerStateChanges[pid] = {
          ...target.playerStateChanges[pid],
          ...pchanges
        };
      }
    }
    if (source.sharedStateChanges) {
      target.sharedStateChanges = {
        ...target.sharedStateChanges,
        ...source.sharedStateChanges
      };
    }
  }
}

/**
 * Get all registered mechanics as metadata for export.
 * Used by scripts to generate shared/registered-mechanics.json
 */
export function getRegisteredMechanicsMetadata(): MechanicMetadata[] {
  return mechanicRegistry.getAllMechanicsMetadata();
}

// Singleton registry instance
export const mechanicRegistry = new MechanicRegistry();

/**
 * Apply state changes to game state (mutates state)
 */
export function applyStateChanges(state: GameState, changes: StateChanges): void {
  if (changes.playerStateChanges) {
    for (const [playerId, playerChanges] of Object.entries(changes.playerStateChanges)) {
      if (state.players[playerId]) {
        Object.assign(state.players[playerId], playerChanges);
      }
    }
  }
  if (changes.sharedStateChanges) {
    state.shared = { ...state.shared, ...changes.sharedStateChanges };
  }
}
