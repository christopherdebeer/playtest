/**
 * Mechanic Registry — Data-driven mechanic registration and hook routing.
 *
 * Each mechanic is registered with metadata (slug, name, defines, requires, hooks)
 * and optionally functional hook implementations. The registry routes hooks to
 * the appropriate mechanics based on config, dependencies, and resolution strategy.
 *
 * The Lean engine handles formal execution; this TS registry provides:
 * - Dependency validation at init time
 * - Mechanic metadata inspection
 * - TS-side hook routing for testing and fallback
 */

import type { StateChanges, ActionExecutionResult, AvailableAction, WinCheckResult } from './types.js';
import type { GameState, GameConfig, GameAction } from '../types/game.js';
import { isBlocked } from './core/effects.js';

// ============ Types ============

export interface MechanicValidationError {
  mechanic: string;
  type: 'missing_dependency' | 'conflict';
  message: string;
}

export interface MechanicMetadata {
  slug: string;
  name: string;
  configKey: string;
  defines?: string;
  requires?: string[];
  hooks: string[];
  alwaysEnabled?: boolean;
}

export interface RegisteredMechanic extends MechanicMetadata {
  // Hook implementations (optional — not all mechanics implement all hooks)
  onExecuteAction?: (state: GameState, playerId: string, action: GameAction) => ActionExecutionResult | null;
  preValidateAction?: (state: GameState, playerId: string, action: GameAction) => { valid: boolean; error?: string } | null;
  getAvailableActions?: (state: GameState, playerId: string) => AvailableAction[];
  onCheckWin?: (state: GameState, playerId: string, trigger: string) => WinCheckResult | null;
  describeAction?: (state: GameState, action: GameAction) => { type: string; label: string; description?: string } | null;
  isPlayerBlocked?: (state: GameState, playerId: string) => boolean;
  canPlayerActNow?: (state: GameState, playerId: string) => boolean;
  getPlayerView?: (state: GameState, playerId: string) => Record<string, unknown>;
  initSharedState?: (config: GameConfig, deck: unknown[], turnOrder: string[], shared: Record<string, unknown>) => Record<string, unknown>;
  initPlayerState?: (config: GameConfig, playerId: string, playerIndex: number, players: Record<string, unknown>, shared: Record<string, unknown>) => Record<string, unknown>;
  onDiceRolled?: (state: GameState, playerId: string, data: Record<string, unknown>) => void;
  onResourceGained?: (state: GameState, playerId: string, data: Record<string, unknown>) => { blocked?: boolean; reducedAmount?: number } | null;
  onVoteTally?: (state: GameState, playerId: string, data: Record<string, unknown>) => Record<string, unknown> | null;
}

export function getMechanicRequires(): string[] {
  return [];
}

// ============ Registry Implementation ============

class MechanicRegistry {
  private mechanics = new Map<string, RegisteredMechanic>();

  register(mechanic: RegisteredMechanic): void {
    this.mechanics.set(mechanic.slug, mechanic);
  }

  installDependencyResolver(): void {
    // No-op — dependency resolution happens inline
  }

  // ============ Dependency Validation ============

  validateDependencies(config: GameConfig): MechanicValidationError[] {
    const errors: MechanicValidationError[] = [];
    const enabled = this.getEnabledMechanicSlugs(config);

    for (const slug of enabled) {
      const mech = this.mechanics.get(slug);
      if (!mech?.requires) continue;
      for (const dep of mech.requires) {
        if (!enabled.has(dep)) {
          errors.push({
            mechanic: slug,
            type: 'missing_dependency',
            message: `${slug} requires ${dep} but it is not enabled`,
          });
        }
      }
    }
    return errors;
  }

  private getEnabledMechanicSlugs(config: GameConfig): Set<string> {
    const enabled = new Set<string>();

    // Always-enabled mechanics
    for (const [, mech] of this.mechanics) {
      if (mech.alwaysEnabled) enabled.add(mech.slug);
    }

    // Explicitly configured mechanics
    if (config.engine_mechanics) {
      for (const key of Object.keys(config.engine_mechanics)) {
        const slug = key.replace(/_/g, '-');
        if (this.mechanics.has(slug)) enabled.add(slug);
        // Also check original key form
        if (this.mechanics.has(key)) enabled.add(key);
      }
    }

    // Resolve dependencies (transitive)
    let changed = true;
    while (changed) {
      changed = false;
      for (const slug of enabled) {
        const mech = this.mechanics.get(slug);
        if (!mech?.requires) continue;
        for (const dep of mech.requires) {
          if (!enabled.has(dep)) {
            enabled.add(dep);
            changed = true;
          }
        }
      }
    }

    return enabled;
  }

