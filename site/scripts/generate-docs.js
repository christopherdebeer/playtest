import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename, relative } from 'path'
import { fileURLToPath } from 'url'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = join(__dirname, '..', '..', 'docs')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'docs.json')

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * Recursively read all markdown files from a directory
 */
async function readMarkdownFiles(dir, basePath = '') {
  const files = []

  try {
    const entries = await readdir(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        // Recursively read subdirectory
        const subFiles = await readMarkdownFiles(fullPath, join(basePath, entry))
        files.push(...subFiles)
      } else if (entry.endsWith('.md')) {
        files.push({
          path: fullPath,
          relativePath: join(basePath, entry)
        })
      }
    }
  } catch (err) {
    console.warn(`Error reading directory ${dir}: ${err.message}`)
  }

  return files
}

/**
 * Parse a markdown document
 */
async function parseDocument(filePath, relativePath) {
  const content = await readFile(filePath, 'utf-8')

  // Extract title from first H1
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : basename(filePath, '.md')

  // Extract metadata from table-like format at top of proposals
  const metadata = {}
  const metaMatches = content.matchAll(/^\*\*([^*]+)\*\*:\s*(.+)$/gm)
  for (const match of metaMatches) {
    const key = match[1].toLowerCase().replace(/\s+/g, '_')
    metadata[key] = match[2]
  }

  // Extract first paragraph as summary
  const paragraphs = content.split(/\n\n+/).filter(p =>
    !p.startsWith('#') &&
    !p.startsWith('**') &&
    !p.startsWith('|') &&
    !p.startsWith('```') &&
    p.trim().length > 0
  )
  const summary = paragraphs[0]?.replace(/\*\*/g, '').slice(0, 200) || ''

  // Convert full content to HTML
  const contentHtml = await marked.parse(content)

  // Determine category from path
  const pathParts = relativePath.split('/')
  const category = pathParts.length > 1 ? pathParts[0] : 'general'

  // Generate slug from filename
  const slug = basename(filePath, '.md').toLowerCase().replace(/\s+/g, '-')

  return {
    slug,
    title,
    category,
    path: relativePath,
    summary: summary.slice(0, 200) + (summary.length > 200 ? '...' : ''),
    metadata,
    contentHtml
  }
}

async function main() {
  console.log('Generating docs data...')

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }

  // Check if docs directory exists
  if (!existsSync(DOCS_DIR)) {
    console.warn('No docs directory found, creating empty docs.json')
    await writeFile(OUTPUT_FILE, JSON.stringify({ categories: [], docs: [] }, null, 2))
    return
  }

  // Read all markdown files
  const files = await readMarkdownFiles(DOCS_DIR)
  console.log(`Found ${files.length} markdown files`)

  const docs = []
  const categoriesSet = new Set()

  // Process each file
  for (const file of files) {
    try {
      const doc = await parseDocument(file.path, file.relativePath)
      docs.push(doc)
      categoriesSet.add(doc.category)
      console.log(`  Processed: ${file.relativePath}`)
    } catch (err) {
      console.warn(`  Skipped: ${file.relativePath} (${err.message})`)
    }
  }

  // Sort docs by category, then by title
  docs.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    return a.title.localeCompare(b.title)
  })

  // Build categories list with counts
  const categories = Array.from(categoriesSet).map(cat => ({
    name: cat,
    label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' '),
    count: docs.filter(d => d.category === cat).length
  })).sort((a, b) => a.name.localeCompare(b.name))

  // Build output
  const output = {
    generated: new Date().toISOString(),
    source: 'docs/',
    count: docs.length,
    categories,
    docs
  }

  // Write output
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`Generated ${OUTPUT_FILE} with ${docs.length} docs in ${categories.length} categories`)
}

main().catch(console.error)
