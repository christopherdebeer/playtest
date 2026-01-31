# Proposal 008: Hand Limits and Card Type Restrictions

**Status**: Draft
**Category**: Engine Mechanics
**Priority**: High
**Discovered**: AAOTE Playtest v0.1 (2026-01-31)

## Problem Statement

Two related issues were discovered:

1. **No Hand Limit**: Players accumulated excessive cards (31 cards in one case)
2. **No Card Type Restrictions**: Items could be "played" like events, discarding them instead of holding them

### Evidence from Playtest

#### Hand Size Issue
```
Turn 22: player-2 hand size = 32 cards
Turn 40: player-2 hand size = 31 cards
```

Player-2 used a draw-heavy strategy to accumulate an extreme card advantage.

#### Card Type Issue
```
Turn 6:  player-3 plays "Dark Tome" (type: item, subtype: forbidden)
Turn 26: player-1 plays "Dark Tome" (type: item, subtype: forbidden)
Turn 26: player-3 plays "Cursed Amulet" (type: item, subtype: forbidden)
Turn 16: player-3 plays "Lantern" (type: item)
Turn 23: player-3 plays "Supplies" (type: item)
```

All these items should have been held in hand, not played to discard.

## Proposed Solution

### Part A: Hand Limits

#### Configuration

```yaml
engine_mechanics:
  hand_limit: 7
  hand_limit_policy: "discard_choice"  # or "cannot_draw", "discard_oldest"
```

#### Enforcement

```typescript
// After draw action
if (player.hand.length > config.engine_mechanics.hand_limit) {
  const excess = player.hand.length - config.engine_mechanics.hand_limit;

  switch (config.engine_mechanics.hand_limit_policy) {
    case 'cannot_draw':
      // Prevent the draw entirely
      return { valid: false, errors: [`Hand limit (${limit}) reached. Cannot draw.`] };

    case 'discard_choice':
      // Queue a forced discard action
      state.pendingActions.push({
        player: playerId,
        type: 'forced_discard',
        count: excess,
        reason: 'hand_limit'
      });
      break;

    case 'discard_oldest':
      // Auto-discard first drawn cards
      const discarded = player.hand.splice(0, excess);
      state.discard.push(...discarded);
      break;
  }
}
```

### Part B: Card Type Restrictions

#### Configuration

```yaml
deck:
  - { name: "Lantern", type: "item", playable: false, ... }
  - { name: "Spy", type: "event", playable: true, ... }
```

Or at the engine level:

```yaml
engine_mechanics:
  card_type_rules:
    item:
      playable: false
      tradeable: true
      holdable: true
    event:
      playable: true
      tradeable: false
      holdable: true
    location:
      playable: false  # Use place_location action instead
      placeable: true
```

#### Enforcement

```typescript
case 'play_card': {
  const card = player.hand.find(c => c.name === playAction.card);

  // Check card type restrictions
  const typeRules = config.engine_mechanics?.card_type_rules?.[card.type];
  if (typeRules && typeRules.playable === false) {
    errors.push(
      `Cannot play "${card.name}". Cards of type "${card.type}" cannot be played. ` +
      `${card.type === 'item' ? 'Items are held in hand until used or traded.' : ''}`
    );
    break;
  }

  // Existing play_card logic...
}
```

## Implementation Details

### New Types

```typescript
interface HandLimitConfig {
  limit: number;
  policy: 'cannot_draw' | 'discard_choice' | 'discard_oldest';
}

interface CardTypeRules {
  playable: boolean;
  tradeable: boolean;
  holdable: boolean;
  placeable?: boolean;
}

interface EngineMechanics {
  // existing...
  hand_limit?: number;
  hand_limit_policy?: string;
  card_type_rules?: Record<string, CardTypeRules>;
}
```

### Files to Modify

1. `engine/src/types.ts` - Add config types
2. `engine/src/game.ts` - Add validation in `validateAction()`
3. `engine/src/game.ts` - Add enforcement in `executeAction()`
4. `engine/src/game.ts` - Add hand limit check after draws

### Available Actions Update

Update `getAvailableActions()` to respect card type rules:

```typescript
function getAvailableActions(state: GameState, playerId: string): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const player = state.players[playerId];
  const typeRules = state.config.engine_mechanics?.card_type_rules;

  // Play card - only for playable types
  const playableCards = player.hand.filter(card => {
    if (!typeRules) return true;
    return typeRules[card.type]?.playable !== false;
  });

  if (playableCards.length > 0) {
    actions.push({
      type: 'play_card',
      description: 'Play an event card',
      examples: playableCards.slice(0, 2).map(c => ({ type: 'play_card', card: c.name }))
    });
  }

  // Place location - only for placeable types
  const placeableCards = player.hand.filter(card => {
    if (!typeRules) return card.type === 'location';
    return typeRules[card.type]?.placeable === true;
  });

  // ... etc
}
```

## Migration

### RULES.md Updates for AAOTE

```yaml
engine_mechanics:
  # Add hand limit
  hand_limit: 7
  hand_limit_policy: "discard_choice"

  # Add card type rules
  card_type_rules:
    item:
      playable: false
      tradeable: true
      holdable: true
    event:
      playable: true
      tradeable: false
      holdable: false
    location:
      playable: false
      placeable: true
      holdable: true
```

### Backwards Compatibility

- Games without `hand_limit` have no limit (current behavior)
- Games without `card_type_rules` allow all cards to be played (current behavior)

## Testing

### Hand Limit Tests
1. Draw up to hand limit - success
2. Draw beyond hand limit with "cannot_draw" - error
3. Draw beyond hand limit with "discard_choice" - pending action created
4. Draw beyond hand limit with "discard_oldest" - auto-discard

### Card Type Tests
1. Play event card - success
2. Play item card (with restrictions) - error
3. Trade item card - success
4. Place location card - success

## Open Questions

1. Should hand limit apply at end of turn or immediately?
2. How to handle "use item" actions vs "play card" actions?
3. Should items have activation effects when "used"?
4. How to communicate item/event distinction to agents?

---

*Proposal created based on AAOTE playtest findings*
