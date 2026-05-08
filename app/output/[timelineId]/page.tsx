import { EmergencySlate, OutputRenderer } from "@/components/output-renderer"
import { getLivePlaybackSchedule } from "@/lib/data"
import { secondsSinceLocalMidnight } from "@/lib/time"

export default async function OutputTimelineCompatPage({ searchParams }: { searchParams: Promise<{ debug?: string; startAt?: string }> }) {
  const params = await searchParams
  const schedule = await getScheduleOrEmergency(getLivePlaybackSchedule)
  const startAt = params.startAt ? Number(params.startAt) : null
  if (!schedule) return <EmergencySlate reason="Schedule data unavailable" />
  return <OutputRenderer initialSchedule={schedule} initialSeconds={Number.isFinite(startAt) ? startAt! : secondsSinceLocalMidnight()} debug={params.debug === "true"} />
}

async function getScheduleOrEmergency(loader: () => Promise<Awaited<ReturnType<typeof getLivePlaybackSchedule>>>) {
  try {
    return await loader()
  } catch {
    return null
  }
}
