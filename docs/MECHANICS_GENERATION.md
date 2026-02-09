# Mechanics Generation Architecture

## Overview

The mechanics system has **two parallel sources of truth** that serve different purposes:

1. **Documentation** (`mechanics/*/`) - BGG reference mechanics (implemented or not)
2. **Runtime** (`src/mechanics/`) - Actual TypeScript implementations with hooks

Build scripts merge these to produce site data.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ SOURCE SYSTEMS (Two parallel sources of truth)               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ 1. DOCUMENTATION (mechanics/*/*.md)                          │
│    - 209 mechanics (192 BGG + 17 engine)                     │
│    - Frontmatter: id, name, slug, category, summary          │
│    - Content: Full descriptions for reference                │
│    │                                                          │
│    └──> scripts/generate-mechanics-index.ts                  │
│         Output: mechanics/index.json                         │
│                                                               │
│ 2. RUNTIME (src/mechanics/*.ts)                              │
│    - 162 implemented mechanics                               │
│    - Introspection: hooks, config_schema, dependencies       │
│    - Methods: getHighlight(), preValidateAction(), etc       │
│    │                                                          │
│    └──> scripts/generate-mechanics-registry.ts               │
│         Output: shared/registered-mechanics.json             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ INTEGRATION LAYER                                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ site/scripts/generate-mechanics-data.ts                      │
│   Inputs: mechanics/index.json + shared/registered-mechanics.json │
│   Merges documentation with implementation metadata         │
│   Output: public/data/mechanics/*.json (for website)        │
│                                                               │
│ site/scripts/generate-games.ts                               │
│   Direct import: mechanicRegistry (runtime)                  │
│   Calls: mechanicRegistry.getHighlights(slug, config)       │
│   Output: site/src/data/games.json                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Build Scripts

From `package.json`, the `generate` script runs 5 steps in sequence:

```bash
npm run generate:registry           # Runtime → shared/registered-mechanics.json
npm run generate:games              # Games → site/src/data/games.json
npm run generate:mechanics-index    # Markdown → mechanics/index.json
npm run generate:mechanics          # Merge → public/data/mechanics/*.json
npm run generate:logs               # Logs → public/data/logs/
npm run generate:docs               # Docs → public/data/docs/
```

### 1. generate:registry
**Script**: `scripts/generate-mechanics-registry.ts`
**Input**: Runtime mechanic imports (`src/mechanics/`)
**Output**: `shared/registered-mechanics.json`

Introspects the TypeScript mechanic registry to extract:
- Config keys and schemas
- Hooks implemented
- Dependencies and conflicts
- Implementation metadata

### 2. generate:mechanics-index
**Script**: `scripts/generate-mechanics-index.ts`
**Input**: Markdown files (`mechanics/*/*.md`)
**Output**: `mechanics/index.json`

Scans markdown files and extracts frontmatter to build an index of all reference mechanics (implemented or not).

### 3. generate:mechanics
**Script**: `site/scripts/generate-mechanics-data.ts`
**Input**:
- `mechanics/index.json` (documentation)
- `shared/registered-mechanics.json` (runtime metadata)
- `src/mechanics/*.ts` (source code)
- `site/src/data/games.json` (game references)

**Output**:
- `public/data/mechanics/index.json` (lightweight list)
- `public/data/mechanics/{slug}.json` (full detail per mechanic)
- `site/src/data/mechanics.json` (static bundle)

Merges documentation with implementation details, adds source code, and cross-references games.

### 4. generate:games
**Script**: `site/scripts/generate-games.ts`
**Input**:
- `games/*/RULES.md` (game configs)
- Runtime mechanic registry (for `getHighlight()`)

**Output**: `site/src/data/games.json`

Parses game RULES.md files, extracts mechanics, calls `mechanicRegistry.getHighlights()` to get card highlights, converts markdown to HTML.

## Why Two Systems?

| System | Purpose | Count |
|--------|---------|-------|
| **Documentation** | Reference all BGG mechanics (whether implemented or not) | 209 mechanics |
| **Runtime** | Describe capabilities of implemented mechanics | 162 mechanics |

This separation allows:
- Documenting mechanics before they're implemented
- Tracking implementation status (209 reference, 162 implemented)
- Site can show "not yet implemented" mechanics with descriptions

## When to Update Each System

### Add a new mechanic implementation:
1. Create `src/mechanics/{slug}.ts` with `MechanicHooks` implementation
2. Register in `src/mechanics/index.ts`
3. Create `mechanics/{category}/{slug}.md` with documentation frontmatter
4. Run `npm run generate` to rebuild all

### Document a BGG mechanic (not yet implemented):
1. Create `mechanics/{category}/{slug}.md` with frontmatter
2. Run `npm run generate:mechanics-index` to update index
3. Site will show it as "not implemented"

### Update mechanic description:
1. Edit `mechanics/{category}/{slug}.md` markdown content
2. Run `npm run generate` to rebuild site data

### Change mechanic config schema:
1. Update `configSchema` in `src/mechanics/{slug}.ts`
2. Run `npm run generate:registry` to update registered-mechanics.json
3. Run `npm run generate:mechanics` to merge into site data

## Known Issues

### Pseudo-Key Problem

`cards` and `board` receive special treatment in config parsing:

**Runtime** (`src/core/rules.ts:38-50`):
```typescript
if (key === 'cards') {
  config.deck = cardsConfig.deck;
  config.starting_cards = cardsConfig.starting_hand;
  engineMechanics.cards = value;
  continue;
}
```

**Build-time** (`site/scripts/generate-games.ts:56-72`):
```typescript
// Unified format: extract pseudo-keys and mechanic slugs
if (key === 'cards') {
  startingCards = cardsConfig?.starting_hand;
  deck = cardsConfig?.deck;
}
```

**Why this is a problem** (see `docs/MECHANICS.md:699-737`):
- Prevents `cards` and `board` from being first-class mechanics
- Requires special handling in build scripts
- Config is decomposed to top-level instead of staying in `engine_mechanics`

**Solution path** (outlined in MECHANICS.md):
1. Cards/board own init via `initSharedState`/`initPlayerState` hooks
2. Keep config in `engine_mechanics.cards`/`engine_mechanics.board`
3. Remove pseudo-key decomposition from `normalizeUnifiedConfig()` and `extractFromMechanics()`
4. Remove special cases from `generate-games.ts`

This would make cards and board participate as normal mechanics in the registry.

## File Locations Reference

```
mechanics/
  index.json                    ← Generated by generate-mechanics-index.ts
  {category}/{slug}.md          ← Hand-authored markdown

scripts/
  generate-mechanics-index.ts   → mechanics/index.json
  generate-mechanics-registry.ts → shared/registered-mechanics.json

shared/
  registered-mechanics.json     ← Generated by generate-mechanics-registry.ts

site/scripts/
  generate-mechanics-data.ts    → public/data/mechanics/*.json
  generate-games.ts             → site/src/data/games.json
  generate-logs.js              → public/data/logs/
  generate-docs.js              → public/data/docs/

site/src/data/
  mechanics.json                ← Static bundle (generate-mechanics-data.ts)
  games.json                    ← Game metadata (generate-games.ts)

site/public/data/
  mechanics/
    index.json                  ← Lightweight list
    {slug}.json                 ← Full detail per mechanic
  games/
    {game-id}.json              ← Per-game data
```