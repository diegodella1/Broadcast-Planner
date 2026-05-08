import { formatPlayoutTimeLabel, formatTimeZoneHelp } from "@/lib/time"

export function PlayoutTime({
  airDate,
  seconds,
  includeSeconds = false
}: {
  airDate: string
  seconds: number
  includeSeconds?: boolean
}) {
  return (
    <span className="font-mono tabular-nums" title={formatTimeZoneHelp(airDate, seconds)}>
      {formatPlayoutTimeLabel(seconds, includeSeconds)}
    </span>
  )
}
