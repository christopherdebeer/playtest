/**
 * Game Server - Stateful session manager for Claude Code integration
 *
 * This is the main interface between hooks and the game engine.
 * It manages game sessions and returns structured responses for Claude to reason about.
 */

import { randomUUID } from 'crypto';
import type {
  GameState,
  PlayerId,
  Card,
  Action,
  GameEvent,
  StateChange,
} from '../core/types.js';
import {
  createGameState,
  applyStateChanges,
  recordAction,
  getPlayerZones,
  cloneGameState,
  findCard,
} from '../core/game-state.js';
import type { GameRules } from '../rules/schema.js';
import { loadGameRules, rulesToConfig } from '../rules/parser.js';
import { RandomAgent, ScriptedAgent } from '../agents/player.js';
import {
  executeEffect,
  validateAction,
  getValidActionsDetailed,
  type ActionOption,
  type EffectResult,
} from './deterministic-rules.js';

/**
 * Response format for Claude to reason about
 */
export interface GameResponse {
  success: boolean;
  message: string;

  // Game metadata
  gameId: string;
  state: {
    turn: number;
    phase: string;
    activePlayer: string;
    status: 'setup' | 'playing' | 'finished';
    winner?: string;
    endReason?: string;
  };

  // Claude's perspective (full visibility for Claude's cards)
  you: {
    playerId: string;
    resources: Record<string, number>;
    hand: CardInfo[];
    battlefield: CardInfo[];
    deckSize: number;
    discardPile: CardInfo[];
  };

  // Opponent info (limited visibility)
  opponent: {
    playerId: string;
    resources: Record<string, number>;
    handSize: number;
    battlefield: CardInfo[];
    deckSize: number;
    discardPile: CardInfo[];
  };

  // What Claude can do next
  validActions: ActionOption[];

  // What just happened (since last command)
  events: GameEventInfo[];

  // Formatted text summary
  summary: string;
}

export interface CardInfo {
  id: string;
  name: string;
  type: string;
  cost?: number;
  power?: number;
  toughness?: number;
  text?: string;
  tapped?: boolean;
  summoningSickness?: boolean;
  damage?: number;
}

export interface GameEventInfo {
  type: string;
  description: string;
  player?: string;
  card?: string;
  target?: string;
  amount?: number;
}

export interface GameSession {
  id: string;
  orchestratorState: GameState;
  rules: GameRules;
  claudePlayerId: PlayerId;
  opponentPlayerId: PlayerId;
  opponentType: 'random' | 'scripted' | 'waiting';
  opponentAgent?: RandomAgent | ScriptedAgent;
  events: GameEventInfo[];
  createdAt: number;
  autoAdvanceOpponent: boolean;
}

export interface CreateGameConfig {
  claudePlayerId?: string;
  opponentType?: 'random' | 'scripted' | 'waiting';
  autoAdvanceOpponent?: boolean;
  script?: Array<{ actionType: string; params: Record<string, unknown> }>;
}

export interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

/**
 * GameServer manages game sessions and provides the interface for Claude Code
 */
export class GameServer {
  private sessions: Map<string, GameSession> = new Map();

