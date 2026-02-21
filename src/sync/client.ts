// HTTP client for sync.parc.land agent-sync service
// Provides typed access to rooms, agents, messages, and state

const DEFAULT_BASE_URL = 'https://sync.parc.land';

export interface SyncRoom {
  id: string;
  created_at: string;
  meta?: Record<string, unknown>;
}

export interface SyncAgent {
  id: string;
  room_id: string;
  name: string;
  role?: string;
  joined_at: string;
  meta?: Record<string, unknown>;
}

export interface SyncMessage {
  id: number;
  room_id: string;
  from_agent?: string;
  to_agent?: string;
  kind?: string;
  body: unknown;
  created_at: string;
}

export interface SyncState {
  room_id: string;
  scope: string;
  key: string;
  value: unknown;
  version: number;
  updated_at: string;
}

export class SyncClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ============ Rooms ============

  async createRoom(options?: { id?: string; meta?: Record<string, unknown> }): Promise<SyncRoom> {
    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) throw new Error(`createRoom failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async listRooms(): Promise<SyncRoom[]> {
    const res = await fetch(`${this.baseUrl}/rooms`);
    if (!res.ok) throw new Error(`listRooms failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getRoom(roomId: string): Promise<SyncRoom> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}`);
    if (!res.ok) throw new Error(`getRoom failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ============ Agents ============

  async registerAgent(roomId: string, options: {
    id?: string;
    name: string;
    role?: string;
    meta?: Record<string, unknown>;
  }): Promise<SyncAgent> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`registerAgent failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async listAgents(roomId: string): Promise<SyncAgent[]> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}/agents`);
    if (!res.ok) throw new Error(`listAgents failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ============ Messages ============

  async postMessage(roomId: string, options: {
    from?: string;
    to?: string;
    kind?: string;
    body: unknown;
  }): Promise<SyncMessage> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`postMessage failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async pollMessages(roomId: string, options?: {
    after?: number;
    kind?: string;
    limit?: number;
  }): Promise<SyncMessage[]> {
    const params = new URLSearchParams();
    if (options?.after !== undefined) params.set('after', String(options.after));
    if (options?.kind) params.set('kind', options.kind);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const url = `${this.baseUrl}/rooms/${roomId}/messages${qs ? '?' + qs : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pollMessages failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ============ State ============

  async putState(roomId: string, options: {
    scope?: string;
    key: string;
    value: unknown;
  }): Promise<SyncState> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`putState failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getState(roomId: string, options?: {
    scope?: string;
    key?: string;
  }): Promise<SyncState | SyncState[]> {
    const params = new URLSearchParams();
    if (options?.scope) params.set('scope', options.scope);
    if (options?.key) params.set('key', options.key);
    const qs = params.toString();
    const url = `${this.baseUrl}/rooms/${roomId}/state${qs ? '?' + qs : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`getState failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async deleteState(roomId: string, options: {
    scope?: string;
    key: string;
  }): Promise<{ deleted: boolean }> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}/state`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error(`deleteState failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // ============ Utilities ============

  /** Get the dashboard URL for a room */
  dashboardUrl(roomId: string): string {
    return `${this.baseUrl}/?room=${roomId}`;
  }
}
