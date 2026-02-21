/**
 * Council of Whispers - Integration / Smoke Tests
 *
 * Tests the core mechanic interactions for council-of-whispers:
 * - Simultaneous action selection (out-of-turn play, format normalization)
 * - Prisoner's dilemma (auto-advance, simultaneous choices, payoff resolution)
 * - Game end deduplication
 * - Resign from non-currentPlayer
 * - Hidden role assignment
 * - Resource tracking across mechanics
 */

import { describe, it, expect, afterEach } from 'vitest';
import { GameTestHarness } from './harness.js';
import { endGame, checkAllWinConditions } from '../src/core/game.js';

let harness: GameTestHarness | null = null;

afterEach(() => {
  harness?.cleanup();
  harness = null;
});

// ============ Game Setup ============

describe('council-of-whispers setup', () => {
  it('initializes with correct player count and resources', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    expect(Object.keys(harness.state.players)).toHaveLength(4);
    for (const [id, player] of Object.entries(harness.state.players)) {
      expect(player.resources).toBeDefined();
      expect(player.resources!.gold).toBe(10);
      expect(player.resources!.influence).toBe(3);
    }
  });

  it('initializes shared state for all mechanics', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    const shared = harness.state.shared as Record<string, unknown>;
    // Lean-canonical state: mechanic fields at top level of shared
    expect(shared.sas_selections).toBeDefined();
    expect(shared.pd_choices).toBeDefined();
    expect(shared.collective_progress).toBeDefined();
  });

  it('starts with treasury at 20 gold', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    const shared = harness.state.shared as Record<string, unknown>;
    expect(shared.collective_progress).toBe(20);
  });
});

// ============ Simultaneous Action Selection ============

describe('simultaneous action selection', () => {
  it('allows out-of-turn select_action via canPlayerActNow', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    expect(harness.state.currentPlayer).toBe('player-1');

    // Player-2 submits BEFORE player-1 (out-of-turn)
    const result = harness.step('player-2', {
      type: 'select_action',
      selectedAction: 'Scheme',
    } as any);
    expect(result.success).toBe(true);
  });

  it('rejects duplicate selection from same player', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);

    // Trying to select again should fail
    const dup = harness.step('player-1', { type: 'select_action', selectedAction: 'Fortify' } as any);
    expect(dup.success).toBe(false);
  });

  it('normalizes action format: string', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // String format: "Scheme"
    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    // All should get +2 gold
    for (const id of ['player-1', 'player-2', 'player-3', 'player-4']) {
      expect(harness.state.players[id].resources!.gold).toBe(12);
    }
  });

  it('normalizes action format: {type: "Scheme"} object', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Object format with 'type' key
    harness.step('player-1', { type: 'select_action', selectedAction: { type: 'Scheme' } } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: { type: 'Scheme' } } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: { type: 'Scheme' } } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: { type: 'Scheme' } } as any);

    // All should get +2 gold (was broken before fix)
    for (const id of ['player-1', 'player-2', 'player-3', 'player-4']) {
      expect(harness.state.players[id].resources!.gold).toBe(12);
    }
  });

  it('normalizes action format: {action: "Investigate"} object', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Object format with 'action' key
    harness.step('player-1', { type: 'select_action', selectedAction: { action: 'Scheme' } } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Fortify' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: { action: 'Investigate', target: 'player-1' } } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    expect(harness.state.players['player-1'].resources!.gold).toBe(12);  // Scheme +2
    expect(harness.state.players['player-2'].resources!.influence).toBe(5);  // Fortify +2
    expect(harness.state.players['player-3'].resources!.gold).toBe(10);  // Investigate, no gold
    expect(harness.state.players['player-4'].resources!.gold).toBe(12);  // Scheme +2
  });

  it('Subvert steals from treasury', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    harness.step('player-1', { type: 'select_action', selectedAction: 'Subvert' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    expect(harness.state.players['player-1'].resources!.gold).toBe(12);  // Subvert +2 from treasury
    const shared = harness.state.shared as Record<string, unknown>;
    expect(shared.collective_progress).toBe(18);  // Treasury reduced by 2
  });

  it('all players can submit in any order', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Submit in reverse order (4, 3, 2, 1) - all should succeed
    expect(harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any).success).toBe(true);
    expect(harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any).success).toBe(true);
    expect(harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any).success).toBe(true);
    expect(harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any).success).toBe(true);
  });
});

