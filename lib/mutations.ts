import { revalidatePath } from "next/cache"

import { auditedMutation } from "./audit"
import { getScheduleForDate } from "./data"
import { buildLongTestSchedule } from "./schedule-builder"
import { findScheduleConflicts } from "./schedule-conflicts"
import { analyzeSchedule } from "./schedule-health"
import { createServiceClient } from "./supabase/server"
import { parseTimecode, PLAYOUT_TIMEZONE } from "./time"

import type { BlockCategory, ProgramBlock } from "./types"

export async function ensureProgramDay(date: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("program_days")
    .upsert(
      {
        air_date: date,
        timezone: PLAYOUT_TIMEZONE,
        status: "draft",
        title: `Programming ${date}`
      },
      { onConflict: "air_date" }
    )
    .select("id")
    .single()
  if (error) throw error
  revalidatePath("/admin/calendar")
  revalidatePath(`/admin/schedule/${date}`)
  return data.id as string
}

export async function createProgramBlock(input: {
  date: string
  title: string
  blockType: string
  category?: BlockCategory
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  preRollSeconds?: number
  postRollSeconds?: number
  hideOverlays: boolean
}) {
  const dayId = await ensureProgramDay(input.date)
  const startTimeSeconds = parseTimecode(input.startTime)
  const schedule = await getScheduleForDate(input.date)
  const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId)
  const preRollSeconds = Math.max(0, Number(input.preRollSeconds || 0) || 0)
  const postRollSeconds = Math.max(0, Number(input.postRollSeconds || 0) || 0)
  const minimumDuration = contentDuration ? contentDuration + preRollSeconds + postRollSeconds : 1
  const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), minimumDuration)
  if (input.blockType === "ad" && durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const candidate: ProgramBlock = {
    id: "candidate",
    programDayId: dayId,
    title: input.title,
    blockType: input.blockType as ProgramBlock["blockType"],
    category: input.category ?? "mercados",
    assetId: input.assetId || null,
    slideId: input.slideId || null,
    startTime: input.startTime,
    startTimeSeconds,
    durationSeconds,
    status: "ready",
    hideOverlays: input.hideOverlays,
    fallbackAssetId: null,
    createdAt: "",
    updatedAt: ""
  }
  const conflict = findScheduleConflicts(schedule.blocks, candidate)
  if (conflict.hasConflict) throw new Error("El bloque se solapa con otro bloque")
  await auditedMutation(
    {
      action: "program_block.created",
      entityType: "program_blocks",
      metadata: { date: input.date },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: durationSeconds,
        status: "ready"
      }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").insert({
        program_day_id: dayId,
        title: input.title,
        block_type: input.blockType,
        category: input.category ?? "mercados",
        asset_id: input.assetId || null,
        slide_id: input.slideId || null,
        start_time: input.startTime,
        start_time_seconds: startTimeSeconds,
        duration_seconds: durationSeconds,
        status: "ready",
        hide_overlays: input.hideOverlays
      })
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
}

function getKnownContentDuration(
  schedule: Awaited<ReturnType<typeof getScheduleForDate>>,
  assetId?: string,
  slideId?: string
) {
  const assetDuration = assetId
    ? schedule.mediaAssets.find((asset) => asset.id === assetId)?.durationSeconds
    : null
  if (assetDuration) return assetDuration
  const slideDuration = slideId
    ? schedule.slideAssets.find((slide) => slide.id === slideId)?.defaultDurationSeconds
    : null
  return slideDuration ?? 0
}

