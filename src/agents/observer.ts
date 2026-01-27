/**
 * Meta-Observer Agent - Analyzes games for quality and balance
 *
 * The Observer tracks:
 * - Game flow and pacing
 * - Balance issues
 * - Rule ambiguities
 * - Strategic depth
 * - Degenerate patterns
 */

import { BaseAgent, type AgentConfig, type LLMProvider } from './base.js';
import type { AgentContext, AgentDecision } from '../engine/orchestrator.js';
import type { GameState, GameMetrics, GameEvent } from '../core/types.js';
import { serializeGameState } from '../core/game-state.js';

export interface GameAnalysis {
  overallScore: number;  // 0-100
  balance: BalanceAnalysis;
  pacing: PacingAnalysis;
  depth: DepthAnalysis;
  issues: GameIssue[];
  suggestions: string[];
}

export interface BalanceAnalysis {
  score: number;
  firstPlayerAdvantage: number;  // -1 to 1, 0 is balanced
  resourceBalance: string;
  cardBalance: Record<string, 'overpowered' | 'balanced' | 'underpowered'>;
}

export interface PacingAnalysis {
  score: number;
  averageTurnLength: number;
  actionDensity: number;
  deadTurns: number;  // Turns with no meaningful action
  comebackFrequency: number;
}

export interface DepthAnalysis {
  score: number;
  decisionComplexity: number;
  strategyDiversity: number;
  skillExpression: number;  // Does better play lead to wins?
}

export interface GameIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'balance' | 'rules' | 'pacing' | 'gameplay';
  description: string;
  suggestedFix?: string;
}

const OBSERVER_SYSTEM_PROMPT = `You are a game design analyst. Your role is to evaluate card games and provide constructive feedback.

Analyze games for:
1. **Balance**: Is one player/strategy dominant? Are resources fair?
2. **Pacing**: Does the game flow well? Are there dead turns or runaway victories?
3. **Depth**: Are there meaningful decisions? Can skill differentiate players?
4. **Clarity**: Are rules clear and consistent?
5. **Fun factors**: What makes this game engaging or frustrating?

Provide specific, actionable feedback for improving the game design.

Response Format:
{
  "overallScore": 0-100,
  "balance": {
    "score": 0-100,
    "firstPlayerAdvantage": -1 to 1,
    "resourceBalance": "analysis...",
    "cardBalance": { "CardName": "overpowered|balanced|underpowered" }
  },
  "pacing": {
    "score": 0-100,
    "analysis": "..."
  },
  "depth": {
    "score": 0-100,
    "analysis": "..."
  },
  "issues": [
    { "severity": "high", "type": "balance", "description": "...", "suggestedFix": "..." }
  ],
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;

export class MetaObserver extends BaseAgent {
  private observations: GameEvent[] = [];
  private gameStates: { turn: number; state: string }[] = [];

  constructor(config: AgentConfig, llm: LLMProvider) {
    super(config, llm, 'observer');
  }

  /**
   * Record a game event for later analysis
   */
  recordEvent(event: GameEvent): void {
    this.observations.push(event);
  }

  /**
   * Record a game state snapshot
   */
  recordState(turn: number, state: GameState): void {
    this.gameStates.push({
      turn,
      state: serializeGameState(state).formatted,
    });
  }

  /**
   * Analyze a completed game
   */
  async analyzeGame(
    finalState: GameState,
    metrics: GameMetrics,
    rules: string
  ): Promise<GameAnalysis> {
    const context: AgentContext = {
      state: serializeGameState(finalState).formatted,
      rules,
      validActions: [],
      prompt: this.buildAnalysisPrompt(finalState, metrics),
    };

    const decision = await this.decideAction(context);
    return this.parseAnalysis(decision);
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    const response = await this.llm.complete(context.prompt, OBSERVER_SYSTEM_PROMPT);
    return this.parseObserverResponse(response);
  }

  private buildAnalysisPrompt(state: GameState, metrics: GameMetrics): string {
    const stateSnapshots = this.gameStates
      .filter((_, i) => i % 3 === 0)  // Sample every 3rd state
      .map((s) => `Turn ${s.turn}:\n${s.state}`)
      .join('\n\n');

    return `
