/**
 * State Management
 *
 * Handles state persistence, loading, and updates.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CoreGameState,
  CorePlayerState,
  GameConfig,
  AdjudicationState,
  LogEvent,
  MechanicConfigEntry,
  InitContext,
  PlayerView,
  ActionContext,
  ExecutionResult,
  EffectResult,
  BaseAction,
  TurnAdvancement,
  ok,
  err,
  Result,
  ValidationError,
} from './types.js';
import { MechanicRegistry, ComposedMechanics } from './registry.js';

// ═══════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const GAMES_DIR = path.resolve(process.cwd(), 'games');

function getStatePath(gameName: string, instanceId: string): string {
  return path.join(GAMES_DIR, gameName, 'state', instanceId, 'game.json');
}

function getLogPath(gameName: string, instanceId: string): string {
  return path.join(GAMES_DIR, gameName, 'logs', `${instanceId}.jsonl`);
}

export function loadState(gameName: string, instanceId: string): CoreGameState | null {
  const statePath = getStatePath(gameName, instanceId);
  if (!fs.existsSync(statePath)) return null;

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as CoreGameState;
  } catch {
    return null;
  }
}

export function saveState(state: CoreGameState): void {
  const statePath = getStatePath(state.gameName, state.instanceId);
  const stateDir = path.dirname(statePath);

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function logEvent(state: CoreGameState, event: LogEvent): void {
  const logDir = path.dirname(state.logPath);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const line = JSON.stringify({
    ...event,
    round: event.round ?? state.round,
    turnNumber: event.turnNumber ?? state.turnNumber,
  }) + '\n';

  fs.appendFileSync(state.logPath, line);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class GameEngine {
  private registry: MechanicRegistry;
  private composedMechanics: Map<string, ComposedMechanics> = new Map();

  constructor(registry: MechanicRegistry) {
    this.registry = registry;
  }

  // ─────────────────────────────────────────────────────────────
  // Game Initialization
  // ─────────────────────────────────────────────────────────────

  initGame(
    gameName: string,
    config: GameConfig,
    playerCount: number
  ): Result<CoreGameState, ValidationError[]> {
    // Validate player count against config
    const playerRange = config.players;
    if (playerRange.type === 'exact') {
      if (playerCount !== playerRange.count) {
        return err([{ message: `Game requires exactly ${playerRange.count} players, got ${playerCount}` }]);
      }
    } else if (playerRange.type === 'range') {
      if (playerCount < playerRange.min || playerCount > playerRange.max) {
        return err([{ message: `Game requires ${playerRange.min}-${playerRange.max} players, got ${playerCount}` }]);
      }
    }

    // Compose mechanics
    const composeResult = this.registry.compose(config.mechanics, playerCount);
    if (!composeResult.ok) {
      return err(composeResult.error);
    }

    const composed = composeResult.value;
    const instanceId = `${gameName}-${Date.now()}`;
    const gameId = `game-${instanceId}`;
    const logPath = getLogPath(gameName, instanceId);

    // Store composed mechanics for this game
    this.composedMechanics.set(instanceId, composed);

    // Create init context
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player-${i + 1}`);
    const initContext: InitContext = {
      playerCount,
      playerIds,
      gameId,
      random: Math.random,
    };

    // Initialize mechanic game states
    const mechanicState = composed.initGameState(initContext);

    // Initialize players
    const players: Record<string, CorePlayerState> = {};
    for (const playerId of playerIds) {
      players[playerId] = {
        playerId,
        isActive: true,
        isConnected: false,
        mechanicState: composed.initPlayerState(playerId, initContext),
      };
    }

    const now = new Date().toISOString();

    const state: CoreGameState = {
      gameId,
      gameName,
      instanceId,
      status: 'waiting_for_players',
      round: 1,
      turnNumber: 0,
      currentPlayer: null,
      turnOrder: playerIds,
      players,
      config,
      mechanicState,
      logPath,
      adjudication: {
        actionHistory: [],
        contestHistory: [],
        resignationHistory: [],
        victoryHistory: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    // Save state and log creation
    saveState(state);
    logEvent(state, {
      timestamp: now,
      event: 'game_created',
      data: { gameName, playerCount, mechanics: config.mechanics.map(m => m.slug) },
    });

    return ok(state);
  }

  // ─────────────────────────────────────────────────────────────
  // Player Registration
  // ─────────────────────────────────────────────────────────────

  registerPlayer(
    state: CoreGameState,
    playerId: string,
    agentId: string,
    persona?: string
  ): Result<CoreGameState, ValidationError[]> {
    if (!state.players[playerId]) {
      return err([{ message: `Player "${playerId}" does not exist` }]);
    }

    if (state.players[playerId].isConnected) {
      return err([{ message: `Player "${playerId}" is already registered` }]);
    }

    const updatedPlayers = { ...state.players };
    updatedPlayers[playerId] = {
      ...updatedPlayers[playerId],
      agentId,
      persona,
      isConnected: true,
    };

    const updatedState = { ...state, players: updatedPlayers };

    logEvent(updatedState, {
      timestamp: new Date().toISOString(),
      event: 'player_registered',
      player: playerId,
      data: { agentId, persona },
    });

    // Check if all players are connected
    const allConnected = Object.values(updatedPlayers).every(p => p.isConnected);
    if (allConnected && state.status === 'waiting_for_players') {
      return this.startGame(updatedState);
    }

    saveState(updatedState);
    return ok(updatedState);
  }

  // ─────────────────────────────────────────────────────────────
  // Game Start
  // ─────────────────────────────────────────────────────────────

  private startGame(state: CoreGameState): Result<CoreGameState, ValidationError[]> {
    const composed = this.getComposedMechanics(state.instanceId);

    let updatedState: CoreGameState = {
      ...state,
      status: 'in_progress',
      currentPlayer: state.turnOrder[0],
      turnNumber: 1,
    };

    // Call onGameStart for all mechanics
    const startResults = composed.onGameStart(updatedState);

    // Apply all state changes from onGameStart
    for (const result of startResults) {
      const slug = result.mechanicSlug;

      if (result.gameStateChanges) {
        updatedState.mechanicState[slug] = {
          ...(updatedState.mechanicState[slug] as object),
          ...(result.gameStateChanges as object),
        };
      }

      if (result.playerStateChanges) {
        for (const [playerId, changes] of Object.entries(result.playerStateChanges)) {
          updatedState.players[playerId].mechanicState[slug] = {
            ...(updatedState.players[playerId].mechanicState[slug] as object),
            ...(changes as object),
          };
        }
      }

      for (const event of result.events) {
        logEvent(updatedState, event);
      }
    }

    logEvent(updatedState, {
      timestamp: new Date().toISOString(),
      event: 'game_started',
      data: { turnOrder: state.turnOrder },
    });

    saveState(updatedState);
    return ok(updatedState);
  }

  // ─────────────────────────────────────────────────────────────
  // Action Execution
  // ─────────────────────────────────────────────────────────────

  executeAction(
    state: CoreGameState,
    playerId: string,
    action: BaseAction
  ): Result<CoreGameState, ValidationError[]> {
    if (state.status !== 'in_progress') {
      return err([{ message: `Game is not in progress (status: ${state.status})` }]);
    }

    if (state.currentPlayer !== playerId) {
      return err([{ message: `It's not your turn (current: ${state.currentPlayer})` }]);
    }

    const composed = this.getComposedMechanics(state.instanceId);
    const ctx = this.createActionContext(state, playerId);

    // Validate
    const validationResult = composed.validateAction(ctx, action);
    if (!validationResult.ok) {
      return err(validationResult.error);
    }

    // Execute
    const result = composed.executeAction(ctx, action);
    if (!result.success) {
      return err([{ message: result.message ?? 'Action failed' }]);
    }

    // Apply state changes
    let updatedState = this.applyExecutionResult(state, playerId, action, result);

    // Log events
    for (const event of result.events) {
      logEvent(updatedState, event);
    }

    // Apply effects
    if (result.effects) {
      for (const effect of result.effects) {
        const effectCtx = { ...ctx, effect, state: updatedState };
        const effectResult = composed.applyEffect(effectCtx as any, effect);
        updatedState = this.applyEffectResult(updatedState, effectResult);
        for (const event of effectResult.events) {
          logEvent(updatedState, event);
        }
      }
    }

    // Check win conditions
    const winCheck = composed.checkWinConditions(this.createActionContext(updatedState, playerId));
    if (winCheck?.triggered) {
      updatedState = {
        ...updatedState,
        status: 'pending_analysis',
        winner: winCheck.winner,
        endReason: winCheck.reason,
      };
      logEvent(updatedState, {
        timestamp: new Date().toISOString(),
        event: 'game_ended',
        data: { winner: winCheck.winner, reason: winCheck.reason },
      });
    } else {
      // Check if any mechanic wants to auto-end the turn (mechanic-agnostic)
      let nextTurn = result.nextTurn;
      if (nextTurn.type === 'same_player') {
        const autoEndCheck = composed.shouldAutoEndTurn(this.createActionContext(updatedState, playerId));
        if (autoEndCheck.shouldEnd) {
          nextTurn = { type: 'advance' };
          logEvent(updatedState, {
            timestamp: new Date().toISOString(),
            event: 'auto_end_turn',
            player: playerId,
            data: { reason: autoEndCheck.reason },
          });
        }
      }

      // Advance turn
      updatedState = this.advanceTurn(updatedState, nextTurn);
    }

    saveState(updatedState);
    return ok(updatedState);
  }

  // ─────────────────────────────────────────────────────────────
  // Player View
  // ─────────────────────────────────────────────────────────────

  getPlayerView(state: CoreGameState, playerId: string): PlayerView {
    const composed = this.getComposedMechanics(state.instanceId);
    const view = composed.getPlayerView(state, playerId);

    // Add available actions if it's the player's turn
    if (state.currentPlayer === playerId && state.status === 'in_progress') {
      const ctx = this.createActionContext(state, playerId);
      view.availableActions = composed.getAvailableActions(ctx);
    }

    return view;
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private getComposedMechanics(instanceId: string): ComposedMechanics {
    const composed = this.composedMechanics.get(instanceId);
    if (!composed) {
      throw new Error(`No composed mechanics for instance: ${instanceId}`);
    }
    return composed;
  }

  loadComposedMechanics(state: CoreGameState): void {
    if (this.composedMechanics.has(state.instanceId)) return;

    const composeResult = this.registry.compose(
      state.config.mechanics,
      state.turnOrder.length
    );

    if (!composeResult.ok) {
      throw new Error(`Failed to compose mechanics: ${composeResult.error.map(e => e.message).join(', ')}`);
    }

    this.composedMechanics.set(state.instanceId, composeResult.value);
  }

  private createActionContext(state: CoreGameState, playerId: string): ActionContext {
    return {
      state,
      playerId,
      timestamp: new Date().toISOString(),
      getMechanicGameState: <T>(slug: string) => state.mechanicState[slug] as T | undefined,
      getMechanicPlayerState: <T>(slug: string, pid: string) =>
        state.players[pid]?.mechanicState?.[slug] as T | undefined,
      getMechanicConfig: <T>(slug: string) =>
        state.config.mechanics.find(m => m.slug === slug)?.config as T | undefined,
      gameState: {},
      playerState: {},
      random: Math.random,
    };
  }

  private applyExecutionResult(
    state: CoreGameState,
    playerId: string,
    action: BaseAction,
    result: ExecutionResult
  ): CoreGameState {
    let updatedState = { ...state };

    // Record action
    updatedState.adjudication = {
      ...updatedState.adjudication,
      lastAction: {
        player: playerId,
        action,
        timestamp: new Date().toISOString(),
        round: state.round,
        turnNumber: state.turnNumber,
        result: { success: result.success, details: { message: result.message } },
      },
      actionHistory: [
        ...updatedState.adjudication.actionHistory.slice(-19),
        {
          player: playerId,
          action,
          timestamp: new Date().toISOString(),
          round: state.round,
          turnNumber: state.turnNumber,
          result: { success: result.success },
        },
      ],
    };

    // Apply game state changes
    if (result.gameStateChanges) {
      const composed = this.getComposedMechanics(state.instanceId);
      const slug = this.registry.getMechanicForAction(action.type)?.slug;
      if (slug) {
        updatedState.mechanicState = {
          ...updatedState.mechanicState,
          [slug]: {
            ...(updatedState.mechanicState[slug] as object),
            ...result.gameStateChanges,
          },
        };
      }
    }

    // Apply player state changes
    if (result.playerStateChanges) {
      const slug = this.registry.getMechanicForAction(action.type)?.slug;
      if (slug) {
        for (const [pid, changes] of Object.entries(result.playerStateChanges)) {
          updatedState.players = {
            ...updatedState.players,
            [pid]: {
              ...updatedState.players[pid],
              mechanicState: {
                ...updatedState.players[pid].mechanicState,
                [slug]: {
                  ...(updatedState.players[pid].mechanicState[slug] as object),
                  ...changes,
                },
              },
            },
          };
        }
      }
    }

    // Apply cross-mechanic state changes from hooks (already keyed by mechanic slug)
    if (result.crossMechanicState) {
      // Apply game state changes
      if (result.crossMechanicState.game) {
        for (const [mechanicSlug, changes] of Object.entries(result.crossMechanicState.game)) {
          updatedState.mechanicState = {
            ...updatedState.mechanicState,
            [mechanicSlug]: {
              ...(updatedState.mechanicState[mechanicSlug] as object),
              ...(changes as object),
            },
          };
        }
      }

      // Apply player state changes
      if (result.crossMechanicState.player) {
        for (const [pid, mechanicChanges] of Object.entries(result.crossMechanicState.player)) {
          for (const [mechanicSlug, changes] of Object.entries(mechanicChanges as Record<string, unknown>)) {
            updatedState.players = {
              ...updatedState.players,
              [pid]: {
                ...updatedState.players[pid],
                mechanicState: {
                  ...updatedState.players[pid].mechanicState,
                  [mechanicSlug]: {
                    ...(updatedState.players[pid].mechanicState[mechanicSlug] as object),
                    ...(changes as object),
                  },
                },
              },
            };
          }
        }
      }
    }

    return updatedState;
  }

  private applyEffectResult(state: CoreGameState, result: EffectResult): CoreGameState {
    let updatedState = { ...state };

    if (result.gameStateChanges) {
      for (const [key, value] of Object.entries(result.gameStateChanges)) {
        // Find which mechanic this belongs to
        for (const slug of Object.keys(state.mechanicState)) {
          if (key in (state.mechanicState[slug] as object)) {
            updatedState.mechanicState = {
              ...updatedState.mechanicState,
              [slug]: {
                ...(updatedState.mechanicState[slug] as object),
                [key]: value,
              },
            };
          }
        }
      }
    }

    if (result.playerStateChanges) {
      for (const [playerId, changes] of Object.entries(result.playerStateChanges)) {
        for (const [key, value] of Object.entries(changes as object)) {
          for (const slug of Object.keys(state.players[playerId]?.mechanicState ?? {})) {
            if (key in (state.players[playerId].mechanicState[slug] as object)) {
              updatedState.players = {
                ...updatedState.players,
                [playerId]: {
                  ...updatedState.players[playerId],
                  mechanicState: {
                    ...updatedState.players[playerId].mechanicState,
                    [slug]: {
                      ...(updatedState.players[playerId].mechanicState[slug] as object),
                      [key]: value,
                    },
                  },
                },
              };
            }
          }
        }
      }
    }

    return updatedState;
  }

  private advanceTurn(state: CoreGameState, advancement: TurnAdvancement): CoreGameState {
    let updatedState = { ...state };

    switch (advancement.type) {
      case 'advance': {
        const currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
        const nextIndex = (currentIndex + 1) % state.turnOrder.length;
        const nextPlayer = state.turnOrder[nextIndex];
        const newRound = nextIndex === 0 ? state.round + 1 : state.round;

        updatedState = {
          ...updatedState,
          currentPlayer: nextPlayer,
          turnNumber: state.turnNumber + 1,
          round: newRound,
        };

        // Check max rounds
        if (state.config.maxRounds && newRound > state.config.maxRounds) {
          updatedState = {
            ...updatedState,
            status: 'pending_analysis',
            endReason: 'Max rounds reached',
          };
        }
        break;
      }

      case 'same_player':
        // No change
        break;

      case 'skip': {
        let currentIndex = state.turnOrder.indexOf(state.currentPlayer!);
        currentIndex = (currentIndex + advancement.count + 1) % state.turnOrder.length;
        updatedState = {
          ...updatedState,
          currentPlayer: state.turnOrder[currentIndex],
          turnNumber: state.turnNumber + 1,
        };
        break;
      }

      case 'reverse': {
        const reversedOrder = [...state.turnOrder].reverse();
        const currentIndex = reversedOrder.indexOf(state.currentPlayer!);
        const nextIndex = (currentIndex + 1) % reversedOrder.length;
        updatedState = {
          ...updatedState,
          turnOrder: reversedOrder,
          currentPlayer: reversedOrder[nextIndex],
          turnNumber: state.turnNumber + 1,
        };
        break;
      }

      case 'game_over':
        updatedState = {
          ...updatedState,
          status: 'pending_analysis',
          winner: advancement.winner,
          endReason: advancement.reason,
        };
        break;
    }

    return updatedState;
  }
}
