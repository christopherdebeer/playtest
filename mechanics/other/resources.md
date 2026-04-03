---
id: engine-021
name: "Resources"
slug: resources
category: other
summary: "Resource/currency tracking"
source: engine
---

# Resources

Core engine service for tracking player resources and currencies. Provides the foundational resource management system that other mechanics build upon.

## Reference

- **ID**: engine-021
- **Category**: other (core service)
- **Source**: Engine core

## Usage in RULES.md

```yaml
---
mechanics:
  resources:
    - { name: "gold", starting_amount: 10, max: 50 }
    - { name: "wood", starting_amount: 5 }
---
```

## Engine Implementation

Defines hooks for resource gain/spend operations. All resource-mutating mechanics use the resource service API for proper hook firing.

### Configuration Schema

```yaml
resources:
  - name: string                # Resource identifier
    starting_amount: number     # Initial amount per player
    max: number                 # Optional maximum cap
```

### Hooks Defined

- `onBeforeResourceGain` - Before resources are added (can block)
- `onBeforeResourceSpend` - Before resources are spent (can block)
- `onResourceGained` - After resources are added
- `onResourceSpent` - After resources are spent

### API

- `addResource(state, playerId, resource, amount)`
- `spendResource(state, playerId, resource, amount)`
- `setResource(state, playerId, resource, amount)`
- `getResource`, `hasResource`, `getAllResources`

### Example Games

- Used by 10+ games including Dice Dynasties, Battle Forge, Council of Whispers, Shadow Operations, Treasure Hunters
