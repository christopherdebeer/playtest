import { LogsData, GameLogSummary, TranscriptSummary } from '../types/logs'

// Cache for loaded data
const cache = new Map<string, unknown>()

/**
 * Fetch logs index (lightweight summaries)
 */
export async function fetchLogsIndex(): Promise<LogsData> {
  const cacheKey = 'logs-index'

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as LogsData
  }

  const response = await fetch('/data/logs/index.json')
  if (!response.ok) {
    throw new Error(`Failed to fetch logs index: ${response.statusText}`)
  }

  const data = await response.json()
  cache.set(cacheKey, data)
  return data
}

/**
 * Fetch detailed log data for a specific game
 */
export async function fetchLogDetail(gameId: string): Promise<GameLogSummary> {
  const cacheKey = `log-detail-${gameId}`

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as GameLogSummary
  }

  const response = await fetch(`/data/logs/${gameId}.json`)
  if (!response.ok) {
    throw new Error(`Failed to fetch log detail: ${response.statusText}`)
  }

  const data = await response.json()
  cache.set(cacheKey, data)
  return data
}

/**
 * Fetch analysis for a specific game
 */
export async function fetchLogAnalysis(gameId: string): Promise<{ version: string; filename: string; content: string } | null> {
  const cacheKey = `log-analysis-${gameId}`

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as { version: string; filename: string; content: string } | null
  }

  try {
    const response = await fetch(`/data/logs/${gameId}-analysis.json`)
    if (!response.ok) {
      return null
    }

    const data = await response.json()
    cache.set(cacheKey, data)
    return data
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}

/**
 * Fetch transcripts for a specific game
 */
export async function fetchLogTranscripts(gameId: string): Promise<TranscriptSummary[]> {
  const cacheKey = `log-transcripts-${gameId}`

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as TranscriptSummary[]
  }

  try {
    const response = await fetch(`/data/logs/${gameId}-transcripts.json`)
    if (!response.ok) {
      return []
    }

    const data = await response.json()
    cache.set(cacheKey, data)
    return data
  } catch {
    cache.set(cacheKey, [])
    return []
  }
}