  getEnabledMechanics(config: GameConfig): RegisteredMechanic[] {
    const slugs = this.getEnabledMechanicSlugs(config);
    return [...slugs].map(s => this.mechanics.get(s)!).filter(Boolean);
  }

  private isEnabled(config: GameConfig, slug: string): boolean {
    return this.getEnabledMechanicSlugs(config).has(slug);
  }

  private getConfig(config: GameConfig, slug: string): unknown {
    if (!config.engine_mechanics) return undefined;
    const configKey = slug.replace(/-/g, '_');
    return (config.engine_mechanics as Record<string, unknown>)[configKey];
  }

  // ============ Hook Routing ============

  fire(definerSlug: string, hookName: string, state: GameState, playerId: string, data?: Record<string, unknown>): unknown {
    const definer = this.mechanics.get(definerSlug);
    if (!definer) return null;

    // Find dependents that require this definer and implement the hook
    for (const [, mech] of this.mechanics) {
      if (!mech.requires?.includes(definerSlug)) continue;
      if (!this.isEnabled(state.config, mech.slug)) continue;

      const hookFn = (mech as unknown as Record<string, unknown>)[hookName];
      if (typeof hookFn === 'function') {
        const result = hookFn.call(mech, state, playerId, data || {});
        if (result !== null && result !== undefined) return result;
      }
    }

    // Also check the definer itself for the hook
    const hookFn = (definer as unknown as Record<string, unknown>)[hookName];
    if (typeof hookFn === 'function') {
      const result = hookFn.call(definer, state, playerId, data || {});
      if (result !== null && result !== undefined) return result;
    }

    return null;
  }

  preValidateAction(state: GameState, playerId: string, action: GameAction): { valid: boolean; error?: string } {
    for (const [, mech] of this.mechanics) {
      if (!mech.preValidateAction) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      const result = mech.preValidateAction(state, playerId, action);
      if (result && !result.valid) return result;
    }
    return { valid: true };
  }

  executeAction(state: GameState, playerId: string, action: GameAction): ActionExecutionResult | null {
    for (const [, mech] of this.mechanics) {
      if (!mech.onExecuteAction) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      const result = mech.onExecuteAction(state, playerId, action);
      if (result?.handled) return result;
    }
    return null;
  }

  postExecuteAction(_state: GameState, _playerId: string, _action: GameAction): StateChanges {
    return {};
  }

  shouldAutoEndTurn(_state: GameState, _playerId: string): boolean {
    return false;
  }

  getAvailableActions(state: GameState, playerId: string): AvailableAction[] {
    const actions: AvailableAction[] = [];
    for (const [, mech] of this.mechanics) {
      if (!mech.getAvailableActions) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      actions.push(...mech.getAvailableActions(state, playerId));
    }
    return actions;
  }

  onTurnStart(_state: GameState, _playerId: string, _isNewRound: boolean): StateChanges {
    return {};
  }

  onTurnEnd(_state: GameState, _playerId: string, _nextPlayerId: string, _isRoundEnd: boolean): StateChanges {
    return {};
  }

  onCheckWin(state: GameState, playerId: string, trigger: string): WinCheckResult | null {
    for (const [, mech] of this.mechanics) {
      if (!mech.onCheckWin) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      const result = mech.onCheckWin(state, playerId, trigger);
      if (result?.won) return result;
    }
    return null;
  }

  checkAllWinConditions(state: GameState, trigger: string): { playerId: string; reason: string } | null {
    for (const playerId of Object.keys(state.players)) {
      const result = this.onCheckWin(state, playerId, trigger);
      if (result?.won) {
        return { playerId, reason: result.reason || 'Win condition met' };
      }
    }
    return null;
  }

