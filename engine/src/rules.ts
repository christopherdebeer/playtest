// Rules parser - extracts YAML frontmatter and markdown from RULES.md

import { readFileSync } from 'fs';
import { parse as parseYAML } from 'yaml';
import type { GameConfig, DeckConfig, Card } from './types.js';

export interface ParsedRules {
  config: GameConfig;
  markdown: string;
}

export function parseRules(rulesPath: string): ParsedRules {
  const content = readFileSync(rulesPath, 'utf-8');

  // Extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error(`Invalid RULES.md format: missing YAML frontmatter in ${rulesPath}`);
  }

  const yamlContent = frontmatterMatch[1];
  const markdown = frontmatterMatch[2].trim();

  let config: GameConfig;
  try {
    config = parseYAML(yamlContent) as GameConfig;
  } catch (e) {
    throw new Error(`Failed to parse YAML frontmatter: ${e}`);
  }

  // Validate required fields
  if (!config.name) throw new Error('RULES.md missing required field: name');
  if (!config.win_condition) throw new Error('RULES.md missing required field: win_condition');

  // Set defaults
  config.max_turns = config.max_turns ?? 50;
  config.starting_cards = config.starting_cards ?? 0;

  return { config, markdown };
}

export function buildDeck(deckConfig: DeckConfig[]): Card[] {
  const deck: Card[] = [];

  for (const cardDef of deckConfig) {
    for (let i = 0; i < cardDef.count; i++) {
      deck.push({
        name: cardDef.name,
        type: cardDef.type ?? 'standard',
        effect: cardDef.effect ?? { type: 'none' }
      });
    }
  }

  return deck;
}

export function shuffleDeck<T>(deck: T[]): T[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getPlayerCount(config: GameConfig): { min: number; max: number } {
  if (typeof config.players === 'number') {
    return { min: config.players, max: config.players };
  }
  return config.players;
}

// Look up card definition from config by name
export function getCardDefinition(config: GameConfig, cardName: string): DeckConfig | null {
  if (!config.deck) return null;
  return config.deck.find(c => c.name === cardName) ?? null;
}
