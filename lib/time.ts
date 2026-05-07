export function parseTimecode(value: string): number {
  const parts = value.trim().split(":").map(Number)
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    throw new Error(`Invalid timecode: ${value}`)
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  throw new Error(`Invalid timecode: ${value}`)
}

export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":")
}

export function secondsSinceLocalMidnight(date = new Date()): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()
}

export function isoDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
  return formatter.format(date)
}
