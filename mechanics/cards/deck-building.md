---
id: engine-008
name: "Deck Building"
slug: deck-building
category: cards
summary: "Acquire cards into personal deck"
source: engine
bgg_equivalent: deck-bag-and-pool-building
---

# Deck Building

Acquire cards into your personal deck during the game, improving your options over time. Engine-specific implementation of the deck-building mechanic.

## Reference

- **ID**: engine-008
- **Category**: cards
- **Source**: Engine-specific
- **BGG Equivalent**: [Deck, Bag, and Pool Building](https://boardgamegeek.com/boardgamemechanic/2664/deck-bag-and-pool-building)

## Usage in RULES.md

```yaml
---
name: "My Game"
mechanics:
  - deck-building
---
```

## Engine Implementation

The deck-building mechanic allows players to acquire cards from a supply into their personal deck, with support for discard piles, reshuffling, and card acquisition strategies.

### Configuration Schema

```yaml
deck_building:
  starting_deck: array              # Initial cards in player deck
  supply: array                     # Cards available to acquire
  currency: string                  # Resource used to buy cards
  use_discard: boolean             # Use discard pile with reshuffle
  draw_count: number               # Cards drawn per turn
  acquire_to: hand | discard | deck_top  # Where acquired cards go
  allow_trash: boolean             # Can cards be permanently removed
  trash_pile: string               # Name of trash pile
```

### Hooks

- `preValidateAction` - Validates card acquisition
- `initPlayerState` - Initializes player deck
- `onExecuteAction` - Executes card acquisition
- `getAvailableActions` - Determines available cards to acquire
- `describeAction` - Generates acquisition action descriptions

### Example Games

- Dominion
- Star Realms
- Ascension
