/**
 * Utilities for fetching mechanics data with lazy loading and caching
 */

// Types for index (lightweight)
export interface MechanicIndexEntry {
  slug: string;
  name: string;
  category: string;
  summary: string;
  source: 'bgg' | 'engine';
  implementationStatus: 'implemented' | 'partial' | 'not_implemented';
  bggEquivalent?: string;
  bggRelated?: string;
  gamesUsing: string[];
}

export interface MechanicsIndex {
  generated: string;
  count: number;
  categories: string[];
  stats: {
    implemented: number;
    partial: number;
    notImplemented: number;
    withSource: number;
  };
  mechanics: MechanicIndexEntry[];
}

// Types for detail (full)
export interface GameReference {
  id: string;
  name: string;
}

export interface MechanicImplementation {
  configKey: string;
  since: string;
  description?: string;
  configSchema?: Record<string, unknown>;
  hooks: string[];
  dependencies?: string[];
  conflicts?: string[];
  actionTypes?: Array<{
    type: string;
    label: string;
    description: string;
    examples?: string[];
  }>;
}

export interface MechanicDetail {
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
  implementationStatus: 'implemented' | 'partial' | 'not_implemented';
  implementation?: MechanicImplementation;
  implementationNotes?: string;
  sourceCode?: string;
  sourceFile?: string;
  gamesUsing: GameReference[];
}

// Cache for loaded data
const cache = new Map<string, unknown>();

/**
 * Fetch mechanics index (lightweight list for MechanicsPage)
 */
export async function fetchMechanicsIndex(): Promise<MechanicsIndex> {
  const cacheKey = 'mechanics-index';

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as MechanicsIndex;
  }

  const response = await fetch('/data/mechanics/index.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch mechanics index: ${response.statusText}`);
  }

  const data = await response.json();
  cache.set(cacheKey, data);
  return data;
}

/**
 * Fetch mechanic detail (full data for MechanicDetailPage)
 */
export async function fetchMechanicDetail(slug: string): Promise<MechanicDetail> {
  const cacheKey = `mechanic-detail-${slug}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as MechanicDetail;
  }

  const response = await fetch(`/data/mechanics/${slug}.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch mechanic detail: ${response.statusText}`);
  }

  const data = await response.json();
  cache.set(cacheKey, data);
  return data;
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearMechanicsCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith('mechanic')) {
      cache.delete(key);
    }
  }
}
