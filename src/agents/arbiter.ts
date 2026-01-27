/**
 * Arbiter Agent - LLM-powered rule interpreter and action validator
 *
 * The Arbiter is responsible for:
 * - Validating proposed actions against game rules
 * - Interpreting natural language effects
 * - Resolving ambiguous situations consistently
 * - Flagging rule contradictions or gaps
 */

import { BaseAgent, type AgentConfig, type LLMProvider } from './base.js';
import type { AgentContext, AgentDecision, ArbiterContext } from '../engine/orchestrator.js';
import type { StateChange } from '../core/types.js';

const ARBITER_SYSTEM_PROMPT = `You are an impartial game arbiter. Your role is to:

1. Validate actions against the game rules
2. Interpret card effects and resolve ambiguities
3. Determine precise state changes when actions are executed
4. Be consistent in your rulings across similar situations
5. Flag any rule contradictions or unclear situations

Guidelines:
- Be strict but fair in rule interpretation
- When rules are ambiguous, choose the interpretation that maintains game balance
- Always explain your reasoning
- Produce deterministic state changes

Response Format:
Always respond with valid JSON:
{
  "valid": true/false,
  "stateChanges": [
    { "type": "move_card", "details": { "cardId": "...", "fromZone": "...", "toZone": "..." } },
    { "type": "modify_resource", "details": { "playerId": "...", "resource": "...", "delta": N } }
  ],
  "message": "explanation",
  "reasoning": "detailed reasoning"
}

State change types:
- move_card: { cardId, fromZone, toZone, position? }
- modify_resource: { playerId, resource, delta? OR absolute? }
- modify_property: { target, targetType: player|card|global, property, value }
- create_card: { card: {...}, zone }
- destroy_card: { cardId, fromZone }
`;

export class ArbiterAgent extends BaseAgent {
  private rulingHistory: Map<string, AgentDecision> = new Map();

  constructor(config: AgentConfig, llm: LLMProvider) {
    super(config, llm, 'arbiter');
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    // Check if this is an arbiter-specific context
    const arbiterContext = context as ArbiterContext;

    if (arbiterContext.validationRequest) {
      return this.validateAction(arbiterContext);
    }

    // Generic interpretation request
    return this.interpretRequest(context);
  }

  private async validateAction(context: ArbiterContext): Promise<AgentDecision> {
    // Check for cached similar rulings for consistency
    const cacheKey = this.generateCacheKey(context);
    const cached = this.rulingHistory.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `
${context.rules}

---

## Current Game State

${context.state}

---

## Validation Request

${context.validationRequest}

---

Analyze the proposed action and provide your ruling.
`;

    const response = await this.llm.complete(prompt, ARBITER_SYSTEM_PROMPT);
    const decision = this.parseArbiterResponse(response);

    // Cache the ruling for consistency
    this.rulingHistory.set(cacheKey, decision);

    return decision;
  }

  private async interpretRequest(context: AgentContext): Promise<AgentDecision> {
    const prompt = `
${context.rules}

---

## Current Game State

${context.state}

---

## Request

${context.prompt}

---

Provide your interpretation and any required state changes.
`;

    const response = await this.llm.complete(prompt, ARBITER_SYSTEM_PROMPT);
    return this.parseArbiterResponse(response);
  }

  private parseArbiterResponse(response: string): AgentDecision {
    // Try to extract JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                     response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        return {
          actionType: 'arbiter_ruling',
          params: {
            valid: parsed.valid ?? true,
            stateChanges: this.normalizeStateChanges(parsed.stateChanges || []),
            message: parsed.message,
          },
          reasoning: parsed.reasoning,
        };
      } catch (error) {
        // Fall through to text parsing
      }
    }

    // Text-based parsing fallback
    const valid = !response.toLowerCase().includes('invalid') &&
                  !response.toLowerCase().includes('not valid') &&
                  !response.toLowerCase().includes('cannot');

    return {
      actionType: 'arbiter_ruling',
      params: {
        valid,
        stateChanges: [],
        message: response.slice(0, 200),
      },
      reasoning: response,
    };
  }

  private normalizeStateChanges(changes: unknown[]): StateChange[] {
    if (!Array.isArray(changes)) return [];

    return changes.map((change: unknown) => {
      const c = change as Record<string, unknown>;
      return {
        type: c.type as StateChange['type'],
        details: (c.details || {}) as Record<string, unknown>,
      };
    }).filter((c) => c.type);
  }

  private generateCacheKey(context: ArbiterContext): string {
    // Create a key based on the action type and relevant state
    const action = context.proposedAction;
    return `${action.type}:${action.playerId}:${JSON.stringify(action.params)}`;
  }

  /**
   * Clear ruling cache (useful between games for fresh interpretation)
   */
  clearCache(): void {
    this.rulingHistory.clear();
  }

  /**
   * Get ruling history for analysis
   */
  getRulingHistory(): Map<string, AgentDecision> {
    return new Map(this.rulingHistory);
  }
}

/**
 * Simple deterministic arbiter for testing without LLM
 */
export class SimpleArbiter extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config, { complete: async () => '' }, 'arbiter');
  }

  async decideAction(context: AgentContext): Promise<AgentDecision> {
    // Always approve for simple testing
    return {
      actionType: 'arbiter_ruling',
      params: {
        valid: true,
        stateChanges: [],
        message: 'Auto-approved by simple arbiter',
      },
      reasoning: 'Simple arbiter always approves valid action formats',
    };
  }
}
