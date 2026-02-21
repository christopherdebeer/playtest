# Remote State Integration Guide for /playtest

Based on sync.parc.land API analysis, this document outlines implementation patterns for optional distributed state management.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│            /playtest CLI (local or remote)          │
│  ┌──────────────────────────────────────────────┐   │
│  │   Game Commands (init, register, act, etc)   │   │
│  └──────────────┬───────────────────────────────┘   │
└─────────────────┼────────────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │   State Backend    │
        │  (abstraction)     │
        └─────────┬──────────┘
                  │
        ┌─────────▴──────────────────────────┐
        │                                    │
   ┌────▼────┐                    ┌─────────▼──────┐
   │ FileState│ (local)            │  RemoteState   │ (API)
   │Backend   │                    │  Backend       │
   └──────────┘                    └────────────────┘
                                          │
                                   ┌──────▴────────┐
                                   │ sync.parc.land│
                                   └───────────────┘
```

---

## Implementation Pattern: State Backend Abstraction

### Interface Definition

```typescript
// src/backend/state-backend.ts

export interface StateBackend {
  // Initialization
  init(gameName: string, playerCount: number): Promise<void>;

  // State Operations
  getState(key: string, scope?: string): Promise<any>;
  setState(key: string, value: any, scope?: string): Promise<void>;
  deleteState(key: string, scope?: string): Promise<void>;
  getAllState(scope?: string): Promise<Record<string, any>>;

  // Event Logging
  logEvent(kind: string, body: any): Promise<void>;
  getEvents(kind?: string, limit?: number): Promise<Event[]>;

  // Cleanup
  destroy(): Promise<void>;
}

export interface Event {
  id: number;
  kind: string;
  body: any;
  createdAt: Date;
}
```

### File-Based Implementation (Current)

```typescript
// src/backend/file-state-backend.ts

export class FileStateBackend implements StateBackend {
  private gamePath: string;

  constructor(gameDir: string) {
    this.gamePath = gameDir;
    mkdirSync(join(gameDir, 'state'), { recursive: true });
    mkdirSync(join(gameDir, 'logs'), { recursive: true });
  }

  async init(gameName: string, playerCount: number): Promise<void> {
    const initialState = {
      gameId: `${gameName}-${Date.now()}`,
      gameName,
      status: 'waiting_for_players',
      turn: 0,
      round: 1,
      currentPlayer: null,
      players: Object.fromEntries(
        Array.from({ length: playerCount }, (_, i) => [
          `player-${i}`,
          { agentId: '', hand: [], state: {} }
        ])
      ),
      shared: {},
      config: {}
    };

    writeFileSync(
      join(this.gamePath, 'state', 'game.json'),
      JSON.stringify(initialState, null, 2)
    );
  }

  async getState(key: string, scope = '_shared'): Promise<any> {
    const filePath = join(this.gamePath, 'state', 'game.json');
    const state = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (scope === '_shared') {
      return state[key];
    } else {
      // scope is player ID
      return state.players[scope]?.[key];
    }
  }

  async setState(key: string, value: any, scope = '_shared'): Promise<void> {
    const filePath = join(this.gamePath, 'state', 'game.json');
    const state = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (scope === '_shared') {
      state[key] = value;
    } else {
      if (!state.players[scope]) state.players[scope] = {};
      state.players[scope][key] = value;
    }

    writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  async logEvent(kind: string, body: any): Promise<void> {
    const logPath = join(this.gamePath, 'logs', `${Date.now()}.jsonl`);
    appendFileSync(
      logPath,
      JSON.stringify({ kind, body, timestamp: new Date().toISOString() }) + '\n'
    );
  }

  async getEvents(kind?: string, limit = 100): Promise<Event[]> {
    // Read all JSONL logs and filter
    const logsDir = join(this.gamePath, 'logs');
    const events: Event[] = [];

    for (const file of readdirSync(logsDir)) {
      const lines = readFileSync(join(logsDir, file), 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (!kind || event.kind === kind) {
          events.push(event);
          if (events.length >= limit) break;
        }
      }
    }

    return events;
  }

  async destroy(): Promise<void> {
    // No cleanup needed for file backend
  }
}
```

### Remote Implementation (New)

```typescript
// src/backend/remote-state-backend.ts

export class RemoteStateBackend implements StateBackend {
  private roomId: string;
  private apiBase = 'https://sync.parc.land';
  private cache = new Map<string, CachedValue>();
  private cacheTimeout = 5000; // 5 seconds

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  async init(gameName: string, playerCount: number): Promise<void> {
    const initialState = {
      gameId: `${gameName}-${Date.now()}`,
      gameName,
      status: 'waiting_for_players',
      turn: 0,
      round: 1,
      currentPlayer: null,
      players: Object.fromEntries(
        Array.from({ length: playerCount }, (_, i) => [
          `player-${i}`,
          { agentId: '', hand: [], state: {} }
        ])
      ),
      shared: {},
      config: {}
    };

    await this.setState('game', initialState, '_shared');
  }