export async function updateProgramDayStatus(input: {
  date: string
  status: string
  allowWarnings?: boolean
}) {
  if (!["draft", "ready", "active", "archived"].includes(input.status)) {
    throw new Error("Estado invalido")
  }
  const schedule = await getScheduleForDate(input.date)
  if (!schedule.day) throw new Error("Dia no encontrado")
  const day = schedule.day
  const health = analyzeSchedule(schedule)
  if ((input.status === "ready" || input.status === "active") && health.criticalCount > 0) {
    throw new Error("No se puede publicar con alertas criticas")
  }
  if (
    (input.status === "ready" || input.status === "active") &&
    health.warnCount > 0 &&
    !input.allowWarnings
  ) {
    throw new Error("Hay advertencias pendientes")
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_day.status_updated",
      entityType: "program_days",
      entityId: day.id,
      metadata: { date: input.date },
      previous: { status: day.status },
      next: { status: input.status }
    },
    async () => {
      const { error } = await supabase
        .from("program_days")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", day.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/calendar")
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function updateProgramBlock(input: {
  date: string
  blockId: string
  title: string
  blockType: string
  category?: BlockCategory
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  status: string
  hideOverlays: boolean
  fallbackAssetId?: string
  notes?: string
}) {
  if (!["video", "image", "slide", "ad", "promo", "fallback"].includes(input.blockType)) {
    throw new Error("Tipo de bloque invalido")
  }
  if (!["draft", "ready", "active", "archived"].includes(input.status)) {
    throw new Error("Estado invalido")
  }
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const startTimeSeconds = parseTimecode(input.startTime)
  const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId)
  const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), contentDuration || 1)
  if (input.blockType === "ad" && durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const conflict = findScheduleConflicts(schedule.blocks, {
    id: input.blockId,
    programDayId: block.programDayId,
    startTimeSeconds,
    durationSeconds
  })
  if (conflict.hasConflict) throw new Error("El bloque se solapa con otro bloque")
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.updated",
      entityType: "program_blocks",
      entityId: input.blockId,
      metadata: { date: input.date },
      previous: {
        title: block.title,
        start_time: block.startTime,
        duration_seconds: block.durationSeconds,
        status: block.status
      },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: durationSeconds,
        status: input.status
      }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({
          title: input.title,
          block_type: input.blockType,
          category: input.category ?? block.category,
          asset_id: input.assetId || null,
          slide_id: input.slideId || null,
          start_time: input.startTime,
          start_time_seconds: startTimeSeconds,
          duration_seconds: durationSeconds,
          status: input.status,
          hide_overlays: input.hideOverlays,
          fallback_asset_id: input.fallbackAssetId || null,
          notes: input.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", input.blockId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
}

export async function deleteProgramBlock(input: { date: string; blockId: string }) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const supabase = createServiceClient()
  const { error: layerError } = await supabase
    .from("scheduled_layers")
    .delete()
    .eq("program_block_id", input.blockId)
  if (layerError) throw layerError
  await auditedMutation(
    {
      action: "program_block.deleted",
      entityType: "program_blocks",
      entityId: input.blockId,
      metadata: { date: input.date },
      previous: { title: block.title, start_time: block.startTime, status: block.status }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").delete().eq("id", input.blockId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function createLongTestSchedule(input: {
  date: string
  startTime: string
  totalHours: number
  programMinutes: number
  adBreakMinutes: number
  imageBumperSeconds: number
  replaceWindow: boolean
}) {
  const dayId = await ensureProgramDay(input.date)
  const schedule = await getScheduleForDate(input.date)
  const generatedBlocks = buildLongTestSchedule({
    mediaAssets: schedule.mediaAssets,
    slideAssets: schedule.slideAssets,
    startTime: input.startTime,
    totalHours: input.totalHours,
    programMinutes: input.programMinutes,
    adBreakMinutes: input.adBreakMinutes,
    imageBumperSeconds: input.imageBumperSeconds
  })
  const firstBlock = generatedBlocks[0]
  const lastBlock = generatedBlocks[generatedBlocks.length - 1]
  if (!firstBlock || !lastBlock) throw new Error("No se pudo generar la grilla")

  const supabase = createServiceClient()
  const startSeconds = firstBlock.startTimeSeconds
  const endSeconds = lastBlock.startTimeSeconds + lastBlock.durationSeconds

  if (input.replaceWindow) {
    const { error: deleteError } = await supabase
      .from("program_blocks")
      .delete()
      .eq("program_day_id", dayId)
      .gte("start_time_seconds", startSeconds)
      .lt("start_time_seconds", endSeconds)
    if (deleteError) throw deleteError
  }

  await auditedMutation(
    {
      action: "program_blocks.generated",
      entityType: "program_blocks",
      metadata: {
        date: input.date,
        start_time: input.startTime,
        total_hours: input.totalHours,
        blocks: generatedBlocks.length,
        replace_window: input.replaceWindow
      },
      next: {
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        blocks: generatedBlocks.length
      }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").insert(
        generatedBlocks.map((block) => ({
          program_day_id: dayId,
          title: block.title,
          block_type: block.blockType,
          category: "broadcast" satisfies BlockCategory,
          asset_id: block.assetId || null,
          slide_id: block.slideId || null,
          start_time: block.startTime,
          start_time_seconds: block.startTimeSeconds,
          duration_seconds: block.durationSeconds,
          status: "ready",
          hide_overlays: false
        }))
      )
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath("/admin/calendar")
}

export async function createSlideAsset(input: {
  title: string
  slideType: string
  content?: string | undefined
  imageUrl?: string | undefined
  htmlContent?: string | undefined
  templateId?: string | undefined
  defaultDurationSeconds?: number | undefined
  status?: string | undefined
}) {
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "slide_asset.created",
      entityType: "slide_assets",
      next: { title: input.title, slide_type: input.slideType, status: input.status || "ready" }
    },
    async () => {
      const { error } = await supabase.from("slide_assets").insert({
        title: input.title,
        slide_type: input.slideType,
        content: input.content || null,
        image_url: input.imageUrl || null,
        html_content: input.htmlContent || null,
        template_id: input.templateId || null,
        default_duration_seconds: input.defaultDurationSeconds || null,
        status: input.status || "ready"
      })
      if (error) throw error
    }
  )
  revalidatePath("/admin/slides")
}

