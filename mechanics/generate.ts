#!/usr/bin/env npx ts-node

// Mechanics generator script
// Parses _raw_mechanics.txt and generates categorized markdown files

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const MECHANICS_DIR = dirname(import.meta.url.replace('file://', ''));

interface MechanicDef {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  bggUrl: string;
}

// Category mappings based on mechanic name patterns
function categorize(name: string): string {
  const n = name.toLowerCase();

  // Auction variants
  if (n.startsWith('auction')) return 'auction';

  // Turn order variants
  if (n.startsWith('turn order')) return 'turn-order';

  // Worker placement variants
  if (n.startsWith('worker placement')) return 'worker-placement';

  // Action-related
  if (n.startsWith('action')) return 'action';

  // Movement mechanics
  if (n.includes('movement') || n.includes('move') || n === 'grid coverage' ||
      n === 'hexagon grid' || n === 'square grid' || n === 'line of sight' ||
      n === 'zone of control' || n === 'rondel') return 'movement';

  // Card mechanics
  if (n.includes('card') || n.includes('deck') || n.includes('hand') ||
      n.includes('drafting') || n === 'trick-taking' || n === 'ladder climbing' ||
      n === 'melding and splaying' || n === 'set collection') return 'cards';

  // Cooperative
  if (n.includes('cooperative') || n.includes('team') || n === 'traitor game' ||
      n === 'alliances' || n === 'semi-cooperative game') return 'cooperative';

  // Economic
  if (n.includes('market') || n.includes('stock') || n.includes('trading') ||
      n === 'income' || n === 'loans' || n === 'investment' || n === 'contracts' ||
      n === 'commodity speculation' || n === 'ownership' || n === 'bribery') return 'economic';

  // Conflict/combat
  if (n.includes('conflict') || n.includes('combat') || n.includes('attack') ||
      n === 'critical hits and failures' || n.includes('ratio') || n === 'area-impulse' ||
      n === 'chit-pull system' || n === 'command cards' || n === 'force commitment' ||
      n === 'secret unit deployment' || n === 'kill steal') return 'conflict';

  // Ending conditions
  if (n.includes('ending') || n === 'player elimination' || n === 'single loser game' ||
      n === 'race') return 'ending';

  // Victory conditions
  if (n.includes('victory') || n.includes('scoring') || n === 'end game bonuses' ||
      n === 'catch the leader' || n === 'king of the hill') return 'victory';

  // Physical/dexterity
  if (n === 'flicking' || n === 'stacking and balancing' || n === 'physical removal' ||
      n === 'singing' || n === 'speed matching' || n === 'real-time' ||
      n === 'cube tower' || n === 'measurement movement') return 'physical';

  // Dice/randomness
  if (n.includes('dice') || n.includes('roll') || n === 'push your luck' ||
      n === 're-rolling and locking') return 'dice';

  // Information/deduction
  if (n.includes('hidden') || n === 'deduction' || n === 'induction' ||
      n === 'memory' || n === 'pattern recognition' || n === 'targeted clues' ||
      n === 'questions and answers') return 'information';

  // Social/negotiation
  if (n === 'negotiation' || n === 'voting' || n === 'betting and bluffing' ||
      n === 'player judge' || n === 'i cut, you choose' || n === "prisoner's dilemma" ||
      n === 'communication limits' || n === 'acting' || n === 'storytelling' ||
      n === 'role playing') return 'social';

  // Building/construction
  if (n.includes('building') || n.includes('placement') || n === 'enclosure' ||
      n === 'connections' || n === 'network and route building' || n === 'tech trees / tech tracks' ||
      n === 'crayon rail system' || n === 'map addition') return 'building';

  return 'other';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/\:,]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Default descriptions based on mechanic type
