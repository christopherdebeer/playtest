#!/usr/bin/env node

// Playtest Engine CLI

import { Command } from 'commander';
import { rmSync, existsSync, readFileSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
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
  getAvailableActions,
  listGameInstances,
  submitAnalysis,
  skipAnalysis,
  submitAnalysisMarkdown
} from '../core/game.js';
import type { PendingAction, GameAction, ContestState, OperatorHint } from '../types/game.js';
import { waitForTurn } from '../core/turns.js';
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
} from '../core/rules.js';
import { getRulesPath } from '../core/game.js';
import { validateRules, formatValidationResult } from '../core/validate.js';

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
  .option('--skip-validation', 'Skip RULES.md validation')
  .action((game: string, options: { players: string; personas: string; skipValidation?: boolean }) => {
    try {
      const playerCount = parseInt(options.players, 10);

      // Validate RULES.md before initializing (unless skipped)
      if (!options.skipValidation) {
        const GAMES_DIR = join(process.cwd(), 'games');
        const rulesPath = join(GAMES_DIR, game, 'RULES.md');
        const validationResult = validateRules(rulesPath, { extractSections: false });

        // Output validation summary
        console.error(`Validating ${game}/RULES.md...`);
        if (validationResult.config) {
          console.error(`  ✓ ${validationResult.config.name} v${validationResult.config.version || '?'}`);
        }
        if (validationResult.errors.length > 0) {
          console.error(`  ✗ ${validationResult.errors.length} error(s):`);
          for (const err of validationResult.errors) {
            console.error(`    - [${err.code}] ${err.message}`);
          }
          // Fail on validation errors
          console.log(JSON.stringify({
            success: false,
            error: `RULES.md validation failed with ${validationResult.errors.length} error(s). Use --skip-validation to bypass.`,
            validation: {
              valid: false,
              errors: validationResult.errors,
              warnings: validationResult.warnings
            }
          }));
          process.exit(1);
        }
        if (validationResult.warnings.length > 0) {
          console.error(`  ⚠ ${validationResult.warnings.length} warning(s)`);
        } else {
          console.error(`  ✓ Valid`);
        }
        console.error('');
      }

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
          prompt: `GAME: ${state.gameName}\nINSTANCE: ${state.gameId}\nROLE: gamemaster\n\nRegister and begin gamemaster duties.`
        },
        players: state.turnOrder.map(playerId => ({
          role: 'player',
          playerId,
          instanceId: state.gameId,
          agentType: 'player',
          persona: state.players[playerId].persona || 'random',  // Show pre-assigned or 'random'
          prompt: `GAME: ${state.gameName}\nINSTANCE: ${state.gameId}\nPLAYER_ID: ${playerId}\n\nRegister and play to WIN!`
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
        round: state.round,
        turnNumber: state.turnNumber,
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
  .option('--status <status>', 'Filter by status (in_progress, completed, waiting_for_players)')
  .option('--since <time>', 'Show instances created since (e.g., "1h", "30m", "2d")')
  .option('--updated-within <time>', 'Show instances updated within (e.g., "5m", "1h")')
  .option('--stalled', 'Show only stalled games (no recent activity)')
  .option('--threshold <time>', 'Stall threshold (default: "5m")', '5m')
  .option('--sort-by <field>', 'Sort by: turns, updated, created (default: updated)', 'updated')
  .option('--format <format>', 'Output format: json, table, compact (default: json)', 'json')
  .action(async (game?: string, options?: {
    status?: string;
    since?: string;
    updatedWithin?: string;
    stalled?: boolean;
    threshold?: string;
    sortBy?: string;
    format?: string;
  }) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const GAMES_DIR = path.join(process.cwd(), 'games');

      interface GameInstance {
        gameName: string;
        instanceId: string;
        status: string;
        round: number;
        turnNumber: number;
        created?: number;
        lastUpdated?: number;
        elapsed?: number;
        stalled?: boolean;
        stalledMinutes?: number;
      }

      // Parse time string to milliseconds
      const parseTime = (timeStr: string): number => {
        const match = timeStr.match(/^(\d+)([smhd])$/);
        if (!match) throw new Error(`Invalid time format: ${timeStr}`);
        const [, value, unit] = match;
        const multipliers: Record<string, number> = {
          s: 1000,
          m: 60 * 1000,
          h: 60 * 60 * 1000,
          d: 24 * 60 * 60 * 1000
        };
        return parseInt(value) * multipliers[unit];
      };

      // Get last update time from log file
      const getLastUpdate = (gameName: string, instanceId: string): number | undefined => {
        try {
          const logPath = path.join(GAMES_DIR, gameName, 'logs', `${instanceId}.jsonl`);
          if (!fs.existsSync(logPath)) return undefined;

          const content = fs.readFileSync(logPath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l.trim());
          if (lines.length === 0) return undefined;

          const lastLine = lines[lines.length - 1];
          const lastEvent = JSON.parse(lastLine);
          return new Date(lastEvent.timestamp).getTime();
        } catch {
          return undefined;
        }
      };

      // Get creation time - prefers state.created, falls back to instance ID parsing (backfill), then file birthtime
      const getCreationTime = (state: any, instanceId: string): number | undefined => {
        try {
          // Primary method: Use state.created if available (proper way going forward)
          if (state.created && typeof state.created === 'number') {
            return state.created;
          }

          // Backfill method: Parse timestamp from instance ID (for existing games)
          const parts = instanceId.split('-');
          const lastPart = parts[parts.length - 1];
          const timestamp = parseInt(lastPart, 10);

          // Validate it looks like a millisecond timestamp (13 digits)
          if (!isNaN(timestamp) && timestamp.toString().length === 13) {
            return timestamp;
          }

          // Last resort: Fall back to file system birthtime (least reliable)
          const statePath = getStatePath(instanceId);
          const stats = fs.statSync(statePath);
          return stats.birthtimeMs;
        } catch {
          return undefined;
        }
      };

      const results: GameInstance[] = [];

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
            const lastUpdated = getLastUpdate(gameName, instanceId);
            const created = getCreationTime(state, instanceId);
            const now = Date.now();
            const stalledMinutes = lastUpdated ? (now - lastUpdated) / (60 * 1000) : undefined;
            const elapsed = (created && lastUpdated) ? lastUpdated - created : undefined;

            results.push({
              gameName: state.gameName,
              instanceId: state.gameId,
              status: state.status,
              round: state.round,
              turnNumber: state.turnNumber,
              created,
              lastUpdated,
              elapsed,
              stalled: state.status === 'in_progress' &&
                       stalledMinutes !== undefined &&
                       stalledMinutes > parseTime(options?.threshold || '5m') / (60 * 1000),
              stalledMinutes
            });
          } catch {
            // Skip if can't load state
          }
        }
      }

      // Apply filters
      let filtered = results;

      if (options?.status) {
        filtered = filtered.filter(i => i.status === options.status);
      }

      if (options?.since) {
        const sinceMs = Date.now() - parseTime(options.since);
        filtered = filtered.filter(i => i.created && i.created >= sinceMs);
      }

      if (options?.updatedWithin) {
        const withinMs = Date.now() - parseTime(options.updatedWithin);
        filtered = filtered.filter(i => i.lastUpdated && i.lastUpdated >= withinMs);
      }

      if (options?.stalled) {
        filtered = filtered.filter(i => i.stalled);
      }

      // Sort results
      const sortBy = options?.sortBy || 'updated';
      filtered.sort((a, b) => {
        if (sortBy === 'turns') {
          return b.turnNumber - a.turnNumber;
        } else if (sortBy === 'created') {
          return (b.created || 0) - (a.created || 0);
        } else {
          return (b.lastUpdated || 0) - (a.lastUpdated || 0);
        }
      });

      // Format output
      const format = options?.format || 'json';

      if (format === 'json') {
        console.log(JSON.stringify({
          success: true,
          instances: filtered,
          count: filtered.length
        }, null, 2));
      } else if (format === 'table') {
        // Table format
        console.log('\n┌─────────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Game Instances                                                                              │');
        console.log('├──────────────────┬──────────────────────────────────┬─────────────┬────────┬────────┬────────┤');
        console.log('│ Game             │ Instance ID                      │ Status      │ Round  │ Turns  │ Elapsed│');
        console.log('├──────────────────┼──────────────────────────────────┼─────────────┼────────┼────────┼────────┤');

        for (const inst of filtered) {
          const elapsedDisplay = inst.elapsed
            ? formatTimeSince(inst.elapsed)
            : 'unknown';
          const stallFlag = inst.stalled ? ' ⚠️' : '';
          console.log(`│ ${inst.gameName.padEnd(16)} │ ${inst.instanceId.padEnd(32)} │ ${inst.status.padEnd(11)} │ ${String(inst.round).padStart(6)} │ ${String(inst.turnNumber).padStart(6)} │ ${(elapsedDisplay + stallFlag).padEnd(6)} │`);
        }

        console.log('└──────────────────┴──────────────────────────────────┴─────────────┴────────┴────────┴────────┘');
        console.log(`\nTotal: ${filtered.length} instance(s)\n`);
      } else if (format === 'compact') {
        // Compact format
        for (const inst of filtered) {
          const elapsedDisplay = inst.elapsed
            ? formatTimeSince(inst.elapsed)
            : '?';
          const stallFlag = inst.stalled ? ' [STALLED]' : '';
          console.log(`${inst.instanceId} | ${inst.status} | T${inst.turnNumber} | ${elapsedDisplay}${stallFlag}`);
        }
      }

      // Helper to format time since
      function formatTimeSince(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
      }

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
  .command('player:wait <game>')
  .description('[Player] Wait for your turn (blocking)')
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

// Optimized turn command - combines wait + actions in one call
program
  .command('player:turn <game>')
  .description('[Player] Wait for turn and get available actions (optimized)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds (0 = no timeout)', '0')
  .action(async (game: string, options: { player: string; timeout: string }) => {
    try {
      // Auto-register the player if not already registered
      let state = loadState(game);
      if (!state.players[options.player]?.agentId) {
        registerAgent(game, 'player', `agent-${options.player}`, options.player);
      }

      const result = await waitForTurn(game, options.player, parseInt(options.timeout, 10));

      // If it's our turn, also include available actions to save a round-trip
      if (result.status === 'your_turn') {
        state = loadState(game); // Reload to get latest state
        const actionsResult = getAvailableActions(state, options.player);
        console.log(JSON.stringify({
          ...result,
          actions: actionsResult.actions.filter(a => a.enabled),
          hand: actionsResult.hand,
          currentState: actionsResult.currentState,
          activeEffects: actionsResult.activeEffects,
          placedCards: actionsResult.placedCards
        }));
      } else {
        console.log(JSON.stringify(result));
      }

      if (result.status === 'timeout') {
        process.exit(124);
      }
      if (result.status === 'game_not_found') {
        process.exit(1);
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
        round: state.round,
        turnNumber: state.turnNumber,
        action,
        submittedAt: new Date().toISOString()
      };
      saveState(state);

      // Log the action
      logEvent(state, {
        event: 'action_submitted',
        round: state.round,
        turnNumber: state.turnNumber,
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
  .command('player:act <game>')
  .description('[Player] Execute action directly (contest-based system)')
  .requiredOption('-p, --player <id>', 'Player ID')
  .requiredOption('-a, --action <json>', 'Action JSON')
  .option('--wait', 'For resign actions: wait for GM adjudication result (Proposal 009)')
  .option('--wait-timeout <ms>', 'Adjudication wait timeout in milliseconds', '120000')
  .action(async (game: string, options: { player: string; action: string; wait?: boolean; waitTimeout?: string }) => {
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
      let updatedState = loadState(game);
      const player = updatedState.players[options.player];
      const playerView = getPlayerView(updatedState, options.player);

      // Proposal 009: Wait for adjudication on resign actions
      if (action.type === 'resign' && options.wait) {
        const timeout = parseInt(options.waitTimeout || '120000', 10);
        const pollInterval = 500;
        const startTime = Date.now();

        // Poll for adjudication result
        while (Date.now() - startTime < timeout) {
          const currentState = loadState(game);
          const contestState = ensureContestState(currentState);

          // Check if resignation has been adjudicated (accepted or rejected)
          const adjudication = contestState.resignations?.find(
            (r: { player: string; accepted?: boolean }) =>
              r.player === options.player && r.accepted !== undefined
          );

          if (adjudication) {
            // Resignation was adjudicated - return result
            console.log(JSON.stringify({
              success: true,
              action,
              effect: execResult.effect,
              validation: ruleResult,
              resignation: {
                accepted: adjudication.accepted,
                reason: adjudication.rulingReason
              },
              handSize: currentState.players[options.player]?.hand.length,
              nextPlayer: currentState.currentPlayer,
              gameStatus: currentState.status,
              gameOver: adjudication.accepted || currentState.status === 'completed',
              winner: currentState.shared.winner as string | undefined,
              yourTurn: currentState.currentPlayer === options.player,
              view: getPlayerView(currentState, options.player)
            }));
            return;
          }

          // Also check if game has ended by other means
          if (currentState.status === 'completed' || currentState.status === 'cancelled') {
            console.log(JSON.stringify({
              success: true,
              action,
              effect: execResult.effect,
              validation: ruleResult,
              handSize: currentState.players[options.player]?.hand.length,
              nextPlayer: currentState.currentPlayer,
              gameStatus: currentState.status,
              gameOver: true,
              winner: currentState.shared.winner as string | undefined,
              view: getPlayerView(currentState, options.player)
            }));
            return;
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // Timeout - return current state with warning
        updatedState = loadState(game);
        console.log(JSON.stringify({
          success: true,
          action,
          effect: execResult.effect,
          validation: ruleResult,
          warning: `Adjudication timeout after ${timeout}ms. Check game status manually.`,
          handSize: updatedState.players[options.player]?.hand.length,
          nextPlayer: updatedState.currentPlayer,
          gameStatus: updatedState.status,
          gameOver: updatedState.status === 'completed' || updatedState.status === 'cancelled',
          winner: updatedState.shared.winner as string | undefined,
          yourTurn: updatedState.currentPlayer === options.player,
          view: getPlayerView(updatedState, options.player)
        }));
        return;
      }

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
  .command('player:contest <game>')
  .description('[Player] Contest the previous player\'s action')
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
  .command('gm:adjudicate <game>')
  .description('[GM] Adjudicate a pending contest, resignation, or victory claim')
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
        round: updatedState.round,
        turnNumber: updatedState.turnNumber
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
  .command('gm:pending <game>')
  .description('[GM] Wait for pending contest, resignation, victory claim, or analysis needed')
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
      const pollInterval = 100; // Reduced from 500ms for faster response

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

        if (state.status === 'pending_analysis') {
          console.log(JSON.stringify({
            status: 'analysis_needed',
            winner: state.shared.winner,
            endReason: state.shared.endReason,
            round: state.round,
        turnNumber: state.turnNumber,
            gameId: state.gameId
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
            round: state.round,
        turnNumber: state.turnNumber,
            currentPlayer: state.currentPlayer
          }));
          return;
        }

        // Check for pending resignation
        if (contestState.pendingResignation) {
          console.log(JSON.stringify({
            status: 'resignation_pending',
            resignation: contestState.pendingResignation,
            round: state.round,
            turnNumber: state.turnNumber
          }));
          return;
        }

        // Check for pending victory claim
        if (contestState.pendingVictoryClaim) {
          console.log(JSON.stringify({
            status: 'victory_pending',
            victoryClaim: contestState.pendingVictoryClaim,
            round: state.round,
            turnNumber: state.turnNumber
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
            round: pending.round,
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
        round: state.round,
        turnNumber: state.turnNumber,
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
        round: state.round,
        turnNumber: state.turnNumber,
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
        round: state.round,
        turnNumber: state.turnNumber,
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
        round: state.round,
        turnNumber: state.turnNumber,
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
  .command('gm:state <game>')
  .description('[GM] Get full game state')
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
            round: state.round,
        turnNumber: state.turnNumber,
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
  .command('player:actions <game>')
  .description('[Player] Get available actions (procedurally generated)')
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
        round: gameState.round,
        turnNumber: gameState.turnNumber,
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
        round: state.round,
        turnNumber: state.turnNumber,
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
        round: state.round,
        turnNumber: state.turnNumber
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
  .command('gm:end <game>')
  .description('[GM] End game and declare winner')
  .requiredOption('-w, --winner <id>', 'Winner player ID')
  .requiredOption('-r, --reason <text>', 'End reason')
  .action((game: string, options: { winner: string; reason: string }) => {
    try {
      const state = endGame(game, options.winner, options.reason);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        winner: options.winner,
        totalRounds: state.round,
        totalTurnNumber: state.turnNumber,
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
  .command('gm:analyze <game>')
  .description('[GM] Submit post-game analysis markdown (transitions from pending_analysis to completed)')
  .requiredOption('-v, --version <version>', 'Analysis version (e.g., v1.0)')
  .option('-f, --file <path>', 'Path to markdown file (if not provided, reads from stdin)')
  .option('-m, --markdown <content>', 'Markdown content directly (alternative to file/stdin)')
  .action(async (game: string, options: {
    version: string;
    file?: string;
    markdown?: string;
  }) => {
    try {
      let markdownContent: string;

      if (options.markdown) {
        // Direct markdown content provided
        markdownContent = options.markdown;
      } else if (options.file) {
        // Read from file
        markdownContent = readFileSync(options.file, 'utf-8');
      } else {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        markdownContent = Buffer.concat(chunks).toString('utf-8');
      }

      if (!markdownContent.trim()) {
        throw new Error('No markdown content provided. Use -f <file>, -m <content>, or pipe via stdin.');
      }

      const state = submitAnalysisMarkdown(game, options.version, markdownContent);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: state.status,
        analysisFile: state.shared.analysisFile,
        version: options.version
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
  .command('gm:skip-analysis <game>')
  .description('[GM] Skip analysis and mark game as completed directly')
  .action((game: string) => {
    try {
      const state = skipAnalysis(game);

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        status: state.status,
        message: 'Analysis skipped, game marked as completed'
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
        totalRounds: state.round,
        totalTurnNumber: state.turnNumber,
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

// ============ Operator Hint Command ============

program
  .command('hint <game>')
  .description('Inject an operator hint to help unblock agents')
  .requiredOption('-m, --message <text>', 'The hint message for agents')
  .requiredOption('-r, --reason <text>', 'Reason for providing this hint (logged)')
  .option('-p, --player <id>', 'Target specific player (default: all players)')
  .option('--expire-rounds <n>', 'Expire hint after N rounds', parseInt)
  .option('--expire-turns <n>', 'Expire hint after N turns', parseInt)
  .action((game: string, options: { message: string; reason: string; player?: string; expireRounds?: number; expireTurns?: number }) => {
    try {
      const state = loadState(game);
      const contestState = ensureContestState(state);

      // Create the hint
      const hint: OperatorHint = {
        message: options.message,
        reason: options.reason,
        timestamp: new Date().toISOString(),
        createdAtRound: state.round || 1,
        createdAtTurn: state.turnNumber || 1,
        targetPlayer: options.player,
        expiresAfterRounds: options.expireRounds,
        expiresAfterTurns: options.expireTurns
      };

      // Add to hints array
      if (!contestState.operatorHints) {
        contestState.operatorHints = [];
      }
      contestState.operatorHints.push(hint);

      // Save state
      saveState(state);

      // Log the hint event
      logEvent(state, {
        event: 'operator_hint',
        data: {
          message: hint.message,
          reason: hint.reason,
          targetPlayer: hint.targetPlayer || 'all',
          expiresAfterRounds: hint.expiresAfterRounds,
          expiresAfterTurns: hint.expiresAfterTurns
        }
      });

      console.log(JSON.stringify({
        success: true,
        hint: {
          message: hint.message,
          reason: hint.reason,
          createdAtRound: hint.createdAtRound,
          createdAtTurn: hint.createdAtTurn,
          targetPlayer: hint.targetPlayer || 'all',
          expiresAfterRounds: hint.expiresAfterRounds,
          expiresAfterTurns: hint.expiresAfterTurns
        },
        totalHints: contestState.operatorHints.length
      }));
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: (e as Error).message
      }));
      process.exit(1);
    }
  });

// ============ Validation Commands ============

program
  .command('validate <game>')
  .description('Validate game rules file (RULES.md)')
  .option('--strict', 'Fail on warnings (exit code 2)')
  .option('--sections', 'Include extracted markdown sections in output')
  .option('--json', 'Output as JSON')
  .action((game: string, options: { strict?: boolean; sections?: boolean; json?: boolean }) => {
    try {
      // Resolve rules path
      const GAMES_DIR = join(process.cwd(), 'games');
      const rulesPath = join(GAMES_DIR, game, 'RULES.md');

      const result = validateRules(rulesPath, { extractSections: options.sections });

      if (options.json) {
        console.log(JSON.stringify({
          valid: result.valid,
          errors: result.errors,
          warnings: result.warnings,
          config: result.config,
          sections: result.sections,
        }, null, 2));
      } else {
        console.log(formatValidationResult(result, rulesPath));
      }

      // Exit codes: 0=valid, 1=errors, 2=strict+warnings, 3=file error
      if (!result.valid) {
        process.exit(1);
      }
      if (options.strict && result.warnings.length > 0) {
        if (!options.json) {
          console.log('\nStrict mode: failing due to warnings');
        }
        process.exit(2);
      }
    } catch (e) {
      if (options.json) {
        console.log(JSON.stringify({
          valid: false,
          errors: [{ code: 'EXCEPTION', message: (e as Error).message, severity: 'error' }],
          warnings: [],
        }));
      } else {
        console.error(`Error: ${(e as Error).message}`);
      }
      process.exit(3);
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
        state.round = 1;
        state.turnNumber = 1;
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

    // Helper function to extract instance ID from transcript content
    // Searches both user messages AND Task tool_use entries
    const extractInstanceId = (content: string, searchToolUse: boolean = false): string => {
      const lines = content.split('\n');
      // For tool_use search, scan all lines (Task calls can be anywhere)
      // For subagent transcripts, check first 50 lines
      const linesToCheck = searchToolUse ? lines : lines.slice(0, 50);

      let foundInstance = '';

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

            const match = text.match(/^INSTANCE:\s*(\S+)/m);
            if (match) {
              return match[1];
            }
          }

          // Check for message.content (main transcript user format)
          if (entry.message?.role === 'user' && entry.message?.content) {
            const text = typeof entry.message.content === 'string'
              ? entry.message.content
              : '';
            const match = text.match(/^INSTANCE:\s*(\S+)/m);
            if (match) {
              return match[1];
            }
          }

          // Check for Task tool_use entries in main transcript (assistant messages)
          if (searchToolUse && entry.message?.role === 'assistant' && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              if (block.type === 'tool_use' && block.name === 'Task' && block.input?.prompt) {
                const match = block.input.prompt.match(/^INSTANCE:\s*(\S+)/m);
                if (match) {
                  // Keep searching to find the most recent one
                  foundInstance = match[1];
                }
              }
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      return foundInstance;
    };

    // Poll transcript until instance ID is found (for start hooks)
    // Stop hooks can fail fast since transcript should already exist
    const MAX_WAIT_MS = hookType === 'start' ? 10000 : 2000;
    const POLL_INTERVAL_MS = 200;
    const startTime = Date.now();

    let instanceId = '';
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
          instanceId = extractInstanceId(content, searchToolUse);
          if (instanceId) {
            log(`Found instance ID: ${instanceId}`);
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

    if (!instanceId) {
      log(`Timeout: instance ID not found after ${Date.now() - startTime}ms`);
    }

    // Handle start hooks - inject context
    if (hookType === 'start') {
      if (!instanceId) {
        log(`No instance ID found - exiting`);
        // Can't inject context without instance ID - exit silently
        process.exit(0);
      }

      log(`Checking if state exists for instance: ${instanceId}`);
      if (!stateExists(instanceId)) {
        log(`State does not exist for instance: ${instanceId} - exiting`);
        // Game not initialized yet - exit silently
        process.exit(0);
      }

      log(`Loading state for instance: ${instanceId}`);
      try {
        const state = loadState(instanceId);
        log(`State loaded successfully. Rules length: ${state.rulesMarkdown?.length || 0}`);

        // Output rules
        console.log(`## Game Rules for ${instanceId}`);
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
            round: state.round,
        turnNumber: state.turnNumber,
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
      if (!instanceId) {
        // Can't determine instance - allow stop
        process.exit(0);
      }

      if (!stateExists(instanceId)) {
        // No active game - allow stop
        process.exit(0);
      }

      try {
        const state = loadState(instanceId);
        const gameStatus = state.status;

        // Allow stop if game is completed or cancelled
        if (gameStatus === 'completed' || gameStatus === 'cancelled' || gameStatus === 'pending_analysis') {
          // Backup transcript before exiting
          const agentTranscriptPath = (inputJson as { agent_transcript_path?: string }).agent_transcript_path || targetTranscript;
          if (agentTranscriptPath && existsSync(agentTranscriptPath)) {
            try {
              log(`Backing up transcript from: ${agentTranscriptPath}`);

              // First, detect the actual agent type from transcript content
              // This is needed because Claude Code may fire both player and gamemaster hooks
              // for the same SubagentStop event due to matcher issues
              let detectedAgentType: string | null = null;
              const transcriptContent = readFileSync(agentTranscriptPath, 'utf8');
              const lines = transcriptContent.split('\n');

              for (const line of lines.slice(0, 50)) {
                if (!line.trim()) continue;
                try {
                  const entry = JSON.parse(line);
                  const getText = (e: unknown): string => {
                    const typedEntry = e as { role?: string; type?: string; content?: string | Array<{ type?: string; text?: string }>; message?: { role?: string; content?: string } };
                    if (typedEntry.role === 'user' && typedEntry.type === 'message') {
                      return typeof typedEntry.content === 'string'
                        ? typedEntry.content
                        : Array.isArray(typedEntry.content)
                          ? typedEntry.content.find(c => c.type === 'text')?.text || ''
                          : '';
                    }
                    if (typedEntry.message?.role === 'user') {
                      return typeof typedEntry.message.content === 'string' ? typedEntry.message.content : '';
                    }
                    return '';
                  };
                  const text = getText(entry);

                  // Check for gamemaster
                  if (text.match(/^ROLE:\s*gamemaster/m)) {
                    detectedAgentType = 'gamemaster';
                    break;
                  }
                  // Check for player
                  const playerMatch = text.match(/^PLAYER_ID:\s*(player-?\d+)/m);
                  if (playerMatch) {
                    detectedAgentType = playerMatch[1].replace('-', '');
                    break;
                  }
                } catch {
                  // Skip invalid JSON lines
                }
              }

              log(`Detected agent type from transcript: ${detectedAgentType || '(none)'}`);
              log(`Hook agent type: ${agentType}`);

              // Verify this hook should handle this transcript
              // Skip if agentType is 'player' but transcript is for gamemaster
              if (agentType === 'player' && detectedAgentType === 'gamemaster') {
                log(`Skipping backup - player hook received gamemaster transcript`);
                process.exit(0);
              }
              // Skip if agentType is 'gamemaster' but transcript is for a player
              if (agentType === 'gamemaster' && detectedAgentType && detectedAgentType.startsWith('player')) {
                log(`Skipping backup - gamemaster hook received player transcript`);
                process.exit(0);
              }

              // Extract timestamp from gameId (format: gameName-timestamp)
              const timestampMatch = state.gameId.match(/(\d{13})$/);
              if (timestampMatch) {
                const timestamp = timestampMatch[1];

                // Use detected agent type for filename
                const finalAgentType = detectedAgentType || agentType;

                // Extract game name from instanceId (format: gameName-timestamp)
                const gameName = instanceId.replace(/-\d{13}$/, '');
                const destDir = `${process.cwd()}/games/${gameName}/logs`;
                const destPath = `${destDir}/${finalAgentType}-transcript-${timestamp}.jsonl`;

                // Ensure destination directory exists
                try { mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }

                // Copy transcript
                copyFileSync(agentTranscriptPath, destPath);
                log(`Transcript backed up to: ${destPath}`);
              }
            } catch (backupErr) {
              log(`Error backing up transcript: ${backupErr}`);
            }
          }
          process.exit(0);
        }

        // Block stop if game is still in progress
        let message: string;
        if (agentType === 'gamemaster') {
          message = 'Game not finished. Continue managing the game until completion.';
        } else {
          // For players, provide specific guidance based on whose turn it is
          const playerId = (inputJson as { player_id?: string }).player_id;
          const isMyTurn = playerId && state.currentPlayer === playerId;

          if (isMyTurn) {
            message = `It is your turn (turn ${state.turnNumber}). Use './playtest wait ${instanceId} -p ${playerId}' to check your turn, then take your action with './playtest act'.`;
          } else {
            message = `Waiting for ${state.currentPlayer}'s turn (turn ${state.turnNumber}). Use './playtest wait ${instanceId} -p ${playerId}' to block until your turn.`;
          }
        }

        console.error(message);
        process.exit(2);
      } catch {
        // Error checking state - allow stop
        process.exit(0);
      }
    }
  });

// ============ Cleanup Command ============

program
  .command('cleanup')
  .description('Clean up incomplete game logs and orphaned files')
  .option('--dry-run', 'Preview files without deleting', false)
  .option('--no-keep-transcripts', 'Also delete transcripts from complete games')
  .option('--archive', 'Create backup archives before deletion', true)
  .option('--force', 'Actually delete files (required without --dry-run)')
  .action(async (options: { dryRun: boolean; keepTranscripts: boolean; archive: boolean; force?: boolean }) => {
    const { cleanupLogs } = await import('../core/cleanup.js');

    try {
      const gamesDir = join(process.cwd(), 'games');

      const cleanupOptions = {
        dryRun: options.dryRun,
        keepTranscripts: options.keepTranscripts,
        archive: options.archive,
        force: options.force || false,
        gamesDir
      };

      const report = await cleanupLogs(cleanupOptions);
      console.log(report);

      process.exit(0);
    } catch (err) {
      console.error('Cleanup failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
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

    // Helper to extract instance ID from transcript or prompt
    const extractInstanceId = (text: string): string => {
      const match = text.match(/^INSTANCE:\s*(\S+)/m);
      return match ? match[1] : '';
    };

    // Try to find instance ID from various sources
    let instanceId = '';

    // For UserPromptSubmit, check the prompt directly
    if (eventName === 'UserPromptSubmit' && prompt) {
      instanceId = extractInstanceId(prompt);
      log(`UserPromptSubmit prompt: ${prompt.substring(0, 200)}`);
    }

    // For PreToolUse with Task, check the tool input
    if (eventName === 'PreToolUse' && toolName === 'Task') {
      const taskPrompt = (toolInput.prompt as string) || '';
      instanceId = extractInstanceId(taskPrompt);
      log(`PreToolUse Task prompt: ${taskPrompt.substring(0, 200)}`);
    }

    // For SessionStart, could search transcript
    if (eventName === 'SessionStart' && transcriptPath) {
      log(`SessionStart - transcript available at: ${transcriptPath}`);
    }

    log(`Extracted instance ID: ${instanceId || '(none)'}`);

    // Handle context injection based on event type
    switch (eventName) {
      case 'SessionStart': {
        // stdout is added to context
        log(`SessionStart - can inject context via stdout`);
        // Output rules if we have a game
        if (instanceId && stateExists(instanceId)) {
          try {
            const state = loadState(instanceId);
            console.log(`## Game Context Loaded`);
            console.log(`Instance: ${instanceId}`);
            console.log(`Status: ${state.status}`);
            log(`SessionStart - output game context for ${instanceId}`);
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
        if (instanceId && stateExists(instanceId)) {
          try {
            const state = loadState(instanceId);
            console.log(`\n## Active Game: ${instanceId}`);
            console.log(`Status: ${state.status}`);
            console.log(`Round: ${state.round}, Turn: ${state.turnNumber}`);
            console.log(`Current Player: ${state.currentPlayer}`);
            log(`UserPromptSubmit - output game status for ${instanceId}`);
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

        if (toolName === 'Task' && instanceId && stateExists(instanceId)) {
          try {
            const state = loadState(instanceId);
            // Return JSON with additionalContext
            const output = {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: `\n## Game Rules for ${instanceId}\n${state.rulesMarkdown}\n\n## Current State\nRound: ${state.round}, Turn: ${state.turnNumber}\nStatus: ${state.status}`
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

        // Backup transcript to expected location if game is completed/cancelled
        const agentTranscriptPath = (inputJson.agent_transcript_path as string) || '';
        if (agentTranscriptPath && existsSync(agentTranscriptPath)) {
          try {
            const transcriptContent = fs.readFileSync(agentTranscriptPath, 'utf8');
            log(`Transcript read: ${transcriptContent.length} bytes`);

            // Extract instance ID from transcript (INSTANCE: <instanceId>)
            let detectedInstanceId = '';
            let detectedAgentType = '';

            const lines = transcriptContent.split('\n');
            for (const line of lines.slice(0, 100)) {
              if (!line.trim()) continue;
              try {
                const entry = JSON.parse(line);

                // Check user messages for INSTANCE: and ROLE:/PLAYER_ID:
                if (entry.role === 'user' && entry.type === 'message') {
                  const text = typeof entry.content === 'string'
                    ? entry.content
                    : Array.isArray(entry.content)
                      ? entry.content.find((c: { type?: string; text?: string }) => c.type === 'text')?.text || ''
                      : '';

                  // Extract instance ID
                  const instanceMatch = text.match(/^INSTANCE:\s*(\S+)/m);
                  if (instanceMatch && !detectedInstanceId) {
                    detectedInstanceId = instanceMatch[1];
                    log(`Found instance ID: ${detectedInstanceId}`);
                  }

                  // Extract agent type
                  const gmMatch = text.match(/^ROLE:\s*gamemaster/m);
                  if (gmMatch && !detectedAgentType) {
                    detectedAgentType = 'gamemaster';
                    log(`Found agent type: gamemaster`);
                  }

                  const playerMatch = text.match(/^PLAYER_ID:\s*(player-?\d+)/m);
                  if (playerMatch && !detectedAgentType) {
                    // Normalize "player-1" to "player1"
                    detectedAgentType = playerMatch[1].replace('-', '');
                    log(`Found agent type: ${detectedAgentType}`);
                  }
                }

                // Also check message.content format (alternative transcript format)
                if (entry.message?.role === 'user' && entry.message?.content) {
                  const text = typeof entry.message.content === 'string' ? entry.message.content : '';

                  const instanceMatch = text.match(/^INSTANCE:\s*(\S+)/m);
                  if (instanceMatch && !detectedInstanceId) {
                    detectedInstanceId = instanceMatch[1];
                    log(`Found instance ID (alt format): ${detectedInstanceId}`);
                  }

                  const gmMatch = text.match(/^ROLE:\s*gamemaster/m);
                  if (gmMatch && !detectedAgentType) {
                    detectedAgentType = 'gamemaster';
                    log(`Found agent type (alt format): gamemaster`);
                  }

                  const playerMatch = text.match(/^PLAYER_ID:\s*(player-?\d+)/m);
                  if (playerMatch && !detectedAgentType) {
                    detectedAgentType = playerMatch[1].replace('-', '');
                    log(`Found agent type (alt format): ${detectedAgentType}`);
                  }
                }

                // Stop early if we found both
                if (detectedInstanceId && detectedAgentType) break;
              } catch {
                // Skip invalid JSON lines
              }
            }

            log(`Detection results - instance: ${detectedInstanceId}, agent: ${detectedAgentType}`);

            // Only proceed if we have both instance ID and agent type
            if (detectedInstanceId && detectedAgentType && stateExists(detectedInstanceId)) {
              const gameState = loadState(detectedInstanceId);

              // Only backup if game is completed or cancelled (not during active gameplay)
              if (gameState.status === 'completed' || gameState.status === 'cancelled' || gameState.status === 'pending_analysis') {
                // Extract timestamp from instance ID (format: gameName-timestamp)
                const timestampMatch = detectedInstanceId.match(/(\d{13})$/);
                if (timestampMatch) {
                  const timestamp = timestampMatch[1];
                  // Extract game name from instance ID (everything before the timestamp)
                  const gameName = detectedInstanceId.replace(/-\d{13}$/, '');
                  const destDir = `${process.cwd()}/games/${gameName}/logs`;
                  const destPath = `${destDir}/${detectedAgentType}-transcript-${timestamp}.jsonl`;

                  // Ensure destination directory exists
                  try { fs.mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }

                  // Copy transcript
                  fs.copyFileSync(agentTranscriptPath, destPath);
                  log(`Transcript backed up to: ${destPath}`);
                }
              } else {
                log(`Game status is ${gameState.status}, skipping transcript backup`);
              }
            } else {
              log(`Missing info for backup - instance: ${detectedInstanceId}, agent: ${detectedAgentType}, stateExists: ${detectedInstanceId ? stateExists(detectedInstanceId) : 'N/A'}`);
            }
          } catch (e) {
            log(`Error backing up transcript: ${e}`);
          }
        }

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
