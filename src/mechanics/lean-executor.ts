/**
 * Lean Executor Mechanic
 *
 * Delegates ALL game mechanic execution to the Lean 4 binary.
 * The TypeScript engine becomes pure I/O — Lean computes every state transition.
 *
 * When lean_executor is the only engine mechanic, this hook handles:
 *   - Shared state initialization (deck, hands, grid, objectives)
 *   - Player state initialization (hand, AP)
 *   - Action execution (all action types)
 *   - Available actions computation
 *   - Turn start (AP reset)
 *   - Player view (AP, position)
 *
 * Architecture:
 *   TS Engine → lean-executor hooks
 *     → pipes state JSON to: ./lean-game <game> <cmd> ...
 *     ← parses JSON response
 *     → applies state diff back to TS game state
 *
 * Enable in RULES.md:
 *   mechanics:
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
  PlayerInitContext,
  PlayerInitResult,
  TurnStartContext,
  StateChanges,
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

// ============ Lean card ↔ TS card conversion ============

function leanCardToTs(c: Record<string, unknown>): Card {
  return {
    name: c.name as string,
    type: c.category as string,
    ...(c.terrain ? { terrain: c.terrain } : {}),
    ...(c.subtype ? { subtype: c.subtype } : {}),
  } as Card;
}

function tsCardToLean(card: Card): Record<string, unknown> {
  const c = card as unknown as Record<string, unknown>;
  return {
    name: card.name,
    category: card.type ?? 'item',
    terrain: c.terrain ?? null,
    subtype: c.subtype ?? null,
  };
}

// ============ State serialization ============

/**
 * Convert TS game state to the JSON format Lean expects.
 */
