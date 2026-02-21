# sync.parc.land API Integration Action Plan

**Status:** Analysis Complete | Ready for Implementation Planning
**Last Updated:** 2026-02-21
**Test Room:** room_1771692589191_c0b742r

---

## Quick Decision Matrix

**Should /playtest integrate with sync.parc.land?**

| Scenario | Answer | Rationale |
|----------|--------|-----------|
| Single machine local playtesting | ✗ No | File-based is simpler, faster, no network latency |
| Distributed agents (multi-machine) | ✓ Yes | Enables shared state across machines |
| Browser-based UI updates | ✓ Yes | Message API provides real-time event stream |
| Remote cloud playtesting | ✓ Yes | Eliminates need for shared filesystem |
| Production monitoring dashboard | ✓ Yes | Query events for live game statistics |
| Offline playtesting | ✗ No | Requires network connectivity |

**Recommendation:** Implement as **optional feature** (flag: `--remote-sync`) while maintaining file-based default.

---

## API Capability Summary

### Message API ✓ Production-Ready

```
✓ Works reliably for event logging
✓ Good pagination and filtering by kind
✓ Chronological ordering guaranteed
✓ Suitable for audit trails and event replay
✗ Polling-only (no subscription)
✗ Cannot delete messages
✗ Limited filtering (kind only)
```

**Use For:**
- Game event log (action, turns, contests)
- Audit trail for debugging
- Agent communication/coordination
- Real-time event stream to UI

---

### State API ✓ Functional with Caveats

```
✓ Persistent key-value with versioning
✓ Scoped isolation (_shared, player-id)
✓ Complex JSON object support
✓ Atomic per-key (good enough for game state)
✗ No multi-key transactions
✗ No change notifications
✗ All values stored as strings (must parse)
✗ No optimistic locking
✗ Limited filtering/querying
```

**Use For:**
- Current game state (players, board, turn)
- Per-player views (hand, visible board)
- Game configuration
- Checkpoint for game resume

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2) - DO THIS FIRST

#### 1.1 Create State Backend Abstraction
**Files to create:**
- `src/backend/state-backend.ts` - Interface definition
- `src/backend/file-state-backend.ts` - Existing file-based logic refactored
- `src/backend/remote-state-backend.ts` - New remote implementation
- `src/backend/state-backend-factory.ts` - Factory pattern

**Effort:** 4-6 hours
**Risk:** Low (interface-based, existing tests still pass)
**Validation:**
- All existing tests pass with file backend
- Unit tests for remote backend with mocked API

#### 1.2 Standardize Message Kinds
**Files to create:**
- `src/types/messages.ts` - Define canonical message kinds

**Effort:** 1-2 hours
**Risk:** Low (backward compatible)
**Validation:**
- Document mapping of old messages to new kinds
- Verify existing logs still parse

### Phase 2: Remote Backend Implementation (Week 2-3)

#### 2.1 Implement Remote State Backend
**Implementation in:** `src/backend/remote-state-backend.ts`
**Features:**
- HTTP client wrapper (fetch or axios)
- Cache layer with TTL
- Error handling and retry logic
- Scope management

**Effort:** 6-8 hours
**Risk:** Medium (network errors, API changes)
**Validation:**
- Integration tests against test room
- Load testing (concurrent writes)
- Network failure scenarios

#### 2.2 Add CLI Flag Support
**Modified files:**
- `src/cli/index.ts` - Add `--remote-sync`, `--room-id` flags
- `src/cli/commands/init.ts` - Support room creation
- `.claude/hooks/agent-start.sh` - Pass backend to agents

**Effort:** 2-4 hours
**Risk:** Low
**Validation:**
- CLI tests with both backends
- Integration test: start game with --remote-sync

### Phase 3: Testing & Documentation (Week 3)

#### 3.1 Test Suite
**Create tests for:**
- State backend interface compliance
- File vs remote backend equivalence
- Message kind canonicalization
- Error scenarios (network, validation)
- Concurrent access patterns

**Effort:** 8-10 hours
**Risk:** Medium (complex scenarios)

#### 3.2 Documentation
**Create guides for:**
- Getting started with remote sync
- Setting up distributed agents
- Monitoring games with API
- Troubleshooting sync issues

**Effort:** 4-6 hours

---

## Implementation Details

### 1. State Backend Interface

