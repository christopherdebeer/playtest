// Sync adapter: bridges local playtest game state with sync.parc.land rooms
//
// Design: The sync room becomes the coordination surface for a distributed game.
// Game state is stored as versioned KV in the room's state store, actions flow
// through the message log, and agents register as room participants.
//
// Message kinds:
//   "action"      - player action submitted (body = { playerId, action })
//   "turn"        - turn advanced (body = { round, turnNumber, currentPlayer })
//   "state_push"  - full state snapshot pushed to room (body = { gameState })
//   "event"       - game event log entry (body = { event })
//   "adjudication"- GM ruling (body = { type, ruling, reason })
//   "chat"        - free-form agent chat
//
// State keys:
//   _shared / "game_state"   - current full GameState JSON
//   _shared / "game_status"  - status enum for quick polling
//   _shared / "current_turn" - { round, turnNumber, currentPlayer }
//   <agentId> / "player_view" - filtered view for that agent

import { SyncClient } from './client.js';
import type { SyncRoom, SyncAgent, SyncMessage } from './client.js';
import { loadStateReadOnly, saveState } from '../core/game.js';
import type { GameState } from '../types/game.js';

// Message kind constants
export const MSG_ACTION = 'action';
export const MSG_TURN = 'turn';
export const MSG_STATE_PUSH = 'state_push';
export const MSG_EVENT = 'event';
export const MSG_ADJUDICATION = 'adjudication';
export const MSG_CHAT = 'chat';

// State key constants
export const STATE_GAME = 'game_state';
export const STATE_STATUS = 'game_status';
export const STATE_TURN = 'current_turn';

export interface SyncSessionInfo {
  roomId: string;
  instanceId: string;
  dashboardUrl: string;
  agents: SyncAgent[];
}

export class SyncAdapter {
  private client: SyncClient;
  private roomId: string | null = null;
  private agentId: string | null = null;
  private lastMessageId: number = 0;

  constructor(baseUrl?: string) {
    this.client = new SyncClient(baseUrl);
  }

  // ============ Session Lifecycle ============

  /**
   * Create a new sync room for a game instance.
   * Call this from the coordinator after `playtest init`.
   */
  async createSession(instanceId: string, gameName: string, meta?: Record<string, unknown>): Promise<SyncSessionInfo> {
    const room = await this.client.createRoom({
      meta: {
        game: gameName,
        instanceId,
        framework: 'playtest',
        createdAt: new Date().toISOString(),
        ...meta,
      },
    });

    this.roomId = room.id;

    return {
      roomId: room.id,
      instanceId,
      dashboardUrl: this.client.dashboardUrl(room.id),
      agents: [],
    };
  }

  /**
   * Join an existing sync room.
   * Call this from a remote agent that received a room ID.
   */
  async joinSession(roomId: string, name: string, role: string, meta?: Record<string, unknown>): Promise<SyncAgent> {
    this.roomId = roomId;

    const agent = await this.client.registerAgent(roomId, {
      name,
      role,
      meta,
    });

    this.agentId = agent.id;
    return agent;
  }

  // ============ State Synchronization ============

  /**
   * Push local game state to the sync room.
   * Call this after any state-mutating operation (action, turn advance, etc).
   */
  async pushState(state: GameState): Promise<void> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    // Push full state
    await this.client.putState(this.roomId, {
      key: STATE_GAME,
      value: state,
    });

    // Push quick-poll fields separately for efficient status checks
    await this.client.putState(this.roomId, {
      key: STATE_STATUS,
      value: state.status,
    });

    await this.client.putState(this.roomId, {
      key: STATE_TURN,
      value: {
        round: state.round,
        turnNumber: state.turnNumber,
        currentPlayer: state.currentPlayer,
      },
    });

