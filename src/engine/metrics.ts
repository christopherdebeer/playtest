/**
 * Metrics collection and analysis system
 *
 * Tracks game quality indicators:
 * - Balance metrics
 * - Pacing metrics
 * - Depth metrics
 * - Engagement proxies
 */

import type { GameState, GameMetrics, PlayerId, Action } from '../core/types.js';

export interface DetailedMetrics extends GameMetrics {
  // Balance metrics
  firstPlayerWinRate: number;
  resourceParity: number;  // How equal resources stay
  leadChanges: number;

  // Pacing metrics
  averageActionsPerTurn: number;
  turnsWithNoAction: number;
  gameProgressionCurve: number[];  // Resource/position over time

  // Depth metrics
  meaningfulChoices: number;
  branchingFactor: number[];  // Valid actions per decision point
  strategicVariety: number;

  // Engagement proxies
  comebackFrequency: number;
  closeFinishes: number;  // Games decided by small margins
  interactionDensity: number;  // How often players affect each other
}

/**
 * Metrics collector - attaches to game events
 */
export class MetricsCollector {
  private metrics: Partial<DetailedMetrics>;
  private turnData: TurnData[] = [];
  private resourceHistory: Map<PlayerId, number[]> = new Map();
  private leadHistory: PlayerId[] = [];

  constructor(gameId: string) {
    this.metrics = {
      gameId,
      turnCount: 0,
      actionCount: 0,
      actionsPerTurn: [],
      decisionsPerPlayer: {},
      arbiterInterventions: 0,
      cardUsage: {},
      leadChanges: 0,
    };
  }

  /**
   * Record turn start
   */
  recordTurnStart(turnNumber: number, activePlayer: PlayerId): void {
    this.turnData.push({
      turnNumber,
      player: activePlayer,
      actions: [],
      validActionCounts: [],
    });
    this.metrics.turnCount = turnNumber;
  }

  /**
   * Record an action taken
   */
  recordAction(action: Action, validActionsCount: number): void {
    const currentTurn = this.turnData[this.turnData.length - 1];
    if (currentTurn) {
      currentTurn.actions.push(action);
      currentTurn.validActionCounts.push(validActionsCount);
    }

    this.metrics.actionCount = (this.metrics.actionCount || 0) + 1;
    this.metrics.decisionsPerPlayer![action.playerId] =
      (this.metrics.decisionsPerPlayer![action.playerId] || 0) + 1;

    // Track card usage
    if (action.params.card) {
      const cardName = typeof action.params.card === 'string'
        ? action.params.card
        : (action.params.card as { name: string }).name;
      this.metrics.cardUsage![cardName] = (this.metrics.cardUsage![cardName] || 0) + 1;
    }
  }

  /**
   * Record resource state
   */
  recordResources(resources: Map<PlayerId, Record<string, number>>): void {
    for (const [playerId, res] of resources) {
      if (!this.resourceHistory.has(playerId)) {
        this.resourceHistory.set(playerId, []);
      }
      // Sum all resources as a simple measure
      const total = Object.values(res).reduce((a, b) => a + b, 0);
      this.resourceHistory.get(playerId)!.push(total);
    }

    // Track lead changes
    const players = Array.from(resources.keys());
    if (players.length >= 2) {
      const totals = players.map((p) => ({
        player: p,
        total: Object.values(resources.get(p) || {}).reduce((a, b) => a + b, 0),
      }));
      totals.sort((a, b) => b.total - a.total);

      const currentLeader = totals[0].player;
      const lastLeader = this.leadHistory[this.leadHistory.length - 1];

      if (lastLeader && lastLeader !== currentLeader) {
        this.metrics.leadChanges = (this.metrics.leadChanges || 0) + 1;
      }

      this.leadHistory.push(currentLeader);
    }
  }

  /**
   * Record arbiter intervention
   */
  recordArbiterIntervention(): void {
    this.metrics.arbiterInterventions = (this.metrics.arbiterInterventions || 0) + 1;
  }