  initSharedState(config: GameConfig, deck: unknown[], turnOrder: string[], shared: Record<string, unknown>): Record<string, unknown> {
    let result = { ...shared };
    for (const [, mech] of this.mechanics) {
      if (!mech.initSharedState) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(config, mech.slug)) continue;
      Object.assign(result, mech.initSharedState(config, deck, turnOrder, result));
    }
    return result;
  }

  initPlayerState(config: GameConfig, playerId: string, playerIndex: number, players: Record<string, unknown>, shared: Record<string, unknown>): Record<string, unknown> {
    let result: Record<string, unknown> = {};
    for (const [, mech] of this.mechanics) {
      if (!mech.initPlayerState) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(config, mech.slug)) continue;
      Object.assign(result, mech.initPlayerState(config, playerId, playerIndex, players, shared));
    }
    return result;
  }

  getPlayerView(state: GameState, playerId: string): Record<string, unknown> {
    let view: Record<string, unknown> = {};
    for (const [, mech] of this.mechanics) {
      if (!mech.getPlayerView) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      Object.assign(view, mech.getPlayerView(state, playerId));
    }
    return view;
  }

  canPlayerActNow(state: GameState, playerId: string): boolean {
    for (const [, mech] of this.mechanics) {
      if (!mech.canPlayerActNow) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      if (mech.canPlayerActNow(state, playerId)) return true;
    }
    return false;
  }

  isPlayerBlocked(state: GameState, playerId: string): boolean {
    for (const [, mech] of this.mechanics) {
      if (!mech.isPlayerBlocked) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      if (mech.isPlayerBlocked(state, playerId)) return true;
    }
    return false;
  }

  describeAction(state: GameState, action: GameAction): { type: string; label: string; description?: string } | null {
    for (const [, mech] of this.mechanics) {
      if (!mech.describeAction) continue;
      if (!mech.alwaysEnabled && !this.isEnabled(state.config, mech.slug)) continue;
      const result = mech.describeAction(state, action);
      if (result) return result;
    }
    return null;
  }

  getActionSchema(_state: GameState, _action: GameAction): { required?: string[]; optional?: string[] } | null {
    return null;
  }

  // ============ Metadata ============

  getAllMechanicsMetadata(): MechanicMetadata[] {
    return [...this.mechanics.values()].map(m => ({
      slug: m.slug,
      name: m.name,
      configKey: m.configKey,
      defines: m.defines,
      requires: m.requires,
      hooks: m.hooks,
      alwaysEnabled: m.alwaysEnabled,
    }));
  }

  getRegisteredMechanicsMetadata(): MechanicMetadata[] {
    return this.getAllMechanicsMetadata();
  }

  getMechanic(slug: string): RegisteredMechanic | undefined {
    return this.mechanics.get(slug);
  }

  getRegisteredSlugs(): string[] {
    return [...this.mechanics.keys()];
  }

  getHighlights(config: GameConfig): string[] {
    return this.getEnabledMechanics(config).map(m => m.name);
  }
}

// ============ Create and Populate Registry ============

export const mechanicRegistry = new MechanicRegistry();

// -- Core mechanics (always enabled or dependency-enabled) --

mechanicRegistry.register({
  slug: 'cards',
  name: 'Cards',
  configKey: 'cards',
  defines: 'cards',
  hooks: ['onCardDrawn', 'onCardPlayed', 'onCardDiscarded'],
});

mechanicRegistry.register({
  slug: 'resources',
  name: 'Resources',
  configKey: 'resources',
  defines: 'resources',
  hooks: ['onResourceGained', 'onResourceSpent'],
});

mechanicRegistry.register({
  slug: 'dice',
  name: 'Dice',
  configKey: 'dice',
  defines: 'dice',
  hooks: ['onDiceRolled'],
});

mechanicRegistry.register({
  slug: 'effects',
  name: 'Effects',
  configKey: 'effects',
  defines: 'effects',
  hooks: ['onEffectAdded', 'onEffectRemoved', 'onEffectExpired'],
});

mechanicRegistry.register({
  slug: 'board',
  name: 'Board',
  configKey: 'board',
  defines: 'board',
  hooks: ['onPlayerMoved'],
});

