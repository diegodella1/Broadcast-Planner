import type { ActiveSchedule, MediaAsset, ProgramBlock, ScheduleBundle, ScheduledLayer, SlideAsset } from "./types"

export function findActiveSchedule(bundle: ScheduleBundle, secondsOfDay: number): ActiveSchedule {
  let block: ProgramBlock | null = null
  for (const candidate of bundle.blocks) {
    if (candidate.status !== "ready" && candidate.status !== "active") continue
    const end = candidate.startTimeSeconds + candidate.durationSeconds
    if (secondsOfDay >= candidate.startTimeSeconds && secondsOfDay < end) {
      if (!block || candidate.startTimeSeconds > block.startTimeSeconds) {
        block = candidate
      }
    }
  }

  if (!block) {
    return {
      day: bundle.day,
      block: null,
      elapsedInBlock: 0,
      layers: [],
      fallbackAsset: findFallbackAsset(bundle),
      reason: "No active block"
    }
  }

  const elapsedInBlock = secondsOfDay - block.startTimeSeconds
  const activeLayers = findActiveLayers(bundle.layers, block.id, elapsedInBlock)
  const asset = block.assetId ? findAsset(bundle.mediaAssets, block.assetId) : null
  const slide = block.slideId ? findSlide(bundle.slideAssets, block.slideId) : null

  return {
    day: bundle.day,
    block,
    elapsedInBlock,
    layers: block.hideOverlays ? [] : activeLayers,
    asset,
    slide,
    fallbackAsset: block.fallbackAssetId ? findAsset(bundle.mediaAssets, block.fallbackAssetId) : findFallbackAsset(bundle)
  }
}

export function findActiveLayers(layers: ScheduledLayer[], blockId: string, elapsedInBlock: number): ScheduledLayer[] {
  return layers
    .filter((layer) => layer.programBlockId === blockId && layer.enabled)
    .filter((layer) => elapsedInBlock >= layer.startTimeSeconds && elapsedInBlock < layer.startTimeSeconds + layer.durationSeconds)
    .sort((a, b) => a.zIndex - b.zIndex)
}

export function validateBlock(block: Pick<ProgramBlock, "blockType" | "durationSeconds">): string[] {
  const errors: string[] = []
  if (block.durationSeconds <= 0) errors.push("Duration must be greater than zero")
  if (block.blockType === "ad" && block.durationSeconds > 300) errors.push("Ads cannot be longer than 300 seconds")
  return errors
}

export function hasBaseBlockConflict(blocks: ProgramBlock[], candidate: ProgramBlock): boolean {
  const candidateEnd = candidate.startTimeSeconds + candidate.durationSeconds
  return blocks.some((block) => {
    if (block.id === candidate.id || block.programDayId !== candidate.programDayId) return false
    const blockEnd = block.startTimeSeconds + block.durationSeconds
    return candidate.startTimeSeconds < blockEnd && candidateEnd > block.startTimeSeconds
  })
}

function findAsset(assets: MediaAsset[], id: string): MediaAsset | null {
  return assets.find((asset) => asset.id === id) ?? null
}

function findSlide(slides: SlideAsset[], id: string): SlideAsset | null {
  return slides.find((slide) => slide.id === id) ?? null
}

function findFallbackAsset(bundle: ScheduleBundle): MediaAsset | null {
  const dayFallback = bundle.day?.fallbackAssetId ? findAsset(bundle.mediaAssets, bundle.day.fallbackAssetId) : null
  return dayFallback ?? bundle.mediaAssets.find((asset) => asset.assetType === "fallback" && asset.status === "ready") ?? null
}
