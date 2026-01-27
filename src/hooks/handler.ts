/**
 * Hook Handler - Processes Claude Code hook events
 *
 * This handler is the bridge between Claude Code and the game orchestrator.
 * It intercepts relevant commands and routes them through the game engine.
 */

import { EventEmitter } from 'events';
import {
  isGameCommand,
  parseGameCommand,
  type HookResponse,
  type GameCommand,
} from './config.js';
import type { GameState, GameEvent, PlayerId } from '../core/types.js';
import { serializeGameState } from '../core/game-state.js';

export interface SessionState {
  gameId?: string;
  currentState?: GameState;
  pendingAction?: GameCommand;
  history: GameEvent[];
}

/**
 * Hook Handler manages the interaction between Claude Code hooks and game state
 */
export class HookHandler extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private activeSessionId?: string;

  constructor() {
    super();
  }

  /**
   * Handle pre-tool-use hook
   * Called before a tool is executed - can approve, block, or modify
   */
  async handlePreToolUse(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<HookResponse> {
    // Only intercept Bash commands
    if (toolName !== 'Bash') {
      return { exitCode: 0, decision: 'approve' };
    }

    const command = toolInput.command as string;
    if (!command || !isGameCommand(command)) {
      return { exitCode: 0, decision: 'approve' };
    }

    const gameCommand = parseGameCommand(command);
    if (!gameCommand) {
      return { exitCode: 0, decision: 'approve' };
    }

    // Route the game command
    const result = await this.handleGameCommand(gameCommand);

    // Block the original bash command and return game result
    return {
      exitCode: 0,
      decision: 'block',
      stdout: result.output,
    };
  }

  /**
   * Handle post-tool-use hook
   * Called after a tool completes - for logging and reactions
   */
  async handlePostToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolOutput: string
  ): Promise<HookResponse> {
    // Log game-related outputs
    if (toolName === 'Bash') {
      const command = toolInput.command as string;
      if (command && isGameCommand(command)) {
        this.emit('game_output', { command, output: toolOutput });
      }
    }

    return { exitCode: 0 };
  }

  /**
   * Handle notification hook
   */
  async handleNotification(message: string): Promise<HookResponse> {
    this.emit('notification', { message });
    return { exitCode: 0 };
  }

  /**
   * Process a game command
   */
  private async handleGameCommand(
    command: GameCommand
  ): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    switch (command.action) {
      case 'new':
        return this.handleNewGame(command.args);

      case 'state':
        return this.handleGetState();

      case 'action':
      case 'move':
      case 'play':
        return this.handlePlayerAction(command);

      case 'history':
        return this.handleGetHistory();

      case 'analyze':
        return this.handleAnalyze();

      case 'save':
        return this.handleSave(command.args.path);

      case 'load':
        return this.handleLoad(command.args.path);

      default:
        return {
          success: false,
          output: `Unknown game command: ${command.action}\n` +
                  'Available: new, state, action, move, play, history, analyze, save, load',
        };
    }
  }

  private getOrCreateSession(): SessionState {
    if (!this.activeSessionId) {
      this.activeSessionId = `session_${Date.now()}`;
    }

    let session = this.sessions.get(this.activeSessionId);
    if (!session) {
      session = { history: [] };
      this.sessions.set(this.activeSessionId, session);
    }

    return session;
  }

  private async handleNewGame(
    args: Record<string, string>
  ): Promise<{ success: boolean; output: string }> {
    const rulesPath = args.rules || args.r;

    if (!rulesPath) {
      return {
        success: false,
        output: 'Usage: playtest new rules=<path-to-rules.yaml>',
      };
    }

    // Emit event for CLI to handle actual game creation
    const result = await new Promise<{ success: boolean; state?: GameState; error?: string }>(
      (resolve) => {
        this.emit('new_game', { rulesPath, callback: resolve });

        // Timeout after 10 seconds
        setTimeout(() => resolve({ success: false, error: 'Timeout creating game' }), 10000);
      }
    );

    if (result.success && result.state) {
      const session = this.getOrCreateSession();
      session.gameId = result.state.id;
      session.currentState = result.state;

      return {
        success: true,
        output: `Game created: ${result.state.id}\n\n${serializeGameState(result.state).formatted}`,
      };
    }

    return {
      success: false,
      output: `Failed to create game: ${result.error}`,
    };
  }

  private async handleGetState(): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    if (!session.currentState) {
      return {
        success: false,
        output: 'No active game. Use "playtest new rules=<path>" to start.',
      };
    }

    return {
      success: true,
      output: serializeGameState(session.currentState).formatted,
    };
  }

  private async handlePlayerAction(
    command: GameCommand
  ): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    if (!session.currentState) {
      return {
        success: false,
        output: 'No active game. Use "playtest new rules=<path>" to start.',
      };
    }

    // Emit event for CLI to process action
    const result = await new Promise<{ success: boolean; state?: GameState; message?: string }>(
      (resolve) => {
        this.emit('player_action', {
          action: command.action,
          args: command.args,
          state: session.currentState,
          callback: resolve,
        });

        setTimeout(() => resolve({ success: false, message: 'Timeout processing action' }), 30000);
      }
    );

    if (result.success && result.state) {
      session.currentState = result.state;
      return {
        success: true,
        output: `Action executed.\n\n${serializeGameState(result.state).formatted}`,
      };
    }

    return {
      success: false,
      output: result.message || 'Action failed',
    };
  }

  private async handleGetHistory(): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    if (!session.currentState) {
      return { success: false, output: 'No active game.' };
    }

    const history = session.currentState.history
      .slice(-20)  // Last 20 actions
      .map((a, i) => `${i + 1}. ${a.playerId}: ${a.type} - ${a.result?.success ? 'OK' : 'FAILED'}`)
      .join('\n');

    return {
      success: true,
      output: history || 'No actions yet.',
    };
  }

  private async handleAnalyze(): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    if (!session.currentState) {
      return { success: false, output: 'No active game.' };
    }

    // Emit for CLI to handle analysis
    const result = await new Promise<{ success: boolean; analysis?: string }>(
      (resolve) => {
        this.emit('analyze_game', {
          state: session.currentState,
          callback: resolve,
        });

        setTimeout(() => resolve({ success: false }), 60000);
      }
    );

    return {
      success: result.success,
      output: result.analysis || 'Analysis not available.',
    };
  }

  private async handleSave(path?: string): Promise<{ success: boolean; output: string }> {
    const session = this.getOrCreateSession();

    if (!session.currentState) {
      return { success: false, output: 'No active game to save.' };
    }

    const savePath = path || `game_${session.gameId}.json`;

    this.emit('save_game', { state: session.currentState, path: savePath });

    return {
      success: true,
      output: `Game saved to ${savePath}`,
    };
  }

  private async handleLoad(path?: string): Promise<{ success: boolean; output: string }> {
    if (!path) {
      return { success: false, output: 'Usage: playtest load path=<file.json>' };
    }

    const result = await new Promise<{ success: boolean; state?: GameState }>(
      (resolve) => {
        this.emit('load_game', { path, callback: resolve });
        setTimeout(() => resolve({ success: false }), 5000);
      }
    );

    if (result.success && result.state) {
      const session = this.getOrCreateSession();
      session.currentState = result.state;
      session.gameId = result.state.id;

      return {
        success: true,
        output: `Game loaded.\n\n${serializeGameState(result.state).formatted}`,
      };
    }

    return { success: false, output: 'Failed to load game.' };
  }

  /**
   * Update game state (called by orchestrator)
   */
  updateState(state: GameState): void {
    const session = this.getOrCreateSession();
    session.currentState = state;
    this.emit('state_updated', { state });
  }

  /**
   * Record a game event
   */
  recordEvent(event: GameEvent): void {
    const session = this.getOrCreateSession();
    session.history.push(event);
    this.emit('game_event', event);
  }

  /**
   * Get current session state
   */
  getSession(): SessionState | undefined {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) : undefined;
  }

  /**
   * Clear current session
   */
  clearSession(): void {
    if (this.activeSessionId) {
      this.sessions.delete(this.activeSessionId);
      this.activeSessionId = undefined;
    }
  }
}

// Singleton instance
let handlerInstance: HookHandler | null = null;

export function getHookHandler(): HookHandler {
  if (!handlerInstance) {
    handlerInstance = new HookHandler();
  }
  return handlerInstance;
}