mechanicRegistry.register({
  slug: 'social',
  name: 'Social',
  configKey: 'social',
  defines: 'social',
  hooks: ['onVoteTally', 'onNegotiationComplete'],
});

// -- Pass mechanic (always enabled) --

mechanicRegistry.register({
  slug: 'pass',
  name: 'Pass',
  configKey: 'pass',
  alwaysEnabled: true,
  hooks: ['onExecuteAction', 'describeAction'],
  onExecuteAction: (_state: GameState, _playerId: string, action: GameAction) => {
    if (action.type !== 'pass') return null;
    return { handled: true, advanceTurn: true, logMessage: 'Player passed' };
  },
  describeAction: (_state: GameState, action: GameAction) => {
    if (action.type !== 'pass') return null;
    return { type: 'pass', label: 'Pass', description: 'End your turn without taking an action' };
  },
});

// -- Board State mechanic (validates moves) --

mechanicRegistry.register({
  slug: 'board-state',
  name: 'Board State',
  configKey: 'board_state',
  requires: ['board'],
  hooks: ['preValidateAction', 'getAvailableActions'],
  preValidateAction: (state: GameState, playerId: string, action: GameAction) => {
    if (action.type !== 'move') return null;
    const board = state.config.board;
    if (!board?.edges) return null;
    const playerState = state.players[playerId]?.state;
    const target = (action as unknown as Record<string, unknown>).target as string;
    const edge = board.edges.find(e => {
      const from = Array.isArray(e.from) ? e.from : [e.from];
      return from.includes(playerState);
    });
    const destinations = edge ? (Array.isArray(edge.to) ? edge.to : [edge.to]) : [];
    if (!edge || !destinations.includes(target)) {
      return { valid: false, error: `Cannot move from ${playerState} to ${target}` };
    }
    return { valid: true };
  },
  getAvailableActions: (state: GameState, playerId: string) => {
    const board = state.config.board;
    if (!board?.edges) return [];
    const playerState = state.players[playerId]?.state;
    const edge = board.edges.find(e => {
      const from = Array.isArray(e.from) ? e.from : [e.from];
      return from.includes(playerState);
    });
    if (!edge) return [];
    const destinations = Array.isArray(edge.to) ? edge.to : [edge.to];
    return [{
      action: { type: 'move' } as unknown as GameAction,
      category: 'movement',
      enabled: true,
      targets: destinations,
    }];
  },
});

// -- Dice Rolling mechanic (stores roll results) --

mechanicRegistry.register({
  slug: 'dice-rolling',
  name: 'Dice Rolling',
  configKey: 'dice_rolling',
  requires: ['dice'],
  hooks: ['onDiceRolled'],
  onDiceRolled: (state: GameState, playerId: string, data: Record<string, unknown>) => {
    const player = state.players[playerId];
    if (player) {
      player.lastRollResults = data.results as number[];
      player.lastRollTotal = data.total as number;
    }
  },
});

// -- Catch the Leader (reduces income for leading player) --

mechanicRegistry.register({
  slug: 'catch-the-leader',
  name: 'Catch the Leader',
  configKey: 'catch_the_leader',
  requires: ['resources'],
  hooks: ['onResourceGained'],
  onResourceGained: (state: GameState, playerId: string, data: Record<string, unknown>) => {
    const config = (state.config.engine_mechanics as Record<string, unknown>)?.catch_the_leader as Record<string, unknown> | undefined;
    if (!config) return null;
    const resource = config.resource as string;
    const reduction = config.income_reduction as number;
    if (data.resource !== resource) return null;

    // Check if this player is the leader
    const playerAmount = state.players[playerId]?.resources?.[resource] ?? 0;
    let isLeader = true;
    for (const [pid, p] of Object.entries(state.players)) {
      if (pid !== playerId && (p.resources?.[resource] ?? 0) > playerAmount) {
        isLeader = false;
        break;
      }
    }
    if (!isLeader || Object.keys(state.players).length <= 1) return null;

    const amount = data.amount as number;
    const reduced = Math.floor(amount * reduction);
    return { reducedAmount: reduced };
  },
});

// -- Voting mechanic --

