/**
 * Player Agent - LLM-powered game player
 */

import { BaseAgent, buildPrompt, parseDecision, type AgentConfig, type LLMProvider } from './base.js';
import type { AgentContext, AgentDecision } from '../engine/orchestrator.js';

const PLAYER_SYSTEM_PROMPT = `You are an AI playing a card game. Your goal is to win by making optimal decisions.

Guidelines:
1. Analyze the game state carefully before each decision
2. Consider both immediate and long-term consequences
3. Track resources and card advantage
4. Anticipate opponent's possible responses
5. Be precise in your action format

Always respond with valid JSON containing your action choice.`;

export class PlayerAgent extends BaseAgent {
  constructor(config: AgentConfig, llm: LLMProvider) {
    super(config, llm, 'player');
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    const prompt = buildPrompt(context, 'player', this.config);
    const systemPrompt = this.config.systemPrompt || PLAYER_SYSTEM_PROMPT;

    const response = await this.llm.complete(prompt, systemPrompt);
    return parseDecision(response, context.validActions);
  }
}

/**
 * Random agent for testing - doesn't require LLM
 */
export class RandomAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config, { complete: async () => '' }, 'player');
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    // Filter out 'pass' for more interesting games (unless it's the only option)
    const actions = context.validActions.filter((a) => a !== 'pass');
    const availableActions = actions.length > 0 ? actions : context.validActions;

    const actionType = availableActions[Math.floor(Math.random() * availableActions.length)];

    return {
      actionType,
      params: {},
      reasoning: 'Random selection',
    };
  }
}

/**
 * Scripted agent for testing specific sequences
 */
export class ScriptedAgent extends BaseAgent {
  private script: AgentDecision[];
  private index: number = 0;

  constructor(config: AgentConfig, script: AgentDecision[]) {
    super(config, { complete: async () => '' }, 'player');
    this.script = script;
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    if (this.index < this.script.length) {
      return this.script[this.index++];
    }
    return { actionType: 'pass', params: {}, reasoning: 'Script exhausted' };
  }

  reset(): void {
    this.index = 0;
  }
}
