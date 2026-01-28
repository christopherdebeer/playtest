#!/usr/bin/env node

// Playtest Engine CLI

import { Command } from 'commander';
import {
  initGame,
  loadState,
  saveState,
  registerAgent,
  endGame,
  roll,
  drawCards,
  discardCard,
  advanceTurn,
  logEvent,
  getPlayerView,
  gameExists,
  stateExists
} from './game.js';
import { waitForTurn } from './turns.js';

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
  .action((game, options) => {
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
  .action((game, options) => {
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
  .action((game) => {
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
  .action(async (game, options) => {
    try {
      const result = await waitForTurn(game, options.player, parseInt(options.timeout, 10));
      console.log(JSON.stringify(result));

      if (result.status === 'timeout') {
        process.exit(124); // Standard timeout exit code
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
  .description('Submit player action')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-a, --action <json>', 'Action JSON')
  .action((game, options) => {
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

      // Log the action
      logEvent(state, {
        event: 'action_submitted',
        turn: state.turn,
        player: options.player,
        data: action
      });

      // For now, just accept and advance turn
      // In full implementation, gamemaster validates
      advanceTurn(state);

      console.log(JSON.stringify({
        accepted: true,
        action,
        nextPlayer: state.currentPlayer,
        turn: state.turn
      }));
    } catch (e) {
      console.log(JSON.stringify({
        accepted: false,
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
  .action((game, options) => {
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
  .action((game, options) => {
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
  .action((game, options) => {
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

// ============ Gamemaster Commands ============

program
  .command('state <game>')
  .description('Get full game state (gamemaster only)')
  .option('-p, --player <id>', 'Get player-filtered view instead')
  .action((game, options) => {
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
  .action((game, options) => {
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
  .action((game) => {
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
  .action((game, options) => {
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
  .action((game) => {
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

program.parse();
