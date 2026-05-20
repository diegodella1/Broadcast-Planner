import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "./audit"
import { getMediaAssetById, getMediaAssetByVimeoUri } from "./data"
import { createProgramBlock } from "./mutations"
import { getVimeoToken } from "./settings"
import { createServiceClient } from "./supabase/server"
import {
  formatTimecode,
  isoDateInTimezone,
  PLAYOUT_TIMEZONE,
  secondsSinceMidnightInTimezone
} from "./time"
import {
  getVimeoVideo,
  searchVimeoAccountVideos,
  upsertVimeoVideos,
  type VimeoVideo
} from "./vimeo"

import type {
  GoLiveNowInput,
  GoLiveReutersInput,
  ScheduleReutersBlockInput,
  ScheduleVimeoBlockInput
} from "./schemas/manual-broadcast"
import type { MediaAsset } from "./types"

const TZ = PLAYOUT_TIMEZONE
const DEFAULT_DURATION_SECONDS = 1800
const REUTERS_LIVE_DEFAULT_DURATION_SECONDS = 1800

/**
 * Look up the cached `media_assets` row for a Vimeo URI. If absent, fetch the
 * full Vimeo video, upsert it into `media_assets`, and return the new id.
 */
export async function ensureVimeoAssetCached(token: string, vimeoUri: string): Promise<string> {
  const existing = await getMediaAssetByVimeoUri(vimeoUri)
  if (existing) return existing.id

  const video = await getVimeoVideo(token, vimeoUri)
  await upsertVimeoVideos([video])

  const inserted = await getMediaAssetByVimeoUri(vimeoUri)
  if (!inserted) {
    throw new Error("manual-broadcast: failed to cache Vimeo asset")
  }
  return inserted.id
}

export async function searchVimeoCatalog(query: string): Promise<VimeoVideo[]> {
  const token = await getVimeoToken()
  if (!token) throw new Error("vimeo: no token configured")
  return searchVimeoAccountVideos(token, query)
}

/**
 * Insert a ProgramBlock for the requested Vimeo video starting at "now".
 * The asset is cached transparently if missing. Throws if the resulting
 * block would overlap an existing block (preempt handling is not yet wired).
 */
export async function goLiveWithVimeo(input: GoLiveNowInput): Promise<{ programBlockId: string }> {
  const token = await getVimeoToken()
  if (!token) throw new Error("vimeo: no token configured")

  const assetId = await ensureVimeoAssetCached(token, input.vimeoUri)
  const asset = await getMediaAssetById(assetId)
  if (!asset) throw new Error("manual-broadcast: cached asset not found")

  const now = new Date()
  const airDate = isoDateInTimezone(now, TZ)
  const startSeconds = secondsSinceMidnightInTimezone(now, TZ)
  const startTime = formatTimecode(startSeconds)
  const durationSeconds = resolveDuration(asset)

  await createProgramBlock({
    date: airDate,
    title: asset.title,
    blockType: "video",
    category: "broadcast",
    assetId,
    startTime,
    durationSeconds,
    hideOverlays: false,
    conflictResolution: "archive_conflicts"
  })

  const programBlockId = await fetchInsertedBlockId(airDate, startSeconds)
  await logManualBroadcast("manual_broadcast.go_live", {
    asset_id: assetId,
    vimeo_uri: input.vimeoUri,
    air_date: airDate,
    start_time: startTime,
    program_block_id: programBlockId
  })

  revalidatePath("/admin/output")
  revalidatePath(`/admin/schedule/${airDate}`)

  return { programBlockId: programBlockId ?? "" }
}

/**
 * Insert a ProgramBlock for the requested Vimeo video at a specific HH:MM[:SS]
 * time on the supplied air date (or today's local date in {@link TZ} when not
 * supplied). Throws on overlap with an existing block.
 */
export async function scheduleVimeoBlock(
  input: ScheduleVimeoBlockInput
): Promise<{ programBlockId: string }> {
  const token = await getVimeoToken()
  if (!token) throw new Error("vimeo: no token configured")

  const assetId = await ensureVimeoAssetCached(token, input.vimeoUri)
  const asset = await getMediaAssetById(assetId)
  if (!asset) throw new Error("manual-broadcast: cached asset not found")

  const airDate = input.airDate ?? isoDateInTimezone(new Date(), TZ)
  const startTime = normalizeStartTime(input.startAt)
  const startSeconds = startTimeToSeconds(startTime)
  const durationSeconds = resolveDuration(asset)

  await createProgramBlock({
    date: airDate,
    title: asset.title,
    blockType: "video",
    category: "broadcast",
    assetId,
    startTime,
    durationSeconds,
    hideOverlays: false
  })

  const programBlockId = await fetchInsertedBlockId(airDate, startSeconds)
  await logManualBroadcast("manual_broadcast.schedule", {
    asset_id: assetId,
    vimeo_uri: input.vimeoUri,
    air_date: airDate,
    start_time: startTime,
    program_block_id: programBlockId
  })

  revalidatePath("/admin/output")
  revalidatePath(`/admin/schedule/${airDate}`)

  return { programBlockId: programBlockId ?? "" }
}

