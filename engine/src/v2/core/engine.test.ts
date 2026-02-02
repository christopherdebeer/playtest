/**
 * V2 Engine Integration Tests
 */

import { describe, it, before } from 'node:test';
import * as assert from 'node:assert';
import { GameEngine, CoreGameState, GameConfig, MechanicRegistry, MechanicConfigEntry } from './index.js';
import { createDefaultRegistry } from '../mechanics/index.js';

function makeConfig(overrides: Partial<GameConfig> & Pick<GameConfig, 'name' | 'players' | 'winCondition' | 'mechanics'>): GameConfig {
  return {
    version: '1.0.0',
    rulesMarkdown: '# Test Game Rules',
    ...overrides,
  };
}

describe('GameEngine', () => {
  let registry: MechanicRegistry;
  let engine: GameEngine;

  before(() => {
    registry = createDefaultRegistry();
    engine = new GameEngine(registry);
  });

  describe('initGame', () => {
    it('should initialize a game with cards mechanic', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test win condition',
        mechanics: [
          {
            slug: 'cards',
            config: {
              deck: [
                { name: 'Card A', count: 10 },
                { name: 'Card B', count: 10 },
              ],
              startingCards: 3,
            },
          },
        ],
      });

      const result = engine.initGame('test-game', config, 2);
      assert.ok(result.ok, 'initGame should succeed');
      if (!result.ok) return;

      const state = result.value;
      assert.strictEqual(state.gameName, 'test-game');
      assert.strictEqual(state.status, 'waiting_for_players');
      assert.deepStrictEqual(state.turnOrder, ['player-1', 'player-2']);
      assert.ok(state.mechanicState.cards, 'cards mechanic state should exist');
    });

    it('should initialize a game with probability mechanic', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Reach Victory',
        mechanics: [
          {
            slug: 'probability',
            config: {
              board: {
                states: ['Start', 'Middle', 'Victory'],
                edges: [
                  { from: 'Start', to: 'Middle', probability: 0.5 },
                  { from: 'Middle', to: 'Victory', probability: 0.5 },
                ],
              },
              startState: 'Start',
              victoryState: 'Victory',
            },
          },
        ],
      });

      const result = engine.initGame('test-game', config, 2);
      assert.ok(result.ok, 'initGame should succeed');
      if (!result.ok) return;

      const state = result.value;
      assert.ok(state.mechanicState.probability, 'probability mechanic state should exist');
    });

    it('should reject invalid player count', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'range', min: 2, max: 4 },
        winCondition: 'Test',
        mechanics: [],
      });

      const result = engine.initGame('test-game', config, 5);
      assert.ok(!result.ok, 'initGame should fail for 5 players');
    });
  });

  describe('registerPlayer', () => {
    it('should register players and start game when all connected', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test',
        mechanics: [],
      });

      const initResult = engine.initGame('test-game', config, 2);
      assert.ok(initResult.ok);
      if (!initResult.ok) return;
      let state = initResult.value;

      // Register player 1
      const reg1 = engine.registerPlayer(state, 'player-1', 'agent-1');
      assert.ok(reg1.ok);
      if (!reg1.ok) return;
      state = reg1.value;
      assert.strictEqual(state.status, 'waiting_for_players');

      // Register player 2
      const reg2 = engine.registerPlayer(state, 'player-2', 'agent-2');
      assert.ok(reg2.ok);
      if (!reg2.ok) return;
      state = reg2.value;
      assert.strictEqual(state.status, 'in_progress');
      assert.strictEqual(state.currentPlayer, 'player-1');
    });

    it('should reject registering non-existent player', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test',
        mechanics: [],
      });

      const initResult = engine.initGame('test-game', config, 2);
      assert.ok(initResult.ok);
      if (!initResult.ok) return;
      const state = initResult.value;

      const result = engine.registerPlayer(state, 'player-99', 'agent-1');
      assert.ok(!result.ok, 'Should reject non-existent player');
    });
  });

  describe('executeAction', () => {
    it('should execute draw action from cards mechanic', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test',
        mechanics: [
          {
            slug: 'cards',
            config: {
              deck: [{ name: 'Test Card', count: 20 }],
              startingCards: 0,
            },
          },
        ],
      });

      const initResult = engine.initGame('test-game', config, 2);
      assert.ok(initResult.ok);
      if (!initResult.ok) return;
      let state = initResult.value;

      // Register both players
      const reg1 = engine.registerPlayer(state, 'player-1', 'agent-1');
      assert.ok(reg1.ok);
      if (!reg1.ok) return;
      state = reg1.value;

      const reg2 = engine.registerPlayer(state, 'player-2', 'agent-2');
      assert.ok(reg2.ok);
      if (!reg2.ok) return;
      state = reg2.value;

      // Execute draw action
      const drawResult = engine.executeAction(state, 'player-1', { type: 'draw' });
      assert.ok(drawResult.ok, 'Draw action should succeed');
      if (!drawResult.ok) return;

      const newState = drawResult.value;
      const playerCards = (newState.players['player-1'].mechanicState as Record<string, any>).cards;
      assert.ok(playerCards.hand.length > 0, 'Player should have drawn a card');
    });

    it('should reject action from wrong player', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test',
        mechanics: [],
      });

      const initResult = engine.initGame('test-game', config, 2);
      assert.ok(initResult.ok);
      if (!initResult.ok) return;
      let state = initResult.value;

      const reg1 = engine.registerPlayer(state, 'player-1', 'agent-1');
      assert.ok(reg1.ok);
      if (!reg1.ok) return;
      state = reg1.value;

      const reg2 = engine.registerPlayer(state, 'player-2', 'agent-2');
      assert.ok(reg2.ok);
      if (!reg2.ok) return;
      state = reg2.value;

      // Player 2 tries to act when it's player 1's turn
      const result = engine.executeAction(state, 'player-2', { type: 'draw' });
      assert.ok(!result.ok, 'Should reject action from wrong player');
    });
  });

  describe('getPlayerView', () => {
    it('should hide opponent hand cards', () => {
      const config = makeConfig({
        name: 'test-game',
        players: { type: 'exact', count: 2 },
        winCondition: 'Test',
        mechanics: [
          {
            slug: 'cards',
            config: {
              deck: [{ name: 'Test Card', count: 20 }],
              startingCards: 5,
            },
          },
        ],
      });

      const initResult = engine.initGame('test-game', config, 2);
      assert.ok(initResult.ok);
      if (!initResult.ok) return;
      let state = initResult.value;

      const reg1 = engine.registerPlayer(state, 'player-1', 'agent-1');
      assert.ok(reg1.ok);
      if (!reg1.ok) return;
      state = reg1.value;

      const reg2 = engine.registerPlayer(state, 'player-2', 'agent-2');
      assert.ok(reg2.ok);
      if (!reg2.ok) return;
      state = reg2.value;

      const view = engine.getPlayerView(state, 'player-1');

      // Player should see their own hand
      const myCards = view.me.mechanicState.cards as Record<string, any>;
      assert.ok(myCards.hand, 'Should see own hand');

      // Should not see opponent's actual cards, only count
      const opponentCards = view.opponents[0].mechanicState.cards as Record<string, any>;
      assert.ok(!opponentCards.hand, 'Should not see opponent hand');
      assert.strictEqual(opponentCards.handCount, 5, 'Should see opponent hand count');
    });
  });
});

describe('MechanicRegistry', () => {
  it('should list all registered mechanics', () => {
    const registry = createDefaultRegistry();
    const mechanics = registry.listAll();

    assert.ok(mechanics.length >= 2, 'Should have at least cards and probability');

    const slugs = mechanics.map(m => m.slug);
    assert.ok(slugs.includes('cards'), 'Should include cards mechanic');
    assert.ok(slugs.includes('probability'), 'Should include probability mechanic');
  });

  it('should compose multiple mechanics', () => {
    const registry = createDefaultRegistry();

    const configs: MechanicConfigEntry[] = [
      {
        slug: 'cards',
        config: {
          deck: [{ name: 'Card', count: 10 }],
          startingCards: 3,
        },
      },
      {
        slug: 'probability',
        config: {
          board: {
            states: ['A', 'B'],
            edges: [{ from: 'A', to: 'B', probability: 0.5 }],
          },
        },
      },
    ];

    const result = registry.compose(configs, 2);
    assert.ok(result.ok, 'Composition should succeed');
    if (!result.ok) return;

    const composed = result.value;
    assert.ok(composed.initGameState, 'Should have initGameState');
    assert.ok(composed.initPlayerState, 'Should have initPlayerState');
  });
});
