import { mockSchedule } from "./mock-data"
import { mapAuditEvent, type AuditEvent } from "./audit"
import { createServiceClient } from "./supabase/server"
import { isoDateInTimezone, PLAYOUT_TIMEZONE } from "./time"

import type {
  MediaAsset,
  ProgramBlock,
  ProgramDay,
  RunbookCheckState,
  ScheduleBundle,
  ScheduledLayer,
  SlideAsset
} from "./types"

type Row = Record<string, unknown>

export function shouldUseDemoData() {
  if (isProductionLikeRuntime() && process.env.ALLOW_DEMO_DATA === "true") {
    throw new Error("ALLOW_DEMO_DATA cannot be enabled in production")
  }
  return process.env.ALLOW_DEMO_DATA === "true"
}

export function handleDataFailure<T>(error: unknown, demoValue: T): T {
  if (shouldUseDemoData()) return demoValue
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Database unavailable: ${message}`)
}

function isProductionLikeRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_BASE_URL?.startsWith("https://") ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://")
  )
}

export async function getScheduleForDate(date: string): Promise<ScheduleBundle> {
  try {
    const supabase = createServiceClient()
    const [
      { data: day, error: dayError },
      { data: mediaAssets, error: mediaError },
      { data: slideAssets, error: slideError }
    ] = await Promise.all([
      supabase.from("program_days").select("*").eq("air_date", date).maybeSingle(),
      supabase.from("media_assets").select("*").order("title"),
      supabase.from("slide_assets").select("*").order("title")
    ])
    if (dayError) throw dayError
    if (mediaError) throw mediaError
    if (slideError) throw slideError
    if (!day) {
      return {
        day: null,
        blocks: [],
        layers: [],
        mediaAssets: (mediaAssets ?? []).map((row) => mapMediaAsset(row)),
        slideAssets: (slideAssets ?? []).map(mapSlide)
      }
    }

    const [{ data: blocks, error: blocksError }] = await Promise.all([
      supabase
        .from("program_blocks")
        .select("*")
        .eq("program_day_id", day.id)
        .order("start_time_seconds")
    ])
    if (blocksError) throw blocksError
    const blockIds = (blocks ?? []).map((row) => text(row.id))
    const { data: layers, error: layersError } = blockIds.length
      ? await supabase.from("scheduled_layers").select("*").in("program_block_id", blockIds)
      : { data: [], error: null }
    if (layersError) throw layersError

    return {
      day: mapDay(day),
      blocks: (blocks ?? []).map(mapBlock),
      layers: (layers ?? []).map(mapLayer),
      mediaAssets: (mediaAssets ?? []).map((row) => mapMediaAsset(row)),
      slideAssets: (slideAssets ?? []).map(mapSlide)
    }
  } catch (error) {
    return handleDataFailure(error, mockSchedule)
  }
}

export async function getProgrammedSecondsByDate(days: Pick<ProgramDay, "id" | "airDate">[]) {
  if (!days.length) return new Map<string, number>()
  try {
    const supabase = createServiceClient()
    const dayIdToDate = new Map(days.map((day) => [day.id, day.airDate]))
    const { data, error } = await supabase
      .from("program_blocks")
      .select("program_day_id,duration_seconds,status")
      .in("program_day_id", days.map((day) => day.id))
    if (error) throw error

    const totals = new Map<string, number>()
    for (const row of data ?? []) {
      if (text(row.status) === "archived") continue
      const date = dayIdToDate.get(text(row.program_day_id))
      if (!date) continue
      totals.set(date, (totals.get(date) ?? 0) + number(row.duration_seconds))
    }
    return totals
  } catch (error) {
    return handleDataFailure(error, new Map<string, number>())
  }
}

export async function getPlaybackScheduleForDate(date: string): Promise<ScheduleBundle> {
  try {
    const supabase = createServiceClient()
    const { data: day, error: dayError } = await supabase
      .from("program_days")
      .select("*")
      .eq("air_date", date)
      .maybeSingle()
    if (dayError) throw dayError
    if (!day) {
      const { data: fallbackMedia, error: fallbackError } = await supabase
        .from("media_assets")
        .select("*")
        .eq("asset_type", "fallback")
        .eq("status", "ready")
      if (fallbackError) throw fallbackError
      return {
        day: null,
        blocks: [],
        layers: [],
        mediaAssets: (fallbackMedia ?? []).map((row) => mapMediaAsset(row)),
        slideAssets: []
      }
    }

    const { data: blocks, error: blocksError } = await supabase
      .from("program_blocks")
      .select("*")
      .eq("program_day_id", day.id)
      .order("start_time_seconds")
    if (blocksError) throw blocksError

    const blockRows = blocks ?? []
    const blockIds = blockRows.map((row) => text(row.id))
    const { data: layers, error: layersError } = blockIds.length
      ? await supabase.from("scheduled_layers").select("*").in("program_block_id", blockIds)
      : { data: [], error: null }
    if (layersError) throw layersError

    const layerRows = layers ?? []
    const mediaIds = uniqueIds([
      nullableText(day.fallback_asset_id),
      ...blockRows.map((row) => nullableText(row.asset_id)),
      ...blockRows.map((row) => nullableText(row.fallback_asset_id)),
      ...layerRows.map((row) => nullableText(row.asset_id))
    ])
    const slideIds = uniqueIds([
      ...blockRows.map((row) => nullableText(row.slide_id)),
      ...layerRows.map((row) => nullableText(row.slide_id))
    ])

    const [
      { data: referencedMedia, error: mediaError },
      { data: fallbackMedia, error: fallbackError },
      { data: musicMedia, error: musicError },
      { data: referencedSlides, error: slidesError }
    ] = await Promise.all([
      mediaIds.length
        ? supabase.from("media_assets").select("*").in("id", mediaIds)
        : { data: [], error: null },
      supabase.from("media_assets").select("*").eq("asset_type", "fallback").eq("status", "ready"),
      supabase.from("media_assets").select("*").eq("asset_type", "music").eq("status", "ready"),
      slideIds.length
        ? supabase.from("slide_assets").select("*").in("id", slideIds)
        : { data: [], error: null }
    ])
    if (mediaError) throw mediaError
    if (fallbackError) throw fallbackError
    if (musicError) throw musicError
    if (slidesError) throw slidesError

    return {
      day: mapDay(day),
      blocks: blockRows.map(mapBlock),
      layers: layerRows.map(mapLayer),
      mediaAssets: uniqueRows([
        ...(referencedMedia ?? []),
        ...(fallbackMedia ?? []),
        ...(musicMedia ?? [])
      ]).map((row) => mapMediaAsset(row)),
      slideAssets: (referencedSlides ?? []).map(mapSlide)
    }
  } catch (error) {
    return handleDataFailure(error, mockSchedule)
  }
}

export async function getPlaybackScheduleForBlock(blockId: string): Promise<ScheduleBundle> {
  try {
    const supabase = createServiceClient()
    const { data: block, error } = await supabase
      .from("program_blocks")
      .select("program_days(air_date)")
      .eq("id", blockId)
      .single()
    if (error) throw error
    const programDay = Array.isArray(block.program_days)
      ? block.program_days[0]
      : block.program_days
    const date =
      typeof programDay === "object" && programDay !== null
        ? text((programDay as Row).air_date)
        : ""
    if (!date) throw new Error("Block has no program day")
    return getPlaybackScheduleForDate(date)
  } catch (error) {
    return handleDataFailure(error, mockSchedule)
  }
}

export async function getLiveSchedule(now = new Date(), timezone = PLAYOUT_TIMEZONE) {
  return getScheduleForDate(isoDateInTimezone(now, timezone))
}

export async function getLivePlaybackSchedule(now = new Date(), timezone = PLAYOUT_TIMEZONE) {
  return getPlaybackScheduleForDate(isoDateInTimezone(now, timezone))
}

export async function getAssets(): Promise<MediaAsset[]> {
  try {
    const supabase = createServiceClient()
    const [{ data, error }, usedAssetIds] = await Promise.all([
      supabase.from("media_assets").select("*").order("updated_at", { ascending: false }),
      getScheduledAssetIds()
    ])
    if (error) throw error
    return (data ?? []).map((row) => mapMediaAsset(row, usedAssetIds))
  } catch (error) {
    return handleDataFailure(error, mockSchedule.mediaAssets)
  }
}

export async function getRunbookState(programDayId: string): Promise<RunbookCheckState[]> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("operator_runbook_checks")
      .select("*")
      .eq("program_day_id", programDayId)
      .order("section")
      .order("item_key")
    if (error) throw error
    return (data ?? []).map(mapRunbookCheck)
  } catch (error) {
    if (isMissingRunbookTable(error)) return []
    return handleDataFailure(error, [])
  }
}

async function getScheduledAssetIds() {
  const supabase = createServiceClient()
  const [{ data: blocks, error: blocksError }, { data: layers, error: layersError }] =
    await Promise.all([
      supabase.from("program_blocks").select("asset_id, fallback_asset_id, status"),
      supabase.from("scheduled_layers").select("asset_id, enabled")
    ])
  if (blocksError) throw blocksError
  if (layersError) throw layersError
  const ids = [
    ...((blocks ?? []) as Row[])
      .filter((row) => text(row.status) !== "archived")
      .flatMap((row) => [nullableText(row.asset_id), nullableText(row.fallback_asset_id)]),
    ...((layers ?? []) as Row[])
      .filter((row) => row.enabled !== false)
      .map((row) => nullableText(row.asset_id))
  ]
  return new Set(ids.filter((id): id is string => Boolean(id)))
}

export async function getMediaAssetById(id: string): Promise<MediaAsset | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    return data ? mapMediaAsset(data) : null
  } catch (error) {
    const fallback = mockSchedule.mediaAssets.find((asset) => asset.id === id) ?? null
    return handleDataFailure(error, fallback)
  }
}

export async function getMediaAssetByVimeoUri(vimeoUri: string): Promise<MediaAsset | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("vimeo_uri", vimeoUri)
      .maybeSingle()
    if (error) throw error
    return data ? mapMediaAsset(data) : null
  } catch (error) {
    const fallback = mockSchedule.mediaAssets.find((asset) => asset.vimeoUri === vimeoUri) ?? null
    return handleDataFailure(error, fallback)
  }
}

export async function getSlides(): Promise<SlideAsset[]> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("slide_assets")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapSlide)
  } catch (error) {
    return handleDataFailure(error, mockSchedule.slideAssets)
  }
}

export async function getDays(): Promise<ProgramDay[]> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("program_days")
      .select("*")
      .order("air_date", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapDay)
  } catch (error) {
    return handleDataFailure(error, mockSchedule.day ? [mockSchedule.day] : [])
  }
}

export async function getAuditEvents(
  input: {
    action?: string
    entityType?: string
    limit?: number
  } = {}
): Promise<AuditEvent[]> {
  try {
    const supabase = createServiceClient()
    let query = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(input.limit ?? 100, 1), 250))
    if (input.action) query = query.eq("action", input.action)
    if (input.entityType) query = query.eq("entity_type", input.entityType)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => mapAuditEvent(row as Row))
  } catch (error) {
    return handleDataFailure(error, [])
  }
}

function mapDay(row: Row): ProgramDay {
  return {
    id: text(row.id),
    airDate: text(row.air_date),
    timezone: text(row.timezone),
    status: text(row.status) as ProgramDay["status"],
    title: nullableText(row.title),
    notes: nullableText(row.notes),
    fallbackAssetId: nullableText(row.fallback_asset_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function mapBlock(row: Row): ProgramBlock {
  return {
    id: text(row.id),
    programDayId: text(row.program_day_id),
    title: text(row.title),
    blockType: text(row.block_type) as ProgramBlock["blockType"],
    category: (nullableText(row.category) ?? "mercados") as ProgramBlock["category"],
    assetId: nullableText(row.asset_id),
    slideId: nullableText(row.slide_id),
    startTime: text(row.start_time),
    startTimeSeconds: number(row.start_time_seconds),
    durationSeconds: number(row.duration_seconds),
    status: text(row.status) as ProgramBlock["status"],
    hideOverlays: Boolean(row.hide_overlays),
    fallbackAssetId: nullableText(row.fallback_asset_id),
    notes: nullableText(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function mapLayer(row: Row): ScheduledLayer {
  return {
    id: text(row.id),
    programBlockId: text(row.program_block_id),
    title: text(row.title),
    layerType: text(row.layer_type) as ScheduledLayer["layerType"],
    assetId: nullableText(row.asset_id),
    slideId: nullableText(row.slide_id),
    startTimeSeconds: number(row.start_time_seconds),
    durationSeconds: number(row.duration_seconds),
    zIndex: number(row.z_index),
    position: text(row.position) as ScheduledLayer["position"],
    enabled: Boolean(row.enabled),
    locked: Boolean(row.locked),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function mapRunbookCheck(row: Row): RunbookCheckState {
  return {
    id: text(row.id),
    programDayId: text(row.program_day_id),
    section: text(row.section) as RunbookCheckState["section"],
    itemKey: text(row.item_key),
    checked: Boolean(row.checked),
    notes: nullableText(row.notes),
    checkedAt: nullableText(row.checked_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function isMissingRunbookTable(error: unknown) {
  if (!error || typeof error !== "object") return false
  const row = error as Row
  const code = nullableText(row.code)
  const message = nullableText(row.message) ?? ""
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("operator_runbook_checks") ||
    message.includes("Could not find the table")
  )
}

function mapMediaAsset(row: Row, scheduledAssetIds = new Set<string>()): MediaAsset {
  const id = text(row.id)
  return {
    id,
    title: text(row.title),
    description: nullableText(row.description),
    sourceType: text(row.source_type) as MediaAsset["sourceType"],
    mediaKind: text(row.media_kind) as MediaAsset["mediaKind"],
    assetType: text(row.asset_type) as MediaAsset["assetType"],
    url: nullableText(row.url),
    storageBucket: nullableText(row.storage_bucket),
    storagePath: nullableText(row.storage_path),
    thumbnailUrl: nullableText(row.thumbnail_url),
    durationSeconds: nullableNumber(row.duration_seconds),
    status: text(row.status) as MediaAsset["status"],
    lifecycleState: (scheduledAssetIds.has(id)
      ? "scheduled_in_use"
      : (nullableText(row.lifecycle_state) ?? "reviewed")) as NonNullable<
      MediaAsset["lifecycleState"]
    >,
    vimeoId: nullableText(row.vimeo_id),
    vimeoUri: nullableText(row.vimeo_uri),
    vimeoPrivacy: nullableText(row.vimeo_privacy),
    vimeoEmbedStatus: nullableText(row.vimeo_embed_status),
    playbackReadinessStatus: (nullableText(row.playback_readiness_status) ??
      "unchecked") as NonNullable<MediaAsset["playbackReadinessStatus"]>,
    playbackCheckedAt: nullableText(row.playback_checked_at),
    playbackError: nullableText(row.playback_error),
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function mapSlide(row: Row): SlideAsset {
  return {
    id: text(row.id),
    title: text(row.title),
    slideType: text(row.slide_type) as SlideAsset["slideType"],
    content: nullableText(row.content),
    imageUrl: nullableText(row.image_url),
    htmlContent: nullableText(row.html_content),
    templateId: nullableText(row.template_id),
    defaultDurationSeconds: nullableNumber(row.default_duration_seconds),
    status: text(row.status) as SlideAsset["status"],
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  }
}

function text(value: unknown): string {
  return String(value ?? "")
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value)
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return number(value)
}

function uniqueIds(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function uniqueRows(rows: Row[]): Row[] {
  return [...new Map(rows.map((row) => [text(row.id), row])).values()]
}
