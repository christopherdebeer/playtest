# Game Mechanics Reference

This directory contains a categorized database of 192 board game mechanics extracted from [BoardGameGeek](https://boardgamegeek.com/browse/boardgamemechanic).

## Structure

```
mechanics/
├── index.json          # Master index with all mechanics
├── README.md           # This file
├── generate.ts         # Generator script
├── _raw_mechanics.txt  # Raw BGG data
│
├── action/             # Action-related mechanics
├── auction/            # Auction and bidding variants
├── building/           # Building and construction
├── cards/              # Card game mechanics
├── conflict/           # Combat and conflict resolution
├── cooperative/        # Cooperative and team mechanics
├── dice/               # Dice and randomness
├── economic/           # Economic and trading
├── ending/             # Game ending conditions
├── information/        # Hidden info and deduction
├── movement/           # Movement mechanics
├── other/              # Uncategorized mechanics
├── physical/           # Physical/dexterity mechanics
├── social/             # Social interaction mechanics
├── turn-order/         # Turn order systems
├── victory/            # Victory conditions
└── worker-placement/   # Worker placement variants
```

## Usage

### CLI Commands

```bash
# List all categories
npx playtest mechanic --list

# List mechanics in a category
npx playtest mechanic -c cards

# Look up a mechanic by slug
npx playtest mechanic hand-management

# Look up by BGG ID
npx playtest mechanic 2040

# Search mechanics
npx playtest mechanic auction

# Get full markdown description
npx playtest mechanic hand-management --markdown

# JSON output
npx playtest mechanic hand-management --json
```

### Referencing in RULES.md

Add mechanics to your game's RULES.md frontmatter:

```yaml
---
name: "My Game"
mechanics:
  - hand-management
  - set-collection
  - push-your-luck
---
```

This allows:
1. Gamemaster agents to understand which mechanics apply
2. Validation that mechanics exist
3. Auto-documentation of game mechanics

### Mechanic File Format

Each mechanic has a markdown file with YAML frontmatter:

```markdown
---
id: 2040
name: "Hand Management"
slug: hand-management
category: cards
bgg_url: https://boardgamegeek.com/boardgamemechanic/2040/hand-management
---

# Hand Management

Players manage a hand of cards, deciding when to play each card for maximum effect.

## Reference

- **BGG ID**: 2040
- **Category**: cards
- **BGG URL**: [Hand Management](https://boardgamegeek.com/boardgamemechanic/2040/hand-management)

## Usage in RULES.md

\```yaml
---
name: "My Game"
mechanics:
  - hand-management
---
\```
```

## Categories

| Category | Description |
|----------|-------------|
| action | Action point systems, action drafting, queues |
| auction | All auction types (Dutch, English, sealed bid, etc.) |
| building | Construction, tile placement, tech trees |
| cards | Hand management, drafting, trick-taking, deck building |
| conflict | Combat resolution, area control |
| cooperative | Co-op, semi-co-op, team, traitor games |
| dice | Dice rolling, push your luck, re-rolling |
| economic | Markets, trading, stocks, loans |
| ending | End conditions (sudden death, player elimination) |
| information | Hidden info, deduction, memory |
| movement | All movement types (grid, area, point-to-point) |
| other | Miscellaneous mechanics |
| physical | Dexterity, flicking, stacking |
| social | Negotiation, voting, acting, bluffing |
| turn-order | Turn order determination systems |
| victory | Victory conditions and scoring |
| worker-placement | Worker placement variants |

## Regenerating

To regenerate mechanics from updated raw data:

```bash
npx tsx mechanics/generate.ts
```

## Source

Data sourced from [BoardGameGeek Board Game Mechanics](https://boardgamegeek.com/browse/boardgamemechanic) database.