mechanicRegistry.register({
  slug: 'voting',
  name: 'Voting',
  configKey: 'voting',
  requires: ['social'],
  hooks: ['onVoteTally'],
  onVoteTally: (_state: GameState, _playerId: string, data: Record<string, unknown>) => {
    const votes = data.votes as Record<string, string>;
    const counts: Record<string, number> = {};
    for (const choice of Object.values(votes)) {
      counts[choice] = (counts[choice] ?? 0) + 1;
    }
    const maxVotes = Math.max(...Object.values(counts), 0);
    const winners = Object.keys(counts).filter(k => counts[k] === maxVotes);
    return { winner: winners.length === 1 ? winners[0] : null, counts };
  },
});

// -- Win Reach State --

mechanicRegistry.register({
  slug: 'win-reach-state',
  name: 'Win: Reach State',
  configKey: 'win_reach_state',
  hooks: ['onCheckWin'],
  onCheckWin: (state: GameState, playerId: string, _trigger: string) => {
    const config = (state.config.engine_mechanics as Record<string, unknown>)?.win_reach_state as Record<string, unknown> | undefined;
    if (!config) return null;
    const targetState = config.target_state as string;
    if (state.players[playerId]?.state === targetState) {
      return { won: true, reason: `Reached ${targetState}` };
    }
    return { won: false };
  },
});

// -- Lose a Turn (blocking effect) --

mechanicRegistry.register({
  slug: 'lose-a-turn',
  name: 'Lose a Turn',
  configKey: 'lose_a_turn',
  requires: ['effects'],
  hooks: ['isPlayerBlocked'],
  isPlayerBlocked: (state: GameState, playerId: string) => {
    return isBlocked(state, playerId);
  },
});

// -- Freeplay (all players can act) --

mechanicRegistry.register({
  slug: 'freeplay',
  name: 'Freeplay',
  configKey: 'freeplay',
  hooks: ['canPlayerActNow'],
  canPlayerActNow: (_state: GameState, _playerId: string) => {
    return true;
  },
});

// -- Push Your Luck (player view contribution) --

mechanicRegistry.register({
  slug: 'push-your-luck',
  name: 'Push Your Luck',
  configKey: 'push_your_luck',
  hooks: ['getPlayerView'],
  getPlayerView: (state: GameState, playerId: string) => {
    const player = state.players[playerId];
    const view: Record<string, unknown> = {};
    if (player?.rollAccumulator !== undefined) view.rollAccumulator = player.rollAccumulator;
    if (player?.rollCount !== undefined) view.rollCount = player.rollCount;
    return view;
  },
});

// -- Remaining mechanics (metadata-only for registry completeness) --

