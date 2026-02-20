/**
 * Lean Executor Mechanic
 *
 * Delegates game action execution to the Lean 4 binary. Instead of just
 * validating (like lean-verifier), this mechanic has Lean compute the
 * actual state transitions. The TypeScript engine becomes I/O only.
 *
 * Architecture:
 *   TS Engine (executeAction) → lean-executor (onExecuteAction)
 *     → pipes state JSON to: ./lean-game <game> act <player> <action...>
 *     ← parses: {"success":true,"state":{...}} or {"success":false,"error":"..."}
 *     → applies full state diff back to TS game state
 *
 * Protocol:
 *   echo '<stateJson>' | ./lean-game aaote act player-1 place_location "Forest Clearing" origin
 *   echo '<stateJson>' | ./lean-game aaote init 3 42
 *
 * Enable in RULES.md:
 *   engine_mechanics:
 *     lean_executor: true
 *
 * Requires the Lean binary:
 *   cd lean && lake build lean-game
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  MechanicHooks,
  ActionExecutionContext,
  ActionExecutionResult,
  HookContext,
  AvailableAction,
  MechanicConfigSchema,
  SharedStateInitContext,
  SharedStateInitResult,
} from './types.js';
import { GameAction, GameState, PlayerState, Card } from '../types/game.js';

const LEAN_BINARY_CANDIDATES = [
  resolve(process.cwd(), 'lean/.lake/build/bin/lean-game'),
  resolve(process.cwd(), '../lean/.lake/build/bin/lean-game'),
];

function findLeanBinary(): string | null {
  for (const path of LEAN_BINARY_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Map game name (slug or display name) to Lean game ID.
 */
function leanGameId(gameName: string): string | null {
  const LEAN_GAMES: Record<string, string> = {
    'aaote': 'aaote',
  };

  // Direct slug match (e.g., "aaote")
  const normalized = gameName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (LEAN_GAMES[normalized]) return LEAN_GAMES[normalized];

  // Try extracting slug from display name (e.g., "AAOTE: An Agent of the Enemy" → "aaote")
  const slug = gameName.toLowerCase().split(/[^a-z0-9]/)[0];
  if (slug && LEAN_GAMES[slug]) return LEAN_GAMES[slug];

  return null;
}

/**
 * Convert TS game state to the JSON format Lean expects.
 */
function stateToLeanJson(state: GameState): string {
  const players = Object.keys(state.players);
  const currentIdx = players.indexOf(state.currentPlayer ?? '');

  const hands = players.map(pid => ({
    player: pid,
    cards: (state.players[pid].hand ?? []).map(cardToLean),
  }));

  const deck = ((state.shared?.deck as Card[]) ?? []).map(cardToLean);
  const discardPile = ((state.shared?.discardPile as Card[]) ?? []).map(cardToLean);

  // Grid from shared state
  const placedLocations = (state.shared?.placedLocations as string[]) ?? [];
  const grid = ((state.shared?.leanGrid as unknown[]) ?? []);

  // Player positions
  const playerPositions = players.map(pid => ({
    player: pid,
    pos: (state.shared as Record<string, unknown>)?.[`leanPos_${pid}`] ?? { x: 0, y: 0, xNeg: false, yNeg: false },
  }));

  // Objectives and player cards from lean state
  const objectives = ((state.shared?.leanObjectives as unknown[]) ?? []);
  const playerCards = ((state.shared?.leanPlayerCards as unknown[]) ?? []);
  const history = ((state.shared?.leanHistory as unknown[]) ?? []);

  const pendingTrade = (state.shared?.leanPendingTrade as unknown) ?? null;

  const status = state.status === 'completed'
    ? { type: 'completed', winner: state.shared?.winner ?? null, reason: state.shared?.winReason ?? '' }
    : { type: 'in_progress' };

  const ap = state.players[state.currentPlayer ?? '']?.actionPoints ?? 3;

  return JSON.stringify({
    players,
    currentPlayerIdx: currentIdx >= 0 ? currentIdx : 0,
    round: state.round ?? 1,
    turnNumber: state.turnNumber ?? 1,
    maxTurns: state.config?.max_turns ?? 40,
    actionPoints: ap,
    actionPointsPerTurn: state.config?.engine_mechanics?.action_points?.points_per_turn ?? 3,
    hands,
    deck,
    discardPile,
    handLimit: state.config?.engine_mechanics?.hand_limit ?? 7,
    grid,
    playerPositions,
    objectives,
    playerCards,
    history,
    pendingTrade,
    status,
    guardianBlockUsed: (state.shared?.guardianBlockUsed as boolean) ?? false,
  });
}

