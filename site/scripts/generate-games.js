import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = join(__dirname, '..', '..', 'games')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'games.json')
const POSTERS_DIR = join(__dirname, '..', 'public', 'data', 'posters')

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * Extract deck, board, and starting_cards from unified mechanics config.
 * In unified format, `cards` and `board` are pseudo-keys inside `mechanics:`.
 */
function extractFromMechanics(config) {
  const mechanics = config.mechanics
  const isUnified = mechanics && typeof mechanics === 'object' && !Array.isArray(mechanics)

  if (!isUnified) {
    // Legacy flat format
    return {
      startingCards: config.starting_cards,
      deck: config.deck,
      board: config.board,
      mechanics: config.mechanics || [],
    }
  }

  // Unified format: extract pseudo-keys and mechanic slugs
  let startingCards = undefined
  let deck = undefined
  let board = undefined
  const mechanicSlugs = []

  for (const [key, value] of Object.entries(mechanics)) {
    if (key === 'cards') {
      startingCards = value?.starting_hand
      deck = value?.deck
    } else if (key === 'board') {
      board = value
    } else {
      mechanicSlugs.push(key.replace(/_/g, '-'))
    }
  }

  return { startingCards, deck, board, mechanics: mechanicSlugs }
}

async function parseRulesFile(content) {
  // Extract YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    throw new Error('Invalid RULES.md format: no YAML frontmatter found')
  }

  const yamlContent = match[1]
  const markdownContent = match[2].trim()

  const config = parseYaml(yamlContent)
  const extracted = extractFromMechanics(config)

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
      deckSize: extracted.deck?.reduce((acc, c) => acc + c.count, 0),
      boardStates: extracted.board?.states,
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
  let gameDirs
  try {
    gameDirs = await readdir(GAMES_DIR)
  } catch (err) {
    console.warn('No games directory found, creating empty games.json')
    await writeFile(OUTPUT_FILE, JSON.stringify([], null, 2))
    return
  }

  const games = []

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

      console.log(`  Parsed: ${gameDir}${hasPoster ? ' (with poster)' : ''}`)
    } catch (err) {
      console.warn(`  Skipped: ${gameDir} (${err.message})`)
    }
  }

  // Sort games alphabetically
  games.sort((a, b) => a.config.name.localeCompare(b.config.name))

  // Write output
  await writeFile(OUTPUT_FILE, JSON.stringify(games, null, 2))
  console.log(`Generated ${OUTPUT_FILE} with ${games.length} games`)
}

main().catch(console.error)