## Game Analysis Request

Analyze this completed game for quality and balance.

### Final State
${serializeGameState(state).formatted}

### Game Metrics
- Duration: ${metrics.duration}ms
- Turns: ${metrics.turnCount}
- Total Actions: ${metrics.actionCount}
- Actions per turn: ${metrics.actionsPerTurn.join(', ')}
- Arbiter interventions: ${metrics.arbiterInterventions}
- Winner: ${state.winner}
- End reason: ${state.endReason}

### Card Usage
${Object.entries(metrics.cardUsage || {})
  .sort(([, a], [, b]) => (b as number) - (a as number))
  .map(([card, count]) => `- ${card}: ${count}`)
  .join('\n') || 'No card usage recorded'}

### Key Game States
${stateSnapshots}

### Events Summary
- Game start to end: ${this.observations.length} events
- Action proposals: ${this.observations.filter((e) => e.type === 'action_proposed').length}
- Rejected actions: ${this.observations.filter((e) => e.type === 'action_rejected').length}

Provide a comprehensive analysis of this game's design quality.
`;
  }

  private parseObserverResponse(response: string): AgentDecision {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          actionType: 'analysis',
          params: parsed,
          reasoning: response,
        };
      }
    } catch {
      // Fall through
    }

    // Return a basic structure if parsing fails
    return {
      actionType: 'analysis',
      params: {
        overallScore: 50,
        issues: [{ severity: 'low', type: 'rules', description: 'Could not parse full analysis' }],
        suggestions: [],
        rawAnalysis: response,
      },
      reasoning: response,
    };
  }

  private parseAnalysis(decision: AgentDecision): GameAnalysis {
    const params = decision.params as Record<string, unknown>;

    return {
      overallScore: (params.overallScore as number) || 50,
      balance: (params.balance as BalanceAnalysis) || {
        score: 50,
        firstPlayerAdvantage: 0,
        resourceBalance: 'Unknown',
        cardBalance: {},
      },
      pacing: (params.pacing as PacingAnalysis) || {
        score: 50,
        averageTurnLength: 0,
        actionDensity: 0,
        deadTurns: 0,
        comebackFrequency: 0,
      },
      depth: (params.depth as DepthAnalysis) || {
        score: 50,
        decisionComplexity: 0,
        strategyDiversity: 0,
        skillExpression: 0,
      },
      issues: (params.issues as GameIssue[]) || [],
      suggestions: (params.suggestions as string[]) || [],
    };
  }

  /**
   * Clear recorded data for new game
   */
  reset(): void {
    this.observations = [];
    this.gameStates = [];
  }

  /**
   * Aggregate analysis across multiple games
   */
  static aggregateAnalyses(analyses: GameAnalysis[]): GameAnalysis {
    if (analyses.length === 0) {
      throw new Error('No analyses to aggregate');
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      overallScore: avg(analyses.map((a) => a.overallScore)),
      balance: {
        score: avg(analyses.map((a) => a.balance.score)),
        firstPlayerAdvantage: avg(analyses.map((a) => a.balance.firstPlayerAdvantage)),
        resourceBalance: 'Aggregated',
        cardBalance: analyses[0].balance.cardBalance,  // Take first for now
      },
      pacing: {
        score: avg(analyses.map((a) => a.pacing.score)),
        averageTurnLength: avg(analyses.map((a) => a.pacing.averageTurnLength)),
        actionDensity: avg(analyses.map((a) => a.pacing.actionDensity)),
        deadTurns: avg(analyses.map((a) => a.pacing.deadTurns)),
        comebackFrequency: avg(analyses.map((a) => a.pacing.comebackFrequency)),
      },
      depth: {
        score: avg(analyses.map((a) => a.depth.score)),
        decisionComplexity: avg(analyses.map((a) => a.depth.decisionComplexity)),
        strategyDiversity: avg(analyses.map((a) => a.depth.strategyDiversity)),
        skillExpression: avg(analyses.map((a) => a.depth.skillExpression)),
      },
      issues: analyses.flatMap((a) => a.issues),
      suggestions: [...new Set(analyses.flatMap((a) => a.suggestions))],
    };
  }
}
