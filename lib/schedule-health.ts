import type { MediaAsset, ProgramBlock, ScheduleBundle, ScheduledLayer, SlideAsset } from "./types"
import { formatTimecode } from "./time"

export type ScheduleIssueSeverity = "warning" | "critical"
export type ScheduleIssueKind =
  | "gap"
  | "overlap"
  | "missing_asset"
  | "unready_asset"
  | "unsupported_asset"
  | "ad_duration"
  | "fallback"
  | "layer_timing"
  | "hidden_layer"

export type ScheduleIssueI18n = {
  titleKey: string
  titleValues?: Record<string, string | number>
  detailKey: string
  detailValues?: Record<string, string | number>
}

export type ScheduleIssue = {
  id: string
  blockId?: string
  layerId?: string
  assetId?: string
  slideId?: string
  title: string
  detail: string
  severity: ScheduleIssueSeverity
  kind: ScheduleIssueKind
  i18n: ScheduleIssueI18n
}

export type AssetReadinessMessage = {
  key: string
  values?: Record<string, string>
}

export type AssetReadiness = {
  ready: boolean
  severity: ScheduleIssueSeverity
  messages: string[]
  i18nMessages: AssetReadinessMessage[]
}

export type ScheduleHealth = {
  gaps: ScheduleIssue[]
  overlaps: ScheduleIssue[]
  missingAssets: ScheduleIssue[]
  unreadyAssets: ScheduleIssue[]
  unsupportedAssets: ScheduleIssue[]
  fallbackIssues: ScheduleIssue[]
  layerIssues: ScheduleIssue[]
  issues: ScheduleIssue[]
  criticalCount: number
  warnCount: number
}

const SUPPORTED_VIDEO_SOURCES = new Set(["vimeo", "remote_mp4", "hls"])
const SUPPORTED_IMAGE_SOURCES = new Set(["remote_image", "supabase_image", "reuters"])

