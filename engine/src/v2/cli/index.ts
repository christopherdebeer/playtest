/**
 * CLI v2 Commands
 *
 * Command handlers for the v2 engine.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  GameEngine,
  loadState,
  saveState,
  MechanicRegistry,
  GameConfig,
  MechanicConfigEntry,
  PlayerRange,
  CoreGameState,
} from '../core/index.js';
import { createDefaultRegistry } from '../mechanics/index.js';

const GAMES_DIR = path.resolve(process.cwd(), 'games');

// ═══════════════════════════════════════════════════════════════════════════
// RULES PARSING
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedRules {
  config: GameConfig;
  errors: string[];
}

function parseRulesFile(gameName: string): ParsedRules {
  const rulesPath = path.join(GAMES_DIR, gameName, 'RULES.md');

  if (!fs.existsSync(rulesPath)) {
    return { config: null as any, errors: [`RULES.md not found at ${rulesPath}`] };
  }

  const content = fs.readFileSync(rulesPath, 'utf-8');
  const errors: string[] = [];

  // Extract YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { config: null as any, errors: ['No YAML frontmatter found'] };
  }

  let rawConfig: any;
  try {
    rawConfig = yaml.parse(match[1]);
  } catch (e: any) {
    return { config: null as any, errors: [`YAML parse error: ${e.message}`] };
  }

  // Parse player range
  let players: PlayerRange;
  if (typeof rawConfig.players === 'number') {
    players = { type: 'exact', count: rawConfig.players };
  } else if (typeof rawConfig.players === 'string') {
    const rangeMatch = rawConfig.players.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      players = { type: 'range', min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    } else {
      players = { type: 'exact', count: parseInt(rawConfig.players) };
    }
  } else {
    errors.push('Invalid players field');
    players = { type: 'exact', count: 2 };
  }

  // Build mechanic configs
  const mechanics: MechanicConfigEntry[] = [];

  // Cards mechanic from deck config
  if (rawConfig.deck) {
    mechanics.push({
      slug: 'cards',
      config: {
        deck: rawConfig.deck,
        startingCards: rawConfig.starting_cards ?? rawConfig.startingCards ?? 5,
        handLimit: rawConfig.hand_limit ?? rawConfig.handLimit,
        handLimitPolicy: rawConfig.hand_limit_policy ?? rawConfig.handLimitPolicy,
        reshuffleDiscard: rawConfig.reshuffle_discard ?? rawConfig.reshuffleDiscard ?? true,
      },
    });
  }

  // Probability mechanic from board config
  if (rawConfig.board) {
    mechanics.push({
      slug: 'probability',
      config: {
        board: rawConfig.board,
        startState: rawConfig.board.start ?? rawConfig.start_state ?? rawConfig.startState,
        victoryState: rawConfig.board.victory ?? rawConfig.victory_state ?? rawConfig.victoryState,
        allowBoosts: rawConfig.engine_mechanics?.card_boosts ?? true,
        maxBoost: rawConfig.max_boost ?? 0.95,
        minProbability: rawConfig.min_probability ?? 0.05,
      },
    });
  }

  // Action points mechanic
  if (rawConfig.engine_mechanics?.action_points) {
    const ap = rawConfig.engine_mechanics.action_points;
    mechanics.push({
      slug: 'action-points',
      config: {
        pointsPerTurn: ap.points_per_turn ?? ap.pointsPerTurn ?? 3,
        actionCosts: ap.action_costs ?? ap.actionCosts ?? {},
        rollover: ap.rollover ?? false,
        maxRollover: ap.max_rollover ?? ap.maxRollover,
      },
    });
  }

  // Grid mechanic
  if (rawConfig.engine_mechanics?.grid) {
    const grid = rawConfig.engine_mechanics.grid;
    mechanics.push({
      slug: 'grid',
      config: {
        type: grid.type ?? 'finite',
        width: grid.width,
        height: grid.height,
        startingTile: grid.starting_tile ?? grid.startingTile,
        adjacency: grid.adjacency ?? 'orthogonal',
      },
    });
  }

  // Trading mechanic
  if (rawConfig.engine_mechanics?.trade) {
    const trade = rawConfig.engine_mechanics.trade;
    mechanics.push({
      slug: 'trading',
      config: {
        enabled: trade.enabled ?? true,
        itemTypesOnly: trade.item_types_only ?? trade.itemTypesOnly ?? false,
        allowedTypes: trade.allowed_types ?? trade.allowedTypes,
        requireSameLocation: trade.require_same_location ?? trade.requireSameLocation ?? false,
        requireAdjacent: trade.require_adjacent_location ?? trade.requireAdjacent ?? false,
        allowGifts: trade.allow_gifts ?? trade.allowGifts ?? true,
        maxCardsPerTrade: trade.max_cards_per_trade ?? trade.maxCardsPerTrade ?? 5,
      },
    });
  }

  // Hidden roles mechanic from objectives
  if (rawConfig.objectives) {
    mechanics.push({
      slug: 'hidden-roles',
      config: {
        roles: rawConfig.objectives.map((obj: any) => ({
          id: obj.name.toLowerCase().replace(/\s+/g, '-'),
          name: obj.name,
          type: obj.type === 'enemy' ? 'traitor' : 'regular',
          count: obj.count ?? 1,
          winCondition: obj.condition,
        })),
        dealAtStart: rawConfig.engine_mechanics?.hidden_objectives?.deal_at_start ?? true,
        revealOnCompletion: rawConfig.engine_mechanics?.hidden_objectives?.reveal_on_completion ?? true,
      },
    });
  }

  // Card matching mechanic
  if (rawConfig.engine_mechanics?.card_matching) {
    const cm = rawConfig.engine_mechanics.card_matching;
    mechanics.push({
      slug: 'card-matching',
      config: {
        enabled: cm.enabled ?? true,
        matchRules: cm.match_rules ?? cm.matchRules ?? [
          { type: 'color', mode: 'any' },
          { type: 'value', mode: 'any' },
        ],
        wildTypes: cm.wild_types ?? cm.wildTypes ?? ['wild'],
        colorProperty: cm.color_property ?? cm.colorProperty ?? 'color',
        valueProperty: cm.value_property ?? cm.valueProperty ?? 'value',
        mustMatchOrDraw: cm.must_match_or_draw ?? cm.mustMatchOrDraw ?? true,
        initialCardFromDeck: cm.initial_card_from_deck ?? cm.initialCardFromDeck ?? true,
      },
    });
  }

  const config: GameConfig = {
    name: rawConfig.name,
    version: rawConfig.version ?? '1.0.0',
    players,
    winCondition: rawConfig.win_condition ?? rawConfig.winCondition ?? 'Reach victory',
    maxRounds: rawConfig.max_rounds ?? rawConfig.maxRounds,
    maxTurns: rawConfig.max_turns ?? rawConfig.maxTurns,
    mechanics,
    rulesMarkdown: content,
  };

  return { config, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract game name from instance ID.
 * Instance ID format: <game-name>-<timestamp>
 */
