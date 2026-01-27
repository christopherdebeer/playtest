/**
 * Hook Handler - Processes Claude Code hook events
 *
 * This handler is the bridge between Claude Code and the game server.
 * It intercepts playtest commands and returns structured game state
 * for Claude to reason about and make decisions.
 */

import { EventEmitter } from 'events';
import { resolve } from 'path';
import {
  isGameCommand,
  parseGameCommand,
  type HookResponse,
  type GameCommand,
} from './config.js';
import {
  getGameServer,
  type GameResponse,
  type ParsedAction,
} from '../engine/game-server.js';

export interface SessionState {
  activeGameId?: string;
}

/**
 * Hook Handler manages the interaction between Claude Code hooks and game server
 */
export class HookHandler extends EventEmitter {
  private sessionState: SessionState = {};

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
    const server = getGameServer();

    switch (command.action) {
      case 'new':
        return this.handleNewGame(command.args);

      case 'state':
      case 'status':
        return this.handleGetState();

      case 'action':
        return this.handlePlayerAction(command.args);

      case 'history':
        return this.handleGetHistory();

      case 'help':
        return this.handleHelp();

      default:
        // Try to parse as direct action (e.g., "playtest play_creature card=goblin")
        if (['play_creature', 'play_spell', 'attack', 'pass', 'draw'].includes(command.action)) {
          return this.handlePlayerAction({ type: command.action, ...command.args });
        }

        return {
          success: false,
          output: `Unknown command: ${command.action}\n\n` + this.getHelpText(),
        };
    }
  }

  /**
   * Handle new game command
   */
  private async handleNewGame(
    args: Record<string, string>
  ): Promise<{ success: boolean; output: string }> {
    const rulesPath = args.rules || args.r;

    if (!rulesPath) {
      return {
        success: false,
        output: 'Usage: playtest new rules=<path-to-rules.yaml>\n\nExample: playtest new rules=games/simple-duel.yaml',
      };
    }

    const server = getGameServer();
    const resolvedPath = resolve(rulesPath);

    const config = {
      claudePlayerId: args.as || 'player1',
      opponentType: (args.opponent || 'random') as 'random' | 'scripted' | 'waiting',
      autoAdvanceOpponent: args.manual !== 'true',
    };

    const response = server.createGame(resolvedPath, config);

    this.sessionState.activeGameId = response.gameId;

    return {
      success: response.success,
      output: this.formatGameResponse(response),
    };
  }

  /**
   * Handle get state command
   */
  private async handleGetState(): Promise<{ success: boolean; output: string }> {
    const server = getGameServer();
    const sessionId = this.sessionState.activeGameId || server.getActiveSessionId();

    if (!sessionId) {
      return {
        success: false,
        output: 'No active game. Use "playtest new rules=<path>" to start a game.',
      };
    }

    const response = server.getState(sessionId);

    return {
      success: response.success,
      output: this.formatGameResponse(response),
    };
  }

  /**
   * Handle player action command
   */
  private async handlePlayerAction(
    args: Record<string, string>
  ): Promise<{ success: boolean; output: string }> {
    const server = getGameServer();
    const sessionId = this.sessionState.activeGameId || server.getActiveSessionId();

    if (!sessionId) {
      return {
        success: false,
        output: 'No active game. Use "playtest new rules=<path>" to start.',
      };
    }

    // Parse the action
    const actionType = args.type || args._action || Object.keys(args).find(k =>
      ['play_creature', 'play_spell', 'attack', 'pass', 'draw'].includes(k)
    ) || 'pass';

    // Build params from args (excluding 'type')
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== 'type' && key !== '_action' && !['play_creature', 'play_spell', 'attack', 'pass', 'draw'].includes(key)) {
        params[key] = value;
      }
    }

    const parsedAction: ParsedAction = {
      type: actionType,
      params,
    };

    const response = server.executeAction(sessionId, parsedAction);

    return {
      success: response.success,
      output: this.formatGameResponse(response),
    };
  }

  /**
   * Handle get history command
   */
  private async handleGetHistory(): Promise<{ success: boolean; output: string }> {
    const server = getGameServer();
    const sessionId = this.sessionState.activeGameId || server.getActiveSessionId();

    if (!sessionId) {
      return { success: false, output: 'No active game.' };
    }

    const session = server.getSession(sessionId);
    if (!session) {
      return { success: false, output: 'Session not found.' };
    }

    const history = session.orchestratorState.history
      .slice(-20)
      .map((a, i) => `${i + 1}. ${a.playerId}: ${a.type}${a.result?.success ? '' : ' (failed)'}`)
      .join('\n');

    return {
      success: true,
      output: history || 'No actions yet.',
    };
  }

  /**
   * Handle help command
   */
  private async handleHelp(): Promise<{ success: boolean; output: string }> {
    return {
      success: true,
      output: this.getHelpText(),
    };
  }

  /**
   * Get help text
   */
  private getHelpText(): string {
    return `
PLAYTEST - Card Game Framework for Claude Code

COMMANDS:
  playtest new rules=<path>     Start a new game
    Options:
      as=player1|player2        Choose which player you are (default: player1)
      opponent=random|waiting   Opponent type (default: random)
      manual=true               Don't auto-advance opponent turns

  playtest state                Show current game state
  playtest status               Same as 'state'

  playtest action <type> [params]    Execute an action
    Actions:
      pass                      End current phase
      play_creature card=<name> Play a creature from hand
      play_spell card=<name> [target=<target>]  Cast a spell
      attack attacker=<name>    Attack with a creature

  playtest history              Show recent action history
  playtest help                 Show this help

EXAMPLES:
  playtest new rules=games/simple-duel.yaml
  playtest action play_creature card="Goblin Grunt"
  playtest action play_spell card="Lightning Bolt" target=opponent
  playtest action attack attacker="Steadfast Soldier"
  playtest action pass

GAME FLOW:
  1. Start a new game with 'playtest new'
  2. During your turn, play cards and attack
  3. Use 'pass' to end each phase
  4. Opponent automatically takes their turn
  5. Win by reducing opponent's life to 0!

PHASES (per turn):
  upkeep  - Draw a card, gain mana
  main    - Play creatures and spells
  combat  - Attack with creatures
  end     - Discard if hand > 7
`.trim();
  }

  /**
   * Format game response for output
   */
  private formatGameResponse(response: GameResponse): string {
    const lines: string[] = [];

    // Message
    if (response.message) {
      lines.push(response.message);
      lines.push('');
    }

    // If not successful, just return message
    if (!response.success || !response.gameId) {
      return lines.join('\n');
    }

    // Game state header
    lines.push(`=== Turn ${response.state.turn} | Phase: ${response.state.phase} | ${response.state.activePlayer === 'you' ? 'YOUR TURN' : "OPPONENT'S TURN"} ===`);

    if (response.state.status === 'finished') {
      lines.push(`GAME OVER - ${response.state.winner === 'you' ? 'YOU WIN!' : 'OPPONENT WINS!'}`);
      if (response.state.endReason) {
        lines.push(`Reason: ${response.state.endReason}`);
      }
      lines.push('');
    }

    // Events
    if (response.events.length > 0) {
      lines.push('');
      lines.push('Recent events:');
      for (const event of response.events) {
        lines.push(`  • ${event.description}`);
      }
    }

    // Your status
    lines.push('');
    lines.push(`YOU (${response.you.playerId}): Life=${response.you.resources.life || 0} Mana=${response.you.resources.mana || 0}`);
    lines.push(`  Hand (${response.you.hand.length}): ${this.formatCards(response.you.hand)}`);
    lines.push(`  Battlefield: ${this.formatBattlefieldCards(response.you.battlefield)}`);
    lines.push(`  Deck: ${response.you.deckSize} cards`);

    // Opponent status
    lines.push('');
    lines.push(`OPPONENT (${response.opponent.playerId}): Life=${response.opponent.resources.life || 0} Mana=${response.opponent.resources.mana || 0}`);
    lines.push(`  Hand: ${response.opponent.handSize} cards`);
    lines.push(`  Battlefield: ${this.formatBattlefieldCards(response.opponent.battlefield)}`);
    lines.push(`  Deck: ${response.opponent.deckSize} cards`);

    // Valid actions (if it's your turn)
    if (response.validActions.length > 0 && response.state.activePlayer === 'you') {
      lines.push('');
      lines.push('VALID ACTIONS:');
      for (const action of response.validActions) {
        lines.push(`  ${action.action}: ${action.description}`);
        if (action.affordable && action.affordable.length > 0) {
          const cardList = action.affordable.map(c => `${c.name}(${c.cost})`).join(', ');
          lines.push(`    Available: ${cardList}`);
        }
        if (action.attackers && action.attackers.length > 0) {
          const attackerList = action.attackers.map(c => `${c.name}(${c.power}/${c.toughness})`).join(', ');
          lines.push(`    Ready: ${attackerList}`);
        }
        if (action.example) {
          lines.push(`    Example: ${action.example}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format cards for display
   */
  private formatCards(cards: Array<{ name: string; cost?: number; power?: number; toughness?: number; type: string }>): string {
    if (cards.length === 0) return '[empty]';

    return cards.map(c => {
      if (c.type === 'creature') {
        return `${c.name}(${c.cost})[${c.power}/${c.toughness}]`;
      } else {
        return `${c.name}(${c.cost})`;
      }
    }).join(', ');
  }

  /**
   * Format battlefield cards with status
   */
  private formatBattlefieldCards(cards: Array<{ name: string; power?: number; toughness?: number; tapped?: boolean; summoningSickness?: boolean }>): string {
    if (cards.length === 0) return '[empty]';

    return cards.map(c => {
      let status = '';
      if (c.tapped) status += '[T]';
      if (c.summoningSickness) status += '[S]';
      return `${c.name}(${c.power}/${c.toughness})${status}`;
    }).join(', ');
  }

  /**
   * Get current session state
   */
  getSession(): SessionState {
    return this.sessionState;
  }

  /**
   * Clear current session
   */
  clearSession(): void {
    this.sessionState = {};
    getGameServer().clearSessions();
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
