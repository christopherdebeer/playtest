---
id: engine-005
name: "Card Type Rules"
slug: card-type-rules
category: cards
summary: "Card type enforcement"
source: engine
---

# Card Type Rules

Card type enforcement mechanic for validating card plays based on card type constraints.

## Reference

- **ID**: engine-005
- **Category**: cards
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - card-type-rules
---
```

## Engine Implementation

The card-type-rules mechanic enforces constraints based on card types, ensuring players can only play cards that are valid for the current game state.

### Hooks

- `preValidateAction` - Validates card type constraints

### Configuration

Configuration is typically embedded in card definitions rather than mechanic config.
