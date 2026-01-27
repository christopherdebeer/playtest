/**
 * Playtest - A computational framework for game design exploration
 *
 * This framework enables rapid iteration on card game designs using
 * LLM-powered agents to play, arbitrate, and analyze games.
 */

// Core types and state management
export * from './core/types.js';
export * from './core/game-state.js';

// Rules parsing and validation
export * from './rules/schema.js';
export * from './rules/parser.js';

// Game orchestration
export * from './engine/orchestrator.js';
export * from './engine/explorer.js';
export * from './engine/metrics.js';
export * from './engine/game-server.js';
export * from './engine/deterministic-rules.js';

// Agents
export * from './agents/base.js';
export * from './agents/player.js';
export * from './agents/arbiter.js';
export * from './agents/observer.js';
export * from './agents/llm-provider.js';

// File-based state for subagent coordination
export * from './engine/file-state.js';

// Hooks for Claude Code integration
export * from './hooks/config.js';
export * from './hooks/handler.js';
