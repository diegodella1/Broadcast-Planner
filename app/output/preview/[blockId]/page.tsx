import { EmergencySlate, OutputRenderer } from "@/components/output-renderer"
import { getPlaybackScheduleForBlock } from "@/lib/data"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { secondsSinceMidnightInTimezone } from "@/lib/time"

export default async function OutputPreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ blockId: string }>
  searchParams: Promise<{ debug?: string; token?: string }>
}) {
  const [{ blockId }, query] = await Promise.all([params, searchParams])
  if (!(await isOutputRequestAllowed(query))) {
    return <EmergencySlate reason={outputAccessDeniedReason()} />
  }
  const schedule = await getScheduleOrEmergency(blockId)
  if (!schedule) return <EmergencySlate reason="Preview data unavailable" />
  return (
    <OutputRenderer
      initialSchedule={schedule}
      initialSeconds={secondsSinceMidnightInTimezone()}
      debug={query.debug === "true"}
      forcedBlockId={blockId}
      outputToken={query.token}
    />
  )
}

async function getScheduleOrEmergency(blockId: string) {
  try {
    return await getPlaybackScheduleForBlock(blockId)
  } catch {
    return null
  }
}
