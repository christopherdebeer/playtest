/**
 * Exploration Engine - Run parameter sweeps to explore game design space
 *
 * The explorer can:
 * - Vary game parameters (hand size, resources, etc.)
 * - Run multiple games per configuration
 * - Collect and aggregate metrics
 * - Identify optimal parameter ranges
 */

import { EventEmitter } from 'events';
import type { GameState, GameMetrics, PlayerId } from '../core/types.js';
import type { GameRules } from '../rules/schema.js';
import { applyParameters, getParameterSpace } from '../rules/parser.js';
import { GameOrchestrator, type Agent } from './orchestrator.js';
import { MetaObserver, type GameAnalysis } from '../agents/observer.js';
import type { LLMProvider } from '../agents/base.js';

export interface ExperimentConfig {
  name: string;
  description?: string;
  baseRules: GameRules;
  parameterOverrides?: Record<string, unknown[]>;  // Override parameter ranges
  gamesPerConfig: number;
  playerConfigs: PlayerConfig[];
  metrics: MetricConfig[];
  parallelGames?: number;
}

export interface PlayerConfig {
  id: PlayerId;
  agentType: 'llm' | 'random' | 'scripted';
  style?: 'aggressive' | 'defensive' | 'balanced' | 'random';
  model?: string;
}

export interface MetricConfig {
  id: string;
  type: 'builtin' | 'custom';
  aggregation: 'mean' | 'median' | 'min' | 'max' | 'distribution';
}

export interface ExperimentResult {
  configId: string;
  parameters: Record<string, unknown>;
  games: GameResult[];
  aggregateMetrics: Record<string, number>;
  analysis?: GameAnalysis;
}

export interface GameResult {
  gameId: string;
  winner: PlayerId | 'draw' | undefined;
  turnCount: number;
  duration: number;
  metrics: GameMetrics;
}

export interface ExplorationReport {
  experimentName: string;
  totalConfigs: number;
  totalGames: number;
  results: ExperimentResult[];
  recommendations: Recommendation[];
  summary: ExperimentSummary;
}

export interface Recommendation {
  parameter: string;
  suggestedValue: unknown;
  reason: string;
  confidence: number;
}

export interface ExperimentSummary {
  bestConfig: Record<string, unknown>;
  bestScore: number;
  parameterImpact: Record<string, number>;  // How much each param affects score
  convergenceInfo: string;
}

export class ExplorationEngine extends EventEmitter {
  private llmProvider: LLMProvider;
  private observer?: MetaObserver;

  constructor(llmProvider: LLMProvider) {
    super();
    this.llmProvider = llmProvider;
  }

  /**
   * Run a full experiment
   */
  async runExperiment(config: ExperimentConfig): Promise<ExplorationReport> {
    const paramSpace = this.buildParameterSpace(config);
    const allConfigs = this.generateConfigurations(paramSpace);

    this.emit('experiment_start', { name: config.name, totalConfigs: allConfigs.length });

    const results: ExperimentResult[] = [];
    const parallelism = config.parallelGames || 1;

    for (let i = 0; i < allConfigs.length; i += parallelism) {
      const batch = allConfigs.slice(i, i + parallelism);

      const batchResults = await Promise.all(
        batch.map((params) => this.runConfiguration(config, params, i))
      );

      results.push(...batchResults);

      this.emit('progress', {
        completed: Math.min(i + parallelism, allConfigs.length),
        total: allConfigs.length,
      });
    }

    const report = this.generateReport(config, results);

    this.emit('experiment_complete', { report });

    return report;
  }

  /**
   * Build the parameter space to explore
   */
  private buildParameterSpace(config: ExperimentConfig): Map<string, unknown[]> {
    const space = getParameterSpace(config.baseRules);

    // Apply overrides
    if (config.parameterOverrides) {
      for (const [param, values] of Object.entries(config.parameterOverrides)) {
        space.set(param, values);
      }
    }

    return space;
  }

  /**
   * Generate all parameter configurations (cartesian product)
   */
  private generateConfigurations(space: Map<string, unknown[]>): Record<string, unknown>[] {
    const keys = Array.from(space.keys());
    const values = Array.from(space.values());

    if (keys.length === 0) {
      return [{}];
    }

    const configs: Record<string, unknown>[] = [];

    const generate = (index: number, current: Record<string, unknown>) => {
      if (index === keys.length) {
        configs.push({ ...current });
        return;
      }

      for (const value of values[index]) {
        current[keys[index]] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});
    return configs;
  }

