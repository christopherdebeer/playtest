---
id: engine-022
name: "Building"
slug: building
category: building
summary: "Construction and placement mechanics"
source: engine
---

# Building

Core engine service for construction and placement mechanics. Provides the foundational building system that specialized building mechanics (pattern-building, network-and-route-building, etc.) build upon.

## Reference

- **ID**: engine-022
- **Category**: building (core service)
- **Source**: Engine core

## Usage in RULES.md

```yaml
---
mechanics:
  building: true
---
```

## Engine Implementation

Defines hooks for building/construction operations. Specialized building mechanics declare `requires: ['building']` to access these hooks.

### Hooks Defined

- Construction placement validation
- Building completion tracking
- Structure scoring

### Example Games

- Arcane Assembly
