#!/usr/bin/env npx tsx
/**
 * Generate split mechanics data files for lazy loading
 *
 * Outputs:
 * - public/data/mechanics/index.json - Lightweight list for MechanicsPage
 * - public/data/mechanics/{slug}.json - Full detail for MechanicDetailPage
 *
 * For implemented mechanics, includes:
 * - Source code (syntax highlighted)
 * - Action types from describeAction
 * - Config schema
 * - Hooks used
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MECHANICS_MD_DIR = join(__dirname, '..', '..', 'mechanics');
const MECHANICS_SRC_DIR = join(__dirname, '..', '..', 'src', 'mechanics');
const REGISTRY_FILE = join(__dirname, '..', '..', 'shared', 'registered-mechanics.json');
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data', 'mechanics');
const STATIC_OUTPUT_DIR = join(__dirname, '..', 'src', 'data');
const STATIC_OUTPUT_FILE = join(STATIC_OUTPUT_DIR, 'mechanics.json');

// Configure marked
marked.setOptions({ gfm: true, breaks: true });

interface MechanicIndex {
  slug: string;
  name: string;
  category: string;
  summary: string;
  source: 'bgg' | 'engine';
  implementationStatus: 'implemented' | 'partial' | 'not_implemented';
  bggEquivalent?: string;
  bggRelated?: string;
  gamesUsing: string[]; // Game IDs using this mechanic
}

interface MechanicDetail {
  slug: string;
  name: string;
  id: number | string;
  category: string;
  summary: string;
  description: string;
  contentHtml: string;
  source: 'bgg' | 'engine';
  bggUrl?: string;
  bggEquivalent?: string;
  bggRelated?: string;

  // Implementation info
  implementationStatus: 'implemented' | 'partial' | 'not_implemented';
  implementation?: {
    configKey: string;
    since: string;
    description?: string;
    configSchema?: Record<string, unknown>;
    hooks: string[];
    dependencies?: string[];
    conflicts?: string[];
    actionTypes?: ActionTypeInfo[];
  };
  implementationNotes?: string;

  // Source code (for implemented mechanics)
  sourceCode?: string;
  sourceFile?: string;

  // Games using this mechanic
  gamesUsing: GameReference[];
}

interface ActionTypeInfo {
  type: string;
  label: string;
  description: string;
  examples?: string[];
}

interface GameReference {
  id: string;
  name: string;
}

interface Registry {
  mechanics: Record<string, {
    config_key: string;
    since: string;
    description?: string;
    config_schema?: Record<string, unknown>;
    hooks: string[];
    dependencies?: string[];
    conflicts?: string[];
  }>;
  partial: Record<string, {
    notes: string;
    related_config?: string;
  }>;
}

interface MechanicsIndexJson {
  categories: string[];
  mechanics: Array<{
    slug: string;
    path: string;
    source?: string;
    bgg_equivalent?: string;
    bgg_related?: string;
  }>;
}

interface GameConfig {
  name: string;
  mechanics?: string[];
}

interface Game {
  id: string;
  config: GameConfig;
}

async function parseMechanicMarkdown(content: string): Promise<{
  id: number | string;
  name: string;
  slug: string;
  category: string;
  summary: string;
  bggUrl?: string;
  source?: string;
  bggEquivalent?: string;
  bggRelated?: string;
  description: string;
  contentHtml: string;
} | null> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const yamlContent = match[1];
  const markdownContent = match[2].trim();
  const config = parseYaml(yamlContent);

  // Extract description (first paragraph after heading)
  const descMatch = markdownContent.match(/^#[^\n]+\n+([^\n#]+)/);
  const description = descMatch ? descMatch[1].trim() : '';

  const contentHtml = await marked.parse(markdownContent);

  return {
    id: config.id,
    name: config.name,
    slug: config.slug,
    category: config.category,
    summary: config.summary || (description.split('.')[0] + '.'),
    bggUrl: config.bgg_url,
    source: config.source || 'bgg',
    bggEquivalent: config.bgg_equivalent,
    bggRelated: config.bgg_related,
    description,
    contentHtml,
  };
}

async function readSourceFile(slug: string): Promise<{ code: string; file: string } | null> {
  // Try different file path patterns
  const patterns = [
    `${slug}.ts`,
    `win-conditions/${slug.replace('win-', '')}.ts`,
    `core/${slug}.ts`,
  ];

  for (const pattern of patterns) {
    const filePath = join(MECHANICS_SRC_DIR, pattern);
    try {
      const code = await readFile(filePath, 'utf-8');
      return { code, file: `src/mechanics/${pattern}` };
    } catch {
      // Try next pattern
    }
  }

  return null;
}

async function loadGames(): Promise<Game[]> {
  try {
    const gamesPath = join(__dirname, '..', 'src', 'data', 'games.json');
    const content = await readFile(gamesPath, 'utf-8');
    return JSON.parse(content) as Game[];
  } catch {
    return [];
  }
}

function getGamesUsingMechanic(games: Game[], slug: string): GameReference[] {
  return games
    .filter(g => g.config.mechanics?.includes(slug))
    .map(g => ({ id: g.id, name: g.config.name }));
}

async function main() {
  console.log('Generating split mechanics data files...');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  // Load mechanics index
  let mechanicsIndex: MechanicsIndexJson;
  try {
    const content = await readFile(join(MECHANICS_MD_DIR, 'index.json'), 'utf-8');
    mechanicsIndex = JSON.parse(content);
  } catch (err) {
    console.error('Failed to load mechanics/index.json:', err);
    return;
  }

  // Load registry
  let registry: Registry = { mechanics: {}, partial: {} };
  try {
    const content = await readFile(REGISTRY_FILE, 'utf-8');
    registry = JSON.parse(content);
  } catch {
    console.warn('No registry found, all mechanics will show as not implemented');
  }

  // Load games for cross-reference
  const games = await loadGames();
  console.log(`Loaded ${games.length} games for cross-reference`);

  const indexEntries: MechanicIndex[] = [];
  const stats = { implemented: 0, partial: 0, notImplemented: 0, withSource: 0 };

  // Process each mechanic
  for (const mech of mechanicsIndex.mechanics) {
    const mechPath = join(MECHANICS_MD_DIR, mech.path);

    try {
      const content = await readFile(mechPath, 'utf-8');
      const parsed = await parseMechanicMarkdown(content);
      if (!parsed) continue;

      // Get implementation info
      const regEntry = registry.mechanics[parsed.slug];
      const partialEntry = registry.partial[parsed.slug];

      let implementationStatus: 'implemented' | 'partial' | 'not_implemented' = 'not_implemented';
      if (regEntry) {
        implementationStatus = 'implemented';
        stats.implemented++;
      } else if (partialEntry) {
        implementationStatus = 'partial';
        stats.partial++;
      } else {
        stats.notImplemented++;
      }

      // Get games using this mechanic
      const gamesUsing = getGamesUsingMechanic(games, parsed.slug);

      // Build index entry (lightweight)
      const indexEntry: MechanicIndex = {
        slug: parsed.slug,
        name: parsed.name,
        category: parsed.category,
        summary: parsed.summary,
        source: (mech.source || parsed.source || 'bgg') as 'bgg' | 'engine',
        implementationStatus,
        gamesUsing: gamesUsing.map(g => g.id),
      };
      if (mech.bgg_equivalent || parsed.bggEquivalent) {
        indexEntry.bggEquivalent = mech.bgg_equivalent || parsed.bggEquivalent;
      }
      if (mech.bgg_related || parsed.bggRelated) {
        indexEntry.bggRelated = mech.bgg_related || parsed.bggRelated;
      }
      indexEntries.push(indexEntry);

      // Build detail entry (full)
      const detail: MechanicDetail = {
        slug: parsed.slug,
        name: parsed.name,
        id: parsed.id,
        category: parsed.category,
        summary: parsed.summary,
        description: parsed.description,
        contentHtml: parsed.contentHtml,
        source: indexEntry.source,
        bggUrl: parsed.bggUrl,
        bggEquivalent: indexEntry.bggEquivalent,
        bggRelated: indexEntry.bggRelated,
        implementationStatus,
        gamesUsing,
      };

      // Add implementation details
      if (regEntry) {
        detail.implementation = {
          configKey: regEntry.config_key,
          since: regEntry.since,
          description: regEntry.description,
          configSchema: regEntry.config_schema,
          hooks: regEntry.hooks,
          dependencies: regEntry.dependencies,
          conflicts: regEntry.conflicts,
        };

        // Try to load source code
        const source = await readSourceFile(parsed.slug);
        if (source) {
          detail.sourceCode = source.code;
          detail.sourceFile = source.file;
          stats.withSource++;
        }
      } else if (partialEntry) {
        detail.implementationNotes = partialEntry.notes;
      }

      // Write detail file
      const detailPath = join(OUTPUT_DIR, `${parsed.slug}.json`);
      await writeFile(detailPath, JSON.stringify(detail, null, 2));

    } catch (err) {
      console.warn(`  Skipped: ${mech.slug} (${err})`);
    }
  }

  // Sort index by name
  indexEntries.sort((a, b) => a.name.localeCompare(b.name));

  // Write index file
  const indexOutput = {
    generated: new Date().toISOString(),
    count: indexEntries.length,
    categories: mechanicsIndex.categories,
    stats: {
      implemented: stats.implemented,
      partial: stats.partial,
      notImplemented: stats.notImplemented,
      withSource: stats.withSource,
    },
    mechanics: indexEntries,
  };

  const indexPath = join(OUTPUT_DIR, 'index.json');
  await writeFile(indexPath, JSON.stringify(indexOutput, null, 2));

  // Also generate static file for build-time imports (MechanicBadge, MechanicsSection)
  if (!existsSync(STATIC_OUTPUT_DIR)) {
    await mkdir(STATIC_OUTPUT_DIR, { recursive: true });
  }

  const staticOutput = {
    categories: mechanicsIndex.categories,
    count: indexEntries.length,
    implementationStats: {
      implemented: stats.implemented,
      partial: stats.partial,
      notImplemented: stats.notImplemented,
    },
    mechanics: indexEntries.map(m => ({
      id: m.slug, // Use slug as id for compatibility
      name: m.name,
      slug: m.slug,
      category: m.category,
      bggUrl: `https://boardgamegeek.com/boardgamemechanic/${m.slug}`,
      description: m.summary,
      source: m.source,
      implementationStatus: m.implementationStatus,
    })),
  };

  await writeFile(STATIC_OUTPUT_FILE, JSON.stringify(staticOutput, null, 2));
  console.log(`\nGenerated static mechanics file: ${STATIC_OUTPUT_FILE}`);

  console.log(`\nGenerated mechanics data:`);
  console.log(`  Index: ${indexPath} (${indexEntries.length} mechanics)`);
  console.log(`  Details: ${OUTPUT_DIR}/{slug}.json`);
  console.log(`\nStats:`);
  console.log(`  Implemented: ${stats.implemented}`);
  console.log(`  Partial: ${stats.partial}`);
  console.log(`  Not implemented: ${stats.notImplemented}`);
  console.log(`  With source code: ${stats.withSource}`);
}

main().catch(console.error);