  /**
   * Run games for a single parameter configuration
   */
  private async runConfiguration(
    config: ExperimentConfig,
    params: Record<string, unknown>,
    configIndex: number
  ): Promise<ExperimentResult> {
    const rules = applyParameters(config.baseRules, params);
    const games: GameResult[] = [];

    for (let i = 0; i < config.gamesPerConfig; i++) {
      const result = await this.runSingleGame(rules, config.playerConfigs);
      games.push(result);

      this.emit('game_complete', { configIndex, gameIndex: i, result });
    }

    const aggregateMetrics = this.aggregateMetrics(games, config.metrics);

    return {
      configId: `config_${configIndex}`,
      parameters: params,
      games,
      aggregateMetrics,
    };
  }

  /**
   * Run a single game
   */
  private async runSingleGame(
    rules: GameRules,
    playerConfigs: PlayerConfig[]
  ): Promise<GameResult> {
    const playerIds = playerConfigs.map((p) => p.id);
    const orchestrator = new GameOrchestrator(rules, playerIds);

    // Register agents
    for (const playerConfig of playerConfigs) {
      const agent = this.createAgent(playerConfig);
      orchestrator.registerAgent(agent);
    }

    // Register arbiter
    const { SimpleArbiter } = await import('../agents/arbiter.js');
    orchestrator.registerAgent(new SimpleArbiter({ id: 'arbiter' }));

    const startTime = Date.now();
    const finalState = await orchestrator.runGame();
    const duration = Date.now() - startTime;

    return {
      gameId: finalState.id,
      winner: finalState.winner,
      turnCount: finalState.currentTurn,
      duration,
      metrics: orchestrator.getMetrics(),
    };
  }

  /**
   * Create an agent based on configuration
   */
  private createAgent(config: PlayerConfig): Agent {
    switch (config.agentType) {
      case 'llm': {
        const { PlayerAgent } = require('../agents/player.js');
        return new PlayerAgent(
          { id: config.id, style: config.style, model: config.model },
          this.llmProvider
        );
      }
      case 'random': {
        const { RandomAgent } = require('../agents/player.js');
        return new RandomAgent({ id: config.id });
      }
      case 'scripted': {
        const { ScriptedAgent } = require('../agents/player.js');
        return new ScriptedAgent({ id: config.id }, []);
      }
      default:
        throw new Error(`Unknown agent type: ${config.agentType}`);
    }
  }

  /**
   * Aggregate metrics across games
   */
  private aggregateMetrics(
    games: GameResult[],
    metricConfigs: MetricConfig[]
  ): Record<string, number> {
    const result: Record<string, number> = {};

    // Built-in metrics
    result.winRate_player1 = games.filter((g) => g.winner === games[0]?.metrics.gameId).length / games.length;
    result.avgTurnCount = games.reduce((sum, g) => sum + g.turnCount, 0) / games.length;
    result.avgDuration = games.reduce((sum, g) => sum + g.duration, 0) / games.length;
    result.drawRate = games.filter((g) => g.winner === 'draw').length / games.length;

    // Aggregate per configured metric
    for (const metricConfig of metricConfigs) {
      const values = games.map((g) => g.metrics[metricConfig.id as keyof GameMetrics] as number).filter((v) => v !== undefined);

      if (values.length > 0) {
        switch (metricConfig.aggregation) {
          case 'mean':
            result[metricConfig.id] = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'median':
            const sorted = [...values].sort((a, b) => a - b);
            result[metricConfig.id] = sorted[Math.floor(sorted.length / 2)];
            break;
          case 'min':
            result[metricConfig.id] = Math.min(...values);
            break;
          case 'max':
            result[metricConfig.id] = Math.max(...values);
            break;
        }
      }
    }

    return result;
  }

