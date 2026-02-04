---
id: engine-004
name: "Card Matching"
slug: card-matching
category: cards
summary: "UNO-style color/value matching"
source: engine
---

# Card Matching

UNO-style card matching mechanic with color and value rules for determining playable cards.

## Reference

- **ID**: engine-004
- **Category**: cards
- **Source**: Engine-specific

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - card-matching
---
```

## Engine Implementation

The card-matching mechanic implements UNO-style card play rules where cards must match either color or value of the previous card played.

### Configuration Schema

```yaml
card_matching:
  colors: array                      # Valid card colors
  value_matching: boolean            # Allow matching by value
  action_matching: boolean           # Allow matching by action type
  allow_any_when_no_color: boolean  # Allow any card when no color match exists
```

### Hooks

- `preValidateAction` - Validates that played card matches current card
- `postExecuteAction` - Updates current card after valid play

### Example Games

- UNO
- Crazy Eights
