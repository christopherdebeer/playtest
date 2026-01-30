#!/usr/bin/env node

// Playtest Engine CLI

import { Command } from 'commander';
import { rmSync, existsSync } from 'fs';
import {
  initGame,
  loadState,
  saveState,
  registerAgent,
  startGame,
  endGame,
  cancelGame,
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
  adjudicateVictory,
  ensureContestState,
  setDebugMode,
  checkAllWinConditions,
  getAvailableActions
} from './game.js';
import type { PendingAction, GameAction, ContestState } from './types.js';
import { waitForTurn } from './turns.js';
import {
  getCardDefinition,
  parseRules,
  loadMechanicsIndex,
  getMechanicBySlug,
  getMechanicById,
  getMechanicByName,
  searchMechanics,
  getMechanicsByCategory,
  getMechanicMarkdown,
  resolveMechanics,
  listCategories
} from './rules.js';
import { getRulesPath } from './game.js';

const program = new Command();

// Global debug flag
let DEBUG_MODE = false;

function debug(...args: any[]): void {
  if (DEBUG_MODE) {
    console.error(...args);
  }
}

program
  .name('playtest')
  .description('Game-agnostic AI playtesting engine')
  .version('3.0.0')
  .option('--debug', 'Enable debug logging')
  .hook('preAction', (thisCommand) => {
    DEBUG_MODE = thisCommand.opts().debug || false;
    setDebugMode(DEBUG_MODE);
  });

// ============ Game Lifecycle Commands ============