// ============ Prisoner's Dilemma ============

describe('prisoner\'s dilemma', () => {
  function setupAfterActionSelection(): void {
    // Complete action selection phase first
    harness!.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness!.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness!.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness!.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);
  }

  it('auto-advances turn after dilemma_choice (no pass needed)', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    const turnBefore = harness.state.turnNumber;

    // Player-1 submits choice - turn should auto-advance
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    expect(harness.state.turnNumber).toBe(turnBefore + 1);
    expect(harness.state.currentPlayer).toBe('player-2');

    // Player-2 submits - auto-advances again
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    expect(harness.state.currentPlayer).toBe('player-3');
  });

  it('resolves payoffs correctly for all cooperate', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    // All cooperate
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    // Each player cooperated with 3 others: 3 * 3 = 9 points each
    for (const id of ['player-1', 'player-2', 'player-3', 'player-4']) {
      expect(harness.state.players[id].score).toBe(9);
    }
  });

  it('resolves payoffs correctly for mixed cooperate/defect', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    // P1,P3 cooperate; P2,P4 defect
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'defect' } as any);

    // Lean-canonical: pd_round tracks the round count (no history array)
    const shared = harness.state.shared as Record<string, unknown>;
    expect(shared.pd_round).toBe(1);

    // P1 (cooperate): vs P2(defect)=0 + vs P3(cooperate)=3 + vs P4(defect)=0 = 3
    expect(harness.state.players['player-1'].score).toBe(3);
    // P2 (defect): vs P1(cooperate)=5 + vs P3(cooperate)=5 + vs P4(defect)=1 = 11
    expect(harness.state.players['player-2'].score).toBe(11);
    // P3 (cooperate): same as P1 = 3
    expect(harness.state.players['player-3'].score).toBe(3);
    // P4 (defect): same as P2 = 11
    expect(harness.state.players['player-4'].score).toBe(11);
  });

  it('allows out-of-turn dilemma_choice via canPlayerActNow', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    // Player-3 submits before it's their turn in the rotation
    const result = harness.step('player-3', { type: 'dilemma_choice', choice: 'defect' } as any);
    expect(result.success).toBe(true);
  });

  it('completes a full PD round in exactly 4 actions (no passes)', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    const historyBefore = harness.history.length;

    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    // Exactly 4 actions for 4 players (was 8 before fix: 4 choices + 4 passes)
    const pdActions = harness.history.slice(historyBefore);
    expect(pdActions).toHaveLength(4);
    expect(pdActions.every(a => a.result.success)).toBe(true);
    expect(pdActions.every(a => a.step.action.type === 'dilemma_choice')).toBe(true);
  });

  it('tracks multiple PD rounds', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();
    setupAfterActionSelection();

    // PD round 1
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    const shared1 = harness.state.shared as Record<string, unknown>;
    expect(shared1.pd_round).toBe(1);
    expect(shared1.pd_resolved).toBe(false);

    // PD round 2
    harness.step('player-1', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'defect' } as any);

    const shared2 = harness.state.shared as Record<string, unknown>;
    expect(shared2.pd_round).toBe(2);
  });
});

// ============ Game End ============

describe('game end', () => {
  it('endGame guard prevents duplicate game_end events', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    const instanceId = harness.state.gameId;

    // End game once
    endGame(instanceId, 'player-1', 'Test win');
    // Reload state
    const stateAfterFirst = JSON.parse(
      require('fs').readFileSync(
        `games/council-of-whispers/state/${instanceId}/game.json`,
        'utf-8'
      )
    );
    expect(stateAfterFirst.status).toBe('pending_analysis');
    expect(stateAfterFirst.shared.winner).toBe('player-1');

    // End game again (should be silently ignored)
    endGame(instanceId, 'player-2', 'Duplicate attempt');
    const stateAfterSecond = JSON.parse(
      require('fs').readFileSync(
        `games/council-of-whispers/state/${instanceId}/game.json`,
        'utf-8'
      )
    );
    // Winner should still be player-1, not changed to player-2
    expect(stateAfterSecond.shared.winner).toBe('player-1');
  });

  it('rejects actions after game ends', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    endGame(harness.state.gameId, 'player-1', 'Test win');
    // Reload state so harness sees the updated status
    harness.state = JSON.parse(
      require('fs').readFileSync(
        `games/council-of-whispers/state/${harness.state.gameId}/game.json`,
        'utf-8'
      )
    );

    const result = harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    expect(result.success).toBe(false);
  });
});

