/**
 * Formats a duration in seconds into a human-readable string.
 * Shows the two most significant time units for clarity.
 *
 * @param seconds - Duration in seconds, or null
 * @returns Formatted duration string (e.g., "5m 30s", "2h 15m", "3d 4h")
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  if (seconds < 0) return 'N/A'
  if (seconds === 0) return '0s'

  const MINUTE = 60
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  const MONTH = 30 * DAY // Approximate month as 30 days

  // Months and weeks/days
  if (seconds >= MONTH) {
    const months = Math.floor(seconds / MONTH)
    const remainder = seconds % MONTH
    const weeks = Math.floor(remainder / WEEK)
    if (weeks > 0) {
      return `${months}mo ${weeks}w`
    }
    const days = Math.floor(remainder / DAY)
    if (days > 0) {
      return `${months}mo ${days}d`
    }
    return `${months}mo`
  }

  // Weeks and days
  if (seconds >= WEEK) {
    const weeks = Math.floor(seconds / WEEK)
    const days = Math.floor((seconds % WEEK) / DAY)
    if (days > 0) {
      return `${weeks}w ${days}d`
    }
    return `${weeks}w`
  }

  // Days and hours
  if (seconds >= DAY) {
    const days = Math.floor(seconds / DAY)
    const hours = Math.floor((seconds % DAY) / HOUR)
    if (hours > 0) {
      return `${days}d ${hours}h`
    }
    return `${days}d`
  }

  // Hours and minutes
  if (seconds >= HOUR) {
    const hours = Math.floor(seconds / HOUR)
    const minutes = Math.floor((seconds % HOUR) / MINUTE)
    if (minutes > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${hours}h`
  }

  // Minutes and seconds
  if (seconds >= MINUTE) {
    const minutes = Math.floor(seconds / MINUTE)
    const secs = seconds % MINUTE
    if (secs > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${minutes}m`
  }

  // Just seconds
  return `${seconds}s`
}
