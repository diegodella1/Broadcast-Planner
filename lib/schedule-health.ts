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
}

export type AssetReadiness = {
  ready: boolean
  severity: ScheduleIssueSeverity
  messages: string[]
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
const SUPPORTED_IMAGE_SOURCES = new Set(["remote_image", "supabase_image"])

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
      gaps.push({
        id: `gap-${current.id}-${next.id}`,
        title: "Gap de programacion",
        detail: `${formatTimecode(currentEnd)} a ${formatTimecode(next.startTimeSeconds)}`,
        severity: "warning",
        kind: "gap"
      })
    }
    if (next.startTimeSeconds < currentEnd) {
      overlaps.push({
        id: `overlap-${current.id}-${next.id}`,
        blockId: next.id,
        title: "Bloques solapados",
        detail: `${current.title} pisa a ${next.title}`,
        severity: "critical",
        kind: "overlap"
      })
    }
  }

  for (const block of blocks) {
    const asset = block.assetId ? findAsset(schedule.mediaAssets, block.assetId) : null
    const slide = block.slideId ? findSlide(schedule.slideAssets, block.slideId) : null
    const expectsSlide = block.blockType === "slide"
    const missing = expectsSlide ? !slide : !asset
    if (missing) {
      missingAssets.push({
        id: `missing-${block.id}`,
        blockId: block.id,
        title: "Bloque sin asset",
        detail: `${block.title} no tiene ${expectsSlide ? "slide" : "media"} asignado`,
        severity: "critical",
        kind: "missing_asset"
      })
      continue
    }

    if (asset) {
      const readiness = getAssetReadiness(asset)
      if (!readiness.ready) {
        const issue = {
          id: `asset-readiness-${block.id}`,
          blockId: block.id,
          assetId: asset.id,
          title: readiness.severity === "critical" ? "Asset no reproducible" : "Asset no ready",
          detail: `${asset.title}: ${readiness.messages.join(", ")}`,
          severity: readiness.severity,
          kind: readiness.severity === "critical" ? "unsupported_asset" : "unready_asset"
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
        title: "Slide no ready",
        detail: `${slide.title} esta ${slide.status}`,
        severity: "warning",
        kind: "unready_asset"
      })
    }
    if (block.blockType === "ad" && block.durationSeconds > 300) {
      unsupportedAssets.push({
        id: `ad-duration-${block.id}`,
        blockId: block.id,
        title: "Ad demasiado largo",
        detail: `${block.title} dura ${formatTimecode(block.durationSeconds)} y el maximo es 00:05:00`,
        severity: "critical",
        kind: "ad_duration"
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
          title: "Overlay oculto por bloque",
          detail: `${layer.title} esta activo pero el bloque oculta overlays`,
          severity: "warning",
          kind: "hidden_layer"
        })
      }
    }
  }

  if (!readyFallback) {
    fallbackIssues.push({
      id: "fallback-missing",
      title: "Sin fallback ready",
      detail: "No hay asset fallback listo para cubrir errores de salida",
      severity: "warning",
      kind: "fallback"
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
  let severity: ScheduleIssueSeverity = "warning"

  if (asset.status !== "ready") messages.push(`status ${asset.status}`)
  if (asset.mediaKind === "video" && !SUPPORTED_VIDEO_SOURCES.has(asset.sourceType)) {
    severity = "critical"
    messages.push(`source ${asset.sourceType} no soportado para video`)
  }
  if (asset.mediaKind === "image" && !SUPPORTED_IMAGE_SOURCES.has(asset.sourceType)) {
    severity = "critical"
    messages.push(`source ${asset.sourceType} no soportado para imagen`)
  }
  if (asset.sourceType === "vimeo" && !asset.vimeoId) {
    severity = "critical"
    messages.push("falta Vimeo ID")
  }
  if ((asset.sourceType === "remote_mp4" || asset.sourceType === "hls" || asset.sourceType === "remote_image") && !asset.url) {
    severity = "critical"
    messages.push("falta URL")
  }
  if (asset.mediaKind === "graphic") {
    severity = "critical"
    messages.push("graphic todavia no renderiza como base")
  }
  return {
    ready: messages.length === 0,
    severity,
    messages
  }
}

function analyzeLayer(schedule: ScheduleBundle, block: ProgramBlock, layer: ScheduledLayer): ScheduleIssue[] {
  const issues: ScheduleIssue[] = []
  if (layer.startTimeSeconds + layer.durationSeconds > block.durationSeconds) {
    issues.push({
      id: `layer-window-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      title: "Overlay fuera del bloque",
      detail: `${layer.title} termina despues de ${formatTimecode(block.durationSeconds)}`,
      severity: "critical",
      kind: "layer_timing"
    })
  }
  const asset = layer.assetId ? findAsset(schedule.mediaAssets, layer.assetId) : null
  const slide = layer.slideId ? findSlide(schedule.slideAssets, layer.slideId) : null
  if (!asset && !slide) {
    issues.push({
      id: `layer-missing-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      title: "Overlay sin asset",
      detail: `${layer.title} no tiene media ni slide asignado`,
      severity: "critical",
      kind: "missing_asset"
    })
  }
  if (asset) {
    const readiness = getAssetReadiness(asset)
    if (!readiness.ready) {
      issues.push({
        id: `layer-asset-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        assetId: asset.id,
        title: "Overlay no ready",
        detail: `${asset.title}: ${readiness.messages.join(", ")}`,
        severity: readiness.severity,
        kind: readiness.severity === "critical" ? "unsupported_asset" : "unready_asset"
      })
    }
  }
  if (slide && slide.status !== "ready") {
    issues.push({
      id: `layer-slide-${layer.id}`,
      blockId: block.id,
      layerId: layer.id,
      slideId: slide.id,
      title: "Overlay slide no ready",
      detail: `${slide.title} esta ${slide.status}`,
      severity: "warning",
      kind: "unready_asset"
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