// ============ Resign ============

describe('resign', () => {
  it('allows resign from non-currentPlayer', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    expect(harness.state.currentPlayer).toBe('player-1');

    // Player-3 resigns while it's player-1's turn
    const result = harness.step('player-3', { type: 'resign', reason: 'Testing resignation' } as any);
    expect(result.success).toBe(true);
  });

  it('shows resign as enabled in available actions for non-currentPlayer', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    const actions = harness.getActions('player-3');
    const resign = actions.actions.find(a => a.type === 'resign');
    expect(resign).toBeDefined();
    expect(resign!.enabled).toBe(true);
  });
});

// ============ Available Actions (canPlayerActNow integration) ============

describe('available actions with canPlayerActNow', () => {
  it('shows select_action as enabled for non-currentPlayer during selection phase', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    expect(harness.state.currentPlayer).toBe('player-1');

    // Player-3 should see select_action as enabled even though it's not their turn
    const actions = harness.getActions('player-3');
    const selectAction = actions.actions.find(a => a.type === 'select_action');
    expect(selectAction).toBeDefined();
    expect(selectAction!.enabled).toBe(true);
  });

  it('shows dilemma_choice as enabled for non-currentPlayer during PD phase', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Complete action selection
    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    // Player-3 should see dilemma_choice even if it's not their turn
    const actions = harness.getActions('player-3');
    const dilemmaActions = actions.actions.filter(a => a.type === 'dilemma_choice');
    expect(dilemmaActions.length).toBeGreaterThan(0);
    expect(dilemmaActions.some(a => a.enabled)).toBe(true);
  });
});

// ============ Pass Restrictions ============

describe('pass spam prevention', () => {
  it('rejects pass from out-of-turn player during PD phase', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Complete action selection
    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    // PD is now active. Player-3 (not currentPlayer) tries to pass instead of submitting dilemma_choice
    expect(harness.state.currentPlayer).not.toBe('player-3');
    const result = harness.step('player-3', { type: 'pass' });
    expect(result.success).toBe(false);
  });

  it('allows pass from currentPlayer during PD phase', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Complete action selection
    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Scheme' } as any);

    // currentPlayer CAN pass (it's their turn)
    const currentPlayer = harness.state.currentPlayer;
    const result = harness.step(currentPlayer, { type: 'pass' });
    expect(result.success).toBe(true);
  });

  it('rejects pass from out-of-turn player during SAS phase', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // SAS is in "selecting" phase, player-3 should select_action, not pass
    expect(harness.state.currentPlayer).not.toBe('player-3');
    const result = harness.step('player-3', { type: 'pass' });
    expect(result.success).toBe(false);
  });

  it('shows pass as disabled for out-of-turn players in available actions', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    expect(harness.state.currentPlayer).toBe('player-1');

    // Player-3 (out-of-turn) should see pass as disabled
    const actions = harness.getActions('player-3');
    const passAction = actions.actions.find(a => a.type === 'pass');
    expect(passAction).toBeDefined();
    expect(passAction!.enabled).toBe(false);

    // But player-1 (currentPlayer) should see pass as enabled
    const p1Actions = harness.getActions('player-1');
    const p1Pass = p1Actions.actions.find(a => a.type === 'pass');
    expect(p1Pass).toBeDefined();
    expect(p1Pass!.enabled).toBe(true);
  });
});

// ============ Full Round Flow ============