function cardToLean(card: Card): Record<string, unknown> {
  const c = card as unknown as Record<string, unknown>;
  return {
    name: card.name,
    category: card.type ?? 'item',
    terrain: c.terrain ?? null,
    subtype: c.subtype ?? null,
  };
}

/**
 * Convert a TS game action to Lean CLI args.
 */
function actionToLeanArgs(action: GameAction): string[] {
  switch (action.type) {
    case 'place_location':
      return ['place_location', action.card as string, (action.adjacentTo as string) ?? 'origin'];
    case 'move':
      return ['move', action.target as string];
    case 'draw':
      return ['draw'];
    case 'play_card': {
      const args = ['play_card', action.card as string];
      if (action.target) args.push(action.target as string);
      return args;
    }
    case 'trade_offer':
      return [
        'trade_offer',
        action.target as string,
        (Array.isArray(action.offer) ? action.offer : [action.offer]).join(','),
        (Array.isArray(action.request) ? action.request : [action.request]).join(','),
      ];
    case 'trade_respond':
      return ['trade_respond', action.accept ? 'accept' : 'decline'];
    case 'pass': {
      const passAction = action as GameAction & { declareVictory?: boolean; victoryReason?: string };
      if (passAction.declareVictory) {
        return passAction.victoryReason
          ? ['declare_victory', passAction.victoryReason]
          : ['declare_victory'];
      }
      return ['pass'];
    }
    default:
      return [action.type];
  }
}

/**
 * Call the Lean binary with state piped via stdin.
 */
