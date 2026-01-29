export interface LogEvent {
  timestamp: string
  event: string
  turn?: number
  player?: string
  data?: Record<string, unknown>
}

export interface GameLogSummary {
  gameId: string
  gameName: string
  playerCount: number
  players: string[]
  startTime: string
  endTime: string
  duration: number | null
  totalTurns: number
  totalEvents: number
  eventCounts: Record<string, number>
  outcome: 'completed' | 'ended' | 'cancelled' | 'in_progress' | 'unknown'
  winner: string | null
  endReason: string | null
  fileSize: number
  events: LogEvent[]
}

export interface GameStats {
  totalLogs: number
  completedGames: number
  cancelledGames: number
  totalTurns: number
}

export interface LogsData {
  generatedAt: string
  games: Record<string, GameStats>
  logs: GameLogSummary[]
}