function resolveDuration(asset: MediaAsset): number {
  const value = asset.durationSeconds
  if (typeof value === "number" && value > 0) return Math.round(value)
  return DEFAULT_DURATION_SECONDS
}

function normalizeStartTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

function startTimeToSeconds(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(":").map(Number) as [number, number, number]
  return h * 3600 + m * 60 + s
}

async function fetchInsertedBlockId(date: string, startSeconds: number): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data: day } = await supabase
      .from("program_days")
      .select("id")
      .eq("air_date", date)
      .maybeSingle()
    if (!day?.id) return null
    const { data } = await supabase
      .from("program_blocks")
      .select("id")
      .eq("program_day_id", String(day.id))
      .eq("start_time_seconds", startSeconds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.id ? String(data.id) : null
  } catch (error) {
    console.error("[lib/manual-broadcast.ts:fetchInsertedBlockId]", error)
    return null
  }
}

async function logManualBroadcast(action: string, metadata: Record<string, unknown>) {
  try {
    await recordAuditEvent({
      actor: "admin",
      action,
      entityType: "program_blocks",
      metadata
    })
  } catch (error) {
    console.error("[lib/manual-broadcast.ts:logManualBroadcast]", error)
  }
}

/**
 * Insert a ProgramBlock for an already-cached Reuters channel asset starting
 * at "now". Reuters assets are live (`durationSeconds === null`); the block
 * defaults to {@link REUTERS_LIVE_DEFAULT_DURATION_SECONDS}.
 */
export async function goLiveWithReuters(
  input: GoLiveReutersInput
): Promise<{ programBlockId: string }> {
  const asset = await getMediaAssetById(input.assetId)
  if (!asset) throw new Error("manual-broadcast: reuters asset not found")
  if (asset.sourceType !== "reuters") {
    throw new Error("manual-broadcast: asset is not a reuters channel")
  }

  const now = new Date()
  const airDate = isoDateInTimezone(now, TZ)
  const startSeconds = secondsSinceMidnightInTimezone(now, TZ)
  const startTime = formatTimecode(startSeconds)
  const durationSeconds = resolveReutersDuration(asset)

  await createProgramBlock({
    date: airDate,
    title: asset.title,
    blockType: "video",
    category: "reuters",
    assetId: input.assetId,
    startTime,
    durationSeconds,
    hideOverlays: false,
    conflictResolution: "archive_conflicts"
  })

  const programBlockId = await fetchInsertedBlockId(airDate, startSeconds)
  await logManualBroadcast("manual_broadcast.reuters_go_live", {
    asset_id: input.assetId,
    air_date: airDate,
    start_time: startTime,
    program_block_id: programBlockId
  })

  revalidatePath("/admin/output")
  revalidatePath(`/admin/schedule/${airDate}`)

  return { programBlockId: programBlockId ?? "" }
}

/**
 * Insert a ProgramBlock for a Reuters channel at a specific HH:MM[:SS] time
 * on the supplied air date (or today's local date in {@link TZ} when not
 * supplied). Throws on overlap with an existing block.
 */
export async function scheduleReutersBlock(
  input: ScheduleReutersBlockInput
): Promise<{ programBlockId: string }> {
  const asset = await getMediaAssetById(input.assetId)
  if (!asset) throw new Error("manual-broadcast: reuters asset not found")
  if (asset.sourceType !== "reuters") {
    throw new Error("manual-broadcast: asset is not a reuters channel")
  }

  const airDate = input.airDate ?? isoDateInTimezone(new Date(), TZ)
  const startTime = normalizeStartTime(input.startAt)
  const startSeconds = startTimeToSeconds(startTime)
  const durationSeconds = input.durationSeconds

  await createProgramBlock({
    date: airDate,
    title: asset.title,
    blockType: "video",
    category: "reuters",
    assetId: input.assetId,
    startTime,
    durationSeconds,
    hideOverlays: false
  })

  const programBlockId = await fetchInsertedBlockId(airDate, startSeconds)
  await logManualBroadcast("manual_broadcast.reuters_schedule", {
    asset_id: input.assetId,
    air_date: airDate,
    start_time: startTime,
    duration_seconds: durationSeconds,
    program_block_id: programBlockId
  })

  revalidatePath("/admin/output")
  revalidatePath(`/admin/schedule/${airDate}`)

  return { programBlockId: programBlockId ?? "" }
}

function resolveReutersDuration(asset: MediaAsset): number {
  const value = asset.durationSeconds
  if (typeof value === "number" && value > 0) return Math.round(value)
  return REUTERS_LIVE_DEFAULT_DURATION_SECONDS
}