function callLeanWithState(
  binary: string,
  gameId: string,
  cmd: string,
  stateJson: string,
  extraArgs: string[]
): Record<string, unknown> | null {
  try {
    const result = execFileSync(binary, [gameId, cmd, ...extraArgs], {
      timeout: 10000,
      encoding: 'utf8',
      input: stateJson,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(result.trim());
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    if (err.stderr) {
      // eslint-disable-next-line no-console
      console.error(`[lean-executor] Lean stderr: ${err.stderr}`);
    }
    return null;
  }
}

/**
 * Apply Lean's computed state back to the TS game state.
 * Returns StateChanges that the engine will merge.
 */
function leanStateToChanges(
  leanState: Record<string, unknown>,
  leanResult: Record<string, unknown>,
  currentState: GameState
): { playerStateChanges: Record<string, Partial<PlayerState>>; sharedStateChanges: Record<string, unknown> } {
  const playerStateChanges: Record<string, Partial<PlayerState>> = {};
  const sharedStateChanges: Record<string, unknown> = {};

  // Extract hands from Lean state
  const hands = leanState.hands as Array<{ player: string; cards: Array<Record<string, unknown>> }>;
  if (hands) {
    for (const { player, cards } of hands) {
      playerStateChanges[player] = {
        ...playerStateChanges[player],
        hand: cards.map(c => ({
          name: c.name as string,
          type: c.category as string,
          ...(c.terrain ? { terrain: c.terrain } : {}),
          ...(c.subtype ? { subtype: c.subtype } : {}),
        })) as Card[],
      };
    }
  }

  // AP for current player
  const currentPlayer = leanResult.currentPlayer as string;
  const ap = leanState.actionPoints as number;
  if (currentPlayer && ap !== undefined) {
    playerStateChanges[currentPlayer] = {
      ...playerStateChanges[currentPlayer],
      actionPoints: ap,
    };
  }

  // Player positions
  const positions = leanState.playerPositions as Array<{ player: string; pos: Record<string, unknown> }>;
  if (positions) {
    for (const { player, pos } of positions) {
      const xNeg = pos.xNeg as boolean;
      const yNeg = pos.yNeg as boolean;
      const x = xNeg ? -(pos.x as number) : (pos.x as number);
      const y = yNeg ? -(pos.y as number) : (pos.y as number);
      // Store position as player state
      if (x === 0 && y === 0) {
        playerStateChanges[player] = { ...playerStateChanges[player], state: 'origin' };
      } else {
        // Find location name at this position from grid
        const grid = leanState.grid as Array<{ pos: Record<string, unknown>; card: Record<string, unknown> }>;
        const tile = grid?.find(t => {
          const tx = (t.pos.xNeg ? -(t.pos.x as number) : (t.pos.x as number));
          const ty = (t.pos.yNeg ? -(t.pos.y as number) : (t.pos.y as number));
          return tx === x && ty === y;
        });
        const locationName = tile?.card?.name as string ?? `(${x},${y})`;
        playerStateChanges[player] = { ...playerStateChanges[player], state: locationName };
      }
      sharedStateChanges[`leanPos_${player}`] = pos;
    }
  }

  // Store Lean-managed state in shared for round-tripping
  sharedStateChanges.leanGrid = leanState.grid;
  sharedStateChanges.leanObjectives = leanState.objectives;
  sharedStateChanges.leanPlayerCards = leanState.playerCards;
  sharedStateChanges.leanHistory = leanState.history;
  sharedStateChanges.leanPendingTrade = leanState.pendingTrade;
  sharedStateChanges.guardianBlockUsed = leanState.guardianBlockUsed;

  // Deck and discard
  sharedStateChanges.deck = (leanState.deck as Array<Record<string, unknown>>)?.map(c => ({
    name: c.name,
    type: c.category,
    ...(c.terrain ? { terrain: c.terrain } : {}),
    ...(c.subtype ? { subtype: c.subtype } : {}),
  }));
  sharedStateChanges.discardPile = (leanState.discardPile as Array<Record<string, unknown>>)?.map(c => ({
    name: c.name,
    type: c.category,
    ...(c.terrain ? { terrain: c.terrain } : {}),
    ...(c.subtype ? { subtype: c.subtype } : {}),
  }));

  // Placed locations list
  const grid = leanState.grid as Array<{ card: Record<string, unknown> }>;
  if (grid) {
    sharedStateChanges.placedLocations = grid.map(t => t.card.name);
  }

  // Game over
  if (leanResult.gameOver) {
    sharedStateChanges.winner = leanResult.winner;
    sharedStateChanges.winReason = leanResult.winReason;
  }

  return { playerStateChanges, sharedStateChanges };
}

export const leanExecutorMechanic: MechanicHooks = {
  slug: 'lean-executor',
  name: 'Lean Execution Engine',

  configSchema: {
    type: 'boolean',
    description: 'Delegate game mechanic execution to the Lean 4 engine. Lean computes all state transitions.',
  } satisfies MechanicConfigSchema,

  /**
   * Initialize Lean-managed state when game starts.
   */
  initSharedState(ctx: SharedStateInitContext): SharedStateInitResult | null {
    const gameId = leanGameId(ctx.config.name ?? '');
    if (!gameId) return null;

    const binary = findLeanBinary();
    if (!binary) return null;

    const numPlayers = ctx.playerIds.length;
    const seed = Date.now() % 100000;

    const result = callLeanWithState(binary, gameId, 'init', '', [
      numPlayers.toString(),
      seed.toString(),
    ]);

    if (!result || !result.success) return null;

    const leanState = result.state as Record<string, unknown>;
    if (!leanState) return null;

    // Store initial Lean state components
    return {
      leanGrid: leanState.grid,
      leanObjectives: leanState.objectives,
      leanPlayerCards: leanState.playerCards,
      leanHistory: leanState.history,
      leanPendingTrade: null,
      leanInitialState: leanState,
      leanEnabled: true,
    };
  },

  /**
   * Execute actions via Lean instead of TypeScript mechanics.
   */
  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const gameId = leanGameId(ctx.state.gameName);
    if (!gameId) return null;

    // Only handle if lean is enabled for this game
    if (!ctx.state.shared?.leanEnabled) return null;

    const binary = findLeanBinary();
    if (!binary) return null;

    const stateJson = stateToLeanJson(ctx.state);
    const actionArgs = actionToLeanArgs(ctx.action);

    const result = callLeanWithState(binary, gameId, 'act', stateJson, [
      ctx.playerId,
      ...actionArgs,
    ]);

    if (!result) return null;

    if (!result.success) {
      // Lean rejected the action
      return {
        handled: true,
        logMessage: `Lean rejected action: ${result.error}`,
      };
    }

    const leanState = result.state as Record<string, unknown>;
    if (!leanState) return null;

    const changes = leanStateToChanges(leanState, result, ctx.state);

    // Determine if turn should advance (Lean may have already advanced)
    const leanCurrentPlayer = result.currentPlayer as string;
    const tsCurrentPlayer = ctx.playerId;
    const turnAdvanced = leanCurrentPlayer !== tsCurrentPlayer;

    return {
      handled: true,
      stateChanges: changes,
      advanceTurn: turnAdvanced,
      checkWin: (result.gameOver as boolean) ?? false,
      logMessage: `[Lean] ${ctx.action.type} executed by ${ctx.playerId}`,
      logData: {
        leanTurnNumber: result.turnNumber,
        leanRound: result.round,
        leanAP: result.actionPoints,
        leanGameOver: result.gameOver,
      },
    };
  },
};
