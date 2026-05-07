import { OutputRenderer } from "@/components/output-renderer"
import { getPlaybackScheduleForBlock } from "@/lib/data"
import { secondsSinceLocalMidnight } from "@/lib/time"

export default async function OutputPreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ blockId: string }>
  searchParams: Promise<{ debug?: string }>
}) {
  const [{ blockId }, query] = await Promise.all([params, searchParams])
  const schedule = await getPlaybackScheduleForBlock(blockId)
  return <OutputRenderer initialSchedule={schedule} initialSeconds={secondsSinceLocalMidnight()} debug={query.debug === "true"} forcedBlockId={blockId} />
}
