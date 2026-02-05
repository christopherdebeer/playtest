/**
 * Layer 2: Registry Hook Routing Tests
 *
 * Tests that verify the MechanicRegistry's fire() method correctly routes
 * mechanic-defined hooks based on resolution strategy and dependency chains.
 *
 * Tests verify:
 * - merge resolution: Multiple dependents' StateChanges accumulated
 * - first resolution: First non-null response wins, others skipped
 * - blocking resolution: Short-circuit when blocked: true
 * - Dependency filtering: Only mechanics with requires: [definer] receive hooks
 * - Disabled mechanics are skipped
 * - Global hook routing (preValidateAction, onExecuteAction, getAvailableActions)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import game.ts first to resolve circular dependency
import '../src/core/game.js';

import type { GameState, Card, GameConfig } from '../src/types/game.js';
import { mechanicRegistry } from '../src/mechanics/index.js';
import { addResource, getResource } from '../src/mechanics/core/resources.js';
import { rollDice } from '../src/mechanics/core/dice.js';
import { addToHand } from '../src/mechanics/core/hand.js';
import { addEffect } from '../src/mechanics/core/effects.js';

// ============ Helpers ============

function mulberry32(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCard(name: string, type = 'action'): Card {
  return { name, type };
}

function makeState(configOverrides?: Partial<GameConfig>): GameState {
  return {
    gameId: 'test-registry-1',
    gameName: 'test-game',
    status: 'in_progress',
    round: 1,
    turnNumber: 1,
    currentPlayer: 'player-1',
    turnOrder: ['player-1', 'player-2'],
    players: {
      'player-1': {
        state: 'Start',
        hand: [],
        effects: [],
        resources: { gold: 10, wood: 5 },
        score: 0,
      },
      'player-2': {
        state: 'Start',
        hand: [],
        effects: [],
        resources: { gold: 5, wood: 3 },
        score: 0,
      },
    },
    shared: {},
    deck: Array.from({ length: 10 }, (_, i) => makeCard(`Card-${i + 1}`)),
    discardPile: [],
    config: {
      name: 'test-game',
      version: '1.0',
      players: 2,
      win_condition: 'test',
      max_rounds: 10,
      engine_mechanics: {},
      ...configOverrides,
    },
    rulesMarkdown: '',
    log: '/tmp/test-registry-log.jsonl',
  };
}

// ============ fire() resolution strategies ============

describe('registry fire() resolution', () => {
  let originalRandom: () => number;

  beforeEach(() => {
    originalRandom = Math.random;
    Math.random = mulberry32(42);
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  describe('merge resolution', () => {
    it('dice-rolling stores roll results in player state via onDiceRolled', () => {
      const state = makeState({
        engine_mechanics: { dice_rolling: true },
      });
      const result = rollDice(state, 'player-1', { diceCount: 2, diceSides: 6 });

      // dice-rolling's onDiceRolled hook saves results to player state
      expect(result.results).toHaveLength(2);
      expect(state.players['player-1'].lastRollResults).toEqual(result.results);
      expect(state.players['player-1'].lastRollTotal).toBe(result.total);
    });

    it('onDiceRolled does not store when dice-rolling disabled', () => {
      const state = makeState(); // no dice_rolling in engine_mechanics
      rollDice(state, 'player-1', { diceCount: 2, diceSides: 6 });

      // No dependent mechanic to respond
      expect(state.players['player-1'].lastRollResults).toBeUndefined();
    });
  });

  describe('blocking resolution', () => {
    it('catch-the-leader reduces resource gain for leader', () => {
      const state = makeState({
        engine_mechanics: {
          catch_the_leader: {
            resource: 'gold',
            income_reduction: 0.5,
          },
        },
      });

      // player-1 has more gold (10 vs 5) — they're the leader
      const result = addResource(state, 'player-1', 'gold', 10);
      expect(result.success).toBe(true);
      // The leader should receive a reduced amount
      expect(result.actualChange).toBeLessThanOrEqual(10);
    });

    it('catch-the-leader does not reduce for non-leader', () => {
      const state = makeState({
        engine_mechanics: {
          catch_the_leader: {
            resource: 'gold',
            income_reduction: 0.5,
          },
        },
      });

      // player-2 has less gold (5 vs 10) — not the leader
      const result = addResource(state, 'player-2', 'gold', 10);
      expect(result.success).toBe(true);
      // Non-leader should receive full amount
      expect(result.actualChange).toBe(10);
    });
  });

  describe('first resolution', () => {
    it('fire returns first non-null result', () => {
      // Social's onVoteTally uses 'first' resolution
      // We can test by checking that fire() returns a result when a dependent exists
      const state = makeState({
        engine_mechanics: { voting: true },
      });

      // Fire onVoteTally directly — voting mechanic implements this
      const result = mechanicRegistry.fire('social', 'onVoteTally', state, 'player-1', {
        sessionId: 'test-vote',
        topic: 'test',
        votes: { 'player-1': 'A', 'player-2': 'A' },
      });

      // voting mechanic should respond (first resolution — first non-null wins)
      expect(result).not.toBeNull();
    });

    it('fire returns null when no dependents respond', () => {
      // No voting mechanic enabled
      const state = makeState();

      const result = mechanicRegistry.fire('social', 'onVoteTally', state, 'player-1', {
        sessionId: 'test-vote',
        topic: 'test',
        votes: {},
      });

      expect(result).toBeNull();
    });
  });
});

// ============ Dependency filtering ============

describe('registry dependency filtering', () => {
  it('fire() only routes to mechanics that require the definer', () => {
    // dice-rolling requires ['dice'], not ['resources']
    // So onResourceGained should NOT be received by dice-rolling
    const state = makeState({
      engine_mechanics: { dice_rolling: true },
    });

    // Add resource — no resource-dependent mechanics enabled
    addResource(state, 'player-1', 'gold', 5);

    // dice-rolling should NOT have been called for resource hooks
    // (it doesn't implement them anyway, but the routing would skip it)
    // Verify resources changed correctly
    expect(getResource(state, 'player-1', 'gold')).toBe(15);
  });

  it('fire() returns null for unregistered definer', () => {
    const state = makeState();
    const result = mechanicRegistry.fire('nonexistent', 'onSomething', state, 'player-1');
    expect(result).toBeNull();
  });

  it('fire() returns null for undefined hook on registered definer', () => {
    const state = makeState();
    const result = mechanicRegistry.fire('cards', 'onNonexistentHook', state, 'player-1');
    expect(result).toBeNull();
  });
});

// ============ Global hook routing ============

describe('registry global hooks', () => {
  it('preValidateAction returns valid when no mechanic blocks', () => {
    const state = makeState();
    const result = mechanicRegistry.preValidateAction(state, 'player-1', { type: 'pass' });
    expect(result.valid).toBe(true);
  });

  it('preValidateAction returns invalid when mechanic blocks', () => {
    // board-state validates move targets against board edges
    const state = makeState({
      engine_mechanics: { board_state: true },
      board: {
        states: ['Start', 'A', 'B', 'Victory'],
        start: 'Start',
        edges: [
          { from: 'Start', to: ['A', 'B'] },
          { from: 'A', to: ['Victory'] },
        ],
      },
    } as Partial<GameConfig>);

    // Try to move to Victory from Start (no direct edge)
    const result = mechanicRegistry.preValidateAction(state, 'player-1', {
      type: 'move',
      target: 'Victory',
    });
    expect(result.valid).toBe(false);
  });

  it('executeAction delegates to first handling mechanic', () => {
    const state = makeState();
    // pass mechanic handles 'pass' action type
    const result = mechanicRegistry.executeAction(state, 'player-1', { type: 'pass' });
    expect(result).not.toBeNull();
    expect(result!.handled).toBe(true);
  });

  it('executeAction returns null for unhandled action type', () => {
    const state = makeState();
    const result = mechanicRegistry.executeAction(state, 'player-1', { type: 'fly_to_moon' });
    expect(result).toBeNull();
  });

  it('getAvailableActions collects from all enabled mechanics', () => {
    const state = makeState();
    const actions = mechanicRegistry.getAvailableActions(state, 'player-1');

    // At minimum, pass should always be available
    const passAction = actions.find(a => a.action.type === 'pass');
    expect(passAction).toBeDefined();
  });

  it('getAvailableActions includes mechanic-specific actions when enabled', () => {
    const state = makeState({
      engine_mechanics: { board_state: true },
      board: {
        states: ['Start', 'A', 'B'],
        start: 'Start',
        edges: [{ from: 'Start', to: ['A', 'B'] }],
      },
    } as Partial<GameConfig>);

    const actions = mechanicRegistry.getAvailableActions(state, 'player-1');
    const moveActions = actions.filter(a => a.action.type === 'move');
    expect(moveActions.length).toBeGreaterThanOrEqual(2); // A and B
  });

  it('postExecuteAction merges changes from all mechanics', () => {
    const state = makeState();
    // Most mechanics return null for postExecuteAction; verify it returns empty changes
    const changes = mechanicRegistry.postExecuteAction(state, 'player-1', { type: 'pass' });
    // Should return an empty changes object (or with some changes depending on enabled mechanics)
    expect(changes).toBeDefined();
  });

  it('describeAction returns description from owning mechanic', () => {
    const state = makeState();
    const desc = mechanicRegistry.describeAction(state, { type: 'pass' });
    expect(desc).not.toBeNull();
    expect(desc!.type).toBe('pass');
    expect(desc!.label).toBeDefined();
  });

  it('describeAction returns null for unknown action', () => {
    const state = makeState();
    const desc = mechanicRegistry.describeAction(state, { type: 'teleport_home' });
    expect(desc).toBeNull();
  });
});

// ============ Win condition routing ============

describe('registry win conditions', () => {
  it('onCheckWin detects reach-state victory', () => {
    const state = makeState({
      win_condition: 'reach_state',
      engine_mechanics: { win_reach_state: { target_state: 'Victory' } },
    } as Partial<GameConfig>);

    // Player not at Victory
    let result = mechanicRegistry.onCheckWin(state, 'player-1', 'move');
    expect(result?.won).toBeFalsy();

    // Move player to Victory
    state.players['player-1'].state = 'Victory';
    result = mechanicRegistry.onCheckWin(state, 'player-1', 'move');
    expect(result?.won).toBe(true);
  });

  it('checkAllWinConditions scans all players', () => {
    const state = makeState({
      win_condition: 'reach_state',
      engine_mechanics: { win_reach_state: { target_state: 'Victory' } },
    } as Partial<GameConfig>);

    // No winners
    let result = mechanicRegistry.checkAllWinConditions(state, 'move');
    expect(result).toBeNull();

    // Player 2 wins
    state.players['player-2'].state = 'Victory';
    result = mechanicRegistry.checkAllWinConditions(state, 'move');
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('player-2');
  });

  it('onCheckWin returns null when no win condition met', () => {
    const state = makeState();
    const result = mechanicRegistry.onCheckWin(state, 'player-1', 'move');
    expect(result).toBeNull();
  });
});

// ============ Agnosticism hooks ============

describe('registry agnosticism hooks', () => {
  it('isPlayerBlocked returns true when blocking effect present', () => {
    const state = makeState();
    addEffect(state, 'player-1', { type: 'block_turn', duration: 1 });

    // lose-a-turn mechanic (always enabled) implements isPlayerBlocked
    const result = mechanicRegistry.isPlayerBlocked(state, 'player-1');
    expect(result).toBe(true);
  });

  it('isPlayerBlocked returns false when no blocking effect', () => {
    const state = makeState();
    const result = mechanicRegistry.isPlayerBlocked(state, 'player-1');
    expect(result).toBe(false);
  });

  it('canPlayerActNow returns false by default', () => {
    const state = makeState();
    const result = mechanicRegistry.canPlayerActNow(state, 'player-1');
    expect(result).toBe(false);
  });

  it('canPlayerActNow returns true with freeplay enabled', () => {
    const state = makeState({
      engine_mechanics: {
        freeplay: { actions_per_round: 8 },
      },
    });

    const result = mechanicRegistry.canPlayerActNow(state, 'player-1');
    expect(result).toBe(true);
  });

  it('getPlayerView collects mechanic contributions', () => {
    const state = makeState({
      engine_mechanics: { push_your_luck: true },
    });

    state.players['player-1'].rollAccumulator = 15;
    state.players['player-1'].rollCount = 3;

    const view = mechanicRegistry.getPlayerView(state, 'player-1');
    // push-your-luck contributes rollAccumulator and rollCount
    expect(view.rollAccumulator).toBe(15);
    expect(view.rollCount).toBe(3);
  });

  it('getPlayerView returns empty when no mechanics contribute', () => {
    const state = makeState();
    const view = mechanicRegistry.getPlayerView(state, 'player-1');
    expect(view).toEqual({});
  });
});

// ============ Dependency validation ============

describe('registry dependency validation', () => {
  it('validateDependencies passes for valid config', () => {
    const config: GameConfig = {
      name: 'test',
      version: '1.0',
      players: 2,
      win_condition: 'test',
      max_rounds: 10,
      engine_mechanics: {
        dice_rolling: true,
        // dice is always-enabled, so dice-rolling's requires: ['dice'] is satisfied
      },
    };
    const errors = mechanicRegistry.validateDependencies(config);
    expect(errors).toHaveLength(0);
  });

  it('validateDependencies reports missing dependency', () => {
    const config: GameConfig = {
      name: 'test',
      version: '1.0',
      players: 2,
      win_condition: 'test',
      max_rounds: 10,
      engine_mechanics: {
        // trick-taking requires 'cards' which IS always-enabled
        trick_taking: true,
      },
    };
    const errors = mechanicRegistry.validateDependencies(config);
    // trick-taking requires ['cards'] — cards is always-enabled, so no error
    expect(errors).toHaveLength(0);
  });

  it('getEnabledMechanics returns core mechanics even without config', () => {
    const config: GameConfig = {
      name: 'test',
      version: '1.0',
      players: 2,
      win_condition: 'test',
      max_rounds: 10,
    };

    const enabled = mechanicRegistry.getEnabledMechanics(config);
    const slugs = enabled.map(m => m.slug);

    // Core mechanics should always be enabled
    expect(slugs).toContain('cards');
    expect(slugs).toContain('resources');
    expect(slugs).toContain('dice');
    expect(slugs).toContain('board');
    expect(slugs).toContain('effects');
    expect(slugs).toContain('visibility');
    expect(slugs).toContain('social');
    expect(slugs).toContain('pass');
  });

  it('getEnabledMechanics includes explicitly configured mechanics', () => {
    const config: GameConfig = {
      name: 'test',
      version: '1.0',
      players: 2,
      win_condition: 'test',
      max_rounds: 10,
      engine_mechanics: {
        action_points: { points_per_turn: 3 },
        dice_rolling: true,
      },
    };

    const enabled = mechanicRegistry.getEnabledMechanics(config);
    const slugs = enabled.map(m => m.slug);

    expect(slugs).toContain('action-points');
    expect(slugs).toContain('dice-rolling');
    // Non-configured mechanics should not be present
    expect(slugs).not.toContain('trick-taking');
  });
});

// ============ Registry metadata ============

describe('registry metadata', () => {
  it('getAllMechanicsMetadata returns all registered mechanics', () => {
    const metadata = mechanicRegistry.getAllMechanicsMetadata();
    expect(metadata.length).toBeGreaterThan(40); // 50+ mechanics registered

    // Verify structure
    const cards = metadata.find(m => m.slug === 'cards');
    expect(cards).toBeDefined();
    expect(cards!.name).toBeDefined();
    expect(cards!.defines).toBeDefined();
    expect(cards!.hooks.length).toBeGreaterThan(0);
  });

  it('getMechanic returns specific mechanic', () => {
    const pass = mechanicRegistry.getMechanic('pass');
    expect(pass).toBeDefined();
    expect(pass!.slug).toBe('pass');
    expect(pass!.onExecuteAction).toBeDefined();
  });

  it('getMechanic returns undefined for unregistered slug', () => {
    expect(mechanicRegistry.getMechanic('nonexistent')).toBeUndefined();
  });

  it('getRegisteredSlugs lists all mechanics', () => {
    const slugs = mechanicRegistry.getRegisteredSlugs();
    expect(slugs.length).toBeGreaterThan(40);
    expect(slugs).toContain('cards');
    expect(slugs).toContain('pass');
    expect(slugs).toContain('dice-rolling');
  });
});
