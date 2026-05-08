export function parseTimecode(value: string): number {
  const parts = value.trim().split(":").map(Number)
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    throw new Error(`Invalid timecode: ${value}`)
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts as [number, number]
    return minutes * 60 + seconds
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts as [number, number, number]
    return hours * 3600 + minutes * 60 + seconds
  }
  throw new Error(`Invalid timecode: ${value}`)
}

/**
 * Formats a duration (seconds) as `HH:MM:SS`.
 *
 * Intentionally locale-free: this is a duration formatter, not a clock
 * formatter. Output is identical across locales by design (it is used in
 * fixed-width timeline and tabular UI). For user-visible wall-clock times
 * tied to a specific calendar instant, use next-intl's `useFormatter()` /
 * `getFormatter()` from the consuming component instead.
 */
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

/**
 * Returns the calendar date (YYYY-MM-DD) for `date` as observed in `timezone`.
 *
 * Intentionally locale-free: the output is consumed as a database key and route
 * parameter (e.g. `/admin/schedule/[date]`), so it must always render in
 * ISO 8601 form regardless of the user's UI locale. Do NOT route this through
 * next-intl's formatter — user-visible day labels live in components and use
 * `useFormatter()` / `getFormatter()`.
 */
export function isoDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
  return formatter.format(date)
}