  /**
   * Create a new game from rules file
   */
  createGame(rulesPath: string, config: CreateGameConfig = {}): GameResponse {
    try {
      const rules = loadGameRules(rulesPath);
      const gameConfig = rulesToConfig(rules);

      const playerIds = ['player1', 'player2'];
      const state = createGameState(gameConfig, playerIds);

      const claudePlayerId = config.claudePlayerId || 'player1';
      const opponentPlayerId = claudePlayerId === 'player1' ? 'player2' : 'player1';

      // Run setup
      const setupState = this.runSetup(state, rules);

      const session: GameSession = {
        id: randomUUID(),
        orchestratorState: { ...setupState, status: 'playing', currentTurn: 1 },
        rules,
        claudePlayerId,
        opponentPlayerId,
        opponentType: config.opponentType || 'random',
        events: [{ type: 'game_start', description: 'Game started' }],
        createdAt: Date.now(),
        autoAdvanceOpponent: config.autoAdvanceOpponent !== false,
      };

      // Create opponent agent if needed
      if (session.opponentType === 'random') {
        session.opponentAgent = new RandomAgent({ id: opponentPlayerId });
      } else if (session.opponentType === 'scripted' && config.script) {
        session.opponentAgent = new ScriptedAgent(
          { id: opponentPlayerId },
          config.script.map((s) => ({ ...s, reasoning: 'scripted' }))
        );
      }

      this.sessions.set(session.id, session);

      return this.formatResponse(session, 'Game created! You are ' + claudePlayerId + '.');
    } catch (error) {
      return this.errorResponse(`Failed to create game: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current game state
   */
  getState(sessionId: string): GameResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.errorResponse('No active game. Use "playtest new rules=<path>" to start.');
    }

    return this.formatResponse(session, 'Current game state:');
  }

  /**
   * Execute a player action
   */
  executeAction(sessionId: string, action: ParsedAction): GameResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.errorResponse('No active game.');
    }

    if (session.orchestratorState.status !== 'playing') {
      return this.errorResponse(`Game is ${session.orchestratorState.status}. Cannot execute actions.`);
    }

    // Check if it's Claude's turn
    if (session.orchestratorState.activePlayer !== session.claudePlayerId) {
      return this.errorResponse(`It's ${session.orchestratorState.activePlayer}'s turn, not yours.`);
    }

    // Clear previous events
    session.events = [];

    // Handle pass action
    if (action.type === 'pass') {
      return this.handlePass(session);
    }

    // Validate the action
    const validation = validateAction(
      session.orchestratorState,
      session.claudePlayerId,
      action,
      session.rules
    );

    if (!validation.valid) {
      return this.formatResponse(session, `Invalid action: ${validation.message}`, false);
    }

    // Execute the action
    const result = executeEffect(
      session.orchestratorState,
      session.claudePlayerId,
      action,
      session.rules
    );

    if (!result.success) {
      return this.formatResponse(session, `Action failed: ${result.message}`, false);
    }

    // Apply state changes
    session.orchestratorState = applyStateChanges(session.orchestratorState, result.stateChanges);

    // Record in history
    const gameAction: Action = {
      id: randomUUID(),
      type: action.type,
      playerId: session.claudePlayerId,
      timestamp: Date.now(),
      params: action.params,
      result: {
        success: true,
        stateChanges: result.stateChanges,
        message: result.message,
      },
    };
    session.orchestratorState = recordAction(session.orchestratorState, gameAction);

    // Record events
    session.events.push(...result.events);

    // Check win conditions
    const winner = this.checkWinConditions(session);
    if (winner) {
      session.orchestratorState = {
        ...session.orchestratorState,
        status: 'finished',
        winner: winner.playerId,
        endReason: winner.reason,
      };
      session.events.push({
        type: 'game_end',
        description: `Game over! ${winner.playerId === session.claudePlayerId ? 'You win' : 'Opponent wins'}: ${winner.reason}`,
      });
      return this.formatResponse(session, result.message || 'Action executed.');
    }

    return this.formatResponse(session, result.message || 'Action executed.');
  }

  /**
   * Handle pass action - advance phase or turn
   */
  private handlePass(session: GameSession): GameResponse {
    const state = session.orchestratorState;
    const rules = session.rules;
    const phases = rules.turn_structure.phases;
    const currentPhaseIndex = phases.indexOf(state.currentPhase);

    session.events.push({
      type: 'pass',
      description: `You passed the ${state.currentPhase} phase.`,
      player: session.claudePlayerId,
    });

    // Move to next phase
    if (currentPhaseIndex < phases.length - 1) {
      // Next phase in current player's turn
      session.orchestratorState = {
        ...state,
        currentPhase: phases[currentPhaseIndex + 1],
      };

      // Handle phase-specific auto-actions (like upkeep draw)
      this.handlePhaseStart(session);

    } else {
      // End of turn - switch to opponent
      session.orchestratorState = {
        ...state,
        currentPhase: phases[0],
        activePlayer: session.opponentPlayerId,
      };

      session.events.push({
        type: 'turn_change',
        description: `Turn passed to ${session.opponentPlayerId}.`,
      });

      // Auto-run opponent's turn if configured
      if (session.autoAdvanceOpponent && session.opponentAgent) {
        this.runOpponentTurn(session);
      }
    }

    return this.formatResponse(session, 'Phase passed.');
  }

  /**
   * Handle automatic phase-start actions
   */
  private handlePhaseStart(session: GameSession): void {
    const state = session.orchestratorState;
    const phase = state.currentPhase;
    const playerId = state.activePlayer;

    if (phase === 'upkeep') {
      // Grant mana
      const player = state.players.get(playerId);
      if (player) {
        const manaPerTurn = session.rules.resources.find((r) => r.id === 'mana')?.per_turn || 1;
        const maxMana = session.rules.resources.find((r) => r.id === 'mana')?.max || 10;
        const newMana = Math.min((player.resources.mana || 0) + manaPerTurn, maxMana);

        session.orchestratorState = applyStateChanges(state, [
          {
            type: 'modify_resource',
            details: { playerId, resource: 'mana', absolute: newMana },
          },
        ]);

        session.events.push({
          type: 'mana_gain',
          description: `${playerId} gained ${manaPerTurn} mana (now ${newMana}).`,
          player: playerId,
          amount: manaPerTurn,
        });
      }

      // Auto-draw
      const deckZone = state.zones.get(`${playerId}:deck`);
      const handZone = state.zones.get(`${playerId}:hand`);

      if (deckZone && handZone && deckZone.cards.length > 0) {
        const drawnCard = deckZone.cards[0];
        session.orchestratorState = applyStateChanges(session.orchestratorState, [
          {
            type: 'move_card',
            details: {
              cardId: drawnCard.id,
              fromZone: `${playerId}:deck`,
              toZone: `${playerId}:hand`,
            },
          },
        ]);

        if (playerId === session.claudePlayerId) {
          session.events.push({
            type: 'draw',
            description: `You drew ${drawnCard.name}.`,
            player: playerId,
            card: drawnCard.name,
          });
        } else {
          session.events.push({
            type: 'draw',
            description: `${playerId} drew a card.`,
            player: playerId,
          });
        }
      } else if (deckZone && deckZone.cards.length === 0) {
        // Can't draw - lose game
        session.orchestratorState = {
          ...session.orchestratorState,
          status: 'finished',
          winner: playerId === session.claudePlayerId ? session.opponentPlayerId : session.claudePlayerId,
          endReason: 'Cannot draw from empty deck',
        };
        session.events.push({
          type: 'game_end',
          description: `${playerId} cannot draw - deck empty!`,
        });
      }
    }

    // Clear summoning sickness at start of turn for active player's creatures
    if (phase === 'upkeep') {
      const battlefield = state.zones.get(`${playerId}:battlefield`);
      if (battlefield) {
        const changes: StateChange[] = [];
        for (const card of battlefield.cards) {
          if (card.properties.summoningSickness) {
            changes.push({
              type: 'modify_property',
              details: {
                target: card.id,
                targetType: 'card',
                property: 'summoningSickness',
                value: false,
              },
            });
          }
          // Untap creatures
          if (card.properties.tapped) {
            changes.push({
              type: 'modify_property',
              details: {
                target: card.id,
                targetType: 'card',
                property: 'tapped',
                value: false,
              },
            });
          }
        }
        if (changes.length > 0) {
          session.orchestratorState = applyStateChanges(session.orchestratorState, changes);
        }
      }
    }
  }

  /**
   * Run opponent's turn automatically
   */
  private runOpponentTurn(session: GameSession): void {
    const maxActions = 20;
    let actions = 0;

    while (
      session.orchestratorState.activePlayer === session.opponentPlayerId &&
      session.orchestratorState.status === 'playing' &&
      actions < maxActions
    ) {
      // Handle phase start
      this.handlePhaseStart(session);

      if (session.orchestratorState.status !== 'playing') break;

      // Get valid actions for opponent
      const validActions = getValidActionsDetailed(
        session.orchestratorState,
        session.opponentPlayerId,
        session.rules
      );

      // If only pass is available, pass
      if (validActions.length === 0 || (validActions.length === 1 && validActions[0].action === 'pass')) {
        this.advanceOpponentPhase(session);
        actions++;
        continue;
      }

      // Use opponent agent to decide
      if (session.opponentAgent) {
        // For random agent, pick a random action
        const nonPassActions = validActions.filter((a) => a.action !== 'pass');
        const availableActions = nonPassActions.length > 0 ? nonPassActions : validActions;
        const chosen = availableActions[Math.floor(Math.random() * availableActions.length)];

        if (chosen.action === 'pass') {
          this.advanceOpponentPhase(session);
        } else {
          // Execute opponent action
          const result = this.executeOpponentAction(session, chosen);
          if (!result) {
            // Action failed, try passing
            this.advanceOpponentPhase(session);
          }
        }
      } else {
        // No agent, just pass
        this.advanceOpponentPhase(session);
      }

      actions++;
    }
  }

  /**
   * Execute an action for the opponent
   */
  private executeOpponentAction(session: GameSession, actionOption: ActionOption): boolean {
    // Build action params from the action option
    const params: Record<string, string> = {};

    // For creature/spell plays, pick a random affordable card
    if (actionOption.affordable && actionOption.affordable.length > 0) {
      const card = actionOption.affordable[Math.floor(Math.random() * actionOption.affordable.length)];
      params.card = card.name;
    }

    // For attacks, pick a random attacker
    if (actionOption.attackers && actionOption.attackers.length > 0) {
      const attacker = actionOption.attackers[Math.floor(Math.random() * actionOption.attackers.length)];
      params.attacker = attacker.name;
    }

    const parsedAction: ParsedAction = {
      type: actionOption.action,
      params,
    };

    const result = executeEffect(
      session.orchestratorState,
      session.opponentPlayerId,
      parsedAction,
      session.rules
    );

    if (!result.success) {
      return false;
    }

    session.orchestratorState = applyStateChanges(session.orchestratorState, result.stateChanges);

    // Record action
    const gameAction: Action = {
      id: randomUUID(),
      type: actionOption.action,
      playerId: session.opponentPlayerId,
      timestamp: Date.now(),
      params,
      result: {
        success: true,
        stateChanges: result.stateChanges,
      },
    };
    session.orchestratorState = recordAction(session.orchestratorState, gameAction);

    // Add event
    session.events.push({
      type: 'opponent_action',
      description: result.message || `Opponent used ${actionOption.action}.`,
      player: session.opponentPlayerId,
    });

    // Check win conditions
    const winner = this.checkWinConditions(session);
    if (winner) {
      session.orchestratorState = {
        ...session.orchestratorState,
        status: 'finished',
        winner: winner.playerId,
        endReason: winner.reason,
      };
    }

    return true;
  }

  /**
   * Advance opponent through phases
   */
  private advanceOpponentPhase(session: GameSession): void {
    const state = session.orchestratorState;
    const phases = session.rules.turn_structure.phases;
    const currentPhaseIndex = phases.indexOf(state.currentPhase);

    if (currentPhaseIndex < phases.length - 1) {
      session.orchestratorState = {
        ...state,
        currentPhase: phases[currentPhaseIndex + 1],
      };
    } else {
      // End of opponent's turn - back to Claude
      const newTurn = state.currentTurn + 1;
      session.orchestratorState = {
        ...state,
        currentTurn: newTurn,
        currentPhase: phases[0],
        activePlayer: session.claudePlayerId,
      };

      session.events.push({
        type: 'turn_start',
        description: `Turn ${newTurn} - Your turn!`,
      });

      // Handle Claude's upkeep
      this.handlePhaseStart(session);
    }
  }

  /**
   * Run setup phase
   */
  private runSetup(state: GameState, rules: GameRules): GameState {
    let newState = cloneGameState(state);

    // Create decks for each player
    for (const playerId of newState.players.keys()) {
      const deckZone = newState.zones.get(`${playerId}:deck`);
      if (!deckZone) continue;

      // Add cards from starter_deck
      const starterDeck = rules.card_sets?.starter_deck || [];
      for (const cardDef of starterDeck) {
        for (let i = 0; i < cardDef.count; i++) {
          deckZone.cards.push({
            id: `${cardDef.id}_${randomUUID().slice(0, 8)}`,
            name: cardDef.name,
            type: cardDef.type,
            properties: { ...cardDef.properties },
            text: cardDef.text,
          });
        }
      }

      // Shuffle deck
      for (let i = deckZone.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deckZone.cards[i], deckZone.cards[j]] = [deckZone.cards[j], deckZone.cards[i]];
      }

      // Draw starting hand
      const handZone = newState.zones.get(`${playerId}:hand`);
      if (handZone) {
        const startingHandSize = (rules.parameters?.starting_hand_size?.default as number) || 5;
        const drawn = deckZone.cards.splice(0, startingHandSize);
        handZone.cards.push(...drawn);
      }

      // Set starting resources
      const player = newState.players.get(playerId);
      if (player) {
        player.resources.life = (rules.parameters?.starting_life?.default as number) || 20;
        player.resources.mana = 1;
      }
    }

    return newState;
  }

  /**
   * Check win conditions
   */
  private checkWinConditions(session: GameSession): { playerId: PlayerId; reason: string } | null {
    const state = session.orchestratorState;

    for (const [playerId, player] of state.players) {
      const opponent = Array.from(state.players.values()).find((p) => p.id !== playerId);
      if (!opponent) continue;

      // Check if opponent's life is 0 or less
      if ((opponent.resources.life || 20) <= 0) {
        return { playerId, reason: 'Reduced opponent life to 0' };
      }
    }

    return null;
  }

  /**
   * Format response for Claude
   */
  private formatResponse(session: GameSession, message: string, success: boolean = true): GameResponse {
    const state = session.orchestratorState;
    const claudePlayer = state.players.get(session.claudePlayerId)!;
    const opponentPlayer = state.players.get(session.opponentPlayerId)!;

    const claudeHand = state.zones.get(`${session.claudePlayerId}:hand`);
    const claudeBattlefield = state.zones.get(`${session.claudePlayerId}:battlefield`);
    const claudeDeck = state.zones.get(`${session.claudePlayerId}:deck`);
    const claudeDiscard = state.zones.get(`${session.claudePlayerId}:discard`);

    const opponentHand = state.zones.get(`${session.opponentPlayerId}:hand`);
    const opponentBattlefield = state.zones.get(`${session.opponentPlayerId}:battlefield`);
    const opponentDeck = state.zones.get(`${session.opponentPlayerId}:deck`);
    const opponentDiscard = state.zones.get(`${session.opponentPlayerId}:discard`);

    const validActions = state.status === 'playing' && state.activePlayer === session.claudePlayerId
      ? getValidActionsDetailed(state, session.claudePlayerId, session.rules)
      : [];

    // Build summary
    const summary = this.buildSummary(session, message);

    return {
      success,
      message,
      gameId: session.id,
      state: {
        turn: state.currentTurn,
        phase: state.currentPhase,
        activePlayer: state.activePlayer === session.claudePlayerId ? 'you' : 'opponent',
        status: state.status,
        winner: state.winner === session.claudePlayerId ? 'you' : state.winner === session.opponentPlayerId ? 'opponent' : state.winner,
        endReason: state.endReason,
      },
      you: {
        playerId: session.claudePlayerId,
        resources: claudePlayer.resources,
        hand: claudeHand?.cards.map((c) => this.formatCard(c)) || [],
        battlefield: claudeBattlefield?.cards.map((c) => this.formatCard(c)) || [],
        deckSize: claudeDeck?.cards.length || 0,
        discardPile: claudeDiscard?.cards.map((c) => this.formatCard(c)) || [],
      },
      opponent: {
        playerId: session.opponentPlayerId,
        resources: opponentPlayer.resources,
        handSize: opponentHand?.cards.length || 0,
        battlefield: opponentBattlefield?.cards.map((c) => this.formatCard(c)) || [],
        deckSize: opponentDeck?.cards.length || 0,
        discardPile: opponentDiscard?.cards.map((c) => this.formatCard(c)) || [],
      },
      validActions,
      events: session.events,
      summary,
    };
  }

  /**
   * Format a card for response
   */
  private formatCard(card: Card): CardInfo {
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      cost: card.properties.cost as number | undefined,
      power: card.properties.power as number | undefined,
      toughness: card.properties.toughness as number | undefined,
      text: card.text,
      tapped: card.properties.tapped as boolean | undefined,
      summoningSickness: card.properties.summoningSickness as boolean | undefined,
      damage: card.properties.damage as number | undefined,
    };
  }

  /**
   * Build text summary
   */
  private buildSummary(session: GameSession, message: string): string {
    const state = session.orchestratorState;
    const lines: string[] = [];

    lines.push(`=== Turn ${state.currentTurn} | Phase: ${state.currentPhase} | ${state.activePlayer === session.claudePlayerId ? 'YOUR TURN' : "OPPONENT'S TURN"} ===`);
    lines.push('');
    lines.push(message);
    lines.push('');

    // Events
    if (session.events.length > 0) {
      lines.push('Recent events:');
      for (const event of session.events.slice(-5)) {
        lines.push(`  - ${event.description}`);
      }
      lines.push('');
    }

    // Your status
    const you = state.players.get(session.claudePlayerId)!;
    const yourHand = state.zones.get(`${session.claudePlayerId}:hand`);
    const yourField = state.zones.get(`${session.claudePlayerId}:battlefield`);

    lines.push(`YOU: Life=${you.resources.life} Mana=${you.resources.mana}`);
    lines.push(`  Hand (${yourHand?.cards.length || 0}): ${yourHand?.cards.map((c) => `${c.name}(${c.properties.cost})`).join(', ') || 'empty'}`);
    lines.push(`  Battlefield: ${yourField?.cards.map((c) => `${c.name}${c.properties.tapped ? '[T]' : ''}${c.properties.summoningSickness ? '[S]' : ''}`).join(', ') || 'empty'}`);

    // Opponent status
    const opp = state.players.get(session.opponentPlayerId)!;
    const oppHand = state.zones.get(`${session.opponentPlayerId}:hand`);
    const oppField = state.zones.get(`${session.opponentPlayerId}:battlefield`);

    lines.push(`OPPONENT: Life=${opp.resources.life} Mana=${opp.resources.mana}`);
    lines.push(`  Hand: ${oppHand?.cards.length || 0} cards`);
    lines.push(`  Battlefield: ${oppField?.cards.map((c) => `${c.name}${c.properties.tapped ? '[T]' : ''}`).join(', ') || 'empty'}`);

    // Valid actions
    if (state.status === 'playing' && state.activePlayer === session.claudePlayerId) {
      const actions = getValidActionsDetailed(state, session.claudePlayerId, session.rules);
      lines.push('');
      lines.push('Valid actions:');
      for (const action of actions) {
        lines.push(`  - ${action.action}: ${action.description}`);
        if (action.example) {
          lines.push(`      Example: ${action.example}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Error response helper
   */
  private errorResponse(message: string): GameResponse {
    return {
      success: false,
      message,
      gameId: '',
      state: {
        turn: 0,
        phase: '',
        activePlayer: '',
        status: 'setup',
      },
      you: {
        playerId: '',
        resources: {},
        hand: [],
        battlefield: [],
        deckSize: 0,
        discardPile: [],
      },
      opponent: {
        playerId: '',
        resources: {},
        handSize: 0,
        battlefield: [],
        deckSize: 0,
        discardPile: [],
      },
      validActions: [],
      events: [],
      summary: message,
    };
  }

  /**
   * Get active session ID (most recent)
   */
  getActiveSessionId(): string | undefined {
    let latest: GameSession | undefined;
    for (const session of this.sessions.values()) {
      if (!latest || session.createdAt > latest.createdAt) {
        latest = session;
      }
    }
    return latest?.id;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
  }
}

// Singleton instance
let serverInstance: GameServer | null = null;

export function getGameServer(): GameServer {
  if (!serverInstance) {
    serverInstance = new GameServer();
  }
  return serverInstance;
}