function stateToLeanJson(state: GameState): string {
  const players = Object.keys(state.players);
  const currentIdx = players.indexOf(state.currentPlayer ?? '');

  const hands = players.map(pid => ({
    player: pid,
    cards: (state.players[pid].hand ?? []).map(tsCardToLean),
  }));

  const deck = ((state.shared?.deck as Card[]) ?? []).map(tsCardToLean);
  const discardPile = ((state.shared?.discardPile as Card[]) ?? []).map(tsCardToLean);

  const grid = ((state.shared?.leanGrid as unknown[]) ?? []);

  const playerPositions = players.map(pid => ({
    player: pid,
    pos: (state.shared as Record<string, unknown>)?.[`leanPos_${pid}`] ?? { x: 0, y: 0, xNeg: false, yNeg: false },
  }));

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
    actionPointsPerTurn: 3,
    hands,
    deck,
    discardPile,
    handLimit: 7,
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

// ============ Action conversion ============

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

// ============ Lean binary invocation ============

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

// ============ State diff application ============

/**
 * Apply Lean's computed state back to the TS game state.
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
        hand: cards.map(leanCardToTs),
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
      actionPointsUsed: 3 - ap,
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
      if (x === 0 && y === 0) {
        playerStateChanges[player] = { ...playerStateChanges[player], state: 'origin' };
      } else {
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
  sharedStateChanges.deck = (leanState.deck as Array<Record<string, unknown>>)?.map(leanCardToTs);
  sharedStateChanges.discardPile = (leanState.discardPile as Array<Record<string, unknown>>)?.map(leanCardToTs);

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

// ============ Mechanic hooks ============

export const leanExecutorMechanic: MechanicHooks = {
  slug: 'lean-executor',
  name: 'Lean Execution Engine',

  configSchema: {
    type: 'boolean',
    description: 'Delegate game mechanic execution to the Lean 4 engine. Lean computes all state transitions.',
  } satisfies MechanicConfigSchema,

  /**
   * Initialize shared state: call Lean init, populate deck/hands/grid.
   * This replaces the cards mechanic's initSharedState entirely.
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

    // Extract hands dealt by Lean for player initialization
    const hands = leanState.hands as Array<{ player: string; cards: Array<Record<string, unknown>> }>;
    const startingHands: Record<string, Card[]> = {};
    if (hands) {
      for (const { player, cards } of hands) {
        startingHands[player] = cards.map(leanCardToTs);
      }
    }

    // Extract deck and discard pile from Lean
    const deck = (leanState.deck as Array<Record<string, unknown>>)?.map(leanCardToTs) ?? [];
    const discardPile = (leanState.discardPile as Array<Record<string, unknown>>)?.map(leanCardToTs) ?? [];

    return {
      // TS engine expected state
      deck,
      discardPile,
      placedCards: [],
      placedLocations: [],
      pendingTrades: [],
      _startingHands: startingHands,

      // Lean-managed state for round-tripping
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
   * Initialize player state: hand from Lean-dealt cards, AP, position.
   * This replaces the cards mechanic's and action-points mechanic's initPlayerState.
   */
  initPlayerState(ctx: PlayerInitContext): PlayerInitResult | null {
    const gameId = leanGameId(ctx.config.name ?? '');
    if (!gameId) return null;

    const startingHands = ctx.shared?._startingHands as Record<string, Card[]> | undefined;
    const hand = startingHands?.[ctx.playerId] ?? [];

    return {
      hand,
      actionPoints: 3,
      actionPointsUsed: 0,
    };
  },

  /**
   * Reset AP at turn start. Replaces action-points mechanic's onTurnStart.
   */
  onTurnStart(ctx: TurnStartContext): StateChanges | null {
    if (!ctx.state.shared?.leanEnabled) return null;

    return {
      playerStateChanges: {
        [ctx.playerId]: {
          actionPoints: 3,
          actionPointsUsed: 0,
        },
      },
    };
  },

  /**
   * Expose AP and position to player view.
   * Replaces action-points mechanic's getPlayerView.
   */
  getPlayerView(ctx: HookContext): Record<string, unknown> | null {
    if (!ctx.state.shared?.leanEnabled) return null;

    return {
      hand: (ctx.player.hand ?? []).map((c: Card) => c.name),
      actionPoints: ctx.player.actionPoints ?? 3,
      actionPointsUsed: ctx.player.actionPointsUsed ?? 0,
      actionPointsPerTurn: 3,
    };
  },

  /**
   * Compute available actions via Lean.
   */
  getAvailableActions(ctx: HookContext): AvailableAction[] {
    if (!ctx.state.shared?.leanEnabled) return [];

    const gameId = leanGameId(ctx.state.gameName);
    if (!gameId) return [];

    const binary = findLeanBinary();
    if (!binary) return [];

    const stateJson = stateToLeanJson(ctx.state);
    const result = callLeanWithState(binary, gameId, 'available', stateJson, [ctx.playerId]);

    if (!result || !result.success) return [];

    const leanActions = result.actions as Array<Record<string, unknown>>;
    if (!leanActions) return [];

    const actions: AvailableAction[] = [];

    for (const la of leanActions) {
      const actionType = la.type as string;
      const action = { type: actionType } as GameAction;

      // Map Lean action fields to TS GameAction
      if (la.card) (action as Record<string, unknown>).card = la.card;
      if (la.target) (action as Record<string, unknown>).target = la.target;
      if (la.adjacentTo) (action as Record<string, unknown>).adjacentTo = la.adjacentTo;
      if (la.offer) (action as Record<string, unknown>).offer = la.offer;
      if (la.request) (action as Record<string, unknown>).request = la.request;
      if (la.declareVictory) (action as Record<string, unknown>).declareVictory = la.declareVictory;
      if (la.victoryReason) (action as Record<string, unknown>).victoryReason = la.victoryReason;
      if (la.accept !== undefined) (action as Record<string, unknown>).accept = la.accept;

      actions.push({
        action,
        description: la.description as string ?? actionType,
        enabled: true,
        priority: actionType === 'pass' ? -1 : 0,
      });
    }

    return actions;
  },

  /**
   * Execute actions via Lean instead of TypeScript mechanics.
   */
  onExecuteAction(ctx: ActionExecutionContext): ActionExecutionResult | null {
    const gameId = leanGameId(ctx.state.gameName);
    if (!gameId) return null;

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
      return {
        handled: true,
        logMessage: `Lean rejected action: ${result.error}`,
      };
    }

    const leanState = result.state as Record<string, unknown>;
    if (!leanState) return null;

    const changes = leanStateToChanges(leanState, result, ctx.state);

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
