import { mockSchedule } from "./mock-data"
import { createServiceClient } from "./supabase/server"
import { isoDateInTimezone } from "./time"

import type {
  MediaAsset,
  ProgramBlock,
  ProgramDay,
  ScheduleBundle,
  ScheduledLayer,
  SlideAsset
} from "./types"

type Row = Record<string, unknown>

export type ReadResult<T> = { data: T | null; outage: boolean }

function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

function devFallback<T>(value: T, error: unknown, tag: string): T {
  if (isProduction()) {
    throw error instanceof Error ? error : new Error(`[${tag}] ${String(error)}`)
  }
  console.error(`[${tag}] falling back to mock data in non-production`, error)
  return value
}

export async function getScheduleForDate(date: string): Promise<ScheduleBundle> {
  try {
    const supabase = createServiceClient()
    const { data: day } = await supabase
      .from("program_days")
      .select("*")
      .eq("air_date", date)
      .maybeSingle()
    if (!day) return mockSchedule

    const [{ data: blocks }, { data: mediaAssets }, { data: slideAssets }] = await Promise.all([
      supabase
        .from("program_blocks")
        .select("*")
        .eq("program_day_id", day.id)
        .order("start_time_seconds"),
      supabase.from("media_assets").select("*").order("title"),
      supabase.from("slide_assets").select("*").order("title")
    ])
    const blockIds = (blocks ?? []).map((row) => text(row.id))
    const { data: layers } = blockIds.length
      ? await supabase.from("scheduled_layers").select("*").in("program_block_id", blockIds)
      : { data: [] }

    return {
      day: mapDay(day),
      blocks: (blocks ?? []).map(mapBlock),
      layers: (layers ?? []).map(mapLayer),
      mediaAssets: (mediaAssets ?? []).map(mapMediaAsset),
      slideAssets: (slideAssets ?? []).map(mapSlide)
    }
  } catch (error) {
    console.error("[lib/data.ts:getScheduleForDate]", error)
    return devFallback(mockSchedule, error, "lib/data.ts:getScheduleForDate")
  }
}

export async function getPlaybackScheduleForDate(date: string): Promise<ScheduleBundle> {
  try {
    const supabase = createServiceClient()
    const { data: day } = await supabase
      .from("program_days")
      .select("*")
      .eq("air_date", date)
      .maybeSingle()
    if (!day) return mockSchedule

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
      { data: referencedSlides, error: slidesError }
    ] = await Promise.all([
      mediaIds.length
        ? supabase.from("media_assets").select("*").in("id", mediaIds)
        : { data: [], error: null },
      supabase.from("media_assets").select("*").eq("asset_type", "fallback").eq("status", "ready"),
      slideIds.length
        ? supabase.from("slide_assets").select("*").in("id", slideIds)
        : { data: [], error: null }
    ])
    if (mediaError) throw mediaError
    if (fallbackError) throw fallbackError
    if (slidesError) throw slidesError

    return {
      day: mapDay(day),
      blocks: blockRows.map(mapBlock),
      layers: layerRows.map(mapLayer),
      mediaAssets: uniqueRows([...(referencedMedia ?? []), ...(fallbackMedia ?? [])]).map(
        mapMediaAsset
      ),
      slideAssets: (referencedSlides ?? []).map(mapSlide)
    }
  } catch (error) {
    console.error("[lib/data.ts:getPlaybackScheduleForDate]", error)
    return devFallback(mockSchedule, error, "lib/data.ts:getPlaybackScheduleForDate")
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
    return date ? getPlaybackScheduleForDate(date) : mockSchedule
  } catch (error) {
    console.error("[lib/data.ts:getPlaybackScheduleForBlock]", error)
    return devFallback(mockSchedule, error, "lib/data.ts:getPlaybackScheduleForBlock")
  }
}

export async function getLiveSchedule(
  now = new Date(),
  timezone = "America/Argentina/Buenos_Aires"
) {
  return getScheduleForDate(isoDateInTimezone(now, timezone))
}

export async function getLivePlaybackSchedule(
  now = new Date(),
  timezone = "America/Argentina/Buenos_Aires"
) {
  return getPlaybackScheduleForDate(isoDateInTimezone(now, timezone))
}

export async function getMediaAssetById(id: string): Promise<MediaAsset | null> {
  if (!id) return null
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
    console.error("[lib/data.ts:getMediaAssetById]", error)
    return devFallback(null, error, "lib/data.ts:getMediaAssetById")
  }
}

export async function getMediaAssetByVimeoUri(uri: string): Promise<MediaAsset | null> {
  if (!uri) return null
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("vimeo_uri", uri)
      .maybeSingle()
    if (error) throw error
    return data ? mapMediaAsset(data) : null
  } catch (error) {
    console.error("[lib/data.ts:getMediaAssetByVimeoUri]", error)
    return devFallback(null, error, "lib/data.ts:getMediaAssetByVimeoUri")
  }
}

export async function getAssets(): Promise<MediaAsset[]> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("media_assets")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapMediaAsset)
  } catch (error) {
    console.error("[lib/data.ts:getAssets]", error)
    return devFallback(mockSchedule.mediaAssets, error, "lib/data.ts:getAssets")
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
    console.error("[lib/data.ts:getSlides]", error)
    return devFallback(mockSchedule.slideAssets, error, "lib/data.ts:getSlides")
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
    console.error("[lib/data.ts:getDays]", error)
    return devFallback(mockSchedule.day ? [mockSchedule.day] : [], error, "lib/data.ts:getDays")
  }
}

/**
 * Wrapper that surfaces an outage flag for read-side callers (e.g. AdminShell).
 * Catches errors thrown by `getLiveSchedule` in production and returns
 * `{ data: null, outage: true }`. In non-production, errors propagate from
 * the underlying call (which already returns the dev fallback).
 */
export async function getLiveScheduleSafe(
  now = new Date(),
  timezone = "America/Argentina/Buenos_Aires"
): Promise<ReadResult<ScheduleBundle>> {
  try {
    const data = await getLiveSchedule(now, timezone)
    return { data, outage: false }
  } catch (error) {
    console.error("[lib/data.ts:getLiveScheduleSafe]", error)
    return { data: null, outage: true }
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
    category: (text(row.category) || "mercados") as ProgramBlock["category"],
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

function mapMediaAsset(row: Row): MediaAsset {
  return {
    id: text(row.id),
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
    vimeoId: nullableText(row.vimeo_id),
    vimeoUri: nullableText(row.vimeo_uri),
    vimeoPrivacy: nullableText(row.vimeo_privacy),
    vimeoEmbedStatus: nullableText(row.vimeo_embed_status),
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