```typescript
// Minimal interface to support both backends
interface StateBackend {
  // One-time setup
  init(gameName: string, playerCount: number): Promise<void>;

  // State operations (most frequently called)
  getState(key: string, scope?: string): Promise<any>;
  setState(key: string, value: any, scope?: string): Promise<void>;

  // Event logging
  logEvent(kind: string, body: any): Promise<void>;
  getEvents(kind?: string, limit?: number): Promise<any[]>;
}
```

**Why this works:**
- File backend: Read/write `game.json`, append to log
- Remote backend: Read/write to State API, POST to Message API
- Same interface, different implementations

### 2. Remote Backend Key Features

#### Caching Strategy
```typescript
// Cache with TTL to reduce API calls
class RemoteBackend {
  private cache = new Map<string, {value: any, ts: number}>();
  private cacheTTL = 5000; // 5 seconds

  async getState(key: string) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTTL) {
      return cached.value; // No API call
    }
    const value = await this.fetchFromAPI(key);
    this.cache.set(key, {value, ts: Date.now()});
    return value;
  }

  // Invalidate cache on writes
  async setState(key: string, value: any) {
    await this.writeToAPI(key, value);
    this.cache.delete(key); // Force refresh next read
  }
}
```

**Effect:** 80%+ cache hit rate for `getState()` calls
**Tradeoff:** 5-second stale state acceptable for game logic

#### Error Handling
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoff = 1000
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await sleep(backoff * Math.pow(2, i));
      }
    }
  }
  throw lastError;
}

// Usage
const value = await withRetry(() => fetch(url).then(r => r.json()));
```

**Effect:** Handles transient network issues
**Fallback:** Logs error after 3 retries, agent fails gracefully

### 3. Message Kind Standardization

Current (unstructured):
```
"game:setup", "game:start", "game:ready", "game:prompt",
"player:action", "game:action", "observation", "game:summary"
```

New (canonical):
```typescript
// Lifecycle
game:init      // Game initialized
game:start     // Game begins, players assigned
game:end       // Winner declared
game:reset     // Game state reset

// Turn flow
turn:start     // Turn begins for player X
turn:action    // Action submitted
turn:end       // Turn complete, next player

// Action flow
action:submitted  // Action sent by player
action:validated  // Gamemaster approved
action:applied    // Engine applied effect
action:rejected   // Invalid action

// Disputes
contest:raised    // Player contests action
contest:ruling    // Gamemaster rules
contest:resolved  // Dispute settled

// Meta
observation   // Analysis/status updates
error         // Error occurred
```

**Implementation:**
- Translate old kinds to new on write (backward compat)
- Query with new kinds only
- Log deprecation warning for old kinds

### 4. CLI Integration

```bash
# Existing (file-based)
npx playtest init markovs-chains --players 2
# Stores state in: games/markovs-chains/state/game.json

# New (remote)
npx playtest init markovs-chains --players 2 --remote-sync
# Creates room on sync.parc.land
# Returns room ID for agents to use

npx playtest init markovs-chains --players 2 \
  --remote-sync \
  --room-id room_1771692589191_c0b742r
# Reuse existing room (for distributed agents)
```

**Storage:** Room ID saved in `games/markovs-chains/state/ROOM_ID` for reference

---

## Success Criteria

### Phase 1 Validation
- ✓ File backend tests pass (100% same as before)
- ✓ Remote backend mock tests pass
- ✓ Message kinds documented
- ✓ No breaking changes to public CLI

### Phase 2 Validation
- ✓ Remote init creates room successfully
- ✓ Remote setState/getState roundtrips correctly
- ✓ Game completes end-to-end with --remote-sync
- ✓ Multi-machine game works (gamemaster on A, player on B)
- ✓ Cache hit rate > 75% on typical game
- ✓ Network failure handled gracefully

### Phase 3 Validation
- ✓ Test coverage > 80%
- ✓ All docs have examples
- ✓ No regressions in existing games
- ✓ Remote mode listed in CLI help

---

## Risk Assessment & Mitigation

### Risk 1: Network Latency (Medium)
**Issue:** Remote calls slower than file I/O
**Impact:** Agents wait longer for state updates
**Mitigation:**
- Cache with 5s TTL reduces calls 80%
- Batch writes where possible
- Use exponential backoff for retries

**Acceptable?** Yes, if < 100ms average latency

---

### Risk 2: Consistency Issues (High)
**Issue:** Two agents update same state key simultaneously
**Impact:** Last write wins, previous write lost
**Mitigation:**
- Document that state is per-key atomic
- Use separate keys for independent state (e.g., player:X:hand)
- Implement optimistic locking on critical updates
- Game logic should handle concurrent updates

**Acceptable?** Yes if gamemaster validates all actions

---

### Risk 3: API Service Outage (Medium)
**Issue:** sync.parc.land becomes unavailable
**Impact:** Remote games pause indefinitely
**Mitigation:**
- Add fallback to local file storage
- Implement circuit breaker pattern
- Detect downtime and alert operators
- Cache state locally during outage

**Acceptable?** Yes with fallback strategy

---

### Risk 4: API Breaking Changes (Low)
**Issue:** sync.parc.land changes API unexpectedly
**Impact:** Remote games fail
**Mitigation:**
- Version the backend interface (V1, V2, etc.)
- Maintain API compatibility layer
- Monitor API changes
- Keep file backend as fallback

**Acceptable?** Yes, change is rare and gradual

---

## Quick Start for Implementation

### Day 1: Abstraction
```bash
# Create interface
src/backend/state-backend.ts