    // Post a state_push message so pollers can react
    await this.client.postMessage(this.roomId, {
      from: this.agentId || undefined,
      kind: MSG_STATE_PUSH,
      body: {
        status: state.status,
        round: state.round,
        turnNumber: state.turnNumber,
        currentPlayer: state.currentPlayer,
      },
    });
  }

  /**
   * Pull game state from the sync room.
   * Returns the latest GameState or null if not yet pushed.
   */
  async pullState(): Promise<GameState | null> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    try {
      const result = await this.client.getState(this.roomId, {
        scope: '_shared',
        key: STATE_GAME,
      });

      // getState returns single object when both scope and key are specified
      const stateEntry = Array.isArray(result) ? result[0] : result;
      if (!stateEntry?.value) return null;

      return stateEntry.value as GameState;
    } catch {
      return null;
    }
  }

  /**
   * Push the local instance state to the sync room.
   * Convenience method: loads from disk then pushes.
   */
  async pushLocalState(instanceId: string): Promise<void> {
    const state = loadStateReadOnly(instanceId);
    await this.pushState(state);
  }

  /**
   * Pull state from sync room and write to local disk.
   * Returns the pulled state, or null if nothing to pull.
   */
  async pullToLocal(instanceId: string): Promise<GameState | null> {
    const state = await this.pullState();
    if (!state) return null;

    saveState(state);
    return state;
  }

  // ============ Message Flow ============

  /**
   * Send a player action to the sync room.
   * Remote players call this instead of `./playtest act`.
   */
  async sendAction(playerId: string, action: Record<string, unknown>): Promise<SyncMessage> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    return this.client.postMessage(this.roomId, {
      from: this.agentId || playerId,
      kind: MSG_ACTION,
      body: { playerId, action },
    });
  }

  /**
   * Send a game event to the sync room.
   */
  async sendEvent(event: Record<string, unknown>): Promise<SyncMessage> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    return this.client.postMessage(this.roomId, {
      from: this.agentId || undefined,
      kind: MSG_EVENT,
      body: event,
    });
  }

  /**
   * Send a chat message.
   */
  async sendChat(text: string): Promise<SyncMessage> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    return this.client.postMessage(this.roomId, {
      from: this.agentId || undefined,
      kind: MSG_CHAT,
      body: { text },
    });
  }

  /**
   * Poll for new messages since last check.
   * Uses cursor-based pagination for efficiency.
   */
  async pollMessages(kind?: string): Promise<SyncMessage[]> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    const messages = await this.client.pollMessages(this.roomId, {
      after: this.lastMessageId,
      kind,
    });

    if (messages.length > 0) {
      this.lastMessageId = messages[messages.length - 1].id;
    }

    return messages;
  }

  /**
   * Poll for new actions submitted by remote players.
   * Returns action messages since the last poll.
   */
  async pollActions(): Promise<SyncMessage[]> {
    return this.pollMessages(MSG_ACTION);
  }

  /**
   * Wait for the game state to change (poll-based).
   * Resolves when status or currentPlayer changes, or timeout.
   */
  async waitForStateChange(
    currentStatus: string,
    currentPlayer: string | null,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 1000,
  ): Promise<{ status: string; currentPlayer: string | null; round: number; turnNumber: number } | null> {
    if (!this.roomId) throw new Error('Not connected to a sync room');

    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.client.getState(this.roomId, {
          scope: '_shared',
          key: STATE_TURN,
        });

        const turnEntry = Array.isArray(result) ? result[0] : result;
        if (turnEntry?.value) {
          const turn = turnEntry.value as { round: number; turnNumber: number; currentPlayer: string | null };

          // Also check status
          const statusResult = await this.client.getState(this.roomId, {
            scope: '_shared',
            key: STATE_STATUS,
          });
          const statusEntry = Array.isArray(statusResult) ? statusResult[0] : statusResult;
          const status = (statusEntry?.value as string) || 'unknown';

          if (status !== currentStatus || turn.currentPlayer !== currentPlayer) {
            return {
              status,
              currentPlayer: turn.currentPlayer,
              round: turn.round,
              turnNumber: turn.turnNumber,
            };
          }
        }
      } catch {
        // Transient error, retry
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return null; // Timeout
  }

  // ============ Room Info ============

  async getSessionInfo(): Promise<SyncSessionInfo | null> {
    if (!this.roomId) return null;

    const [room, agents] = await Promise.all([
      this.client.getRoom(this.roomId),
      this.client.listAgents(this.roomId),
    ]);

    return {
      roomId: room.id,
      instanceId: (room.meta?.instanceId as string) || '',
      dashboardUrl: this.client.dashboardUrl(room.id),
      agents,
    };
  }

  async listMessages(kind?: string, limit?: number): Promise<SyncMessage[]> {
    if (!this.roomId) throw new Error('Not connected to a sync room');
    return this.client.pollMessages(this.roomId, { kind, limit });
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }

  get currentAgentId(): string | null {
    return this.agentId;
  }
}
