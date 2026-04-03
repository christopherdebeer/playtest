---
id: engine-026
name: "Cards"
slug: cards
category: cards
summary: "Core card deck and hand management"
source: engine
---

# Cards

Core engine service for card deck management, hand tracking, draw/play/discard operations. Provides the foundational card system that all card-based mechanics build upon.

## Reference

- **ID**: engine-026
- **Category**: cards (core service)
- **Source**: Engine core

## Usage in RULES.md

```yaml
---
mechanics:
  cards:
    starting_hand: 5
    deck:
      - { name: "Gold Coin", count: 8, type: "treasure", effect: { type: "points", value: 5 } }
      - { name: "Silver Bar", count: 6, type: "treasure", effect: { type: "points", value: 10 } }
---
```

## Engine Implementation

The `cards` pseudo-key in RULES.md serves a dual role: it declares the cards core mechanic AND provides deck/hand configuration. During config normalization, `cards.deck` is extracted to `config.deck` and `cards.starting_hand` to `config.starting_cards`.

Auto-enabled via dependency resolution when any card-based mechanic is used (hand-management, card-matching, deck-building, etc.).

### Configuration Schema

```yaml
cards:
  starting_hand: number     # Cards dealt at game start
  deck:                     # Card definitions
    - name: string
      count: number
      type: string
      effect: object
```

### Hooks Implemented

- `initSharedState` - Build deck from config, shuffle
- `initPlayerState` - Deal starting hands
- `getPlayerView` - Expose hand to player
- `getAvailableActions` - Draw and play_card actions
- `preValidateAction` - Validate draw/play actions
- `onExecuteAction` - Execute draw/play/discard
- `getActionSchema` - Schema for card actions
- `reverseAction` - Undo card plays

### Hooks Defined (for other mechanics)

- `onBeforeCardDraw` / `onCardDrawn`
- `onBeforeCardPlay` / `onCardPlayed`
- `onCardDiscarded`
- `onBeforeAddToHand` / `onAfterAddToHand` / `onAfterRemoveFromHand`
- `filterPlayableCards`

### Dependents

15+ mechanics require `cards`: hand-management, card-matching, deck-building, closed-drafting, open-drafting, multi-use-cards, trick-taking, command-cards, melding-and-splaying, set-collection, and more.

### Example Games

- Used by 13+ games including AAOTE, Markov's Chains, Fortune Seekers, UNO, Spellbook Showdown, Draft Duel
