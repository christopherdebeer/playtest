#!/usr/bin/env node

// Playtest Engine CLI

import { Command } from 'commander';
import { rmSync, existsSync } from 'fs';
import {
  initGame,
  loadState,
  saveState,
  registerAgent,
  endGame,
  roll,
  drawCards,
  discardCard,
  playCardByName,
  advanceTurn,
  logEvent,
  getPlayerView,
  gameExists,
  stateExists,
  getStatePath,
  getGamePath,
  validateActionSchema,
  validateAction,
  executeAction,
  fileContest,
  adjudicateContest,
  adjudicateResignation,
  ensureContestState
} from './game.js';
import type { PendingAction, GameAction, ContestState } from './types.js';
import { waitForTurn } from './turns.js';
import { getCardDefinition, parseRules } from './rules.js';
import { getRulesPath } from './game.js';

const program = new Command();

program
  .name('playtest')
  .description('Game-agnostic AI playtesting engine')
  .version('3.0.0');

// ============ Game Lifecycle Commands ============

program
  .command('init <game>')
  .description('Initialize a new game')
  .option('-p, --players <n>', 'Number of players', '2')
  .action((game: string, options: { players: string }) => {
    try {
      const playerCount = parseInt(options.players, 10);
      const state = initGame(game, playerCount);
      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: state.status,
        players: state.turnOrder,
        message: `Game initialized. Waiting for ${playerCount} players to register.`
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('register <game>')
  .description('Register an agent as gamemaster or player')
  .requiredOption('-r, --role <role>', 'Role: gamemaster or player')
  .requiredOption('-a, --agent-id <id>', 'Agent ID')
  .option('-p, --player <id>', 'Player ID (auto-assigned if not specified)')
  .action((game: string, options: { role: 'gamemaster' | 'player'; agentId: string; player?: string }) => {
    try {
      const result = registerAgent(game, options.role, options.agentId, options.player);
      console.log(JSON.stringify({
        success: true,
        ...result
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('status <game>')
  .description('Get current game status')
  .action((game: string) => {
    try {
      if (!stateExists(game)) {
        console.log(JSON.stringify({
          success: false,
          error: `No active game for ${game}`
        }));
        process.exit(1);
      }

      const state = loadState(game);
      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: state.status,
        turn: state.turn,
        currentPlayer: state.currentPlayer,
        players: Object.fromEntries(
          Object.entries(state.players).map(([id, p]) => [
            id,
            { state: p.state, handSize: p.hand.length, registered: !!p.agentId }
          ])
        ),
        winner: state.shared.winner
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Turn Management Commands ============

program
  .command('wait <game>')
  .description('Wait for player turn (blocking)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
  .action(async (game: string, options: { player: string; timeout: string }) => {
    try {
      const result = await waitForTurn(game, options.player, parseInt(options.timeout, 10));
      console.log(JSON.stringify(result));

      if (result.status === 'timeout') {
        process.exit(124); // Standard timeout exit code
      }
      if (result.status === 'game_not_found') {
        process.exit(1); // Game was reset or doesn't exist
      }
    } catch (e) {
      console.log(JSON.stringify({
        status: 'error',
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('submit <game>')
  .description('Submit player action (queues for gamemaster validation)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-a, --action <json>', 'Action JSON')
  .action((game: string, options: { player: string; action: string }) => {
    try {
      const state = loadState(game);

      // Verify it's this player's turn
      if (state.currentPlayer !== options.player) {
        console.log(JSON.stringify({
          accepted: false,
          error: `Not ${options.player}'s turn. Current player: ${state.currentPlayer}`
        }));
        process.exit(1);
      }

      const action = JSON.parse(options.action);

      // Queue the action for gamemaster validation (don't advance yet)
      state.shared.pendingAction = {
        player: options.player,
        turn: state.turn,
        action,
        submittedAt: new Date().toISOString()
      };
      saveState(state);

      // Log the action
      logEvent(state, {
        event: 'action_submitted',
        turn: state.turn,
        player: options.player,
        data: action
      });

      console.log(JSON.stringify({
        accepted: true,
        action,
        message: 'Action queued for gamemaster validation'
      }));
    } catch (e) {
      console.log(JSON.stringify({
        accepted: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Contest-Based Adjudication Commands ============

program
  .command('act <game>')
  .description('Execute action directly (contest-based system)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-a, --action <json>', 'Action JSON')
  .action((game: string, options: { player: string; action: string }) => {
    try {
      const state = loadState(game);

      // Parse action JSON
      let action: GameAction;
      try {
        action = JSON.parse(options.action);
      } catch {
        console.log(JSON.stringify({
          success: false,
          validation: {
            valid: false,
            errors: ['Invalid JSON. Action must be valid JSON object. Example: \'{"type": "play_card", "card": "Red 5"}\'']
          }
        }));
        process.exit(1);
        return;
      }

      // Step 1: Schema validation
      const schemaResult = validateActionSchema(action);
      if (!schemaResult.valid) {
        console.log(JSON.stringify({
          success: false,
          validation: schemaResult
        }));
        process.exit(1);
        return;
      }

      // Step 2: Game rule validation
      const ruleResult = validateAction(state, options.player, action);
      if (!ruleResult.valid) {
        console.log(JSON.stringify({
          success: false,
          validation: ruleResult
        }));
        process.exit(1);
        return;
      }

      // Step 3: Execute the action
      const execResult = executeAction(state, options.player, action);

      if (!execResult.success) {
        console.log(JSON.stringify({
          success: false,
          error: execResult.error
        }));
        process.exit(1);
        return;
      }

      // Check for win condition (hand empty for card games)
      const player = state.players[options.player];
      if (player && player.hand.length === 0 && action.type === 'play_card') {
        endGame(game, options.player, `${options.player} emptied their hand`);
      }

      // Reload state to get updated values
      const updatedState = loadState(game);
      const playerView = getPlayerView(updatedState, options.player);

      console.log(JSON.stringify({
        success: true,
        action,
        effect: execResult.effect,
        validation: ruleResult,
        handSize: player?.hand.length,
        nextPlayer: updatedState.currentPlayer,
        gameStatus: updatedState.status,
        view: playerView
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('contest <game>')
  .description('Contest the previous player\'s action')
  .requiredOption('-p, --player <id>', 'Contesting player ID')
  .requiredOption('-r, --reason <text>', 'Reason for contest')
  .action((game: string, options: { player: string; reason: string }) => {
    try {
      const state = loadState(game);
      const result = fileContest(state, options.player, options.reason);

      if (!result.success) {
        console.log(JSON.stringify({
          success: false,
          error: result.error
        }));
        process.exit(1);
        return;
      }

      const contestState = ensureContestState(state);

      console.log(JSON.stringify({
        success: true,
        message: 'Contest filed. Waiting for gamemaster adjudication.',
        contest: contestState.pendingContest
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('adjudicate <game>')
  .description('Adjudicate a pending contest or resignation (gamemaster only)')
  .option('--allow', 'Allow the contested action (reject the contest)')
  .option('--reject', 'Reject the contested action (uphold the contest)')
  .option('--accept-resignation', 'Accept a pending resignation')
  .option('--reject-resignation', 'Reject a pending resignation')
  .requiredOption('-r, --reason <text>', 'Reason for ruling')
  .action((game: string, options: { allow?: boolean; reject?: boolean; acceptResignation?: boolean; rejectResignation?: boolean; reason: string }) => {
    try {
      const state = loadState(game);
      const contestState = ensureContestState(state);

      // Handle resignation adjudication
      if (options.acceptResignation || options.rejectResignation) {
        if (!contestState.pendingResignation) {
          console.log(JSON.stringify({
            success: false,
            error: 'No pending resignation to adjudicate'
          }));
          process.exit(1);
          return;
        }

        const accepted = !!options.acceptResignation;
        const result = adjudicateResignation(state, accepted, options.reason);

        if (!result.success) {
          console.log(JSON.stringify({
            success: false,
            error: result.error
          }));
          process.exit(1);
          return;
        }

        const updatedState = loadState(game);
        console.log(JSON.stringify({
          success: true,
          type: 'resignation',
          accepted,
          reason: options.reason,
          gameStatus: updatedState.status,
          winner: updatedState.shared.winner
        }));
        return;
      }

      // Handle contest adjudication
      if (!options.allow && !options.reject) {
        console.log(JSON.stringify({
          success: false,
          error: 'Must specify --allow or --reject for contest, or --accept-resignation/--reject-resignation'
        }));
        process.exit(1);
        return;
      }

      if (!contestState.pendingContest) {
        console.log(JSON.stringify({
          success: false,
          error: 'No pending contest to adjudicate'
        }));
        process.exit(1);
        return;
      }

      const ruling = options.allow ? 'allowed' : 'rejected';
      const result = adjudicateContest(state, ruling, options.reason);

      if (!result.success) {
        console.log(JSON.stringify({
          success: false,
          error: result.error
        }));
        process.exit(1);
        return;
      }

      const updatedState = loadState(game);
      console.log(JSON.stringify({
        success: true,
        type: 'contest',
        ruling,
        reason: options.reason,
        actionReversed: result.reversed,
        currentPlayer: updatedState.currentPlayer,
        turn: updatedState.turn
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('pending <game>')
  .description('Wait for pending action, contest, or resignation (gamemaster use)')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '120000')
  .action(async (game: string, options: { timeout: string }) => {
    try {
      const timeout = parseInt(options.timeout, 10);
      const startTime = Date.now();
      const pollInterval = 500;

      // Poll for pending action, contest, or resignation
      while (Date.now() - startTime < timeout) {
        const state = loadState(game);

        if (state.status === 'completed') {
          console.log(JSON.stringify({
            status: 'game_over',
            winner: state.shared.winner
          }));
          return;
        }

        // Check for pending contest (priority)
        const contestState = ensureContestState(state);
        if (contestState.pendingContest) {
          console.log(JSON.stringify({
            status: 'contest_pending',
            contest: contestState.pendingContest,
            turn: state.turn,
            currentPlayer: state.currentPlayer
          }));
          return;
        }

        // Check for pending resignation
        if (contestState.pendingResignation) {
          console.log(JSON.stringify({
            status: 'resignation_pending',
            resignation: contestState.pendingResignation,
            turn: state.turn
          }));
          return;
        }

        // Check for pending action (legacy mode)
        if (state.shared.pendingAction) {
          const pending = state.shared.pendingAction as PendingAction;
          // Clear the pending action
          delete state.shared.pendingAction;
          saveState(state);

          console.log(JSON.stringify({
            status: 'action_received',
            player: pending.player,
            turn: pending.turn,
            action: pending.action,
            submittedAt: pending.submittedAt
          }));
          return;
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      console.log(JSON.stringify({
        status: 'timeout',
        message: 'No action received within timeout'
      }));
      process.exit(124);
    } catch (e) {
      console.log(JSON.stringify({
        status: 'error',
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Game Mechanics Commands ============

program
  .command('roll <game>')
  .description('Roll probability check')
  .requiredOption('--probability <p>', 'Success probability (0.0-1.0)')
  .option('-c, --context <text>', 'Context for logging', 'probability check')
  .action((game: string, options: { probability: string; context: string }) => {
    try {
      const state = loadState(game);
      const probability = parseFloat(options.probability);

      if (isNaN(probability) || probability < 0 || probability > 1) {
        throw new Error('Probability must be between 0.0 and 1.0');
      }

      const result = roll(probability);

      logEvent(state, {
        event: 'roll',
        turn: state.turn,
        player: state.currentPlayer ?? undefined,
        data: {
          probability,
          roll: result.roll,
          success: result.success,
          context: options.context
        }
      });

      console.log(JSON.stringify({
        success: true,
        roll: result.roll.toFixed(4),
        threshold: probability,
        passed: result.success,
        context: options.context
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('draw <game>')
  .description('Draw cards from deck')
  .requiredOption('-p, --player <id>', 'Player ID')
  .option('-n, --count <n>', 'Number of cards to draw', '1')
  .action((game: string, options: { player: string; count: string }) => {
    try {
      const state = loadState(game);
      const count = parseInt(options.count, 10);
      const cards = drawCards(state, options.player, count);

      logEvent(state, {
        event: 'draw',
        turn: state.turn,
        player: options.player,
        data: { count, cards: cards.map(c => c.name) }
      });

      console.log(JSON.stringify({
        success: true,
        cards,
        drawn: cards.length,
        deckRemaining: state.deck.length
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('discard <game>')
  .description('Discard a card from hand')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-i, --index <n>', 'Card index in hand')
  .action((game: string, options: { player: string; index: string }) => {
    try {
      const state = loadState(game);
      const index = parseInt(options.index, 10);
      const card = discardCard(state, options.player, index);

      if (!card) {
        throw new Error(`Invalid card index: ${index}`);
      }

      logEvent(state, {
        event: 'discard',
        turn: state.turn,
        player: options.player,
        data: { card: card.name }
      });

      console.log(JSON.stringify({
        success: true,
        discarded: card
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('play <game>')
  .description('Play a card by name (removes from hand, adds to discard)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-c, --card <name>', 'Card name to play')
  .option('--color <color>', 'Declared color for wild cards')
  .action((game: string, options: { player: string; card: string; color?: string }) => {
    try {
      const state = loadState(game);
      const card = playCardByName(state, options.player, options.card, options.color);

      if (!card) {
        throw new Error(`Card "${options.card}" not found in ${options.player}'s hand`);
      }

      // Get card definition from rules to help gamemaster resolve effects
      const rulesPath = getRulesPath(game);
      const { config } = parseRules(rulesPath);
      const cardDef = getCardDefinition(config, card.name);

      logEvent(state, {
        event: 'play_card',
        turn: state.turn,
        player: options.player,
        data: {
          card: card.name,
          declaredColor: options.color,
          newTopCard: state.shared.topCard,
          currentColor: state.shared.currentColor
        }
      });

      console.log(JSON.stringify({
        success: true,
        played: card,
        cardDefinition: cardDef?.effect,  // Effect info for gamemaster
        handSize: state.players[options.player].hand.length,
        topCard: state.shared.topCard,
        currentColor: state.shared.currentColor
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Gamemaster Commands ============

program
  .command('state <game>')
  .description('Get full game state (gamemaster only)')
  .option('-p, --player <id>', 'Get player-filtered view instead')
  .action((game: string, options: { player?: string }) => {
    try {
      const state = loadState(game);

      if (options.player) {
        const view = getPlayerView(state, options.player);
        console.log(JSON.stringify({ success: true, view }));
      } else {
        // Full state for gamemaster
        console.log(JSON.stringify({
          success: true,
          state: {
            gameId: state.gameId,
            status: state.status,
            turn: state.turn,
            currentPlayer: state.currentPlayer,
            turnOrder: state.turnOrder,
            players: state.players,
            shared: state.shared,
            deckSize: state.deck.length,
            discardSize: state.discardPile.length
          }
        }));
      }
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('update <game>')
  .description('Update player state (gamemaster only)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-s, --state <json>', 'State updates JSON')
  .action((game: string, options: { player: string; state: string }) => {
    try {
      const gameState = loadState(game);
      const updates = JSON.parse(options.state);

      const player = gameState.players[options.player];
      if (!player) {
        throw new Error(`Player ${options.player} not found`);
      }

      // Apply updates
      if (updates.state !== undefined) player.state = updates.state;
      if (updates.effects !== undefined) player.effects = updates.effects;
      if (updates.score !== undefined) player.score = updates.score;

      saveState(gameState);

      logEvent(gameState, {
        event: 'state_update',
        turn: gameState.turn,
        player: options.player,
        data: updates
      });

      console.log(JSON.stringify({
        success: true,
        player: options.player,
        newState: {
          state: player.state,
          effects: player.effects,
          score: player.score
        }
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('advance <game>')
  .description('Advance to next player turn (gamemaster only)')
  .action((game: string) => {
    try {
      const state = loadState(game);
      const previousPlayer = state.currentPlayer;
      advanceTurn(state);

      console.log(JSON.stringify({
        success: true,
        previousPlayer,
        currentPlayer: state.currentPlayer,
        turn: state.turn
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('end <game>')
  .description('End game and declare winner')
  .requiredOption('-w, --winner <id>', 'Winner player ID')
  .requiredOption('-r, --reason <text>', 'End reason')
  .action((game: string, options: { winner: string; reason: string }) => {
    try {
      const state = endGame(game, options.winner, options.reason);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        winner: options.winner,
        totalTurns: state.turn,
        reason: options.reason
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Utility Commands ============

program
  .command('rules <game>')
  .description('Get game rules markdown')
  .action((game: string) => {
    try {
      if (!stateExists(game)) {
        throw new Error(`No active game for ${game}`);
      }
      const state = loadState(game);
      console.log(JSON.stringify({
        success: true,
        rules: state.rulesMarkdown,
        config: state.config
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program
  .command('reset <game>')
  .description('Reset game state (clean up and optionally reinitialize)')
  .option('-p, --players <n>', 'Reinitialize with this many players')
  .option('--keep-logs', 'Keep existing log files')
  .action((game: string, options: { players?: string; keepLogs?: boolean }) => {
    try {
      // Check if game exists
      if (!gameExists(game)) {
        throw new Error(`Game '${game}' not found`);
      }

      const stateDir = getStatePath(game);

      // Clean up state directory
      if (existsSync(stateDir)) {
        rmSync(stateDir, { recursive: true, force: true });
      }

      let result: Record<string, unknown> = {
        success: true,
        game,
        stateCleared: true
      };

      // Reinitialize if players specified
      if (options.players) {
        const playerCount = parseInt(options.players, 10);
        const state = initGame(game, playerCount);

        // Auto-start the game
        state.status = 'in_progress';
        state.turn = 1;
        state.currentPlayer = state.turnOrder[0];
        saveState(state);

        result = {
          ...result,
          reinitialized: true,
          gameId: state.gameId,
          status: state.status,
          players: state.turnOrder,
          topCard: state.shared.topCard,
          currentColor: state.shared.currentColor
        };
      }

      console.log(JSON.stringify(result));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

program.parse();