function getGameNameFromInstanceId(instanceId: string): string {
  const parts = instanceId.split('-');
  parts.pop(); // Remove timestamp
  return parts.join('-');
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export function createV2Commands(program: Command): void {
  const v2 = program
    .command('v2')
    .description('V2 engine commands (lean, pluggable mechanics)');

  // ─────────────────────────────────────────────────────────────
  // v2 init
  // ─────────────────────────────────────────────────────────────
  v2.command('init <game>')
    .description('Initialize a new game instance')
    .option('-p, --players <count>', 'Number of players', '2')
    .action((gameName: string, options: { players: string }) => {
      const playerCount = parseInt(options.players);

      const { config, errors } = parseRulesFile(gameName);
      if (errors.length > 0) {
        console.error(JSON.stringify({ success: false, errors }, null, 2));
        process.exit(1);
      }

      const registry = createDefaultRegistry();
      const engine = new GameEngine(registry);

      const result = engine.initGame(gameName, config, playerCount);
      if (!result.ok) {
        console.error(JSON.stringify({ success: false, errors: result.error }, null, 2));
        process.exit(1);
      }

      const state = result.value;
      saveState(state);

      console.log(JSON.stringify({
        success: true,
        instanceId: state.instanceId,
        gameId: state.gameId,
        status: state.status,
        players: state.turnOrder,
        mechanics: config.mechanics.map(m => m.slug),
      }, null, 2));
    });

  // ─────────────────────────────────────────────────────────────
  // v2 register
  // ─────────────────────────────────────────────────────────────
  v2.command('register <instanceId>')
    .description('Register a player agent')
    .requiredOption('-p, --player <playerId>', 'Player ID')
    .requiredOption('-a, --agent <agentId>', 'Agent ID')
    .option('--persona <persona>', 'Player persona')
    .action((instanceId: string, options: { player: string; agent: string; persona?: string }) => {
      const gameName = getGameNameFromInstanceId(instanceId);
      const state = loadState(gameName, instanceId);

      if (!state) {
        console.error(JSON.stringify({ success: false, error: 'Game not found' }));
        process.exit(1);
      }

      const registry = createDefaultRegistry();
      const engine = new GameEngine(registry);
      engine.loadComposedMechanics(state);

      const result = engine.registerPlayer(state, options.player, options.agent, options.persona);
      if (!result.ok) {
        console.error(JSON.stringify({ success: false, errors: result.error }, null, 2));
        process.exit(1);
      }

      const updatedState = result.value;
      saveState(updatedState);

      console.log(JSON.stringify({
        success: true,
        status: updatedState.status,
        currentPlayer: updatedState.currentPlayer,
        registeredPlayers: Object.entries(updatedState.players)
          .filter(([_, p]) => p.isConnected)
          .map(([id]) => id),
      }, null, 2));
    });

  // ─────────────────────────────────────────────────────────────
  // v2 status
  // ─────────────────────────────────────────────────────────────
  v2.command('status <instanceId>')
    .description('Get game status')
    .action((instanceId: string) => {
      const gameName = getGameNameFromInstanceId(instanceId);
      const state = loadState(gameName, instanceId);

      if (!state) {
        console.error(JSON.stringify({ success: false, error: 'Game not found' }));
        process.exit(1);
      }

      console.log(JSON.stringify({
        success: true,
        gameId: state.gameId,
        instanceId: state.instanceId,
        status: state.status,
        round: state.round,
        turnNumber: state.turnNumber,
        currentPlayer: state.currentPlayer,
        turnOrder: state.turnOrder,
        winner: state.winner,
        endReason: state.endReason,
        players: Object.entries(state.players).map(([id, p]) => ({
          playerId: id,
          isConnected: p.isConnected,
          isActive: p.isActive,
          persona: p.persona,
        })),
      }, null, 2));
    });

  // ─────────────────────────────────────────────────────────────
  // v2 turn
  // ─────────────────────────────────────────────────────────────
  v2.command('turn <instanceId>')
    .description('Get player view and available actions')
    .requiredOption('-p, --player <playerId>', 'Player ID')
    .action((instanceId: string, options: { player: string }) => {
      const gameName = getGameNameFromInstanceId(instanceId);
      const state = loadState(gameName, instanceId);

      if (!state) {
        console.error(JSON.stringify({ success: false, error: 'Game not found' }));
        process.exit(1);
      }

      const registry = createDefaultRegistry();
      const engine = new GameEngine(registry);
      engine.loadComposedMechanics(state);

      const view = engine.getPlayerView(state, options.player);

      console.log(JSON.stringify({
        success: true,
        isYourTurn: state.currentPlayer === options.player,
        ...view,
      }, null, 2));
    });

  // ─────────────────────────────────────────────────────────────
  // v2 act
  // ─────────────────────────────────────────────────────────────
  v2.command('act <instanceId>')
    .description('Execute an action')
    .requiredOption('-p, --player <playerId>', 'Player ID')
    .requiredOption('-a, --action <json>', 'Action JSON')
    .action((instanceId: string, options: { player: string; action: string }) => {
      const gameName = getGameNameFromInstanceId(instanceId);
      const state = loadState(gameName, instanceId);

      if (!state) {
        console.error(JSON.stringify({ success: false, error: 'Game not found' }));
        process.exit(1);
      }

      let action: any;
      try {
        action = JSON.parse(options.action);
      } catch (e) {
        console.error(JSON.stringify({ success: false, error: 'Invalid action JSON' }));
        process.exit(1);
      }

      const registry = createDefaultRegistry();
      const engine = new GameEngine(registry);
      engine.loadComposedMechanics(state);

      const result = engine.executeAction(state, options.player, action);
      if (!result.ok) {
        console.error(JSON.stringify({ success: false, errors: result.error }, null, 2));
        process.exit(1);
      }

      const updatedState = result.value;
      saveState(updatedState);

      const view = engine.getPlayerView(updatedState, options.player);

      console.log(JSON.stringify({
        success: true,
        status: updatedState.status,
        isYourTurn: updatedState.currentPlayer === options.player,
        view,
      }, null, 2));
    });

  // ─────────────────────────────────────────────────────────────
  // v2 mechanics
  // ─────────────────────────────────────────────────────────────
  v2.command('mechanics')
    .description('List available mechanics')
    .action(() => {
      const registry = createDefaultRegistry();
      const mechanics = registry.listAll();

      console.log(JSON.stringify({
        success: true,
        mechanics: mechanics.map(m => ({
          slug: m.slug,
          displayName: m.displayName,
          description: m.description,
          version: m.version,
          actionTypes: m.actionTypes,
          effectTypes: m.effectTypes,
          dependencies: m.dependencies,
          conflicts: m.conflicts,
        })),
      }, null, 2));
    });
}

export default createV2Commands;
