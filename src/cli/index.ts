#!/usr/bin/env node

/**
 * Playtest CLI - Command-line interface for the game design framework
 *
 * Commands:
 * - play: Run a single game
 * - explore: Run parameter exploration
 * - analyze: Analyze game rules or results
 * - hook: Handle Claude Code hooks
 * - init: Initialize hooks configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const program = new Command();

program
  .name('playtest')
  .description('A computational framework for game design exploration')
  .version('0.1.0');

// Play command - run a single game
program
  .command('play')
  .description('Run a single game with specified rules')
  .requiredOption('-r, --rules <path>', 'Path to game rules YAML file')
  .option('-p1, --player1 <type>', 'Player 1 type: llm, random, human', 'random')
  .option('-p2, --player2 <type>', 'Player 2 type: llm, random, human', 'random')
  .option('--model <model>', 'LLM model to use', 'claude-sonnet-4-20250514')
  .option('-v, --verbose', 'Show detailed game output')
  .option('--save <path>', 'Save game result to file')
  .action(async (options) => {
    console.log(chalk.blue('Loading game rules...'));

    try {
      const { loadGameRules, formatRulesForLLM } = await import('../rules/parser.js');
      const { GameOrchestrator } = await import('../engine/orchestrator.js');
      const { RandomAgent } = await import('../agents/player.js');
      const { SimpleArbiter } = await import('../agents/arbiter.js');
      const { serializeGameState } = await import('../core/game-state.js');

      const rulesPath = resolve(options.rules);
      const rules = loadGameRules(rulesPath);

      console.log(chalk.green(`Loaded: ${rules.game.name} v${rules.game.version}`));

      if (options.verbose) {
        console.log(chalk.gray(formatRulesForLLM(rules)));
      }

      // Create orchestrator
      const playerIds = ['player1', 'player2'];
      const orchestrator = new GameOrchestrator(rules, playerIds, {
        maxTurns: 50,
        maxActionsPerTurn: 20,
      });

      // Register agents
      const createAgent = async (type: string, id: string) => {
        if (type === 'llm') {
          const { PlayerAgent } = await import('../agents/player.js');
          const { AnthropicProvider } = await import('../agents/llm-provider.js');
          return new PlayerAgent(
            { id, model: options.model },
            new AnthropicProvider({ model: options.model })
          );
        }
        return new RandomAgent({ id });
      };

      orchestrator.registerAgent(await createAgent(options.player1, 'player1'));
      orchestrator.registerAgent(await createAgent(options.player2, 'player2'));
      orchestrator.registerAgent(new SimpleArbiter({ id: 'arbiter' }));

      // Event logging
      if (options.verbose) {
        orchestrator.on('game_event', (event) => {
          console.log(chalk.gray(`[${event.type}]`), JSON.stringify(event.data).slice(0, 100));
        });
      }

      console.log(chalk.blue('\nStarting game...\n'));

      const startTime = Date.now();
      const finalState = await orchestrator.runGame();
      const duration = Date.now() - startTime;

      console.log(chalk.green('\n=== Game Complete ===\n'));
      console.log(serializeGameState(finalState).formatted);
      console.log(chalk.yellow(`\nWinner: ${finalState.winner}`));
      console.log(chalk.gray(`Duration: ${duration}ms | Turns: ${finalState.currentTurn}`));

      if (options.save) {
        const savePath = resolve(options.save);
        writeFileSync(savePath, JSON.stringify({
          state: finalState,
          metrics: orchestrator.getMetrics(),
          duration,
        }, null, 2));
        console.log(chalk.green(`Saved to: ${savePath}`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Explore command - run parameter sweeps
program
  .command('explore')
  .description('Explore parameter space with multiple games')
  .requiredOption('-r, --rules <path>', 'Path to game rules YAML file')
  .option('-n, --games <number>', 'Games per configuration', '5')
  .option('-p, --parallel <number>', 'Parallel games', '1')
  .option('--param <param=values...>', 'Override parameter ranges (e.g., starting_life=10,15,20)')
  .option('-o, --output <path>', 'Output report path')
  .action(async (options) => {
    console.log(chalk.blue('Starting exploration...\n'));

    try {
      const { loadGameRules } = await import('../rules/parser.js');
      const { ExplorationEngine } = await import('../engine/explorer.js');
      const { MockProvider } = await import('../agents/llm-provider.js');

      const rules = loadGameRules(resolve(options.rules));

      // Parse parameter overrides
      const paramOverrides: Record<string, unknown[]> = {};
      if (options.param) {
        for (const override of options.param) {
          const [param, valuesStr] = override.split('=');
          paramOverrides[param] = valuesStr.split(',').map((v: string) => {
            const num = parseFloat(v);
            return isNaN(num) ? v : num;
          });
        }
      }

      const engine = new ExplorationEngine(new MockProvider());

      engine.on('progress', ({ completed, total }) => {
        process.stdout.write(`\rProgress: ${completed}/${total} configurations`);
      });

      engine.on('game_complete', ({ configIndex, gameIndex }) => {
        process.stdout.write(chalk.gray('.'));
      });

      const report = await engine.runExperiment({
        name: `Exploration of ${rules.game.name}`,
        baseRules: rules,
        gamesPerConfig: parseInt(options.games),
        parameterOverrides: Object.keys(paramOverrides).length > 0 ? paramOverrides : undefined,
        parallelGames: parseInt(options.parallel),
        playerConfigs: [
          { id: 'player1', agentType: 'random' },
          { id: 'player2', agentType: 'random' },
        ],
        metrics: [
          { id: 'turnCount', type: 'builtin', aggregation: 'mean' },
          { id: 'actionCount', type: 'builtin', aggregation: 'mean' },
        ],
      });

      console.log(chalk.green('\n\n=== Exploration Complete ===\n'));
      console.log(`Total configurations: ${report.totalConfigs}`);
      console.log(`Total games: ${report.totalGames}`);

      console.log(chalk.blue('\nBest configuration:'));
      console.log(JSON.stringify(report.summary.bestConfig, null, 2));
      console.log(`Score: ${report.summary.bestScore.toFixed(3)}`);

      console.log(chalk.blue('\nRecommendations:'));
      for (const rec of report.recommendations) {
        console.log(`  ${rec.parameter}: ${rec.suggestedValue} (${(rec.confidence * 100).toFixed(0)}% confidence)`);
        console.log(chalk.gray(`    ${rec.reason}`));
      }

      if (options.output) {
        writeFileSync(resolve(options.output), JSON.stringify(report, null, 2));
        console.log(chalk.green(`\nReport saved to: ${options.output}`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Analyze command - analyze rules or game results
program
  .command('analyze')
  .description('Analyze game rules or results')
  .option('-r, --rules <path>', 'Analyze game rules')
  .option('-g, --game <path>', 'Analyze saved game result')
  .action(async (options) => {
    try {
      if (options.rules) {
        const { loadGameRules, validateRules, formatRulesForLLM } = await import('../rules/parser.js');

        const rules = loadGameRules(resolve(options.rules));
        const issues = validateRules(rules);

        console.log(chalk.blue(`=== Analysis: ${rules.game.name} ===\n`));

        if (issues.length === 0) {
          console.log(chalk.green('No structural issues found.\n'));
        } else {
          console.log(chalk.yellow('Issues found:'));
          for (const issue of issues) {
            console.log(chalk.yellow(`  - ${issue}`));
          }
          console.log();
        }

        // Show parameter space
        const { getParameterSpace } = await import('../rules/parser.js');
        const space = getParameterSpace(rules);

        console.log(chalk.blue('Parameter space:'));
        for (const [param, values] of space) {
          console.log(`  ${param}: ${values.length} values (${values[0]} to ${values[values.length - 1]})`);
        }

        console.log(chalk.blue('\nFormatted rules:'));
        console.log(chalk.gray(formatRulesForLLM(rules)));
      }

      if (options.game) {
        const gameData = JSON.parse(readFileSync(resolve(options.game), 'utf-8'));

        console.log(chalk.blue('=== Game Analysis ===\n'));
        console.log(`Winner: ${gameData.state?.winner}`);
        console.log(`Turns: ${gameData.state?.currentTurn}`);
        console.log(`Duration: ${gameData.duration}ms`);

        if (gameData.metrics) {
          console.log(chalk.blue('\nMetrics:'));
          console.log(JSON.stringify(gameData.metrics, null, 2));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Hook command - handle Claude Code hooks
program
  .command('hook')
  .description('Handle Claude Code hook events')
  .argument('<type>', 'Hook type: pre-tool, post-tool, notify')
  .option('--input <json>', 'Tool input JSON')
  .option('--output <json>', 'Tool output')
  .option('--message <msg>', 'Notification message')
  .action(async (type, options) => {
    try {
      const { getHookHandler } = await import('../hooks/handler.js');
      const handler = getHookHandler();

      switch (type) {
        case 'pre-tool': {
          const input = options.input ? JSON.parse(options.input) : {};
          const result = await handler.handlePreToolUse('Bash', input);

          if (result.stdout) console.log(result.stdout);
          if (result.decision === 'block') {
            console.log('HOOK_DECISION: block');
          }
          process.exit(result.exitCode);
        }

        case 'post-tool': {
          const input = options.input ? JSON.parse(options.input) : {};
          const result = await handler.handlePostToolUse('Bash', input, options.output || '');
          process.exit(result.exitCode);
        }

        case 'notify': {
          const result = await handler.handleNotification(options.message || '');
          process.exit(result.exitCode);
        }

        default:
          console.error(`Unknown hook type: ${type}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Hook error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Init-game command - initialize file-based game state for subagents
program
  .command('init-game')
  .description('Initialize a new game with file-based state for subagent coordination')
  .requiredOption('-r, --rules <path>', 'Path to game rules YAML file')
  .option('-d, --dir <path>', 'Base directory for game state (default: current directory)')
  .action(async (options) => {
    try {
      const { initializeGame, formatGameState } = await import('../engine/file-state.js');

      console.log(chalk.blue('Initializing game state for subagent play...\n'));

      const rulesPath = resolve(options.rules);
      const baseDir = options.dir ? resolve(options.dir) : process.cwd();

      const state = initializeGame(rulesPath, baseDir);

      console.log(chalk.green('Game initialized successfully!\n'));
      console.log(chalk.gray('Files created:'));
      console.log(chalk.gray(`  ${baseDir}/game-state/board.json - Current board state`));
      console.log(chalk.gray(`  ${baseDir}/game-state/rules.json - Game rules`));
      console.log(chalk.gray(`  ${baseDir}/game-state/turn-history.jsonl - Action log`));
      console.log(chalk.gray(`  ${baseDir}/game-state/pending-moves/*.json - Player move files\n`));

      console.log(chalk.blue('Initial State:'));
      console.log(formatGameState(state));

      console.log(chalk.yellow('\nTo start playing with subagents:'));
      console.log(chalk.gray('  1. Use the game-master agent to orchestrate'));
      console.log(chalk.gray('  2. Or invoke player-1/player-2 agents directly'));
      console.log(chalk.gray('  3. The arbiter validates moves automatically'));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Init command - set up hooks configuration
program
  .command('init')
  .description('Initialize playtest hooks in Claude Code settings')
  .option('--global', 'Install in global settings (~/.claude/settings.json)')
  .option('--local', 'Install in local settings (.claude/settings.json)')
  .action(async (options) => {
    try {
      const { generateHooksConfig } = await import('../hooks/config.js');

      const playtestPath = dirname(dirname(dirname(resolve(import.meta.url.replace('file://', '')))));
      const hooksConfig = generateHooksConfig(playtestPath);

      const settingsPath = options.global
        ? resolve(process.env.HOME || '~', '.claude/settings.json')
        : resolve('.claude/settings.json');

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      }

      settings.hooks = hooksConfig;

      // Ensure directory exists
      const { mkdirSync } = await import('fs');
      mkdirSync(dirname(settingsPath), { recursive: true });

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      console.log(chalk.green(`Hooks configured in: ${settingsPath}`));
      console.log(chalk.gray('\nPlaytest commands are now available:'));
      console.log(chalk.gray('  playtest new rules=<path>  - Start a new game'));
      console.log(chalk.gray('  playtest state             - Show current game state'));
      console.log(chalk.gray('  playtest action <action>   - Take an action'));
      console.log(chalk.gray('  playtest history           - Show action history'));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Interactive mode command
program
  .command('interactive')
  .alias('i')
  .description('Start an interactive game session')
  .requiredOption('-r, --rules <path>', 'Path to game rules')
  .action(async (options) => {
    console.log(chalk.blue('Starting interactive session...'));
    console.log(chalk.gray('Type "help" for available commands, "quit" to exit.\n'));

    const { loadGameRules, formatRulesForLLM } = await import('../rules/parser.js');
    const { GameOrchestrator, serializeGameState } = await import('../engine/orchestrator.js');
    const { RandomAgent } = await import('../agents/player.js');
    const { SimpleArbiter } = await import('../agents/arbiter.js');
    const readline = await import('readline');

    const rules = loadGameRules(resolve(options.rules));
    const orchestrator = new GameOrchestrator(rules, ['player1', 'player2']);

    orchestrator.registerAgent(new RandomAgent({ id: 'player1' }));
    orchestrator.registerAgent(new RandomAgent({ id: 'player2' }));
    orchestrator.registerAgent(new SimpleArbiter({ id: 'arbiter' }));

    await orchestrator.runSetup();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => {
      const state = orchestrator.getState();
      rl.question(
        chalk.cyan(`[Turn ${state.currentTurn}/${state.currentPhase}] > `),
        async (input) => {
          const cmd = input.trim().toLowerCase();

          switch (cmd) {
            case 'help':
              console.log(chalk.gray(`
Commands:
  state    - Show current game state
  rules    - Show game rules
  turn     - Run one turn
  run      - Run until game ends
  history  - Show action history
  quit     - Exit
`));
              break;

            case 'state':
              console.log(serializeGameState(orchestrator.getState()).formatted);
              break;

            case 'rules':
              console.log(formatRulesForLLM(rules));
              break;

            case 'turn':
              const continued = await orchestrator.runTurn();
              console.log(serializeGameState(orchestrator.getState()).formatted);
              if (!continued) {
                console.log(chalk.yellow(`Game ended: ${orchestrator.getState().winner} wins!`));
              }
              break;

            case 'run':
              while (orchestrator.getState().status === 'playing') {
                await orchestrator.runTurn();
                process.stdout.write('.');
              }
              console.log();
              console.log(serializeGameState(orchestrator.getState()).formatted);
              console.log(chalk.yellow(`Game ended: ${orchestrator.getState().winner} wins!`));
              break;

            case 'history':
              const history = orchestrator.getState().history.slice(-10);
              for (const action of history) {
                console.log(`${action.playerId}: ${action.type}`);
              }
              break;

            case 'quit':
            case 'exit':
              rl.close();
              process.exit(0);

            default:
              console.log(chalk.red(`Unknown command: ${cmd}. Type "help" for options.`));
          }

          prompt();
        }
      );
    };

    prompt();
  });

program.parse();
