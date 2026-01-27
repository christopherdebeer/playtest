/**
 * Base agent interface and common utilities
 */

import type { Agent, AgentContext, AgentDecision } from '../engine/orchestrator.js';

export interface LLMProvider {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface AgentConfig {
  id: string;
  name?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  style?: 'aggressive' | 'defensive' | 'balanced' | 'random';
}

/**
 * Parse LLM response into structured decision
 */
export function parseDecision(response: string, validActions: string[]): AgentDecision {
  // Try to extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        actionType: parsed.action || parsed.actionType || 'pass',
        params: parsed.params || parsed.parameters || {},
        reasoning: parsed.reasoning || parsed.reason,
      };
    } catch {
      // Fall through to text parsing
    }
  }

  // Try to parse as plain JSON
  try {
    const parsed = JSON.parse(response);
    return {
      actionType: parsed.action || parsed.actionType || 'pass',
      params: parsed.params || parsed.parameters || {},
      reasoning: parsed.reasoning,
    };
  } catch {
    // Fall through to text parsing
  }

  // Text-based parsing
  const lines = response.split('\n');
  let actionType = 'pass';
  const params: Record<string, unknown> = {};
  let reasoning = '';

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Look for action keywords
    for (const action of validActions) {
      if (lowerLine.includes(action.toLowerCase())) {
        actionType = action;
        break;
      }
    }

    // Look for card references
    const cardMatch = line.match(/card[:\s]+["']?([^"'\n]+)["']?/i);
    if (cardMatch) {
      params.cardName = cardMatch[1].trim();
    }

    // Look for target references
    const targetMatch = line.match(/target[:\s]+["']?([^"'\n]+)["']?/i);
    if (targetMatch) {
      params.target = targetMatch[1].trim();
    }

    // Collect reasoning
    if (lowerLine.includes('reason') || lowerLine.includes('because')) {
      reasoning += line + ' ';
    }
  }

  return { actionType, params, reasoning: reasoning.trim() };
}

/**
 * Build a prompt for the agent
 */
export function buildPrompt(context: AgentContext, agentType: string, config?: AgentConfig): string {
  const style = config?.style || 'balanced';
  const styleGuide = getStyleGuide(style);

  return `
${context.rules}

---

## Current Game State

${context.state}

---

## Your Role

You are playing as a ${agentType}. ${styleGuide}

## Valid Actions

${context.validActions.map((a) => `- ${a}`).join('\n')}

## Recent History

${context.history || 'No actions yet.'}

---

## Your Task

${context.prompt}

Respond with your chosen action in this JSON format:
\`\`\`json
{
  "action": "<action_type>",
  "params": {
    "card": "<card_name_if_applicable>",
    "target": "<target_if_applicable>"
  },
  "reasoning": "<brief explanation>"
}
\`\`\`
`;
}

function getStyleGuide(style: string): string {
  switch (style) {
    case 'aggressive':
      return 'Play aggressively. Prioritize dealing damage and creating pressure. Take calculated risks.';
    case 'defensive':
      return 'Play defensively. Prioritize protecting your resources and building a strong position. Be patient.';
    case 'random':
      return 'Make unpredictable choices. Vary your strategy to test edge cases.';
    default:
      return 'Play a balanced game. Consider both offense and defense, adapting to the situation.';
  }
}

/**
 * Abstract base for LLM-powered agents
 */
export abstract class BaseAgent implements Agent {
  id: string;
  type: 'player' | 'arbiter' | 'observer';
  protected config: AgentConfig;
  protected llm: LLMProvider;

  constructor(config: AgentConfig, llm: LLMProvider, type: 'player' | 'arbiter' | 'observer') {
    this.id = config.id;
    this.type = type;
    this.config = config;
    this.llm = llm;
  }

  abstract decideAction(context: AgentContext): Promise<AgentDecision>;
}