export function analyzeSchedule(schedule: ScheduleBundle, inputBlocks = schedule.blocks): ScheduleHealth {
  const blocks = [...inputBlocks].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  const gaps: ScheduleIssue[] = []
  const overlaps: ScheduleIssue[] = []
  const missingAssets: ScheduleIssue[] = []
  const unreadyAssets: ScheduleIssue[] = []
  const unsupportedAssets: ScheduleIssue[] = []
  const fallbackIssues: ScheduleIssue[] = []
  const layerIssues: ScheduleIssue[] = []
  const readyFallback = schedule.mediaAssets.some((asset) => asset.assetType === "fallback" && asset.status === "ready")

  for (let index = 0; index < blocks.length - 1; index += 1) {
    const current = blocks[index]
    const next = blocks[index + 1]
    const currentEnd = current.startTimeSeconds + current.durationSeconds
    if (next.startTimeSeconds > currentEnd) {
      const from = formatTimecode(currentEnd)
      const to = formatTimecode(next.startTimeSeconds)
      gaps.push({
        id: `gap-${current.id}-${next.id}`,
        title: "Programming gap",
        detail: `${from} to ${to}`,
        severity: "warning",
        kind: "gap",
        i18n: {
          titleKey: "health.issues.gap.title",
          detailKey: "health.issues.gap.description",
          detailValues: { from, to }
        }
      })
    }
    if (next.startTimeSeconds < currentEnd) {
      overlaps.push({
        id: `overlap-${current.id}-${next.id}`,
        blockId: next.id,
        title: "Overlapping blocks",
        detail: `${current.title} overlaps with ${next.title}`,
        severity: "critical",
        kind: "overlap",
        i18n: {
          titleKey: "health.issues.overlap.title",
          detailKey: "health.issues.overlap.description",
          detailValues: { current: current.title, next: next.title }
        }
      })
    }
  }

  for (const block of blocks) {
    const asset = block.assetId ? findAsset(schedule.mediaAssets, block.assetId) : null
    const slide = block.slideId ? findSlide(schedule.slideAssets, block.slideId) : null
    const expectsSlide = block.blockType === "slide"
    const missing = expectsSlide ? !slide : !asset
    if (missing) {
      const kind = expectsSlide ? "slide" : "media"
      missingAssets.push({
        id: `missing-${block.id}`,
        blockId: block.id,
        title: "Missing asset",
        detail: `${block.title} has no ${kind} assigned`,
        severity: "critical",
        kind: "missing_asset",
        i18n: {
          titleKey: "health.issues.missingAsset.title",
          detailKey: "health.issues.missingAsset.blockDescription",
          detailValues: { block: block.title, kind: expectsSlide ? "health.issues.missingAsset.kindSlide" : "health.issues.missingAsset.kindMedia" }
        }
      })
      continue
    }

    if (asset) {
      const readiness = getAssetReadiness(asset)
      if (!readiness.ready) {
        const messages = readiness.messages.join(", ")
        const isUnsupported = readiness.severity === "critical"
        const issue = {
          id: `asset-readiness-${block.id}`,
          blockId: block.id,
          assetId: asset.id,
          title: isUnsupported ? "Asset not playable" : "Asset not ready",
          detail: `${asset.title}: ${messages}`,
          severity: readiness.severity,
          kind: isUnsupported ? "unsupported_asset" : "unready_asset",
          i18n: {
            titleKey: isUnsupported ? "health.issues.unsupportedAsset.title" : "health.issues.unreadyAsset.title",
            detailKey: isUnsupported ? "health.issues.unsupportedAsset.description" : "health.issues.unreadyAsset.description",
            detailValues: { title: asset.title, messages }
          }
        } satisfies ScheduleIssue
        if (issue.kind === "unsupported_asset") unsupportedAssets.push(issue)
        else unreadyAssets.push(issue)
      }
    }
    if (slide && slide.status !== "ready") {
      unreadyAssets.push({
        id: `slide-status-${block.id}`,
        blockId: block.id,
        slideId: slide.id,
        title: "Slide not ready",
        detail: `${slide.title} is ${slide.status}`,
        severity: "warning",
        kind: "unready_asset",
        i18n: {
          titleKey: "health.issues.unreadySlide.title",
          detailKey: "health.issues.unreadySlide.description",
          detailValues: { title: slide.title, status: slide.status }
        }
      })
    }
    if (block.blockType === "ad" && block.durationSeconds > 300) {
      unsupportedAssets.push({
        id: `ad-duration-${block.id}`,
        blockId: block.id,
        title: "Ad duration out of range",
        detail: `${block.title} runs ${formatTimecode(block.durationSeconds)} and the maximum is 00:05:00`,
        severity: "critical",
        kind: "ad_duration",
        i18n: {
          titleKey: "health.issues.adDuration.title",
          detailKey: "health.issues.adDuration.description",
          detailValues: { title: block.title, duration: formatTimecode(block.durationSeconds) }
        }
      })
    }

    const blockLayers = schedule.layers.filter((layer) => layer.programBlockId === block.id)
    for (const layer of blockLayers) {
      layerIssues.push(...analyzeLayer(schedule, block, layer))
      if (block.hideOverlays && layer.enabled) {
        layerIssues.push({
          id: `hidden-layer-${layer.id}`,
          blockId: block.id,
          layerId: layer.id,
          title: "Hidden overlay",
          detail: `${layer.title} is enabled but the block hides overlays`,
          severity: "warning",
          kind: "hidden_layer",
          i18n: {
            titleKey: "health.issues.hiddenLayer.title",
            detailKey: "health.issues.hiddenLayer.description",
            detailValues: { title: layer.title }
          }
        })
      }
    }
  }

  if (!readyFallback) {
    fallbackIssues.push({
      id: "fallback-missing",
      title: "No ready fallback",
      detail: "There is no fallback asset ready to cover output errors",
      severity: "warning",
      kind: "fallback",
      i18n: {
        titleKey: "health.issues.fallbackMissing.title",
        detailKey: "health.issues.fallbackMissing.description"
      }
    })
  }

  const issues = [...overlaps, ...missingAssets, ...unsupportedAssets, ...unreadyAssets, ...layerIssues, ...gaps, ...fallbackIssues]
  return {
    gaps,
    overlaps,
    missingAssets,
    unreadyAssets,
    unsupportedAssets,
    fallbackIssues,
    layerIssues,
    issues,
    criticalCount: issues.filter((issue) => issue.severity === "critical").length,
    warnCount: issues.filter((issue) => issue.severity === "warning").length
  }
}