const metadataOnlyMechanics: Omit<MechanicMetadata, 'hooks'>[] = [
  { slug: 'action-points', name: 'Action Points', configKey: 'action_points' },
  { slug: 'income', name: 'Income', configKey: 'income' },
  { slug: 'set-collection', name: 'Set Collection', configKey: 'set_collection' },
  { slug: 'auction', name: 'Auction', configKey: 'auction' },
  { slug: 'turn-order', name: 'Turn Order', configKey: 'turn_order' },
  { slug: 'variable-powers', name: 'Variable Powers', configKey: 'variable_powers' },
  { slug: 'open-drafting', name: 'Open Drafting', configKey: 'open_drafting' },
  { slug: 'simultaneous', name: 'Simultaneous', configKey: 'simultaneous' },
  { slug: 'grid', name: 'Grid', configKey: 'grid' },
  { slug: 'trade', name: 'Trade', configKey: 'trade' },
  { slug: 'hand-limit', name: 'Hand Limit', configKey: 'hand_limit' },
  { slug: 'card-type-rules', name: 'Card Type Rules', configKey: 'card_type_rules' },
  { slug: 'timeout-winner', name: 'Timeout Winner', configKey: 'timeout_winner' },
  { slug: 'win-score-threshold', name: 'Win: Score Threshold', configKey: 'win_score_threshold' },
  { slug: 'win-empty-hand', name: 'Win: Empty Hand', configKey: 'win_empty_hand' },
  { slug: 'win-elimination', name: 'Win: Elimination', configKey: 'win_elimination' },
  { slug: 'win-timeout', name: 'Win: Timeout', configKey: 'win_timeout' },
  { slug: 'win-end-game-bonuses', name: 'Win: End Game Bonuses', configKey: 'win_end_game_bonuses' },
  { slug: 'win-king-of-the-hill', name: 'Win: King of the Hill', configKey: 'win_king_of_the_hill' },
  { slug: 'win-victory-points-as-resource', name: 'Win: VP as Resource', configKey: 'win_victory_points_as_resource' },
  { slug: 'win-highest-lowest-scoring', name: 'Win: Highest/Lowest Scoring', configKey: 'win_highest_lowest_scoring' },
  { slug: 'closed-drafting', name: 'Closed Drafting', configKey: 'closed_drafting' },
  { slug: 'trick-taking', name: 'Trick Taking', configKey: 'trick_taking', requires: ['cards'] },
  { slug: 'movement-points', name: 'Movement Points', configKey: 'movement_points' },
  { slug: 'automatic-resource-growth', name: 'Auto Resource Growth', configKey: 'automatic_resource_growth' },
  { slug: 'events', name: 'Events', configKey: 'events' },
  { slug: 'ladder-climbing', name: 'Ladder Climbing', configKey: 'ladder_climbing' },
  { slug: 'once-per-game-abilities', name: 'Once Per Game Abilities', configKey: 'once_per_game_abilities' },
  { slug: 'chaining', name: 'Chaining', configKey: 'chaining' },
  { slug: 'win-race', name: 'Win: Race', configKey: 'win_race' },
  { slug: 'sudden-death-ending', name: 'Sudden Death', configKey: 'sudden_death_ending' },
  { slug: 'area-movement', name: 'Area Movement', configKey: 'area_movement' },
  { slug: 'deck-building', name: 'Deck Building', configKey: 'deck_building', requires: ['cards'] },
  { slug: 'multi-use-cards', name: 'Multi-Use Cards', configKey: 'multi_use_cards', requires: ['cards'] },
  { slug: 'point-to-point-movement', name: 'Point to Point Movement', configKey: 'point_to_point_movement' },
  { slug: 'hidden-roles', name: 'Hidden Roles', configKey: 'hidden_roles' },
  { slug: 'traitor-game', name: 'Traitor Game', configKey: 'traitor_game' },
  { slug: 'card-matching', name: 'Card Matching', configKey: 'card_matching', requires: ['cards'] },
  { slug: 'probability-movement', name: 'Probability Movement', configKey: 'probability_movement' },
  { slug: 'card-boosts', name: 'Card Boosts', configKey: 'card_boosts' },
  { slug: 'victory-declaration', name: 'Victory Declaration', configKey: 'victory_declaration' },
  { slug: 'rerolling', name: 'Rerolling', configKey: 'rerolling', requires: ['dice'] },
  { slug: 'turn-order-random', name: 'Turn Order: Random', configKey: 'turn_order_random' },
  { slug: 'turn-order-stat-based', name: 'Turn Order: Stat Based', configKey: 'turn_order_stat_based' },
  { slug: 'turn-order-progressive', name: 'Turn Order: Progressive', configKey: 'turn_order_progressive' },
  { slug: 'hidden-victory-points', name: 'Hidden VP', configKey: 'hidden_victory_points' },
  { slug: 'negotiation', name: 'Negotiation', configKey: 'negotiation' },
  { slug: 'communication-limits', name: 'Communication Limits', configKey: 'communication_limits' },
  { slug: 'roll-spin-move', name: 'Roll/Spin/Move', configKey: 'roll_spin_move' },
  { slug: 'different-dice-movement', name: 'Different Dice Movement', configKey: 'different_dice_movement' },
  { slug: 'turn-order-pass-order', name: 'Turn Order: Pass Order', configKey: 'turn_order_pass_order' },
  { slug: 'hidden-movement', name: 'Hidden Movement', configKey: 'hidden_movement' },
  { slug: 'hidden-objectives', name: 'Hidden Objectives', configKey: 'hidden_objectives' },
  { slug: 'auction-sealed-bid', name: 'Auction: Sealed Bid', configKey: 'auction_sealed_bid' },
  { slug: 'auction-once-around', name: 'Auction: Once Around', configKey: 'auction_once_around' },
  { slug: 'die-icon-resolution', name: 'Die Icon Resolution', configKey: 'die_icon_resolution' },
  { slug: 'turn-order-auction', name: 'Turn Order: Auction', configKey: 'turn_order_auction' },
  { slug: 'turn-order-claim', name: 'Turn Order: Claim', configKey: 'turn_order_claim' },
  { slug: 'turn-order-time-track', name: 'Turn Order: Time Track', configKey: 'turn_order_time_track' },
  { slug: 'turn-order-role', name: 'Turn Order: Role', configKey: 'turn_order_role' },
  { slug: 'deduction', name: 'Deduction', configKey: 'deduction' },
  { slug: 'memory', name: 'Memory', configKey: 'memory' },
  { slug: 'targeted-clues', name: 'Targeted Clues', configKey: 'targeted_clues' },
  { slug: 'roles-asymmetric-info', name: 'Roles: Asymmetric Info', configKey: 'roles_asymmetric_info' },
  { slug: 'player-judge', name: 'Player Judge', configKey: 'player_judge' },
  { slug: 'i-cut-you-choose', name: 'I Cut You Choose', configKey: 'i_cut_you_choose' },
  { slug: 'bribery', name: 'Bribery', configKey: 'bribery' },
  { slug: 'critical-hits', name: 'Critical Hits', configKey: 'critical_hits' },
  { slug: 'zone-of-control', name: 'Zone of Control', configKey: 'zone_of_control' },
  { slug: 'ratio-crt', name: 'Ratio CRT', configKey: 'ratio_crt' },
  { slug: 'force-commitment', name: 'Force Commitment', configKey: 'force_commitment' },
  { slug: 'area-impulse', name: 'Area Impulse', configKey: 'area_impulse' },
  { slug: 'chit-pull', name: 'Chit Pull', configKey: 'chit_pull' },
  { slug: 'secret-deployment', name: 'Secret Deployment', configKey: 'secret_deployment' },
  { slug: 'kill-steal', name: 'Kill Steal', configKey: 'kill_steal' },
  { slug: 'worker-placement', name: 'Worker Placement', configKey: 'worker_placement' },
  { slug: 'different-worker-types', name: 'Different Worker Types', configKey: 'different_worker_types' },
  { slug: 'auction-dutch', name: 'Auction: Dutch', configKey: 'auction_dutch' },
  { slug: 'simultaneous-action-selection', name: 'Simultaneous Action Selection', configKey: 'simultaneous_action_selection' },
  { slug: 'market', name: 'Market', configKey: 'market' },
  { slug: 'tableau-building', name: 'Tableau Building', configKey: 'tableau_building' },
  { slug: 'action-programming', name: 'Action Programming', configKey: 'action_programming' },
  { slug: 'cooperative', name: 'Cooperative', configKey: 'cooperative' },
  { slug: 'contracts', name: 'Contracts', configKey: 'contracts' },
  { slug: 'loans', name: 'Loans', configKey: 'loans' },
  { slug: 'win-finale-ending', name: 'Win: Finale Ending', configKey: 'win_finale_ending' },
  { slug: 'win-single-loser', name: 'Win: Single Loser', configKey: 'win_single_loser' },
  { slug: 'player-elimination', name: 'Player Elimination', configKey: 'player_elimination' },
];

for (const meta of metadataOnlyMechanics) {
  mechanicRegistry.register({
    ...meta,
    hooks: [],
  } as RegisteredMechanic);
}

// ============ Utility ============

export function applyStateChanges(state: GameState, changes: StateChanges): void {
  if (!changes) return;
  if (changes.playerStateChanges) {
    for (const [pid, playerChanges] of Object.entries(changes.playerStateChanges)) {
      if (state.players[pid]) {
        Object.assign(state.players[pid], playerChanges);
      }
    }
  }
  if (changes.sharedStateChanges) {
    Object.assign(state.shared, changes.sharedStateChanges);
  }
}

export function getRegisteredMechanicsMetadata(): MechanicMetadata[] {
  return mechanicRegistry.getAllMechanicsMetadata();
}
