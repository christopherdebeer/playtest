import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GAMES_DIR = join(__dirname, '..', '..', 'games')
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'logs.json')

/**
 * Transcript naming conventions (for backup/archival):
 *
 * Expected patterns:
 *   - gamemaster-transcript-{TIMESTAMP}.jsonl   (gamemaster agent)
 *   - player1-transcript-{TIMESTAMP}.jsonl      (player 1 agent)
 *   - player2-transcript-{TIMESTAMP}.jsonl      (player 2 agent)
 *   - playerN-transcript-{TIMESTAMP}.jsonl      (player N agent)
 *
 * The TIMESTAMP should match the game log timestamp, e.g.:
 *   - markovs-chains-1769816283703.jsonl        (game log)
 *   - gamemaster-transcript-1769816283703.jsonl (matching transcript)
 *   - player1-transcript-1769816283703.jsonl    (matching transcript)
 *
 * Non-timestamped transcripts (e.g., player1-transcript.jsonl) are
 * considered "current/active" and not linked to any specific game.
 *
 * To backup transcripts after a playtest session, copy from:
 *   ~/.claude/projects/-home-user-playtest/{session-id}/subagents/agent-{id}.jsonl
 * To:
 *   games/{game}/logs/{agent-type}-transcript-{timestamp}.jsonl
 */

/**
 * Check if a file is a transcript (player or gamemaster transcript)
 */
function isTranscriptFile(filename) {
  // Match patterns like:
  // - gamemaster-transcript.jsonl
  // - gamemaster-transcript-1769816283703.jsonl
  // - player1-transcript.jsonl
  // - player1-transcript-1769816283703.jsonl
  // - player2-transcript-1769816283703.jsonl
  return /^(gamemaster|player\d+)-transcript(-\d+)?\.jsonl$/.test(filename)
}

/**
 * Check if a file is a game log (not a transcript)
 */
function isGameLogFile(filename) {
  if (!filename.endsWith('.jsonl')) return false
  if (isTranscriptFile(filename)) return false
  // Game logs should have a timestamp and game name
  // e.g., markovs-chains-1769816283703.jsonl, uno-1769645846611.jsonl
  return /^[a-z][\w-]+-\d{13}\.jsonl$/.test(filename)
}

/**
 * Extract timestamp from filename
 * e.g., "markovs-chains-1769816283703" -> "1769816283703"
 * e.g., "player1-transcript-1769816283703" -> "1769816283703"
 */
function extractTimestamp(filename) {
  const match = filename.match(/(\d{13})/)
  return match ? match[1] : null
}

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
 * Parse transcript file and extract summary
 */
function parseTranscriptFile(content, filename) {
  const events = parseJsonlFile(content, filename)

  // Extract agent info from events
  let agentType = 'unknown'
  let agentId = null
  let messageCount = 0
  let toolUseCount = 0
  let thinkingCount = 0

  for (const event of events) {
    // Determine agent type from filename or content
    if (filename.startsWith('gamemaster')) {
      agentType = 'gamemaster'
    } else if (filename.startsWith('player1')) {
      agentType = 'player1'
    } else if (filename.startsWith('player2')) {
      agentType = 'player2'
    } else if (filename.includes('player')) {
      const match = filename.match(/player(\d+)/)
      if (match) agentType = `player${match[1]}`
    }

    // Get agent ID
    if (event.agentId && !agentId) {
      agentId = event.agentId
    }

    // Count message types
    if (event.type === 'user' || event.type === 'assistant') {
      messageCount++
    }

    // Count tool uses
    if (event.message?.content) {
      const content = event.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') toolUseCount++
          if (block.type === 'thinking') thinkingCount++
        }
      }
    }
  }

  return {
    agentType,
    agentId,
    messageCount,
    toolUseCount,
    thinkingCount,
    eventCount: events.length,
    events, // Include full events for detailed view
  }
}

/**
 * Find transcripts for a given game timestamp
 */
async function findTranscripts(logsDir, timestamp, allFiles) {
  const transcripts = []

  for (const file of allFiles) {
    if (!isTranscriptFile(file)) continue
    if (!file.endsWith('.jsonl')) continue

    const fileTimestamp = extractTimestamp(file)
    if (fileTimestamp !== timestamp) continue

    try {
      const content = await readFile(join(logsDir, file), 'utf-8')
      const fileStat = await stat(join(logsDir, file))
      const parsed = parseTranscriptFile(content, file)

      transcripts.push({
        filename: file,
        fileSize: fileStat.size,
        ...parsed,
      })
    } catch (err) {
      console.warn(`  Warning: Failed to parse transcript ${file}: ${err.message}`)
    }
  }

  // Sort by agent type (gamemaster first, then players in order)
  transcripts.sort((a, b) => {
    if (a.agentType === 'gamemaster') return -1
    if (b.agentType === 'gamemaster') return 1
    return a.agentType.localeCompare(b.agentType)
  })

  return transcripts
}

/**
 * Find analysis file for a given game ID
 * Analysis files are named: playtest-analysis-{VERSION}-{TIMESTAMP}.md
 * Game IDs are like: markovs-chains-1769816283703
 * So we extract the timestamp and match against that
 */
async function findAnalysis(logsDir, gameId) {
  try {
    const files = await readdir(logsDir)

    // Extract timestamp from gameId (e.g., "markovs-chains-1769816283703" -> "1769816283703")
    const timestampMatch = gameId.match(/(\d{13})$/)
    if (!timestampMatch) return null
    const timestamp = timestampMatch[1]

    // Look for analysis files matching this timestamp
    // Pattern: playtest-analysis-{VERSION}-{TIMESTAMP}.md or playtest-analysis-{TIMESTAMP}.md
    const analysisFile = files.find(f =>
      f.startsWith('playtest-analysis-') &&
      f.endsWith(`${timestamp}.md`)
    )

    if (!analysisFile) return null

    const content = await readFile(join(logsDir, analysisFile), 'utf-8')

    // Extract version from filename: playtest-analysis-v2.4-timestamp.md
    const versionMatch = analysisFile.match(/playtest-analysis-(v[\d.]+)-/)
    const version = versionMatch ? versionMatch[1] : 'unknown'

    return {
      version,
      filename: analysisFile,
      content,
    }
  } catch (err) {
    return null
  }
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

    let allFiles
    try {
      allFiles = await readdir(logsDir)
    } catch (err) {
      continue
    }

    // Filter to only game log files (not transcripts)
    const logFiles = allFiles.filter(f => isGameLogFile(f))

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

        // Look for analysis file
        const analysis = await findAnalysis(logsDir, gameId)

        // Look for associated transcripts (matching timestamp)
        const timestamp = extractTimestamp(gameId)
        const transcripts = timestamp
          ? await findTranscripts(logsDir, timestamp, allFiles)
          : []

        allLogs.push({
          ...summary,
          fileSize: fileStat.size,
          events, // Include full events for detailed view
          analysis, // Include analysis if available
          transcripts, // Include agent transcripts if available
        })

        const analysisNote = analysis ? ` + analysis (${analysis.version})` : ''
        const transcriptNote = transcripts.length > 0 ? ` + ${transcripts.length} transcripts` : ''
        console.log(`  Parsed: ${logFile} (${events.length} events)${analysisNote}${transcriptNote}`)
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
