import { EmergencyOutputStub, OutputStub } from "@/components/output-stub"
import { getPlaybackScheduleForBlock } from "@/lib/data"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { findActiveLayers } from "@/lib/scheduler"

export default async function OutputPreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ blockId: string }>
  searchParams: Promise<{ debug?: string; token?: string }>
}) {
  const [{ blockId }, query] = await Promise.all([params, searchParams])
  if (!(await isOutputRequestAllowed(query))) {
    return <EmergencyOutputStub reason={outputAccessDeniedReason()} />
  }
  const schedule = await getScheduleOrEmergency(blockId)
  if (!schedule) return <EmergencyOutputStub reason="Preview data unavailable" />
  const block = schedule.blocks.find((item) => item.id === blockId)
  if (!block) return <EmergencyOutputStub reason="Block not found" />
  return (
    <OutputStub
      active={{
        day: schedule.day,
        block,
        elapsedInBlock: 0,
        layers: block.hideOverlays ? [] : findActiveLayers(schedule.layers, block.id, 0),
        asset: block.assetId
          ? (schedule.mediaAssets.find((asset) => asset.id === block.assetId) ?? null)
          : null,
        slide: block.slideId
          ? (schedule.slideAssets.find((slide) => slide.id === block.slideId) ?? null)
          : null,
        fallbackAsset: block.fallbackAssetId
          ? (schedule.mediaAssets.find((asset) => asset.id === block.fallbackAssetId) ?? null)
          : (schedule.mediaAssets.find(
              (asset) => asset.assetType === "fallback" && asset.status === "ready"
            ) ?? null)
      }}
      secondsOfDay={block.startTimeSeconds}
      debug={query.debug === "true"}
      label="Preview output status"
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
