/**
 * @playtest/shared - Shared types for playtest framework
 *
 * This package is the source of truth for types shared between:
 * - engine (game logic)
 * - site (dashboard/visualization)
 */

// Log event types and schemas
export {
  LOG_EVENT_TYPES,
  type LogEventType,
  type PlayerStateSnapshot,
  type GameStateSnapshot,
  type LogEventDataSchemas,
  type TypedLogEvent,
  type AnyLogEvent,
  isEventType,
  validateActionEvent,
} from './log-events.js';