program
  .command('init <game>')
  .description('Initialize a new game instance')
  .option('-p, --players <n>', 'Number of players', '2')
  .option('--personas <list>', 'Persona assignments: "random" (default), "none", or comma-separated list (e.g., "aggressive,casual")', 'random')
  .action((game: string, options: { players: string; personas: string }) => {
    try {
      const playerCount = parseInt(options.players, 10);

      // Parse persona assignments
      let personaOverrides: Record<string, string> | undefined;
      if (options.personas === 'none') {
        // No personas - set all to empty to prevent random assignment
        personaOverrides = {};
        for (let i = 1; i <= playerCount; i++) {
          personaOverrides[`player-${i}`] = '';  // Empty string means no persona
        }
      } else if (options.personas !== 'random') {
        // Specific persona list
        const personaList = options.personas.split(',').map(p => p.trim());
        personaOverrides = {};
        for (let i = 1; i <= playerCount; i++) {
          const persona = personaList[i - 1] || 'random';  // Fall back to random if not enough specified
          personaOverrides[`player-${i}`] = persona;
        }
      }
      // If 'random', leave personaOverrides undefined - will be assigned at registration

      const state = initGame(game, playerCount, personaOverrides ? { personas: personaOverrides } : undefined);

      // Generate explicit spawn instructions for coordinator
      const spawnInstructions = {
        gamemaster: {
          role: 'gamemaster',
          instanceId: state.gameId,
          agentType: 'gamemaster',
          prompt: `INSTANCE: ${state.gameId}\nROLE: gamemaster\n\nRegister and begin gamemaster duties.`
        },
        players: state.turnOrder.map(playerId => ({
          role: 'player',
          playerId,
          instanceId: state.gameId,
          agentType: 'player',
          persona: state.players[playerId].persona || 'random',  // Show pre-assigned or 'random'
          prompt: `INSTANCE: ${state.gameId}\nPLAYER_ID: ${playerId}\n\nRegister and play to WIN!`
        }))
      };

      console.log(JSON.stringify({
        success: true,
        instanceId: state.gameId,
        gameName: state.gameName,
        status: state.status,
        players: state.turnOrder,
        spawnInstructions,
        message: `Game instance ${state.gameId} created. Spawn agents using the instructions above.`
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
  .description('Register an agent as gamemaster or player. Returns rules on successful registration.')
  .requiredOption('-r, --role <role>', 'Role: gamemaster or player')
  .requiredOption('-a, --agent-id <id>', 'Agent ID')
  .option('-p, --player <id>', 'Player ID (auto-assigned if not specified)')
  .action((game: string, options: { role: 'gamemaster' | 'player'; agentId: string; player?: string }) => {
    try {
      const result = registerAgent(game, options.role, options.agentId, options.player);
      // Return full rules and config on successful registration
      // This replaces the need for a separate 'rules' command
      const personaInfo = result.persona ? ` with persona "${result.persona}"` : '';
      console.log(JSON.stringify({
        success: true,
        registered: result.registered,
        role: result.role,
        playerId: result.playerId,
        persona: result.persona,
        instanceId: result.instanceId,
        rules: result.rules,
        config: result.config,
        message: `Registered as ${result.role}${result.playerId ? ` (${result.playerId})` : ''}${personaInfo} for instance ${result.instanceId}. Rules included above.`
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
  .description('Get current game status (accepts game name or instance ID)')
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
        instanceId: state.gameId,
        gameName: state.gameName,
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

program
  .command('list [game]')
  .description('List active game instances (optionally for a specific game)')
  .action(async (game?: string) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const GAMES_DIR = path.join(process.cwd(), 'games');

      const results: { gameName: string; instanceId: string; status: string; turn: number }[] = [];

      // If game specified, list instances for that game only
      const gamesToCheck = game ? [game] : fs.readdirSync(GAMES_DIR).filter((f: string) => {
        try {
          return fs.statSync(path.join(GAMES_DIR, f)).isDirectory();
        } catch {
          return false;
        }
      });

      for (const gameName of gamesToCheck) {
        const instances = listGameInstances(gameName);
        for (const instanceId of instances) {
          try {
            const state = loadState(instanceId);
            results.push({
              gameName: state.gameName,
              instanceId: state.gameId,
              status: state.status,
              turn: state.turn
            });
          } catch {
            // Skip if can't load state
          }
        }
      }

      console.log(JSON.stringify({
        success: true,
        instances: results,
        count: results.length
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
  .option('-t, --timeout <ms>', 'Timeout in milliseconds (0 = no timeout)', '0')
  .action(async (game: string, options: { player: string; timeout: string }) => {
    try {
      // Auto-register the player if not already registered
      const state = loadState(game);
      debug(`[WAIT DEBUG] Player ${options.player}: checking registration...`);
      debug(`[WAIT DEBUG] Current agentId: ${state.players[options.player]?.agentId || 'null'}`);

      if (!state.players[options.player]?.agentId) {
        debug(`[WAIT DEBUG] Attempting auto-registration for ${options.player}...`);
        try {
          const regResult = registerAgent(game, 'player', `agent-${options.player}`, options.player);
          debug(`[WAIT DEBUG] Registration result:`, regResult);
        } catch (regError) {
          debug(`[WAIT DEBUG] Registration error:`, regError);
          throw regError;
        }
      } else {
        debug(`[WAIT DEBUG] Already registered with agentId: ${state.players[options.player].agentId}`);
      }

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

      // Reload state to get updated values
      const updatedState = loadState(game);
      const player = updatedState.players[options.player];
      const playerView = getPlayerView(updatedState, options.player);

      // Return result with gameOver info if applicable
      console.log(JSON.stringify({
        success: true,
        action,
        effect: execResult.effect,
        validation: ruleResult,
        handSize: player?.hand.length,
        nextPlayer: updatedState.currentPlayer,
        gameStatus: updatedState.status,
        gameOver: execResult.gameOver || false,
        winner: execResult.winner,
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
  .description('Adjudicate a pending contest, resignation, or victory claim (gamemaster only)')
  .option('--allow', 'Allow the contested action (reject the contest)')
  .option('--reject', 'Reject the contested action (uphold the contest)')
  .option('--accept-resignation', 'Accept a pending resignation')
  .option('--reject-resignation', 'Reject a pending resignation')
  .option('--accept-victory', 'Accept a pending victory claim')
  .option('--reject-victory', 'Reject a pending victory claim (rolls back move)')
  .requiredOption('-r, --reason <text>', 'Reason for ruling')
  .action((game: string, options: { allow?: boolean; reject?: boolean; acceptResignation?: boolean; rejectResignation?: boolean; acceptVictory?: boolean; rejectVictory?: boolean; reason: string }) => {
    try {
      const state = loadState(game);
      const contestState = ensureContestState(state);

      // Handle victory claim adjudication
      if (options.acceptVictory || options.rejectVictory) {
        if (!contestState.pendingVictoryClaim) {
          console.log(JSON.stringify({
            success: false,
            error: 'No pending victory claim to adjudicate'
          }));
          process.exit(1);
          return;
        }

        const accepted = !!options.acceptVictory;
        const result = adjudicateVictory(state, accepted, options.reason);

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
          type: 'victory',
          accepted,
          reason: options.reason,
          gameStatus: updatedState.status,
          winner: updatedState.shared.winner
        }));
        return;
      }

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
          error: 'Must specify --allow/--reject for contest, --accept-resignation/--reject-resignation, or --accept-victory/--reject-victory'
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
  .option('-t, --timeout <ms>', 'Timeout in milliseconds (0 = no timeout)', '0')
  .action(async (game: string, options: { timeout: string }) => {
    try {
      // Auto-register the gamemaster if not already registered
      {
        const state = loadState(game);
        debug(`[PENDING DEBUG] Gamemaster: checking registration...`);
        debug(`[PENDING DEBUG] Current gamemasterAgentId: ${state.shared.gamemasterAgentId || 'null'}`);

        if (!state.shared.gamemasterAgentId) {
          debug(`[PENDING DEBUG] Attempting auto-registration for gamemaster...`);
          try {
            const regResult = registerAgent(game, 'gamemaster', 'agent-gamemaster');
            debug(`[PENDING DEBUG] Registration result:`, regResult);
          } catch (regError) {
            debug(`[PENDING DEBUG] Registration error:`, regError);
            throw regError;
          }
        } else {
          debug(`[PENDING DEBUG] Already registered with agentId: ${state.shared.gamemasterAgentId}`);
        }
      }

      const timeout = parseInt(options.timeout, 10);
      const startTime = Date.now();
      const pollInterval = 500;

      // Poll for pending action, contest, or resignation
      // timeout=0 means infinite wait
      while (timeout === 0 || Date.now() - startTime < timeout) {
        const state = loadState(game);

        if (state.status === 'completed') {
          console.log(JSON.stringify({
            status: 'game_over',
            winner: state.shared.winner
          }));
          return;
        }

        if (state.status === 'cancelled') {
          console.log(JSON.stringify({
            status: 'game_cancelled',
            reason: state.shared.cancelReason
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

        // Check for pending victory claim
        if (contestState.pendingVictoryClaim) {
          console.log(JSON.stringify({
            status: 'victory_pending',
            victoryClaim: contestState.pendingVictoryClaim,
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
  .command('actions <game>')
  .description('Get available actions for a player (procedurally generated based on game rules)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .option('--enabled-only', 'Only show currently enabled actions')
  .option('--json', 'Output as JSON (default is human-readable)')
  .action((game: string, options: { player: string; enabledOnly?: boolean; json?: boolean }) => {
    try {
      const state = loadState(game);
      const result = getAvailableActions(state, options.player);

      // Filter to enabled-only if requested
      if (options.enabledOnly) {
        result.actions = result.actions.filter(a => a.enabled);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, ...result }));
      } else {
        // Human-readable format for agents
        console.log(`\n=== Available Actions for ${options.player} ===`);
        console.log(`Current State: ${result.currentState}`);
        console.log(`Your Turn: ${result.isYourTurn ? 'YES' : 'NO'}`);
        console.log(`Hand: ${result.hand.join(', ') || '(empty)'}`);

        if (result.activeEffects.length > 0) {
          console.log(`\nActive Effects:`);
          for (const eff of result.activeEffects) {
            console.log(`  - ${eff.type}${eff.value ? ` (${eff.value})` : ''} [${eff.duration} turns remaining]`);
          }
        }

        if (result.placedCards.length > 0) {
          console.log(`\nPlaced Cards on Board:`);
          for (const pc of result.placedCards) {
            console.log(`  - ${pc.cardName} on ${pc.state} (by ${pc.placedBy}, affects ${pc.targetMode})`);
          }
        }

        console.log(`\n--- Actions ---`);
        for (const action of result.actions) {
          const status = action.enabled ? '✓' : '✗';
          console.log(`\n[${status}] ${action.type.toUpperCase()}: ${action.description}`);

          if (!action.enabled && action.reason) {
            console.log(`    (Disabled: ${action.reason})`);
          }

          if (action.enabled) {
            if (action.cards && action.cards.length > 0) {
              console.log(`    Cards: ${action.cards.join(', ')}`);
            }
            if (action.targets && action.targets.length > 0) {
              console.log(`    Targets: ${action.targets.join(', ')}`);
            }

            // Show required fields
            const reqFields = Object.entries(action.required);
            if (reqFields.length > 0) {
              console.log(`    Required: ${reqFields.map(([k, v]) => `${k}`).join(', ')}`);
            }

            // Show examples
            if (action.examples.length > 0) {
              console.log(`    Example: ${JSON.stringify(action.examples[0])}`);
            }
          }
        }
        console.log('');
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
  .command('start <game>')
  .description('Start the game (transition from waiting_for_players to in_progress)')
  .action((game: string) => {
    try {
      startGame(game);
      const state = loadState(game);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: state.status,
        turn: state.turn,
        currentPlayer: state.currentPlayer,
        message: 'Game started successfully'
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

program
  .command('cancel <game>')
  .description('Cancel game without a winner (releases all waiting agents)')
  .requiredOption('-r, --reason <text>', 'Cancellation reason')
  .action((game: string, options: { reason: string }) => {
    try {
      const state = cancelGame(game, options.reason);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: 'cancelled',
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

// ============ Mechanics Commands ============

program
  .command('mechanic [query]')
  .description('Look up game mechanic by slug, ID, name, or search')
  .option('-c, --category <cat>', 'List mechanics in category')
  .option('-l, --list', 'List all categories')
  .option('--markdown', 'Output full markdown content')
  .option('--json', 'Output as JSON')
  .action((query: string | undefined, options: { category?: string; list?: boolean; markdown?: boolean; json?: boolean }) => {
    try {
      // List categories
      if (options.list) {
        const categories = listCategories();
        if (options.json) {
          console.log(JSON.stringify({ success: true, categories }));
        } else {
          console.log('Mechanic Categories:\n');
          categories.forEach(c => console.log(`  - ${c}`));
        }
        return;
      }

      // List mechanics in category
      if (options.category) {
        const mechanics = getMechanicsByCategory(options.category);
        if (mechanics.length === 0) {
          console.log(JSON.stringify({
            success: false,
            error: `No mechanics found in category: ${options.category}`
          }));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ success: true, category: options.category, mechanics }));
        } else {
          console.log(`\n${options.category.toUpperCase()} Mechanics:\n`);
          mechanics.forEach(m => console.log(`  - ${m.name} (${m.slug})`));
        }
        return;
      }

      // Require query for lookup
      if (!query) {
        const index = loadMechanicsIndex();
        console.log(JSON.stringify({
          success: true,
          totalMechanics: index.count,
          categories: index.categories,
          usage: 'npx playtest mechanic <slug|id|name|search-term>'
        }));
        return;
      }

      // Try exact lookups first
      let mechanic = getMechanicBySlug(query);
      if (!mechanic) mechanic = getMechanicById(query);
      if (!mechanic) mechanic = getMechanicByName(query);

      if (mechanic) {
        if (options.markdown) {
          const md = getMechanicMarkdown(mechanic.slug);
          console.log(md || 'Markdown not found');
        } else if (options.json) {
          console.log(JSON.stringify({ success: true, mechanic }));
        } else {
          console.log(`\n${mechanic.name}`);
          console.log(`${'='.repeat(mechanic.name.length)}\n`);
          console.log(`ID:       ${mechanic.id}`);
          console.log(`Slug:     ${mechanic.slug}`);
          console.log(`Category: ${mechanic.category}`);
          console.log(`Path:     mechanics/${mechanic.path}`);
          console.log(`\nUse --markdown for full description`);
        }
        return;
      }

      // Fall back to search
      const results = searchMechanics(query);
      if (results.length === 0) {
        console.log(JSON.stringify({
          success: false,
          error: `No mechanics found matching: ${query}`
        }));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, query, results }));
      } else {
        console.log(`\nMechanics matching "${query}":\n`);
        results.slice(0, 20).forEach(m => {
          console.log(`  - ${m.name} (${m.slug}) [${m.category}]`);
        });
        if (results.length > 20) {
          console.log(`\n  ... and ${results.length - 20} more`);
        }
      }
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Hook Commands ============

program
  .command('hook')
  .description('Handle agent session hooks (reads JSON from stdin)')
  .requiredOption('-n, --name <type>', 'Hook type: start or stop')
  .requiredOption('-a, --agent <type>', 'Agent type: player or gamemaster')
  .action(async (options: { name: 'start' | 'stop'; agent: 'player' | 'gamemaster' }) => {
    const { name: hookType, agent: agentType } = options;

    // Immediate log to confirm hook is invoked
    const fsEarly = await import('fs');
    const earlyLogsDir = `${process.cwd()}/logs/hooks`;
    try { fsEarly.mkdirSync(earlyLogsDir, { recursive: true }); } catch { /* ignore */ }
    try { fsEarly.appendFileSync(`${earlyLogsDir}/hook-invocations.log`, `[${new Date().toISOString()}] Hook invoked: ${hookType}-${agentType}\n`); } catch { /* ignore */ }

    // Read JSON input from stdin
    let inputJson: {
      session_id?: string;
      transcript_path?: string;
      cwd?: string;
      hook_event_name?: string;
      agent_id?: string;
      agent_type?: string;
    } = {};

    let rawInput = '';
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      rawInput = Buffer.concat(chunks).toString('utf8').trim();
      if (rawInput) {
        inputJson = JSON.parse(rawInput);
      }
    } catch {
      // No stdin or invalid JSON - continue with empty input
    }

    // Debug: Log the raw stdin JSON
    try { fsEarly.appendFileSync(`${earlyLogsDir}/hook-invocations.log`, `[${new Date().toISOString()}] Raw stdin: ${rawInput.substring(0, 500)}\n`); } catch { /* ignore */ }
    try { fsEarly.appendFileSync(`${earlyLogsDir}/hook-invocations.log`, `[${new Date().toISOString()}] Parsed fields: ${JSON.stringify(Object.keys(inputJson))}\n`); } catch { /* ignore */ }

    const transcriptPath = inputJson.transcript_path || '';

    // Helper function to extract game name from transcript content
    // Searches both user messages AND Task tool_use entries
    const extractGameName = (content: string, searchToolUse: boolean = false): string => {
      const lines = content.split('\n');
      // For tool_use search, scan all lines (Task calls can be anywhere)
      // For subagent transcripts, check first 50 lines
      const linesToCheck = searchToolUse ? lines : lines.slice(0, 50);

      let foundGame = '';

      for (const line of linesToCheck) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);

          // Check for user messages (subagent transcript format)
          if (entry.role === 'user' && entry.type === 'message') {
            const text = typeof entry.content === 'string'
              ? entry.content
              : Array.isArray(entry.content)
                ? entry.content.find((c: { type?: string; text?: string }) => c.type === 'text')?.text || ''
                : '';

            const match = text.match(/^GAME:\s*(\S+)/m);
            if (match) {
              return match[1];
            }
          }

          // Check for message.content (main transcript user format)
          if (entry.message?.role === 'user' && entry.message?.content) {
            const text = typeof entry.message.content === 'string'
              ? entry.message.content
              : '';
            const match = text.match(/^GAME:\s*(\S+)/m);
            if (match) {
              return match[1];
            }
          }

          // Check for Task tool_use entries in main transcript (assistant messages)
          if (searchToolUse && entry.message?.role === 'assistant' && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              if (block.type === 'tool_use' && block.name === 'Task' && block.input?.prompt) {
                const match = block.input.prompt.match(/^GAME:\s*(\S+)/m);
                if (match) {
                  // Keep searching to find the most recent one
                  foundGame = match[1];
                }
              }
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      return foundGame;
    };

    // Poll transcript until game name is found (for start hooks)
    // Stop hooks can fail fast since transcript should already exist
    const MAX_WAIT_MS = hookType === 'start' ? 10000 : 2000;
    const POLL_INTERVAL_MS = 200;
    const startTime = Date.now();

    let gameName = '';
    const { readFileSync, appendFileSync, mkdirSync } = await import('fs');

    // Setup debug logging with relative path from cwd
    const logsDir = `${process.cwd()}/logs/hooks`;
    try { mkdirSync(logsDir, { recursive: true }); } catch { /* ignore */ }
    const logFile = `${logsDir}/${agentType}-${hookType}-hook.log`;
    const log = (msg: string) => {
      const ts = new Date().toISOString();
      try { appendFileSync(logFile, `[${ts}] ${msg}\n`); } catch { /* ignore */ }
    };

    // Determine which transcript to poll and how to search
    // For SubagentStart: Read MAIN transcript, search Task tool_use entries
    //   (subagent transcript doesn't exist yet when hook fires)
    // For SubagentStop: use agent_transcript_path if available
    const targetTranscript = hookType === 'start'
      ? transcriptPath  // Main transcript has Task tool_use with prompt
      : ((inputJson as { agent_transcript_path?: string }).agent_transcript_path || transcriptPath);
    const searchToolUse = hookType === 'start';  // Search Task tool_use for start hooks

    log(`=== HOOK START ===`);
    log(`Hook: ${agentType}-${hookType}`);
    log(`Main transcript path: ${transcriptPath}`);
    log(`Target transcript: ${targetTranscript}`);
    log(`Search mode: ${searchToolUse ? 'Task tool_use' : 'user messages'}`);
    log(`Max wait: ${MAX_WAIT_MS}ms`);

    while (Date.now() - startTime < MAX_WAIT_MS) {
      if (targetTranscript && existsSync(targetTranscript)) {
        try {
          const content = readFileSync(targetTranscript, 'utf8');
          const lineCount = content.split('\n').filter(l => l.trim()).length;
          log(`Polling: file exists, ${lineCount} lines, elapsed ${Date.now() - startTime}ms`);
          gameName = extractGameName(content, searchToolUse);
          if (gameName) {
            log(`Found game name: ${gameName}`);
            break;
          }
        } catch (e) {
          log(`Read error: ${e}`);
        }
      } else {
        log(`Polling: file not found, elapsed ${Date.now() - startTime}ms`);
      }
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!gameName) {
      log(`Timeout: game name not found after ${Date.now() - startTime}ms`);
    }

    // Handle start hooks - inject context
    if (hookType === 'start') {
      if (!gameName) {
        log(`No game name found - exiting`);
        // Can't inject context without game name - exit silently
        process.exit(0);
      }

      log(`Checking if state exists for game: ${gameName}`);
      if (!stateExists(gameName)) {
        log(`State does not exist for game: ${gameName} - exiting`);
        // Game not initialized yet - exit silently
        process.exit(0);
      }

      log(`Loading state for game: ${gameName}`);
      try {
        const state = loadState(gameName);
        log(`State loaded successfully. Rules length: ${state.rulesMarkdown?.length || 0}`);

        // Output rules
        console.log(`## Game Rules for ${gameName}`);
        console.log('');
        console.log(JSON.stringify({
          success: true,
          rules: state.rulesMarkdown,
          config: state.config
        }));
        log(`Rules output complete`);

        // For gamemaster, also output current status
        if (agentType === 'gamemaster') {
          console.log('');
          console.log('## Current Game Status');
          console.log('```json');
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
          console.log('```');
        }

        process.exit(0);
      } catch (err) {
        log(`Error loading state: ${err}`);
        // Error loading state - exit silently
        process.exit(0);
      }
    }

    // Handle stop hooks - block if game in progress
    if (hookType === 'stop') {
      if (!gameName) {
        // Can't determine game - allow stop
        process.exit(0);
      }

      if (!stateExists(gameName)) {
        // No active game - allow stop
        process.exit(0);
      }

      try {
        const state = loadState(gameName);
        const gameStatus = state.status;

        // Allow stop if game is completed or cancelled
        if (gameStatus === 'completed' || gameStatus === 'cancelled') {
          process.exit(0);
        }

        // Block stop if game is still in progress
        const message = agentType === 'gamemaster'
          ? 'Game not finished. Continue managing the game until completion.'
          : 'Game still in progress. Wait for your turn or for the game to end.';

        console.error(message);
        process.exit(2);
      } catch {
        // Error checking state - allow stop
        process.exit(0);
      }
    }
  });

// ============ Universal Hook Event Handler ============
// Handles all hook events for tracing and debugging

program
  .command('hook-event')
  .description('Universal hook event handler (reads JSON from stdin)')
  .requiredOption('-e, --event <name>', 'Hook event name')
  .option('-m, --matcher <pattern>', 'Matcher pattern (for tool events)')
  .action(async (options: { event: string; matcher?: string }) => {
    const { event: eventName, matcher } = options;
    const fs = await import('fs');
    const logsDir = `${process.cwd()}/logs/hooks`;

    try { fs.mkdirSync(logsDir, { recursive: true }); } catch { /* ignore */ }

    const traceLog = `${logsDir}/hook-trace.log`;
    const log = (msg: string) => {
      const ts = new Date().toISOString();
      try { fs.appendFileSync(traceLog, `[${ts}] ${msg}\n`); } catch { /* ignore */ }
    };

    // Read stdin
    let rawInput = '';
    let inputJson: Record<string, unknown> = {};
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      rawInput = Buffer.concat(chunks).toString('utf8').trim();
      if (rawInput) {
        inputJson = JSON.parse(rawInput);
      }
    } catch {
      // No stdin or invalid JSON
    }

    log(`========== ${eventName} ==========`);
    log(`Matcher: ${matcher || '(none)'}`);
    log(`Input keys: ${JSON.stringify(Object.keys(inputJson))}`);
    log(`Raw input (first 1000 chars): ${rawInput.substring(0, 1000)}`);

    // Extract common fields
    const transcriptPath = (inputJson.transcript_path as string) || '';
    const prompt = (inputJson.prompt as string) || '';
    const toolName = (inputJson.tool_name as string) || '';
    const toolInput = inputJson.tool_input as Record<string, unknown> || {};

    // Helper to extract game name from transcript or prompt
    const extractGameName = (text: string): string => {
      const match = text.match(/^GAME:\s*(\S+)/m);
      return match ? match[1] : '';
    };

    // Try to find game name from various sources
    let gameName = '';

    // For UserPromptSubmit, check the prompt directly
    if (eventName === 'UserPromptSubmit' && prompt) {
      gameName = extractGameName(prompt);
      log(`UserPromptSubmit prompt: ${prompt.substring(0, 200)}`);
    }

    // For PreToolUse with Task, check the tool input
    if (eventName === 'PreToolUse' && toolName === 'Task') {
      const taskPrompt = (toolInput.prompt as string) || '';
      gameName = extractGameName(taskPrompt);
      log(`PreToolUse Task prompt: ${taskPrompt.substring(0, 200)}`);
    }

    // For SessionStart, could search transcript
    if (eventName === 'SessionStart' && transcriptPath) {
      log(`SessionStart - transcript available at: ${transcriptPath}`);
    }

    log(`Extracted game name: ${gameName || '(none)'}`);

    // Handle context injection based on event type
    switch (eventName) {
      case 'SessionStart': {
        // stdout is added to context
        log(`SessionStart - can inject context via stdout`);
        // Output rules if we have a game
        if (gameName && stateExists(gameName)) {
          try {
            const state = loadState(gameName);
            console.log(`## Game Context Loaded`);
            console.log(`Game: ${gameName}`);
            console.log(`Status: ${state.status}`);
            log(`SessionStart - output game context for ${gameName}`);
          } catch (e) {
            log(`SessionStart - error loading state: ${e}`);
          }
        }
        process.exit(0);
        break;
      }

      case 'UserPromptSubmit': {
        // stdout is added to context
        log(`UserPromptSubmit - can inject context via stdout`);
        if (gameName && stateExists(gameName)) {
          try {
            const state = loadState(gameName);
            console.log(`\n## Active Game: ${gameName}`);
            console.log(`Status: ${state.status}`);
            console.log(`Turn: ${state.turn}`);
            console.log(`Current Player: ${state.currentPlayer}`);
            log(`UserPromptSubmit - output game status for ${gameName}`);
          } catch (e) {
            log(`UserPromptSubmit - error loading state: ${e}`);
          }
        }
        process.exit(0);
        break;
      }

      case 'PreToolUse': {
        // Can use JSON output with additionalContext or updatedInput
        log(`PreToolUse - tool: ${toolName}, can use additionalContext/updatedInput`);

        if (toolName === 'Task' && gameName && stateExists(gameName)) {
          try {
            const state = loadState(gameName);
            // Return JSON with additionalContext
            const output = {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: `\n## Game Rules for ${gameName}\n${state.rulesMarkdown}\n\n## Current State\nTurn: ${state.turn}\nStatus: ${state.status}`
              }
            };
            console.log(JSON.stringify(output));
            log(`PreToolUse Task - injected game rules via additionalContext`);
          } catch (e) {
            log(`PreToolUse - error: ${e}`);
          }
        }
        process.exit(0);
        break;
      }

      case 'PostToolUse': {
        // Can use JSON output with additionalContext
        log(`PostToolUse - tool: ${toolName}`);
        process.exit(0);
        break;
      }

      case 'SubagentStart': {
        // Side effects only - stdout NOT injected into subagent
        log(`SubagentStart - side effects only, stdout not injected`);
        log(`Agent ID: ${inputJson.agent_id}`);
        log(`Agent Type: ${inputJson.agent_type}`);
        process.exit(0);
        break;
      }

      case 'SubagentStop': {
        log(`SubagentStop - agent finished`);
        log(`Agent ID: ${inputJson.agent_id}`);
        log(`Agent transcript: ${inputJson.agent_transcript_path}`);
        process.exit(0);
        break;
      }

      case 'Stop': {
        log(`Stop - Claude finishing response`);
        log(`stop_hook_active: ${inputJson.stop_hook_active}`);
        process.exit(0);
        break;
      }

      case 'PreCompact': {
        log(`PreCompact - trigger: ${inputJson.trigger}`);
        process.exit(0);
        break;
      }

      case 'SessionEnd': {
        log(`SessionEnd - reason: ${inputJson.reason}`);
        process.exit(0);
        break;
      }

      case 'Notification': {
        log(`Notification - type: ${inputJson.notification_type}`);
        log(`Message: ${inputJson.message}`);
        process.exit(0);
        break;
      }

      case 'PermissionRequest': {
        log(`PermissionRequest - tool: ${toolName}`);
        process.exit(0);
        break;
      }

      case 'PostToolUseFailure': {
        log(`PostToolUseFailure - tool: ${toolName}`);
        process.exit(0);
        break;
      }

      case 'Setup': {
        log(`Setup - trigger: ${inputJson.trigger}`);
        process.exit(0);
        break;
      }

      default: {
        log(`Unknown event: ${eventName}`);
        process.exit(0);
      }
    }
  });

program.parse();
