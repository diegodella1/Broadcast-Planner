import { OutputRenderer } from "@/components/output-renderer"
import { getLivePlaybackSchedule } from "@/lib/data"
import { secondsSinceLocalMidnight } from "@/lib/time"

export default async function OutputTimelineCompatPage({ searchParams }: { searchParams: Promise<{ debug?: string; startAt?: string }> }) {
  const params = await searchParams
  const schedule = await getLivePlaybackSchedule()
  const startAt = params.startAt ? Number(params.startAt) : null
  return <OutputRenderer initialSchedule={schedule} initialSeconds={Number.isFinite(startAt) ? startAt! : secondsSinceLocalMidnight()} debug={params.debug === "true"} />
}
