import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MECHANICS_DIR = join(__dirname, '..', '..', 'mechanics')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'mechanics.json')

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
})

async function parseMechanicFile(content) {
  // Extract YAML frontmatter from mechanic markdown
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return null
  }

  const yamlContent = match[1]
  const markdownContent = match[2].trim()

  const config = parseYaml(yamlContent)

  // Extract description (first paragraph after the heading)
  const descMatch = markdownContent.match(/^#[^\n]+\n+([^\n#]+)/)
  const description = descMatch ? descMatch[1].trim() : ''

  // Convert full markdown to HTML
  const contentHtml = await marked.parse(markdownContent)

  return {
    id: config.id,
    name: config.name,
    slug: config.slug,
    category: config.category,
    summary: config.summary || description.split('.')[0] + '.',
    bggUrl: config.bgg_url,
    description,
    contentHtml,
  }
}

async function main() {
  console.log('Generating mechanics data...')

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }

  // Read mechanics index
  let mechanicsIndex
  try {
    const indexContent = await readFile(join(MECHANICS_DIR, 'index.json'), 'utf-8')
    mechanicsIndex = JSON.parse(indexContent)
  } catch (err) {
    console.warn('No mechanics index found, creating empty mechanics.json')
    await writeFile(OUTPUT_FILE, JSON.stringify({ categories: [], mechanics: [] }, null, 2))
    return
  }

  const mechanics = []
  const categories = mechanicsIndex.categories

  // Process each mechanic
  for (const mech of mechanicsIndex.mechanics) {
    const mechPath = join(MECHANICS_DIR, mech.path)

    try {
      const content = await readFile(mechPath, 'utf-8')
      const parsed = await parseMechanicFile(content)

      if (parsed) {
        mechanics.push(parsed)
      }
    } catch (err) {
      console.warn(`  Skipped: ${mech.slug} (${err.message})`)
    }
  }

  // Sort mechanics alphabetically
  mechanics.sort((a, b) => a.name.localeCompare(b.name))

  // Build output
  const output = {
    generated: new Date().toISOString(),
    source: mechanicsIndex.source,
    count: mechanics.length,
    categories,
    mechanics,
  }

  // Write output
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`Generated ${OUTPUT_FILE} with ${mechanics.length} mechanics in ${categories.length} categories`)
}

main().catch(console.error)