export async function createScheduledLayer(input: {
  date: string
  blockId: string
  title: string
  layerType: string
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  zIndex: number
  position: string
}) {
  const startTimeSeconds = parseTimecode(input.startTime)
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "scheduled_layer.created",
      entityType: "scheduled_layers",
      metadata: { block_id: input.blockId },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: input.durationSeconds
      }
    },
    async () => {
      const { error } = await supabase.from("scheduled_layers").insert({
        program_block_id: input.blockId,
        title: input.title,
        layer_type: input.layerType,
        asset_id: input.assetId || null,
        slide_id: input.slideId || null,
        start_time_seconds: startTimeSeconds,
        duration_seconds: input.durationSeconds,
        z_index: input.zIndex,
        position: input.position,
        enabled: true
      })
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function setScheduledLayerEnabled(input: {
  date: string
  blockId: string
  layerId: string
  enabled: boolean
}) {
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: input.enabled ? "scheduled_layer.enabled" : "scheduled_layer.disabled",
      entityType: "scheduled_layers",
      entityId: input.layerId,
      metadata: { block_id: input.blockId },
      next: { enabled: input.enabled }
    },
    async () => {
      const { error } = await supabase
        .from("scheduled_layers")
        .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
        .eq("id", input.layerId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
}

export async function createLowerThirdLayer(input: {
  date: string
  blockId: string
  title: string
  primaryText: string
  secondaryText?: string
  startTime: string
  durationSeconds: number
}) {
  const supabase = createServiceClient()
  const slideTitle = input.title || input.primaryText
  const htmlContent = lowerThirdHtml(input.primaryText, input.secondaryText)
  const { data: slide, error: slideError } = await supabase
    .from("slide_assets")
    .insert({
      title: slideTitle,
      slide_type: "html",
      html_content: htmlContent,
      content: input.secondaryText || null,
      default_duration_seconds: input.durationSeconds,
      status: "ready"
    })
    .select("id")
    .single()
  if (slideError) throw slideError

  await createScheduledLayer({
    date: input.date,
    blockId: input.blockId,
    title: slideTitle,
    layerType: "lower_third",
    slideId: String(slide.id),
    startTime: input.startTime,
    durationSeconds: input.durationSeconds,
    zIndex: 30,
    position: "lower_third"
  })
  revalidatePath("/admin/slides")
}

export async function createMediaAsset(input: {
  title: string
  sourceType: string
  mediaKind: string
  assetType: string
  url?: string | undefined
  storageBucket?: string | undefined
  storagePath?: string | undefined
  durationSeconds?: number | undefined
  metadata?: Record<string, unknown> | undefined
}) {
  if (input.assetType === "ad" && input.durationSeconds && input.durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const data = await auditedMutation(
    {
      action: "media_asset.created",
      entityType: "media_assets",
      next: { title: input.title, source_type: input.sourceType, status: "ready" }
    },
    async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .insert({
          title: input.title,
          source_type: input.sourceType,
          media_kind: input.mediaKind,
          asset_type: input.assetType,
          url: input.url || null,
          storage_bucket: input.storageBucket || null,
          storage_path: input.storagePath || null,
          duration_seconds: input.durationSeconds || null,
          metadata: input.metadata ?? {},
          status: "ready"
        })
        .select("id")
        .single()
      if (error) throw error
      return data
    }
  )
  revalidatePath("/admin/assets")
  return String(data.id)
}

export async function updateMediaAsset(input: {
  id: string
  title: string
  description?: string | undefined
  sourceType: string
  mediaKind: string
  assetType: string
  url?: string | undefined
  thumbnailUrl?: string | undefined
  durationSeconds?: number | undefined
  status: string
  orientation?: string | undefined
  playlistOrder?: number | undefined
  revalidatePaths?: string[] | undefined
}) {
  if (!input.id) throw new Error("Asset missing")
  if (input.assetType === "ad" && input.durationSeconds && input.durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const { data: current, error: currentError } = await supabase
    .from("media_assets")
    .select("metadata")
    .eq("id", input.id)
    .single()
  if (currentError) throw currentError

  const metadata =
    typeof current.metadata === "object" && current.metadata !== null
      ? { ...(current.metadata as Record<string, unknown>) }
      : {}
  const orientation = input.orientation || String(metadata.orientation || "auto")
  metadata.orientation = orientation
  metadata.presentation = orientation === "vertical" ? "vertical_blur" : "fit"
  metadata.background = orientation === "vertical" ? "blur" : "black"
  if (input.assetType === "music" && typeof input.playlistOrder === "number") {
    metadata.playlist_order = input.playlistOrder
  }

  await auditedMutation(
    {
      action: "media_asset.updated",
      entityType: "media_assets",
      entityId: input.id,
      ...(typeof current === "object" && current !== null
        ? { previous: { metadata: current.metadata ?? null } }
        : {}),
      next: {
        title: input.title,
        source_type: input.sourceType,
        asset_type: input.assetType,
        status: input.status
      }
    },
    async () => {
      const { error } = await supabase
        .from("media_assets")
        .update({
          title: input.title,
          description: input.description || null,
          source_type: input.sourceType,
          media_kind: input.mediaKind,
          asset_type: input.assetType,
          url: input.url || null,
          thumbnail_url: input.thumbnailUrl || null,
          duration_seconds: input.durationSeconds || null,
          status: input.status,
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq("id", input.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/assets")
  for (const path of input.revalidatePaths ?? []) {
    revalidatePath(path)
  }
}

export async function deleteMediaAsset(input: { id: string }) {
  if (!input.id) throw new Error("Asset missing")
  const supabase = createServiceClient()
  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("title, storage_bucket, storage_path")
    .eq("id", input.id)
    .single()
  if (assetError) throw assetError

  const storageBucket = asset.storage_bucket ? String(asset.storage_bucket) : ""
  const storagePath = asset.storage_path ? String(asset.storage_path) : ""
  if (storageBucket && storagePath) {
    const { error: storageError } = await supabase.storage.from(storageBucket).remove([storagePath])
    if (storageError) throw storageError
  }

  await auditedMutation(
    {
      action: "media_asset.deleted",
      entityType: "media_assets",
      entityId: input.id,
      previous: { title: String(asset.title ?? "") }
    },
    async () => {
      const { error } = await supabase.from("media_assets").delete().eq("id", input.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/assets")
  revalidatePath("/admin/music")
}

function lowerThirdHtml(primaryText: string, secondaryText?: string) {
  const primary = escapeHtml(primaryText)
  const secondary = secondaryText ? escapeHtml(secondaryText) : ""
  return `
    <div class="lower-third-card">
      <div class="lower-third-accent"></div>
      <div>
        <div class="lower-third-primary">${primary}</div>
        ${secondary ? `<div class="lower-third-secondary">${secondary}</div>` : ""}
      </div>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
