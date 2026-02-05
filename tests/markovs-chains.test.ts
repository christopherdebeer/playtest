/**
 * Markov's Chains — integration tests
 *
 * Exercises the engine via the GameTestHarness, using both hand-crafted
 * scenarios and log-replay to verify game state transitions.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { GameTestHarness } from './harness.js';

let harness: GameTestHarness | null = null;

afterEach(() => {
  harness?.cleanup();
  harness = null;
});

// ============ Basic lifecycle ============

describe('game lifecycle', () => {
  it('initializes with correct state', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });

    expect(harness.state.status).toBe('waiting_for_players');
    expect(harness.state.gameName).toBe('markovs-chains');

    // Two players created
    const playerIds = Object.keys(harness.state.players);
    expect(playerIds).toHaveLength(2);

    // Both players start at "Start"
    for (const id of playerIds) {
      expect(harness.state.players[id].state).toBe('Start');
    }
  });

  it('starts the game and sets first player', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    expect(harness.state.status).toBe('in_progress');
    expect(harness.state.round).toBe(1);
    expect(harness.state.turnNumber).toBe(1);
    expect(harness.state.currentPlayer).toBe('player-1');
    expect(harness.state.turnOrder).toEqual(['player-1', 'player-2']);
  });

  it('deals starting hands', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // Each player should have cards dealt (starting hand defined in RULES.md)
    for (const id of Object.keys(harness.state.players)) {
      expect(harness.state.players[id].hand.length).toBeGreaterThan(0);
    }
  });
});

// ============ Movement ============

describe('movement', () => {
  it('moves player to a valid adjacent state', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // Player 1 starts at "Start", can move to A, B, or C
    const result = harness.step('player-1', { type: 'move', target: 'A' });
    expect(result.success).toBe(true);
    expect(harness.state.players['player-1'].state).toBe('A');
  });

  it('rejects move to non-adjacent state', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // Can't jump directly to Victory from Start (no edge connects them)
    const result = harness.step('player-1', { type: 'move', target: 'Victory' });
    expect(result.success).toBe(false);
  });

  it('rejects action from wrong player', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // It's player-1's turn; player-2 cannot act
    expect(harness.state.currentPlayer).toBe('player-1');
    const result = harness.step('player-2', { type: 'move', target: 'A' });
    expect(result.success).toBe(false);
  });

  it('tracks available actions for current player', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    const result = harness.getActions('player-1');
    // getAvailableActions returns { actions: AvailableAction[], ... }
    expect(result.actions).toBeDefined();
    expect(Array.isArray(result.actions)).toBe(true);

    // Should include a move action with targets including A, B, C
    const moveAction = result.actions.find((a: { type: string }) => a.type === 'move');
    expect(moveAction).toBeDefined();
    expect(moveAction!.targets).toContain('A');
    expect(moveAction!.targets).toContain('B');
    expect(moveAction!.targets).toContain('C');
  });
});

// ============ Pass and turn advancement ============

describe('turn flow', () => {
  it('advances turn after pass', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    expect(harness.state.currentPlayer).toBe('player-1');

    // Player 1 passes
    const result = harness.step('player-1', { type: 'pass' });
    expect(result.success).toBe(true);

    // Turn advances to player 2
    expect(harness.state.currentPlayer).toBe('player-2');
  });

  it('advances round after all players pass', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    expect(harness.state.round).toBe(1);

    // Both players pass
    harness.step('player-1', { type: 'pass' });
    harness.step('player-2', { type: 'pass' });

    expect(harness.state.round).toBe(2);
  });
});

// ============ Win condition ============

describe('win condition', () => {
  it('detects victory when player reaches Victory state', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // Walk player-1 through the board: Start → A → Checkpoint-X → Victory
    // Game uses "action + pass" model: move then pass to end turn
    let result = harness.step('player-1', { type: 'move', target: 'A' });
    expect(result.success).toBe(true);
    harness.step('player-1', { type: 'pass' }); // end turn

    // Player 2 passes
    harness.step('player-2', { type: 'pass' });

    // Player 1 moves to checkpoint
    result = harness.step('player-1', { type: 'move', target: 'Checkpoint-X' });
    expect(result.success).toBe(true);
    harness.step('player-1', { type: 'pass' }); // end turn

    // Player 2 passes
    harness.step('player-2', { type: 'pass' });

    // Player 1 reaches Victory
    result = harness.step('player-1', { type: 'move', target: 'Victory' });
    expect(result.success).toBe(true);
    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe('player-1');

    // Game status should reflect completion
    expect(harness.state.players['player-1'].state).toBe('Victory');
  });
});

// ============ Card actions ============

describe('cards', () => {
  it('allows drawing cards', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    const handBefore = harness.state.players['player-1'].hand.length;
    const result = harness.step('player-1', { type: 'draw', count: 1 });
    expect(result.success).toBe(true);

    const handAfter = harness.state.players['player-1'].hand.length;
    expect(handAfter).toBe(handBefore + 1);
  });
});

// ============ Seeded determinism ============

describe('seeded randomness', () => {
  it('produces identical starting hands across runs with same seed', () => {
    // Run 1
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 42 });
    harness.start();
    const hands1 = {
      p1: harness.state.players['player-1'].hand.map(c => c.name),
      p2: harness.state.players['player-2'].hand.map(c => c.name),
    };
    const deck1 = harness.state.deck.map(c => c.name);
    harness.cleanup();

    // Run 2 — same seed
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 42 });
    harness.start();
    const hands2 = {
      p1: harness.state.players['player-1'].hand.map(c => c.name),
      p2: harness.state.players['player-2'].hand.map(c => c.name),
    };
    const deck2 = harness.state.deck.map(c => c.name);

    expect(hands1.p1).toEqual(hands2.p1);
    expect(hands1.p2).toEqual(hands2.p2);
    expect(deck1).toEqual(deck2);
  });

  it('produces different starting hands with different seeds', () => {
    // Run 1
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();
    const hands1 = harness.state.players['player-1'].hand.map(c => c.name);
    harness.cleanup();

    // Run 2 — different seed
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 999 });
    harness.start();
    const hands2 = harness.state.players['player-1'].hand.map(c => c.name);

    // Very unlikely to be identical with different seeds
    expect(hands1).not.toEqual(hands2);
  });
});

// ============ Log replay ============

describe('log replay', () => {
  it('replays a full game from log file', () => {
    // No seed: the original log was generated with real Math.random().
    // Card-specific actions (play_card) may reference cards the player
    // doesn't have with a different random shuffle. We skip those assertions
    // and verify structural actions (move, pass, draw) succeed.
    const { harness: h, steps } = GameTestHarness.fromLog(
      'games/markovs-chains/logs/markovs-chains-1770216120437.jsonl'
    );
    harness = h;
    harness.start();

    const cardActions = new Set(['play_card', 'place_card']);

    // Remove success expectation from card-specific actions
    const adjustedSteps = steps.map(step => ({
      ...step,
      expect: cardActions.has(step.action.type) ? undefined : step.expect,
    }));

    harness.replay(adjustedSteps);

    // Should have executed steps
    expect(harness.history.length).toBeGreaterThan(0);

    // Move, pass, and draw actions should all succeed
    for (const entry of harness.history) {
      if (!cardActions.has(entry.step.action.type)) {
        expect(entry.result.success).toBe(true);
      }
    }
  });

  it('supports partial replay with maxSteps', () => {
    const { harness: h, steps } = GameTestHarness.fromLog(
      'games/markovs-chains/logs/markovs-chains-1770216120437.jsonl',
      { seed: 1 }
    );
    harness = h;
    harness.start();

    // Replay only first 3 steps
    harness.replay(steps, { maxSteps: 3 });

    expect(harness.history).toHaveLength(3);
    // Game shouldn't be over after just 3 steps
    expect(harness.state.status).toBe('in_progress');
  });
});

// ============ Harness utilities ============

describe('harness utilities', () => {
  it('records step history with state snapshots', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    harness.step('player-1', { type: 'pass' });
    harness.step('player-2', { type: 'pass' });

    expect(harness.history).toHaveLength(2);
    expect(harness.history[0].step.action.type).toBe('pass');
    expect(harness.history[0].stateSnapshot.round).toBe(1);
    expect(harness.history[1].step.action.type).toBe('pass');
  });

  it('validates actions without executing them', () => {
    harness = GameTestHarness.create('markovs-chains', 2, { seed: 1 });
    harness.start();

    // Valid move
    const valid = harness.validate('player-1', { type: 'move', target: 'A' });
    expect(valid.valid).toBe(true);

    // Invalid move (Victory not reachable from Start)
    const invalid = harness.validate('player-1', { type: 'move', target: 'Victory' });
    expect(invalid.valid).toBe(false);
  });
});