  /**
   * Record turn end
   */
  recordTurnEnd(): void {
    const currentTurn = this.turnData[this.turnData.length - 1];
    if (currentTurn) {
      this.metrics.actionsPerTurn!.push(currentTurn.actions.length);
    }
  }

  /**
   * Finalize and compute derived metrics
   */
  finalize(finalState: GameState, duration: number): DetailedMetrics {
    this.metrics.duration = duration;

    // Compute averages
    const totalActions = this.metrics.actionsPerTurn!.reduce((a, b) => a + b, 0);
    const avgActionsPerTurn = this.metrics.turnCount! > 0
      ? totalActions / this.metrics.turnCount!
      : 0;

    // Compute branching factor
    const branchingFactor = this.turnData.flatMap((t) => t.validActionCounts);

    // Compute resource parity (how equal resources stayed)
    let resourceParity = 1;
    const playerIds = Array.from(this.resourceHistory.keys());
    if (playerIds.length >= 2) {
      const diffs: number[] = [];
      const history1 = this.resourceHistory.get(playerIds[0]) || [];
      const history2 = this.resourceHistory.get(playerIds[1]) || [];
      const minLen = Math.min(history1.length, history2.length);

      for (let i = 0; i < minLen; i++) {
        const total = history1[i] + history2[i];
        if (total > 0) {
          diffs.push(Math.abs(history1[i] - history2[i]) / total);
        }
      }

      if (diffs.length > 0) {
        resourceParity = 1 - (diffs.reduce((a, b) => a + b, 0) / diffs.length);
      }
    }

    // Turns with no action
    const turnsWithNoAction = this.metrics.actionsPerTurn!.filter((a) => a === 0).length;

    // Meaningful choices (turns with >1 valid action where player made a choice)
    const meaningfulChoices = this.turnData.reduce((sum, turn) => {
      const hadChoice = turn.validActionCounts.some((c) => c > 1);
      return sum + (hadChoice ? 1 : 0);
    }, 0);

    return {
      ...this.metrics as GameMetrics,
      firstPlayerWinRate: 0,  // Would need multiple games
      resourceParity,
      leadChanges: this.metrics.leadChanges || 0,
      averageActionsPerTurn: avgActionsPerTurn,
      turnsWithNoAction,
      gameProgressionCurve: this.resourceHistory.get(playerIds[0]) || [],
      meaningfulChoices,
      branchingFactor,
      strategicVariety: this.computeStrategicVariety(),
      comebackFrequency: 0,  // Would need multiple games
      closeFinishes: this.isCloseFinish(finalState) ? 1 : 0,
      interactionDensity: this.computeInteractionDensity(),
    };
  }

  private computeStrategicVariety(): number {
    // Measure how varied the action types were
    const actionTypes = new Set<string>();
    for (const turn of this.turnData) {
      for (const action of turn.actions) {
        actionTypes.add(action.type);
      }
    }
    return actionTypes.size;
  }

  private isCloseFinish(state: GameState): boolean {
    // Check if the final resource difference was small
    const players = Array.from(state.players.values());
    if (players.length < 2) return false;

    const resources1 = Object.values(players[0].resources).reduce((a, b) => a + b, 0);
    const resources2 = Object.values(players[1].resources).reduce((a, b) => a + b, 0);
    const total = resources1 + resources2;

    if (total === 0) return true;
    return Math.abs(resources1 - resources2) / total < 0.2;  // Within 20%
  }

  private computeInteractionDensity(): number {
    // Count actions that affected the opponent
    let interactions = 0;
    for (const turn of this.turnData) {
      for (const action of turn.actions) {
        if (action.type.includes('attack') ||
            action.type.includes('target') ||
            action.params.target) {
          interactions++;
        }
      }
    }
    return this.metrics.actionCount! > 0 ? interactions / this.metrics.actionCount! : 0;
  }
}

