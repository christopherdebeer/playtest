#!/usr/bin/env tsx
/**
 * Generate mechanics/index.json from mechanics markdown files
 *
 * Scans all mechanics markdown files and extracts frontmatter to build the index.
 * This makes markdown files the single source of truth.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

const MECHANICS_DIR = path.join(process.cwd(), 'mechanics');
const OUTPUT_FILE = path.join(MECHANICS_DIR, 'index.json');

interface MechanicFrontmatter {
  id: string | number;
  name: string;
  slug: string;
  category: string;
  source?: string;
  bgg_url?: string;
  bgg_equivalent?: string;
  bgg_related?: string;
  [key: string]: any;
}

interface MechanicIndexEntry {
  id: string;
  name: string;
  slug: string;
  category: string;
  path: string;
  source?: string;
  bgg_equivalent?: string;
  bgg_related?: string;
}

async function extractFrontmatter(content: string): Promise<MechanicFrontmatter | null> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  try {
    const frontmatter = parseYaml(match[1]);
    return frontmatter;
  } catch (err) {
    console.error('Failed to parse YAML:', err);
    return null;
  }
}

async function scanMechanicsDirectory(): Promise<MechanicIndexEntry[]> {
  const mechanics: MechanicIndexEntry[] = [];
  const categories = new Set<string>();

  // Read all category directories
  const entries = await fs.readdir(MECHANICS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const categoryDir = entry.name;
    categories.add(categoryDir);

    // Read all markdown files in this category
    const categoryPath = path.join(MECHANICS_DIR, categoryDir);
    const files = await fs.readdir(categoryPath);

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'README.md') {
        continue;
      }

      const filePath = path.join(categoryPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const frontmatter = await extractFrontmatter(content);

      if (!frontmatter) {
        console.warn(`  Skipped ${categoryDir}/${file}: No frontmatter`);
        continue;
      }

      if (!frontmatter.id || !frontmatter.name || !frontmatter.slug || !frontmatter.category) {
        console.warn(`  Skipped ${categoryDir}/${file}: Missing required fields`);
        continue;
      }

      const mechanic: MechanicIndexEntry = {
        id: String(frontmatter.id),
        name: frontmatter.name,
        slug: frontmatter.slug,
        category: frontmatter.category,
        path: `${categoryDir}/${file}`,
      };

      // Add optional fields
      if (frontmatter.source) {
        mechanic.source = frontmatter.source;
      }
      if (frontmatter.bgg_equivalent) {
        mechanic.bgg_equivalent = frontmatter.bgg_equivalent;
      }
      if (frontmatter.bgg_related) {
        mechanic.bgg_related = frontmatter.bgg_related;
      }

      mechanics.push(mechanic);
    }
  }

  return mechanics;
}

async function main() {
  console.log('Generating mechanics/index.json from markdown files...');

  const mechanics = await scanMechanicsDirectory();

  // Sort by category, then name
  mechanics.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  // Extract unique categories in order
  const categories = Array.from(new Set(mechanics.map(m => m.category))).sort();

  // Count sources
  const sourceStats = mechanics.reduce((acc, m) => {
    const source = m.source || 'bgg';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const output = {
    source: 'Generated from mechanics/*/*.md frontmatter',
    count: mechanics.length,
    sourceBreakdown: sourceStats,
    categories,
    mechanics,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n');

  console.log(`✓ Generated ${OUTPUT_FILE}`);
  console.log(`  Total: ${mechanics.length} mechanics`);
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Sources:`, Object.entries(sourceStats).map(([k, v]) => `${k}=${v}`).join(', '));
}

main().catch((err) => {
  console.error('Failed to generate mechanics index:', err);
  process.exit(1);
});