  async getState(key: string, scope = '_shared'): Promise<any> {
    const cached = this.cache.get(`${scope}:${key}`);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    const url = `${this.apiBase}/rooms/${this.roomId}/state`;
    const params = new URLSearchParams({ scope });
    const response = await fetch(`${url}?${params}`);
    const states = await response.json() as StateEntry[];

    const entry = states.find(s => s.key === key);
    if (!entry) return undefined;

    const value = this.parseValue(entry.value);
    this.cache.set(`${scope}:${key}`, { value, timestamp: Date.now() });
    return value;
  }

  async setState(key: string, value: any, scope = '_shared'): Promise<void> {
    const url = `${this.apiBase}/rooms/${this.roomId}/state`;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: valueStr, scope })
    });

    if (!response.ok) {
      throw new Error(`Failed to set state: ${response.statusText}`);
    }

    this.cache.set(`${scope}:${key}`, { value, timestamp: Date.now() });
  }

  async logEvent(kind: string, body: any): Promise<void> {
    const url = `${this.apiBase}/rooms/${this.roomId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        body: typeof body === 'string' ? body : JSON.stringify(body)
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to log event: ${response.statusText}`);
    }
  }

  async getEvents(kind?: string, limit = 100): Promise<Event[]> {
    const url = `${this.apiBase}/rooms/${this.roomId}/messages`;
    const params = new URLSearchParams();
    if (kind) params.append('kind', kind);
    params.append('limit', limit.toString());

    const response = await fetch(`${url}?${params}`);
    const messages = await response.json() as any[];

    return messages.map(msg => ({
      id: msg.id,
      kind: msg.kind,
      body: this.parseValue(msg.body),
      createdAt: new Date(msg.created_at)
    }));
  }

  async destroy(): Promise<void> {
    // Could implement room cleanup here
    this.cache.clear();
  }

  private parseValue(str: string): any {
    try {
      return JSON.parse(str);
    } catch {
      return str; // Not JSON, return as string
    }
  }
}

interface StateEntry {
  room_id: string;
  scope: string;
  key: string;
  value: string;
  version: number;
  updated_at: string;
}

interface CachedValue {
  value: any;
  timestamp: number;
}
```

### Factory Pattern

```typescript
// src/backend/state-backend-factory.ts

export class StateBackendFactory {
  static create(options: BackendOptions): StateBackend {
    if (options.remote) {
      return new RemoteStateBackend(options.roomId!);
    } else {
      return new FileStateBackend(options.gameDir!);
    }
  }
}

export interface BackendOptions {
  remote?: boolean;
  roomId?: string;           // For remote backend
  gameDir?: string;          // For file backend
}
```

---

## Integration with CLI Commands

### Modified init Command

```typescript
// src/cli/commands/init.ts

export async function initCommand(
  gameName: string,
  options: {
    players: number;
    remote?: boolean;
    roomId?: string;
  }
) {
  const backend = StateBackendFactory.create({
    remote: options.remote,
    roomId: options.roomId || await createRemoteRoom(gameName),
    gameDir: join(GAMES_DIR, gameName)
  });

  await backend.init(gameName, options.players);

  return {
    gameId: `${gameName}-${Date.now()}`,
    roomId: options.roomId,
    backend: options.remote ? 'remote' : 'file',
    status: 'waiting_for_players'
  };
}
```

### Modified act Command

```typescript
// src/cli/commands/act.ts