  /**
   * Generate exploration report with recommendations
   */
  private generateReport(
    config: ExperimentConfig,
    results: ExperimentResult[]
  ): ExplorationReport {
    // Find best configuration (highest composite score)
    const scored = results.map((r) => ({
      result: r,
      score: this.computeCompositeScore(r.aggregateMetrics),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Analyze parameter impact
    const parameterImpact = this.analyzeParameterImpact(results);

    // Generate recommendations
    const recommendations = this.generateRecommendations(results, parameterImpact);

    return {
      experimentName: config.name,
      totalConfigs: results.length,
      totalGames: results.length * config.gamesPerConfig,
      results,
      recommendations,
      summary: {
        bestConfig: best.result.parameters,
        bestScore: best.score,
        parameterImpact,
        convergenceInfo: this.analyzeConvergence(scored),
      },
    };
  }

  /**
   * Compute a composite score for a configuration
   */
  private computeCompositeScore(metrics: Record<string, number>): number {
    // Balance multiple factors
    const factors = {
      balance: 1 - Math.abs((metrics.winRate_player1 || 0.5) - 0.5) * 2,  // Closer to 50% is better
      gameLength: Math.min(metrics.avgTurnCount || 10, 20) / 20,  // Prefer games ~20 turns
      lowDrawRate: 1 - (metrics.drawRate || 0),  // Prefer decisive games
    };

    return (
      factors.balance * 0.4 +
      factors.gameLength * 0.3 +
      factors.lowDrawRate * 0.3
    );
  }

  /**
   * Analyze how each parameter affects outcomes
   */
  private analyzeParameterImpact(results: ExperimentResult[]): Record<string, number> {
    const impact: Record<string, number> = {};
    const parameters = new Set<string>();

    for (const result of results) {
      for (const param of Object.keys(result.parameters)) {
        parameters.add(param);
      }
    }

    for (const param of parameters) {
      // Group results by parameter value
      const groups = new Map<unknown, number[]>();

      for (const result of results) {
        const value = result.parameters[param];
        const score = this.computeCompositeScore(result.aggregateMetrics);

        if (!groups.has(value)) {
          groups.set(value, []);
        }
        groups.get(value)!.push(score);
      }

      // Compute variance across groups
      const groupMeans = Array.from(groups.values()).map(
        (scores) => scores.reduce((a, b) => a + b, 0) / scores.length
      );

      if (groupMeans.length > 1) {
        const overallMean = groupMeans.reduce((a, b) => a + b, 0) / groupMeans.length;
        const variance = groupMeans.reduce((sum, m) => sum + Math.pow(m - overallMean, 2), 0) / groupMeans.length;
        impact[param] = Math.sqrt(variance);
      }
    }

    return impact;
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(
    results: ExperimentResult[],
    impact: Record<string, number>
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Sort parameters by impact
    const sortedParams = Object.entries(impact)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);  // Top 5 most impactful

    for (const [param, impactValue] of sortedParams) {
      // Find the value that produces highest scores
      const valueScores = new Map<unknown, number[]>();

      for (const result of results) {
        const value = result.parameters[param];
        const score = this.computeCompositeScore(result.aggregateMetrics);

        if (!valueScores.has(value)) {
          valueScores.set(value, []);
        }
        valueScores.get(value)!.push(score);
      }

      let bestValue: unknown;
      let bestAvg = -Infinity;

      for (const [value, scores] of valueScores) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestValue = value;
        }
      }

      recommendations.push({
        parameter: param,
        suggestedValue: bestValue,
        reason: `This value produces the highest average game quality score`,
        confidence: Math.min(impactValue * 10, 1),  // Scale impact to 0-1
      });
    }

    return recommendations;
  }

  /**
   * Analyze convergence of the exploration
   */
  private analyzeConvergence(scored: { result: ExperimentResult; score: number }[]): string {
    if (scored.length < 2) {
      return 'Insufficient data for convergence analysis';
    }

    const topScores = scored.slice(0, Math.min(5, scored.length)).map((s) => s.score);
    const variance = this.computeVariance(topScores);

    if (variance < 0.01) {
      return 'Strong convergence - top configurations have similar scores';
    } else if (variance < 0.05) {
      return 'Moderate convergence - some variation in top configurations';
    } else {
      return 'Low convergence - significant variation suggests more exploration needed';
    }
  }

  private computeVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }
}

/**
 * Quick explore function for simple parameter sweeps
 */
export async function quickExplore(
  rules: GameRules,
  llmProvider: LLMProvider,
  options: {
    gamesPerConfig?: number;
    parameterOverrides?: Record<string, unknown[]>;
  } = {}
): Promise<ExplorationReport> {
  const engine = new ExplorationEngine(llmProvider);

  return engine.runExperiment({
    name: 'Quick Exploration',
    baseRules: rules,
    gamesPerConfig: options.gamesPerConfig || 5,
    parameterOverrides: options.parameterOverrides,
    playerConfigs: [
      { id: 'player1', agentType: 'random' },
      { id: 'player2', agentType: 'random' },
    ],
    metrics: [
      { id: 'turnCount', type: 'builtin', aggregation: 'mean' },
      { id: 'actionCount', type: 'builtin', aggregation: 'mean' },
    ],
  });
}