interface TurnData {
  turnNumber: number;
  player: PlayerId;
  actions: Action[];
  validActionCounts: number[];
}

/**
 * Aggregate metrics across multiple games
 */
export function aggregateMetrics(metrics: DetailedMetrics[]): AggregatedMetrics {
  if (metrics.length === 0) {
    throw new Error('No metrics to aggregate');
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const firstPlayerWins = metrics.filter((m) => m.firstPlayerWinRate > 0.5).length;

  return {
    gameCount: metrics.length,

    // Turn/action stats
    avgTurnCount: avg(metrics.map((m) => m.turnCount)),
    medianTurnCount: median(metrics.map((m) => m.turnCount)),
    avgActionsPerTurn: avg(metrics.map((m) => m.averageActionsPerTurn)),

    // Balance
    firstPlayerWinRate: firstPlayerWins / metrics.length,
    avgResourceParity: avg(metrics.map((m) => m.resourceParity)),
    avgLeadChanges: avg(metrics.map((m) => m.leadChanges)),

    // Depth
    avgMeaningfulChoices: avg(metrics.map((m) => m.meaningfulChoices)),
    avgBranchingFactor: avg(metrics.flatMap((m) => m.branchingFactor)),
    avgStrategicVariety: avg(metrics.map((m) => m.strategicVariety)),

    // Engagement
    closeFinishRate: avg(metrics.map((m) => m.closeFinishes)),
    avgInteractionDensity: avg(metrics.map((m) => m.interactionDensity)),

    // Arbiter
    avgArbiterInterventions: avg(metrics.map((m) => m.arbiterInterventions)),
  };
}

export interface AggregatedMetrics {
  gameCount: number;

  avgTurnCount: number;
  medianTurnCount: number;
  avgActionsPerTurn: number;

  firstPlayerWinRate: number;
  avgResourceParity: number;
  avgLeadChanges: number;

  avgMeaningfulChoices: number;
  avgBranchingFactor: number;
  avgStrategicVariety: number;

  closeFinishRate: number;
  avgInteractionDensity: number;

  avgArbiterInterventions: number;
}

/**
 * Format metrics as readable report
 */
export function formatMetricsReport(metrics: AggregatedMetrics): string {
  const lines: string[] = [];

  lines.push('# Game Metrics Report');
  lines.push('');
  lines.push(`Games analyzed: ${metrics.gameCount}`);
  lines.push('');

  lines.push('## Game Length');
  lines.push(`- Average turns: ${metrics.avgTurnCount.toFixed(1)}`);
  lines.push(`- Median turns: ${metrics.medianTurnCount}`);
  lines.push(`- Actions per turn: ${metrics.avgActionsPerTurn.toFixed(2)}`);
  lines.push('');

  lines.push('## Balance');
  lines.push(`- First player win rate: ${(metrics.firstPlayerWinRate * 100).toFixed(1)}%`);
  lines.push(`- Resource parity: ${(metrics.avgResourceParity * 100).toFixed(1)}%`);
  lines.push(`- Lead changes per game: ${metrics.avgLeadChanges.toFixed(1)}`);
  lines.push('');

  lines.push('## Strategic Depth');
  lines.push(`- Meaningful choices per game: ${metrics.avgMeaningfulChoices.toFixed(1)}`);
  lines.push(`- Average branching factor: ${metrics.avgBranchingFactor.toFixed(1)}`);
  lines.push(`- Strategic variety: ${metrics.avgStrategicVariety.toFixed(1)} action types used`);
  lines.push('');

  lines.push('## Engagement Indicators');
  lines.push(`- Close finish rate: ${(metrics.closeFinishRate * 100).toFixed(1)}%`);
  lines.push(`- Interaction density: ${(metrics.avgInteractionDensity * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('## Rule Clarity');
  lines.push(`- Arbiter interventions per game: ${metrics.avgArbiterInterventions.toFixed(1)}`);

  return lines.join('\n');
}