export async function actCommand(
  gameName: string,
  options: {
    player: string;
    action: string;
    remote?: boolean;
  }
) {
  const backend = getBackend(gameName); // Retrieve from context

  // Get current state
  const game = await backend.getState('game');
  const playerState = await backend.getState('view', options.player);

  // Validate and apply action
  const action = JSON.parse(options.action);
  const validation = validateAction(game, playerState, action);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Apply to state
  const updated = applyGameRules(game, action);
  await backend.setState('game', updated);

  // Log event
  await backend.logEvent('game:action', {
    player: options.player,
    action: action.type,
    round: updated.round,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    effect: validation.effect,
    gameState: updated
  };
}
```

---

## Message Kind Standardization

### Canonical Message Kinds

```typescript
// src/types/messages.ts

export type GameMessageKind =
  // Lifecycle
  | 'game:init'
  | 'game:start'
  | 'game:end'
  | 'game:reset'

  // Turns
  | 'turn:start'
  | 'turn:action'
  | 'turn:end'

  // Actions
  | 'action:submitted'
  | 'action:validated'
  | 'action:applied'
  | 'action:rejected'

  // Contests
  | 'contest:raised'
  | 'contest:ruling'
  | 'contest:resolved'

  // State Sync
  | 'state:updated'
  | 'state:checkpoint'

  // Meta
  | 'observation'
  | 'error';

export interface GameEvent {
  kind: GameMessageKind;
  body: {
    timestamp: string;
    round?: number;
    turn?: number;
    player?: string;
    [key: string]: any;
  };
}
```

### Usage Pattern

```typescript
// When logging from engine
await backend.logEvent('action:applied', {
  player: 'player-1',
  action: 'play_card',
  card: 'card_123',
  target: 'player-2',
  timestamp: new Date().toISOString(),
  round: game.round,
  turn: game.turn
});

// When querying history
const actions = await backend.getEvents('action:applied');
const contested = await backend.getEvents('contest:raised');
```

---

## Caching & Consistency Strategy

### Invalidation Pattern

```typescript
// src/backend/cache-manager.ts

export class CacheManager {
  private invalidateOn = new Map<string, Set<string>>();

  constructor() {
    // Define dependencies
    this.invalidateOn.set('game', new Set(['game']));
    this.invalidateOn.set('player:*:hand', new Set(['player:*:hand', 'game']));
    this.invalidateOn.set('board', new Set(['board', 'game']));
  }

  invalidate(key: string, scope = '_shared'): void {
    const cacheKey = `${scope}:${key}`;
    // Invalidate direct key
    cache.delete(cacheKey);

    // Invalidate dependent keys
    for (const [depKey, deps] of this.invalidateOn.entries()) {
      if (deps.has(key)) {
        cache.delete(depKey);
      }
    }
  }
}
```

### Optimistic Locking

```typescript
// src/backend/optimistic-lock.ts

export class OptimisticLock {
  private versions = new Map<string, number>();

  async acquireRead(key: string): Promise<ReadLock> {
    const currentVersion = await getRemoteVersion(key);
    this.versions.set(key, currentVersion);

    return {
      key,
      version: currentVersion,
      release: () => {
        // No-op for read locks
      }
    };
  }

  async acquireWrite(key: string): Promise<WriteLock> {
    const currentVersion = await getRemoteVersion(key);
    const lock = { key, version: currentVersion };

    return {
      ...lock,
      release: async (value: any) => {
        const latestVersion = await getRemoteVersion(key);
        if (latestVersion !== currentVersion) {
          throw new OptimisticLockError(
            `Version mismatch: expected ${currentVersion}, got ${latestVersion}`
          );
        }
        await setState(key, value);
      }
    };
  }
}
```

---

## Performance Considerations

### Polling Strategy

```typescript
// src/backend/polling.ts

export class PollingManager {
  private pollIntervals = new Map<string, NodeJS.Timeout>();
  private pollRates = new Map<string, number>();

  // Adaptive polling based on change frequency
  async startPolling(
    key: string,
    callback: (value: any) => void,
    initialRate = 1000
  ): Promise<void> {
    let rate = initialRate;
    let unchangedCount = 0;

    const poll = async () => {
      const newValue = await backend.getState(key);
      callback(newValue);
      unchangedCount++;

      // Exponential backoff if no changes
      if (unchangedCount > 3) {
        rate = Math.min(rate * 1.5, 30000); // Max 30s
      } else {
        rate = initialRate;
        unchangedCount = 0;
      }

      this.pollIntervals.set(
        key,
        setTimeout(poll, rate)
      );
    };

    await poll();
  }

  stopPolling(key: string): void {
    const interval = this.pollIntervals.get(key);
    if (interval) {
      clearTimeout(interval);
      this.pollIntervals.delete(key);
    }
  }
}
```

### Batching Writes

```typescript
// src/backend/batch-writer.ts

export class BatchStateWriter {
  private batch = new Map<string, any>();
  private timer: NodeJS.Timeout | null = null;
  private batchSize = 10;
  private flushInterval = 100; // ms

  async queue(key: string, value: any): Promise<void> {
    this.batch.set(key, value);

    if (this.batch.size >= this.batchSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.batch.size === 0) return;

    const entries = Array.from(this.batch.entries());
    this.batch.clear();

    // Write all at once (in practice, would be API call batching)
    for (const [key, value] of entries) {
      await backend.setState(key, value);
    }
  }
}
```

---

## Testing with Mock Backend

```typescript
// src/backend/mock-state-backend.ts

export class MockStateBackend implements StateBackend {
  private state = new Map<string, any>();
  private events: Event[] = [];

  async getState(key: string, scope = '_shared'): Promise<any> {
    return this.state.get(`${scope}:${key}`);
  }

  async setState(key: string, value: any, scope = '_shared'): Promise<void> {
    this.state.set(`${scope}:${key}`, value);
  }

  async logEvent(kind: string, body: any): Promise<void> {
    this.events.push({
      id: this.events.length,
      kind,
      body,
      createdAt: new Date()
    });
  }

  async getEvents(kind?: string): Promise<Event[]> {
    return kind ? this.events.filter(e => e.kind === kind) : this.events;
  }

  async init(): Promise<void> {}
  async deleteState(): Promise<void> {}
  async getAllState(): Promise<Record<string, any>> {
    return Object.fromEntries(this.state);
  }
  async destroy(): Promise<void> {
    this.state.clear();
    this.events = [];
  }
}
```

---

## Conclusion

This abstraction pattern enables /playtest to support multiple state backends without changing core game logic. The file-based backend remains the default for local development, while the remote backend unlocks distributed playtesting across machines.

Key benefits:
- **Decoupling** - Game logic doesn't care about storage mechanism
- **Testability** - Easy to mock for unit tests
- **Extensibility** - Can add SQL, S3, or other backends
- **Gradual Adoption** - Toggle remote mode without code changes