describe('full round flow', () => {
  it('completes action selection + PD smoothly', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Phase 1: Simultaneous action selection
    harness.step('player-1', { type: 'select_action', selectedAction: 'Scheme' } as any);
    harness.step('player-2', { type: 'select_action', selectedAction: 'Fortify' } as any);
    harness.step('player-3', { type: 'select_action', selectedAction: 'Subvert' } as any);
    harness.step('player-4', { type: 'select_action', selectedAction: 'Investigate' } as any);

    // Verify resources after action selection
    expect(harness.state.players['player-1'].resources!.gold).toBe(12);     // Scheme +2
    expect(harness.state.players['player-2'].resources!.influence).toBe(5);  // Fortify +2
    expect(harness.state.players['player-3'].resources!.gold).toBe(12);     // Subvert +2 from treasury
    expect(harness.state.players['player-4'].resources!.gold).toBe(10);     // Investigate, no change

    const shared = harness.state.shared as Record<string, unknown>;
    expect(shared.collective_progress).toBe(18);  // 20 - 2 from Subvert

    // Phase 3: Prisoner's dilemma
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    // Check scores after PD
    // P1 cooperate: vs P2(C)=3 + vs P3(D)=0 + vs P4(C)=3 = 6
    expect(harness.state.players['player-1'].score).toBe(6);
    // P3 defect: vs P1(C)=5 + vs P2(C)=5 + vs P4(C)=5 = 15
    expect(harness.state.players['player-3'].score).toBe(15);

    // Total actions: 4 (select) + 4 (dilemma) = 8, no passes needed
    const successfulActions = harness.history.filter(h => h.result.success);
    expect(successfulActions).toHaveLength(8);
  });
});

// ============ Highest Score Win Condition ============

describe('highest_score win condition', () => {
  it('checkAllWinConditions finds highest scorer for highest_score_or_single_loser', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Manually set different scores and gameOver flag
    harness.state.players['player-1'].score = 10;
    harness.state.players['player-2'].score = 25;
    harness.state.players['player-3'].score = 15;
    harness.state.players['player-4'].score = 5;
    (harness.state.shared as Record<string, unknown>).gameOver = true;

    const result = checkAllWinConditions(harness.state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe('player-2');
  });

  it('PD game-over triggers game end via highest_score win condition', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // Play through 3 rounds of PD (maxRounds=3 for council-of-whispers)
    // First: SAS selections (round 1)
    harness.step('player-1', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-2', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-3', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-4', { type: 'select_action', action: 'scheme' } as any);

    // PD Round 1
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    // Now advance turns so SAS can run again
    harness.step('player-1', { type: 'pass' }); // p1 is currentPlayer
    harness.step('player-2', { type: 'pass' });
    harness.step('player-3', { type: 'pass' });
    harness.step('player-4', { type: 'pass' });

    // PD Round 2
    harness.step('player-1', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-4', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-1', { type: 'pass' });
    harness.step('player-2', { type: 'pass' });
    harness.step('player-3', { type: 'pass' });
    harness.step('player-4', { type: 'pass' });

    // PD Round 3 (final - should trigger gameOver)
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    // Last choice resolves the round and triggers checkWin
    const lastChoice = harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    // Game should end after PD max rounds
    expect(lastChoice.gameOver).toBe(true);
    expect(lastChoice.winner).toBeDefined();
    expect(harness.state.status).toBe('pending_analysis');
  });

  it('game does not end prematurely before PD completes all rounds', () => {
    harness = GameTestHarness.create('council-of-whispers', 4, { seed: 1 });
    harness.start();

    // SAS selections
    harness.step('player-1', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-2', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-3', { type: 'select_action', action: 'scheme' } as any);
    harness.step('player-4', { type: 'select_action', action: 'scheme' } as any);

    // PD Round 1 only
    harness.step('player-1', { type: 'dilemma_choice', choice: 'cooperate' } as any);
    harness.step('player-2', { type: 'dilemma_choice', choice: 'defect' } as any);
    harness.step('player-3', { type: 'dilemma_choice', choice: 'defect' } as any);
    const r1Result = harness.step('player-4', { type: 'dilemma_choice', choice: 'cooperate' } as any);

    // Game should NOT be over after round 1 (maxRounds=3)
    expect(r1Result.gameOver).toBeFalsy();
    expect(harness.state.status).toBe('in_progress');
  });
});
