import { EmergencySlate, OutputRenderer } from "@/components/output-renderer"
import { getLivePlaybackSchedule } from "@/lib/data"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { secondsSinceMidnightInTimezone } from "@/lib/time"

export default async function OutputTimelineCompatPage({
  searchParams
}: {
  searchParams: Promise<{ debug?: string; startAt?: string; token?: string }>
}) {
  const params = await searchParams
  if (!(await isOutputRequestAllowed(params))) {
    return <EmergencySlate reason={outputAccessDeniedReason()} />
  }
  const schedule = await getScheduleOrEmergency(getLivePlaybackSchedule)
  const startAt = params.startAt ? Number(params.startAt) : null
  if (!schedule) return <EmergencySlate reason="Schedule data unavailable" />
  return (
    <OutputRenderer
      initialSchedule={schedule}
      initialSeconds={Number.isFinite(startAt) ? startAt! : secondsSinceMidnightInTimezone()}
      debug={params.debug === "true"}
      outputToken={params.token}
    />
  )
}

async function getScheduleOrEmergency(
  loader: () => Promise<Awaited<ReturnType<typeof getLivePlaybackSchedule>>>
) {
  try {
    return await loader()
  } catch {
    return null
  }
}
