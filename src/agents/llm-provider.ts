/**
 * LLM Provider implementations
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './base.js';

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Anthropic Claude provider
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: AnthropicConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 1024;
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    return textContent ? textContent.text : '';
  }
}

/**
 * Mock provider for testing
 */
export class MockProvider implements LLMProvider {
  private responses: Map<string, string> = new Map();
  private defaultResponse: string;

  constructor(defaultResponse: string = '{"action": "pass", "params": {}, "reasoning": "Mock response"}') {
    this.defaultResponse = defaultResponse;
  }

  setResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }

  async complete(prompt: string, _systemPrompt?: string): Promise<string> {
    // Check for matching patterns
    for (const [pattern, response] of this.responses) {
      if (prompt.includes(pattern)) {
        return response;
      }
    }
    return this.defaultResponse;
  }
}

/**
 * Provider that logs all requests (useful for debugging)
 */
export class LoggingProvider implements LLMProvider {
  private inner: LLMProvider;
  private logs: { prompt: string; response: string; timestamp: number }[] = [];

  constructor(inner: LLMProvider) {
    this.inner = inner;
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.inner.complete(prompt, systemPrompt);
    this.logs.push({
      prompt,
      response,
      timestamp: Date.now(),
    });
    return response;
  }

  getLogs(): typeof this.logs {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
