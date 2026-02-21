// Distributed sync module - enables multi-machine playtest coordination
// via sync.parc.land rooms

export { SyncClient } from './client.js';
export type { SyncRoom, SyncAgent, SyncMessage, SyncState } from './client.js';

export { SyncAdapter } from './adapter.js';
export type { SyncSessionInfo } from './adapter.js';
export {
  MSG_ACTION,
  MSG_TURN,
  MSG_STATE_PUSH,
  MSG_EVENT,
  MSG_ADJUDICATION,
  MSG_CHAT,
  STATE_GAME,
  STATE_STATUS,
  STATE_TURN,
} from './adapter.js';
