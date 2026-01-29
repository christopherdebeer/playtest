import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = join(__dirname, '..', '..', 'games')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'logs.json')

/**
 * Parse a JSONL file and extract game log data
 */
function parseJsonlFile(content, filename) {
  const lines = content.trim().split('\n').filter(line => line.trim())
  const events = []

  for (const line of lines) {
    try {
      const event = JSON.parse(line)
      events.push(event)
    } catch (err) {
      console.warn(`  Warning: Failed to parse line in ${filename}`)
    }
  }

  return events
}

/**
 * Extract summary info from events
 */
function extractSummary(events, gameId, gameName) {
  const initEvent = events.find(e => e.event === 'game_init')
  const startEvent = events.find(e => e.event === 'game_start')
  const endEvent = events.find(e => e.event === 'game_end' || e.event === 'game_cancelled')

  // Count unique players who took actions
  const activePlayers = new Set()
  events.forEach(e => {
    if (e.player) activePlayers.add(e.player)
  })

  // Calculate duration if we have start and end timestamps
  let duration = null
  if (events.length >= 2) {
    const startTime = new Date(events[0].timestamp).getTime()
    const endTime = new Date(events[events.length - 1].timestamp).getTime()
    duration = Math.round((endTime - startTime) / 1000) // in seconds
  }

  // Get max turn
  const maxTurn = Math.max(...events.filter(e => e.turn).map(e => e.turn), 0)

  // Count events by type
  const eventCounts = {}
  events.forEach(e => {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1
  })

  // Determine outcome
  let outcome = 'unknown'
  let winner = null
  let endReason = null

  if (endEvent) {
    if (endEvent.event === 'game_cancelled') {
      outcome = 'cancelled'
      endReason = endEvent.data?.reason
    } else if (endEvent.data?.winner && endEvent.data.winner !== 'none') {
      outcome = 'completed'
      winner = endEvent.data.winner
      endReason = endEvent.data.reason
    } else {
      outcome = 'ended'
      endReason = endEvent.data?.reason
    }
  } else {
    outcome = 'in_progress'
  }

  return {
    gameId,
    gameName,
    playerCount: initEvent?.data?.playerCount || activePlayers.size,
    players: startEvent?.data?.players || Array.from(activePlayers),
    startTime: events[0]?.timestamp,
    endTime: events[events.length - 1]?.timestamp,
    duration,
    totalTurns: maxTurn,
    totalEvents: events.length,
    eventCounts,
    outcome,
    winner,
    endReason,
  }
}

async function main() {
  console.log('Generating game logs data...')

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true })
  }

  // Read games directory
  let gameDirs
  try {
    gameDirs = await readdir(GAMES_DIR)
  } catch (err) {
    console.warn('No games directory found, creating empty logs.json')
    await writeFile(OUTPUT_FILE, JSON.stringify({ games: {}, logs: [] }, null, 2))
    return
  }

  const allLogs = []
  const gameStats = {}

  for (const gameDir of gameDirs) {
    const logsDir = join(GAMES_DIR, gameDir, 'logs')

    // Check if logs directory exists
    if (!existsSync(logsDir)) {
      continue
    }

    let logFiles
    try {
      logFiles = await readdir(logsDir)
      logFiles = logFiles.filter(f => f.endsWith('.jsonl'))
    } catch (err) {
      continue
    }

    if (logFiles.length === 0) continue

    gameStats[gameDir] = {
      totalLogs: logFiles.length,
      completedGames: 0,
      cancelledGames: 0,
      totalTurns: 0,
    }

    for (const logFile of logFiles) {
      const logPath = join(logsDir, logFile)

      try {
        const content = await readFile(logPath, 'utf-8')
        const fileStat = await stat(logPath)
        const events = parseJsonlFile(content, logFile)

        if (events.length === 0) continue

        // Extract game ID from filename (e.g., "uno-1769640173221.jsonl")
        const gameId = basename(logFile, '.jsonl')

        const summary = extractSummary(events, gameId, gameDir)

        // Update game stats
        if (summary.outcome === 'completed' || summary.outcome === 'ended') {
          gameStats[gameDir].completedGames++
        } else if (summary.outcome === 'cancelled') {
          gameStats[gameDir].cancelledGames++
        }
        gameStats[gameDir].totalTurns += summary.totalTurns

        allLogs.push({
          ...summary,
          fileSize: fileStat.size,
          events, // Include full events for detailed view
        })

        console.log(`  Parsed: ${logFile} (${events.length} events)`)
      } catch (err) {
        console.warn(`  Skipped: ${logFile} (${err.message})`)
      }
    }
  }

  // Sort logs by start time (newest first)
  allLogs.sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0
    return timeB - timeA
  })

  const output = {
    generatedAt: new Date().toISOString(),
    games: gameStats,
    logs: allLogs,
  }

  // Write output
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`Generated ${OUTPUT_FILE} with ${allLogs.length} game logs`)
}

main().catch(console.error)
