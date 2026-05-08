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

export const PLAYOUT_TIMEZONE = "America/Los_Angeles"
export const PLAYOUT_TIMEZONE_LABEL = "SF"

export const HELPER_TIMEZONES = [
  { label: "London", timeZone: "Europe/London" },
  { label: "Buenos Aires", timeZone: "America/Argentina/Buenos_Aires" },
  { label: "Hong Kong", timeZone: "Asia/Hong_Kong" }
] as const

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

export function secondsSinceMidnightInTimezone(
  date = new Date(),
  timezone = PLAYOUT_TIMEZONE
): number {
  const parts = dateTimePartsInTimezone(date, timezone)
  return parts.hour * 3600 + parts.minute * 60 + parts.second
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

export function formatPlayoutTimeLabel(seconds: number, includeSeconds = false): string {
  const formatted = formatTimecode(seconds)
  return `${includeSeconds ? formatted : formatted.slice(0, 5)} ${PLAYOUT_TIMEZONE_LABEL}`
}

export function formatTimeZoneHelp(airDate: string, seconds: number): string {
  const instant = zonedTimeToUtc(airDate, seconds, PLAYOUT_TIMEZONE)
  return [
    `${formatPlayoutTimeLabel(seconds, true)} (${PLAYOUT_TIMEZONE})`,
    ...HELPER_TIMEZONES.map(
      (zone) => `${zone.label}: ${formatClockInTimezone(instant, zone.timeZone)}`
    )
  ].join("\n")
}

export function formatClockInTimezone(date: Date, timezone: string): string {
  const parts = dateTimePartsInTimezone(date, timezone)
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
}

export function zonedTimeToUtc(airDate: string, seconds: number, timezone: string): Date {
  const [year, month, day] = airDate.split("-").map(Number) as [number, number, number]
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hour = Math.floor(safeSeconds / 3600)
  const minute = Math.floor((safeSeconds % 3600) / 60)
  const second = safeSeconds % 60
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  let utc = targetUtc

  for (let index = 0; index < 3; index += 1) {
    const parts = dateTimePartsInTimezone(new Date(utc), timezone)
    const observedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
    const delta = observedUtc - targetUtc
    if (delta === 0) break
    utc -= delta
  }

  return new Date(utc)
}

function dateTimePartsInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  )
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour)
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}