# Refactor existing logic
src/backend/file-state-backend.ts (extract from src/core/game.ts)

# Create factory
src/backend/state-backend-factory.ts
```

### Day 2-3: Remote Backend
```bash
# Implement HTTP client
src/backend/remote-state-backend.ts

# Add cache layer
src/backend/cache-manager.ts

# Add retry logic
src/backend/client-utils.ts
```

### Day 4-5: CLI Integration
```bash
# Update command handlers
src/cli/commands/init.ts
src/cli/commands/register.ts
src/cli/commands/act.ts

# Add CLI flags
src/cli/index.ts
```

### Day 6-7: Testing & Docs
```bash
# Unit tests
src/__tests__/backend/
src/__tests__/remote/

# Integration tests
integration/remote-sync.test.ts

# Documentation
docs/REMOTE_SYNC_GUIDE.md
docs/API_TROUBLESHOOTING.md
```

---

## NOT Doing (Out of Scope)

- ✗ Real-time WebSocket/SSE (polling is sufficient)
- ✗ Multi-room orchestration (one game = one room)
- ✗ Agent authentication/authorization (all agents see all state)
- ✗ State snapshots/versioning (one current version per key)
- ✗ Distributed consensus voting (gamemaster decides)
- ✗ SQL backend (file + remote is enough)

These can be added in future phases if needed.

---

## Rollout Strategy

### Internal Testing (Week 1-2)
```bash
# Dogfood with existing games
./playtest markovs-chains 2 --remote-sync

# Test multi-machine with SSH tunnel
# Agent 1 (machine A): SSH forward to machine B's API
# Agent 2 (machine B): Uses public API
```

### Beta Testing (Week 3)
```bash
# Document in CLAUDE.md
# Add examples to EXTENSION-GUIDE.md
# Mark as "beta" in help text
```

### GA (Week 4)
```bash
# Remove beta warnings
# Add to CI/CD pipeline tests
# Promote in documentation
```

---

## Estimated Effort

| Phase | Task | Hours | Person-Hours |
|-------|------|-------|-------------|
| 1 | Abstraction | 6 | 6 |
| 1 | Message kinds | 2 | 2 |
| 2 | Remote backend | 8 | 8 |
| 2 | CLI integration | 4 | 4 |
| 3 | Testing | 10 | 10 |
| 3 | Documentation | 6 | 6 |
| **Total** | | **36** | **36** |

**Timeline:** 2-3 weeks for one developer

---

## Success Metrics

After implementation, measure:

1. **Adoption** - % of games using `--remote-sync`
2. **Reliability** - % of games that complete successfully
3. **Latency** - Average state update latency (target: < 200ms)
4. **Throughput** - Messages per game (target: > 50)
5. **Debuggability** - Can we replay games from API history?

---

## Decision Point

**Before Phase 1 starts:**
- ✓ Confirm sync.parc.land will remain stable
- ✓ Ensure API terms allow game state storage
- ✓ Get buy-in from team for optional feature
- ✓ Allocate developer time

**Recommend:** Proceed with Phase 1 (low risk foundation)

---

## Next Steps

1. **Review** this plan with team
2. **Validate** Phase 1 scope with stakeholders
3. **Create** tracking issue for Phase 1 tasks
4. **Start** with state backend abstraction
5. **Test** end-to-end with file backend first
6. **Then** add remote backend implementation

---

## Contact & Questions

For questions about this analysis or integration plan:
- See `/docs/SYNC_PARC_LAND_API_ANALYSIS.md` for detailed API findings
- See `/docs/REMOTE_STATE_INTEGRATION.md` for code examples
- Test room: `room_1771692589191_c0b742r` still available for experimentation