export function getAssetReadiness(asset: MediaAsset): AssetReadiness {
  const messages: string[] = []
  const i18nMessages: AssetReadinessMessage[] = []
  let severity: ScheduleIssueSeverity = "warning"

  if (asset.status !== "ready") {
    messages.push(`status ${asset.status}`)
    i18nMessages.push({ key: "health.readiness.statusLabel", values: { status: asset.status } })
  }
  if (asset.mediaKind === "video" && !SUPPORTED_VIDEO_SOURCES.has(asset.sourceType)) {
    severity = "critical"
    messages.push(`source ${asset.sourceType} not supported for video`)
    i18nMessages.push({ key: "health.readiness.videoSourceUnsupported", values: { source: asset.sourceType } })
  }
  if (asset.mediaKind === "image" && !SUPPORTED_IMAGE_SOURCES.has(asset.sourceType)) {
    severity = "critical"
    messages.push(`source ${asset.sourceType} not supported for image`)
    i18nMessages.push({ key: "health.readiness.imageSourceUnsupported", values: { source: asset.sourceType } })
  }
  if (asset.sourceType === "vimeo" && !asset.vimeoId) {
    severity = "critical"
    messages.push("missing Vimeo ID")
    i18nMessages.push({ key: "health.readiness.missingVimeoId" })
  }
  if ((asset.sourceType === "remote_mp4" || asset.sourceType === "hls" || asset.sourceType === "remote_image" || asset.sourceType === "reuters") && !asset.url) {
    severity = "critical"
    messages.push("missing URL")
    i18nMessages.push({ key: "health.readiness.missingUrl" })
  }
  if (asset.mediaKind === "graphic") {
    severity = "critical"
    messages.push("graphic cannot render as base yet")
    i18nMessages.push({ key: "health.readiness.graphicNotSupported" })
  }
  return {
    ready: messages.length === 0,
    severity,
    messages,
    i18nMessages
  }
}

function analyzeLayer(schedule: ScheduleBundle, block: ProgramBlock, layer: ScheduledLayer): ScheduleIssue[] {
  const issues: ScheduleIssue[] = []
  if (layer.startTimeSeconds + layer.durationSeconds > block.durationSeconds) {
    issues.push({
      id: `layer-window-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      title: "Overlay out of block",
      detail: `${layer.title} ends after ${formatTimecode(block.durationSeconds)}`,
      severity: "critical",
      kind: "layer_timing",
      i18n: {
        titleKey: "health.issues.layerOutOfRange.title",
        detailKey: "health.issues.layerOutOfRange.description",
        detailValues: { title: layer.title, duration: formatTimecode(block.durationSeconds) }
      }
    })
  }
  const asset = layer.assetId ? findAsset(schedule.mediaAssets, layer.assetId) : null
  const slide = layer.slideId ? findSlide(schedule.slideAssets, layer.slideId) : null
  if (!asset && !slide) {
    issues.push({
      id: `layer-missing-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      title: "Overlay without asset",
      detail: `${layer.title} has no media or slide assigned`,
      severity: "critical",
      kind: "missing_asset",
      i18n: {
        titleKey: "health.issues.layerMissing.title",
        detailKey: "health.issues.layerMissing.description",
        detailValues: { title: layer.title }
      }
    })
  }
  if (asset) {
    const readiness = getAssetReadiness(asset)
    if (!readiness.ready) {
      const messages = readiness.messages.join(", ")
      issues.push({
        id: `layer-asset-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        assetId: asset.id,
        title: "Overlay not ready",
        detail: `${asset.title}: ${messages}`,
        severity: readiness.severity,
        kind: readiness.severity === "critical" ? "unsupported_asset" : "unready_asset",
        i18n: {
          titleKey: "health.issues.layerUnready.title",
          detailKey: "health.issues.layerUnready.description",
          detailValues: { title: asset.title, messages }
        }
      })
    }
  }
  if (slide && slide.status !== "ready") {
    issues.push({
      id: `layer-slide-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      slideId: slide.id,
      title: "Overlay slide not ready",
      detail: `${slide.title} is ${slide.status}`,
      severity: "warning",
      kind: "unready_asset",
      i18n: {
        titleKey: "health.issues.layerUnreadySlide.title",
        detailKey: "health.issues.layerUnreadySlide.description",
        detailValues: { title: slide.title, status: slide.status }
      }
    })
  }
  return issues
}

function findAsset(assets: MediaAsset[], id: string): MediaAsset | null {
  return assets.find((asset) => asset.id === id) ?? null
}

function findSlide(slides: SlideAsset[], id: string): SlideAsset | null {
  return slides.find((slide) => slide.id === id) ?? null
}