const defaultDescriptions: Record<string, string> = {
  'action-points': 'A player receives a number of Action Points on their turn, which they may spend on a variety of actions.',
  'dice-rolling': 'Players roll dice to determine outcomes, introducing randomness into game decisions.',
  'hand-management': 'Players manage a hand of cards, deciding when to play each card for maximum effect.',
  'set-collection': 'Players collect sets of items to score points or achieve objectives.',
  'worker-placement': 'Players place worker tokens on action spaces to perform actions, blocking others from using those spaces.',
  'tile-placement': 'Players place tiles to build a shared or personal playing area.',
  'trick-taking': 'Players play cards in rounds (tricks), with the highest card winning the trick.',
  'area-majority---influence': 'Players compete to have the most pieces or influence in various areas.',
  'cooperative-game': 'Players work together against the game system rather than competing against each other.',
  'trading': 'Players exchange resources, cards, or other game elements with each other.',
  'auction---bidding': 'Players bid resources to acquire items, with the highest bidder winning.',
  'push-your-luck': 'Players repeatedly take risks, weighing potential rewards against the chance of losing everything.',
  'deck--bag--and-pool-building': 'Players construct a personal deck, bag, or pool of items that improves over the course of the game.',
  'variable-player-powers': 'Each player has unique abilities that create asymmetric gameplay.',
  'modular-board': 'The game board is made of interchangeable pieces, creating a different layout each game.',
  'hidden-roles': 'Players have secret roles that determine their objectives and allegiances.',
  'player-elimination': 'Players can be eliminated from the game before it ends.',
  'take-that': 'Players can directly attack or hinder other players.',
  'roll---spin-and-move': 'Players roll dice or spin a spinner to determine how far they move.',
  'simultaneous-action-selection': 'All players choose their actions at the same time, then reveal them together.',
};

function getDescription(slug: string, name: string): string {
  if (defaultDescriptions[slug]) {
    return defaultDescriptions[slug];
  }
  return `${name} is a board game mechanic. See BGG for detailed definition.`;
}

function generateMarkdown(mech: MechanicDef): string {
  return `---
id: ${mech.id}
name: "${mech.name}"
slug: ${mech.slug}
category: ${mech.category}
bgg_url: ${mech.bggUrl}
---

# ${mech.name}

${mech.description}

## Reference

- **BGG ID**: ${mech.id}
- **Category**: ${mech.category}
- **BGG URL**: [${mech.name}](${mech.bggUrl})

## Usage in RULES.md

\`\`\`yaml
---
name: "My Game"
mechanics:
  - ${mech.slug}
---
\`\`\`
`;
}

function main() {
  const rawPath = join(MECHANICS_DIR, '_raw_mechanics.txt');
  const raw = readFileSync(rawPath, 'utf-8');

  const mechanics: MechanicDef[] = [];
  const categories = new Set<string>();

  for (const line of raw.trim().split('\n')) {
    const [id, name] = line.split('|');
    if (!id || !name) continue;

    const slug = slugify(name);
    const category = categorize(name);
    categories.add(category);

    mechanics.push({
      id: id.trim(),
      name: name.trim(),
      slug,
      category,
      description: getDescription(slug, name.trim()),
      bggUrl: `https://boardgamegeek.com/boardgamemechanic/${id.trim()}/${slug}`
    });
  }

  // Ensure category directories exist
  for (const cat of categories) {
    const catDir = join(MECHANICS_DIR, cat);
    if (!existsSync(catDir)) {
      mkdirSync(catDir, { recursive: true });
    }
  }

  // Generate markdown files
  for (const mech of mechanics) {
    const filePath = join(MECHANICS_DIR, mech.category, `${mech.slug}.md`);
    writeFileSync(filePath, generateMarkdown(mech));
  }

  // Generate index.json
  const index = {
    generated: new Date().toISOString(),
    source: 'https://boardgamegeek.com/browse/boardgamemechanic',
    count: mechanics.length,
    categories: [...categories].sort(),
    mechanics: mechanics.map(m => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      category: m.category,
      path: `${m.category}/${m.slug}.md`
    }))
  };

  writeFileSync(join(MECHANICS_DIR, 'index.json'), JSON.stringify(index, null, 2));

  // Generate category index files
  for (const cat of categories) {
    const catMechanics = mechanics.filter(m => m.category === cat);
    const catIndex = `# ${cat.charAt(0).toUpperCase() + cat.slice(1)} Mechanics

${catMechanics.map(m => `- [${m.name}](./${m.slug}.md)`).join('\n')}
`;
    writeFileSync(join(MECHANICS_DIR, cat, 'README.md'), catIndex);
  }

  console.log(`Generated ${mechanics.length} mechanic files in ${categories.size} categories`);
  console.log('Categories:', [...categories].sort().join(', '));
}

main();
