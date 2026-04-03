---
id: engine-023
name: "Cooperative Actions"
slug: cooperative-actions
category: cooperative
summary: "Cooperative play with shared resources"
source: engine
---

# Cooperative Actions

Players work together using shared resources to overcome collective threats. Unlike full cooperative games, this mechanic can be combined with competitive elements.

## Reference

- **ID**: engine-023
- **Category**: cooperative
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
mechanics:
  cooperative_actions:
    shared_pool: { supplies: 10, morale: 5 }
    threat_per_round: 1
---
```

## Engine Implementation

Manages shared resource pools and collective threat tracking.

### Configuration Schema

```yaml
cooperative_actions:
  shared_pool: Record<string, number>   # Shared resources
  threat_per_round: number              # Threat escalation rate
```

### Hooks

- `initSharedState` - Initialize shared resource pool
- `onTurnEnd` - Escalate threat level

### Example Games

- Alliance
