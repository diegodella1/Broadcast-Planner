import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { recordAuditEvent } from "@/lib/audit"
import { requireAdmin } from "@/lib/auth"
import { verifyCsrfToken } from "@/lib/csrf"
import { getReutersClient, type ReutersChannel } from "@/lib/reuters"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type ReutersSyncedChannel = ReutersChannel & {
  /** `media_assets.id` for the cached row, or null if not yet synced. */
  assetId: string | null
}

type SyncResponse = {
  synced: number
  channels: ReutersSyncedChannel[]
}

type ChannelsResponse = {
  channels: ReutersSyncedChannel[]
}

/**
 * GET /api/reuters/sync
 *
 * Returns the current list of Reuters live channels (from `getReutersClient()`)
 * merged with the cached `media_assets.id` for each channel — used by the
 * operations panel to drive the "Reuters Live" picker without forcing a sync.
 * Channels without a cached asset id surface `assetId: null`; the caller must
 * trigger POST /api/reuters/sync first to be able to schedule them.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin()
    const client = await getReutersClient()
    const channels = await client.listLiveChannels()
    const merged = await mergeWithCachedAssetIds(channels)
    const body: ChannelsResponse = { channels: merged }
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/reuters/sync:GET]", error)
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}

/**
 * POST /api/reuters/sync
 *
 * Calls the configured Reuters client (fixtures by default — see
 * REUTERS_PROVIDER and `lib/reuters.ts`), upserts each live channel into
 * `media_assets` keyed by URL, and revalidates affected admin routes.
 *
 * The natural key is `media_assets.url`: Reuters HLS endpoints are stable per
 * channel id even when the upstream signing rotates, so two runs against the
 * same provider reconcile in place. If the upstream URL changes, the row is
 * inserted as a fresh asset and the stale row is left untouched (operator
 * cleanup task — out of scope for the scaffolding round).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin()
    await verifyCsrfToken(request)
    const client = await getReutersClient()
    const channels = await client.listLiveChannels()
    const supabase = createServiceClient()

    const urls = channels.map((c) => c.hlsUrl)
    const { data: existingRows, error: existingError } = urls.length
      ? await supabase.from("media_assets").select("id, url").in("url", urls)
      : { data: [], error: null }
    if (existingError) throw existingError
    const existingByUrl = new Map<string, string>()
    for (const row of existingRows ?? []) {
      const url = typeof row.url === "string" ? row.url : ""
      const id = typeof row.id === "string" ? row.id : String(row.id ?? "")
      if (url && id) existingByUrl.set(url, id)
    }

    const nowIso = new Date().toISOString()
    const inserts = channels
      .filter((c) => !existingByUrl.has(c.hlsUrl))
      .map((c) => buildAssetInsertRow(c, nowIso))
    if (inserts.length) {
      const { error } = await supabase.from("media_assets").insert(inserts)
      if (error) throw error
    }

    const updates = channels.filter((c) => existingByUrl.has(c.hlsUrl))
    for (const channel of updates) {
      const id = existingByUrl.get(channel.hlsUrl)
      if (!id) continue
      const { error } = await supabase
        .from("media_assets")
        .update(buildAssetUpdateRow(channel, nowIso))
        .eq("id", id)
      if (error) throw error
    }

    revalidatePath("/admin/assets")
    revalidatePath("/admin/output")
    revalidatePath("/admin/settings")

    const merged = await mergeWithCachedAssetIds(channels)
    await recordAuditEvent({
      actor: "reuters-sync",
      action: "reuters.sync",
      entityType: "media_assets",
      metadata: { synced_count: channels.length }
    })
    const body: SyncResponse = { synced: channels.length, channels: merged }
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      )
    }
    if (error instanceof Error && error.message === "Invalid CSRF token") {
      return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    await recordAuditEvent({
      actor: "reuters-sync",
      action: "reuters.sync",
      entityType: "media_assets",
      result: "failure",
      metadata: { error: message }
    }).catch(() => undefined)
    console.error("[api/reuters/sync:POST]", error)
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}

async function mergeWithCachedAssetIds(
  channels: ReutersChannel[]
): Promise<ReutersSyncedChannel[]> {
  const supabase = createServiceClient()
  const urls = channels.map((c) => c.hlsUrl)
  if (!urls.length) return []
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, url")
    .eq("source_type", "reuters")
    .in("url", urls)
  if (error) throw error
  const byUrl = new Map<string, string>()
  for (const row of data ?? []) {
    const url = typeof row.url === "string" ? row.url : ""
    const id = typeof row.id === "string" ? row.id : String(row.id ?? "")
    if (url && id) byUrl.set(url, id)
  }
  return channels.map((c) => ({ ...c, assetId: byUrl.get(c.hlsUrl) ?? null }))
}

function buildAssetInsertRow(channel: ReutersChannel, nowIso: string) {
  return {
    title: channel.name,
    description: channel.description ?? null,
    source_type: "reuters",
    media_kind: "video",
    asset_type: "video",
    url: channel.hlsUrl,
    thumbnail_url: channel.thumbnailUrl ?? null,
    duration_seconds: null,
    status: "ready",
    lifecycle_state: "synced",
    metadata: {
      reuters_channel_id: channel.id,
      reuters_category: channel.category ?? null
    },
    updated_at: nowIso
  }
}

function buildAssetUpdateRow(channel: ReutersChannel, nowIso: string) {
  return {
    title: channel.name,
    description: channel.description ?? null,
    thumbnail_url: channel.thumbnailUrl ?? null,
    status: "ready",
    lifecycle_state: "synced",
    metadata: {
      reuters_channel_id: channel.id,
      reuters_category: channel.category ?? null
    },
    updated_at: nowIso
  }
}
