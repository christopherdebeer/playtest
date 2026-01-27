/**
 * Game Orchestrator - the deterministic state machine that manages game flow
 *
 * The orchestrator handles:
 * - Turn and phase progression
 * - Action routing to agents
 * - State management and history
 * - Win condition checking
 * - Event emission for hooks
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  GameState,
  GameConfig,
  Action,
  ActionResult,
  PlayerId,
  GameEvent,
  GameEventType,
  Resolution,
  Card,
  GameMetrics,
} from '../core/types.js';
import {
  createGameState,
  cloneGameState,
  applyStateChanges,
  recordAction,
  serializeGameState,
  getPlayerZones,
} from '../core/game-state.js';
import type { GameRules, SetupInstruction } from '../rules/schema.js';
import { generateCards, rulesToConfig, formatRulesForLLM } from '../rules/parser.js';

export interface Agent {
  id: string;
  type: 'player' | 'arbiter' | 'observer';
  decideAction(context: AgentContext): Promise<AgentDecision>;
}

export interface AgentContext {
  state: string;           // Serialized game state
  rules: string;           // Formatted rules
  validActions: string[];  // List of valid action types
  prompt: string;          // Specific prompt for this decision
  history?: string;        // Recent action history
}

export interface AgentDecision {
  actionType: string;
  params: Record<string, unknown>;
  reasoning?: string;
}

export interface ArbiterContext extends AgentContext {
  proposedAction: Action;
  validationRequest: string;
}

export interface ArbiterResult {
  valid: boolean;
  stateChanges?: ActionResult['stateChanges'];
  message?: string;
  reasoning?: string;
}

export interface OrchestratorConfig {
  maxTurns: number;
  maxActionsPerTurn: number;
  timeout: number;  // ms per decision
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxTurns: 100,
  maxActionsPerTurn: 50,
  timeout: 30000,
};

export class GameOrchestrator extends EventEmitter {
  private state: GameState;
  private rules: GameRules;
  private config: GameConfig;
  private orchConfig: OrchestratorConfig;
  private agents: Map<string, Agent> = new Map();
  private arbiter?: Agent;
  private metrics: Partial<GameMetrics>;
  private actionCount: number = 0;
  private turnActionCounts: number[] = [];

  constructor(
    rules: GameRules,
    playerIds: PlayerId[],
    orchConfig: Partial<OrchestratorConfig> = {}
  ) {
    super();
    this.rules = rules;
    this.config = rulesToConfig(rules);
    this.orchConfig = { ...DEFAULT_CONFIG, ...orchConfig };
    this.state = createGameState(this.config, playerIds);
    this.metrics = {
      gameId: this.state.id,
      turnCount: 0,
      actionCount: 0,
      actionsPerTurn: [],
      decisionsPerPlayer: Object.fromEntries(playerIds.map((p) => [p, 0])),
      arbiterInterventions: 0,
      cardUsage: {},
    };
  }

  /**
   * Register an agent (player or arbiter)
   */
  registerAgent(agent: Agent): void {
    if (agent.type === 'arbiter') {
      this.arbiter = agent;
    } else {
      this.agents.set(agent.id, agent);
    }
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Get the rules formatted for agents
   */
  getFormattedRules(): string {
    return formatRulesForLLM(this.rules);
  }

  /**
   * Run the complete setup phase
   */
  async runSetup(): Promise<void> {
    this.emit('game_event', this.createEvent('game_start', {}));

    // Generate and distribute cards
    const cards = generateCards(this.rules);
    await this.executeSetup(this.rules.setup, cards);

    this.state = { ...this.state, status: 'playing', currentTurn: 1 };
    this.emit('game_event', this.createEvent('turn_start', { turn: 1 }));
  }

  /**
   * Execute setup instructions
   */
  private async executeSetup(instructions: SetupInstruction[], cards: Card[]): Promise<void> {
    for (const instruction of instructions) {
      await this.executeSetupInstruction(instruction, cards);
    }
  }

  private async executeSetupInstruction(instruction: SetupInstruction, cards: Card[]): Promise<void> {
    if ('each_player' in instruction) {
      for (const playerId of this.state.players.keys()) {
        const playerCards = cards.splice(0, Math.floor(cards.length / this.state.players.size));
        await this.executeSetup(instruction.each_player, playerCards);
        // Restore player context
      }
    } else if ('shuffle' in instruction) {
      const zoneId = instruction.shuffle;
      for (const [id, zone] of this.state.zones) {
        if (id.endsWith(`:${zoneId}`) || id === zoneId) {
          this.shuffleZone(zone);
        }
      }
    } else if ('draw' in instruction) {
      const count = instruction.draw;
      const fromZone = instruction.from || 'deck';
      const toZone = instruction.to || 'hand';

      for (const playerId of this.state.players.keys()) {
        const from = this.state.zones.get(`${playerId}:${fromZone}`);
        const to = this.state.zones.get(`${playerId}:${toZone}`);
        if (from && to) {
          const drawn = from.cards.splice(0, count);
          to.cards.push(...drawn);
        }
      }
    } else if ('set' in instruction) {
      for (const [resource, value] of Object.entries(instruction.set as Record<string, number>)) {
        for (const player of this.state.players.values()) {
          player.resources[resource] = value;
        }
      }
    } else if ('create_deck' in instruction) {
      const { zone, cards: cardSetName } = instruction.create_deck;
      const cardSet = this.rules.card_sets?.[cardSetName] || [];
      for (const playerId of this.state.players.keys()) {
        const targetZone = this.state.zones.get(`${playerId}:${zone}`) || this.state.zones.get(zone);
        if (targetZone) {
          for (const cardDef of cardSet) {
            for (let i = 0; i < cardDef.count; i++) {
              targetZone.cards.push({
                id: `${cardDef.id}_${randomUUID().slice(0, 8)}`,
                name: cardDef.name,
                type: cardDef.type,
                properties: { ...cardDef.properties },
                text: cardDef.text,
              });
            }
          }
        }
      }
    } else if ('custom' in instruction) {
      // Route to arbiter for interpretation
      if (this.arbiter) {
        await this.arbiter.decideAction({
          state: serializeGameState(this.state).formatted,
          rules: this.getFormattedRules(),
          validActions: [],
          prompt: `Execute this setup instruction: ${instruction.custom}`,
        });
        this.metrics.arbiterInterventions = (this.metrics.arbiterInterventions || 0) + 1;
      }
    }
  }

  private shuffleZone(zone: { cards: Card[] }): void {
    for (let i = zone.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [zone.cards[i], zone.cards[j]] = [zone.cards[j], zone.cards[i]];
    }
  }

  /**
   * Run a single game turn
   */
  async runTurn(): Promise<boolean> {
    if (this.state.status !== 'playing') return false;
    if (this.state.currentTurn > this.orchConfig.maxTurns) {
      this.endGame('draw', 'Max turns exceeded');
      return false;
    }

    const startActions = this.actionCount;

    for (const phase of this.config.turnStructure.phases) {
      this.state = { ...this.state, currentPhase: phase };
      this.emit('game_event', this.createEvent('phase_start', { phase }));

      await this.runPhase(phase);

      // Check win conditions after each phase
      const winner = await this.checkWinConditions();
      if (winner) {
        this.endGame(winner.playerId, winner.reason);
        return false;
      }

      this.emit('game_event', this.createEvent('phase_end', { phase }));
    }

    this.turnActionCounts.push(this.actionCount - startActions);
    this.advanceTurn();
    return this.state.status === 'playing';
  }

  /**
   * Run a single phase within a turn
   */
  private async runPhase(phase: string): Promise<void> {
    let actionsThisPhase = 0;
    let playerPassed = false;

    while (!playerPassed && actionsThisPhase < this.orchConfig.maxActionsPerTurn) {
      const agent = this.agents.get(this.state.activePlayer);
      if (!agent) break;

      const validActions = this.getValidActions(this.state.activePlayer, phase);

      // If only 'pass' is valid, auto-pass
      if (validActions.length === 0 || (validActions.length === 1 && validActions[0] === 'pass')) {
        playerPassed = true;
        break;
      }

      const context: AgentContext = {
        state: serializeGameState(this.state, this.state.activePlayer).formatted,
        rules: this.getFormattedRules(),
        validActions,
        prompt: `It is your turn. Current phase: ${phase}. Choose an action.`,
        history: this.getRecentHistory(5),
      };

      const decision = await agent.decideAction(context);
      this.metrics.decisionsPerPlayer![this.state.activePlayer]++;

      if (decision.actionType === 'pass') {
        playerPassed = true;
        break;
      }

      const action: Action = {
        id: randomUUID(),
        type: decision.actionType,
        playerId: this.state.activePlayer,
        timestamp: Date.now(),
        params: decision.params,
      };

      this.emit('game_event', this.createEvent('action_proposed', { action }));

      const result = await this.validateAndExecuteAction(action);
      action.result = result;

      if (result.success) {
        this.state = applyStateChanges(this.state, result.stateChanges);
        this.state = recordAction(this.state, action);
        this.actionCount++;
        actionsThisPhase++;
        this.emit('game_event', this.createEvent('action_executed', { action }));

        // Track card usage
        if (action.params.card && typeof action.params.card === 'object') {
          const card = action.params.card as Card;
          this.metrics.cardUsage![card.name] = (this.metrics.cardUsage![card.name] || 0) + 1;
        }
      } else {
        this.emit('game_event', this.createEvent('action_rejected', { action, reason: result.message }));
      }
    }
  }

  /**
   * Get valid actions for a player in the current state
   */
  private getValidActions(playerId: PlayerId, phase: string): string[] {
    const validActions: string[] = ['pass'];

    for (const actionDef of this.config.actions) {
      // Check phase restriction
      if (actionDef.phases && !actionDef.phases.includes(phase)) {
        continue;
      }

      // For simple conditions, evaluate directly
      // For complex conditions, we'd need the arbiter
      if (this.evaluateSimpleCondition(actionDef.validWhen, playerId)) {
        validActions.push(actionDef.id);
      }
    }

    return validActions;
  }

  /**
   * Evaluate simple conditions without LLM
   */
  private evaluateSimpleCondition(condition: string, playerId: PlayerId): boolean {
    const player = this.state.players.get(playerId);
    if (!player) return false;

    // Handle common patterns
    const patterns = [
      { regex: /phase\s*==\s*['"](\w+)['"]/, check: (m: RegExpMatchArray) => this.state.currentPhase === m[1] },
      { regex: /(\w+)\.(\w+)\s*>=\s*(\d+)/, check: (m: RegExpMatchArray) => (player.resources[m[2]] || 0) >= parseInt(m[3]) },
      { regex: /(\w+)\.(\w+)\s*>\s*(\d+)/, check: (m: RegExpMatchArray) => (player.resources[m[2]] || 0) > parseInt(m[3]) },
      { regex: /hand\.length\s*>\s*(\d+)/, check: (m: RegExpMatchArray) => {
        const hand = this.state.zones.get(`${playerId}:hand`);
        return hand ? hand.cards.length > parseInt(m[1]) : false;
      }},
    ];

    for (const { regex, check } of patterns) {
      const match = condition.match(regex);
      if (match && !check(match)) {
        return false;
      }
    }

    // Default to true for complex conditions (arbiter will validate)
    return true;
  }

  /**
   * Validate action with arbiter and execute
   */
  private async validateAndExecuteAction(action: Action): Promise<ActionResult> {
    const actionDef = this.config.actions.find((a) => a.id === action.type);

    if (!actionDef) {
      return { success: false, stateChanges: [], message: `Unknown action: ${action.type}` };
    }

    // Use arbiter for validation and effect resolution
    if (this.arbiter) {
      const context: ArbiterContext = {
        state: serializeGameState(this.state).formatted,
        rules: this.getFormattedRules(),
        validActions: [],
        prompt: '',
        proposedAction: action,
        validationRequest: `
Validate and execute this action:
Action: ${action.type}
Player: ${action.playerId}
Params: ${JSON.stringify(action.params)}

Action definition:
- Valid when: ${actionDef.validWhen}
- Effect: ${actionDef.effect}

Respond with:
1. Is this action valid? (yes/no)
2. If valid, what state changes should occur? List them precisely.
3. Brief reasoning.
`,
      };

      try {
        const result = await this.arbiter.decideAction(context);
        this.metrics.arbiterInterventions = (this.metrics.arbiterInterventions || 0) + 1;

        // Parse arbiter response into ActionResult
        return this.parseArbiterResult(result);
      } catch (error) {
        return {
          success: false,
          stateChanges: [],
          message: `Arbiter error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }

    // Fallback: execute without arbiter (limited)
    return this.executeActionDirect(action, actionDef);
  }

  private parseArbiterResult(decision: AgentDecision): ActionResult {
    // The arbiter returns structured data in params
    const valid = decision.params.valid === true || decision.params.valid === 'yes';

    return {
      success: valid,
      stateChanges: (decision.params.stateChanges as ActionResult['stateChanges']) || [],
      message: decision.params.message as string | undefined,
      arbiterReasoning: decision.reasoning,
    };
  }

  private executeActionDirect(action: Action, actionDef: { effect: string }): ActionResult {
    // Very basic direct execution for simple effects
    // Most games should use an arbiter for proper interpretation
    return {
      success: true,
      stateChanges: [],
      message: 'Executed directly (no arbiter)',
    };
  }

  /**
   * Check win conditions
   */
  private async checkWinConditions(): Promise<{ playerId: PlayerId | 'draw'; reason: string } | null> {
    for (const wc of this.config.winConditions) {
      // Simple condition checking
      for (const [playerId, player] of this.state.players) {
        if (this.evaluateWinCondition(wc.condition, playerId)) {
          return { playerId, reason: wc.condition };
        }
      }
    }
    return null;
  }

  private evaluateWinCondition(condition: string, playerId: PlayerId): boolean {
    const player = this.state.players.get(playerId);
    const opponent = Array.from(this.state.players.values()).find((p) => p.id !== playerId);
    if (!player || !opponent) return false;

    // Common win condition patterns
    if (condition.includes('opponent.life <= 0') || condition.includes('opponent.health <= 0')) {
      return (opponent.resources.life || opponent.resources.health || 20) <= 0;
    }

    if (condition.includes('deck.empty') && condition.includes('hand.empty')) {
      const deck = this.state.zones.get(`${playerId}:deck`);
      const hand = this.state.zones.get(`${playerId}:hand`);
      if (deck?.cards.length === 0 && hand?.cards.length === 0) {
        // Check if this is a loss condition for opponent
        if (condition.includes('opponent')) {
          const oppDeck = this.state.zones.get(`${opponent.id}:deck`);
          const oppHand = this.state.zones.get(`${opponent.id}:hand`);
          return oppDeck?.cards.length === 0 && oppHand?.cards.length === 0;
        }
      }
    }

    return false;
  }

  /**
   * Advance to next turn
   */
  private advanceTurn(): void {
    const playerIds = Array.from(this.state.players.keys());
    const currentIndex = playerIds.indexOf(this.state.activePlayer);
    const nextIndex = (currentIndex + 1) % playerIds.length;

    // Only increment turn counter when we cycle back to first player
    const newTurn = nextIndex === 0 ? this.state.currentTurn + 1 : this.state.currentTurn;

    this.state = {
      ...this.state,
      currentTurn: newTurn,
      activePlayer: playerIds[nextIndex],
      currentPhase: this.config.turnStructure.phases[0],
    };

    this.metrics.turnCount = newTurn;
    this.emit('game_event', this.createEvent('turn_end', { turn: this.state.currentTurn - 1 }));
    this.emit('game_event', this.createEvent('turn_start', { turn: newTurn }));
  }

  /**
   * End the game
   */
  private endGame(winner: PlayerId | 'draw', reason: string): void {
    this.state = {
      ...this.state,
      status: 'finished',
      winner,
      endReason: reason,
    };

    this.metrics.actionCount = this.actionCount;
    this.metrics.actionsPerTurn = this.turnActionCounts;

    this.emit('game_event', this.createEvent('game_end', { winner, reason }));
  }

  /**
   * Get recent action history as string
   */
  private getRecentHistory(count: number): string {
    const recent = this.state.history.slice(-count);
    return recent
      .map((a) => `${a.playerId}: ${a.type}${a.result?.success ? '' : ' (failed)'}`)
      .join('\n');
  }

  /**
   * Create a game event
   */
  private createEvent(type: GameEventType, data: Record<string, unknown>): GameEvent {
    return {
      type,
      timestamp: Date.now(),
      gameId: this.state.id,
      data,
    };
  }

  /**
   * Get collected metrics
   */
  getMetrics(): GameMetrics {
    return {
      ...this.metrics,
      duration: Date.now() - (this.metrics.gameId ? 0 : Date.now()),
    } as GameMetrics;
  }

  /**
   * Run complete game
   */
  async runGame(): Promise<GameState> {
    await this.runSetup();

    while (this.state.status === 'playing') {
      const continueGame = await this.runTurn();
      if (!continueGame) break;
    }

    return this.state;
  }
}

export { createGameState, serializeGameState };
