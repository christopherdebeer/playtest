import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { marked } from 'marked'

// Import mechanic registry (registers all mechanics on import)
import '../../src/mechanics/index.js'
import { mechanicRegistry } from '../../src/mechanics/registry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = join(__dirname, '..', '..', 'games')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'games.json')
const POSTERS_DIR = join(__dirname, '..', 'public', 'data', 'posters')

const MAX_HIGHLIGHTS = 4

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
})

interface Highlight {
  label: string
  value: string
}

interface ExtractedConfig {
  startingCards?: number
  deck?: Array<{ name: string; count: number; type: string; effect?: unknown }>
  board?: { states: string[]; start?: string }
  mechanics: string[]
}

/**
 * Extract deck, board, and starting_cards from unified mechanics config.
 * In unified format, `cards` and `board` are pseudo-keys inside `mechanics:`.
 */
function extractFromMechanics(config: Record<string, unknown>): ExtractedConfig {
  const mechanics = config.mechanics
  const isUnified = mechanics && typeof mechanics === 'object' && !Array.isArray(mechanics)

  if (!isUnified) {
    // Legacy flat format
    return {
      startingCards: config.starting_cards as number | undefined,
      deck: config.deck as ExtractedConfig['deck'],
      board: config.board as ExtractedConfig['board'],
      mechanics: (config.mechanics as string[]) || [],
    }
  }

  // Unified format: extract pseudo-keys and mechanic slugs
  let startingCards: number | undefined
  let deck: ExtractedConfig['deck']
  let board: ExtractedConfig['board']
  const mechanicSlugs: string[] = []

  for (const [key, value] of Object.entries(mechanics as Record<string, unknown>)) {
    if (key === 'cards') {
      const cardsConfig = value as Record<string, unknown>
      startingCards = cardsConfig?.starting_hand as number | undefined
      deck = cardsConfig?.deck as ExtractedConfig['deck']
    } else if (key === 'board') {
      board = value as ExtractedConfig['board']
    } else {
      mechanicSlugs.push(key.replace(/_/g, '-'))
    }
  }

  return { startingCards, deck, board, mechanics: mechanicSlugs }
}

/**
 * Extract highlights from a game's mechanics config.
 * Calls getHighlight on each registered mechanic that defines it.
 * Cards and board participate through the registry like any other mechanic.
 */
function extractHighlights(config: Record<string, unknown>): Highlight[] {
  const highlights: Highlight[] = []
  const mechanics = config.mechanics

  if (!mechanics || typeof mechanics !== 'object' || Array.isArray(mechanics)) {
    return []
  }

  const mechanicsObj = mechanics as Record<string, unknown>

  for (const [key, value] of Object.entries(mechanicsObj)) {
    const slug = key.replace(/_/g, '-')
    const highlight = mechanicRegistry.getHighlight(slug, value)
    if (highlight) {
      highlights.push(highlight)
    }
  }

  return highlights.slice(0, MAX_HIGHLIGHTS)
}

async function parseRulesFile(content: string) {
  // Extract YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid RULES.md format: no YAML frontmatter found')
  }

  const yamlContent = match[1]
  const markdownContent = match[2].trim()

  const config = parseYaml(yamlContent) as Record<string, unknown>
  const extracted = extractFromMechanics(config)
  const highlights = extractHighlights(config)

  // Convert markdown to HTML at build time
  const rulesHtml = await marked.parse(markdownContent)

  return {
    config: {
      name: config.name,
      players: config.players,
      winCondition: config.win_condition,
      maxRounds: config.max_rounds,
      startingCards: extracted.startingCards,
      deck: extracted.deck,
      board: extracted.board,
      mechanics: extracted.mechanics,
      deckSize: extracted.deck?.reduce((acc: number, c: { count: number }) => acc + c.count, 0),
      boardStates: extracted.board?.states,
      highlights,
    },
    rulesMarkdown: markdownContent,
    rulesHtml: rulesHtml,
    rulesPreview: markdownContent.split('\n').slice(0, 5).join('\n') + '...',
  }
}

async function main() {
  console.log('Generating games data...')

  // Ensure output directories exist
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }
  if (!existsSync(POSTERS_DIR)) {
    await mkdir(POSTERS_DIR, { recursive: true })
  }

  // Read games directory
  let gameDirs: string[]
  try {
    gameDirs = await readdir(GAMES_DIR)
  } catch {
    console.warn('No games directory found, creating empty games.json')
    await writeFile(OUTPUT_FILE, JSON.stringify([], null, 2))
    return
  }

  const games: Array<Record<string, unknown>> = []

  for (const gameDir of gameDirs) {
    const rulesPath = join(GAMES_DIR, gameDir, 'RULES.md')

    try {
      const content = await readFile(rulesPath, 'utf-8')
      const parsed = await parseRulesFile(content)

      // Check for poster image and copy to public directory
      const posterPath = join(GAMES_DIR, gameDir, 'POSTER.png')
      const hasPoster = existsSync(posterPath)
      if (hasPoster) {
        await copyFile(posterPath, join(POSTERS_DIR, `${gameDir}.png`))
      }

      games.push({
        id: gameDir,
        hasPoster,
        ...parsed,
      })

      const hlSummary = parsed.config.highlights.length > 0
        ? ` [${parsed.config.highlights.map((h: Highlight) => `${h.label}: ${h.value}`).join(', ')}]`
        : ''
      console.log(`  Parsed: ${gameDir}${hasPoster ? ' (with poster)' : ''}${hlSummary}`)
    } catch (err) {
      console.warn(`  Skipped: ${gameDir} (${(err as Error).message})`)
    }
  }

  // Sort games alphabetically
  games.sort((a, b) => (a.config as Record<string, string>).name.localeCompare((b.config as Record<string, string>).name))

  // Write output
  await writeFile(OUTPUT_FILE, JSON.stringify(games, null, 2))
  console.log(`Generated ${OUTPUT_FILE} with ${games.length} games`)
}

main().catch(console.error)
