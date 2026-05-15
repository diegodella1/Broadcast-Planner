import { appUrl } from "@/lib/app-url"
import { getLiveSchedule, getMediaAssetById } from "@/lib/data"
import { getVimeoToken } from "@/lib/settings"
import { findActiveSchedule } from "@/lib/scheduler"
import { secondsSinceMidnightInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"
import { getVimeoPlayback } from "@/lib/vimeo"

export type OutputHlsPayload = {
  assetId: string
  title: string
  durationSeconds: number | null
  elapsedInBlock: number | null
  startOffsetSeconds: number
  hlsUrl: string
  playlistUrl: string
}

export async function resolveOutputHls({
  requestUrl,
  assetId
}: {
  requestUrl: string
  assetId?: string | null
}): Promise<OutputHlsPayload> {
  const active = assetId ? await getRequestedAsset(assetId) : await getActiveAsset()
  if (!active.asset) throw new OutputHlsError("No active media asset", 404)
  if (active.asset.sourceType !== "vimeo" || !active.asset.vimeoId) {
    throw new OutputHlsError("Active asset is not a Vimeo video", 400)
  }

  const token = await getVimeoToken()
  if (!token) throw new OutputHlsError("Missing Vimeo token", 400)

  const playback = await getVimeoPlayback(token, active.asset.vimeoId)
  const durationSeconds = playback.durationSeconds || active.asset.durationSeconds || null
  const startOffsetSeconds = clampStartOffset(active.elapsedInBlock ?? 0, durationSeconds)
  return {
    assetId: active.asset.id,
    title: playback.title || active.asset.title,
    durationSeconds,
    elapsedInBlock: active.elapsedInBlock,
    startOffsetSeconds,
    hlsUrl: playback.hlsUrl,
    playlistUrl: outputPlaylistUrl(requestUrl).toString()
  }
}

export function renderVlcPlaylist(
  payload: Pick<OutputHlsPayload, "hlsUrl" | "startOffsetSeconds">
) {
  const startTime = Math.max(0, Math.floor(payload.startOffsetSeconds))
  return [
    "#EXTM3U",
    `#EXT-X-START:TIME-OFFSET=${startTime},PRECISE=NO`,
    `#EXTVLCOPT:start-time=${startTime}`,
    "#EXT-X-STREAM-INF:BANDWIDTH=1",
    payload.hlsUrl,
    ""
  ].join("\n")
}

export async function renderVlcHlsManifest(
  payload: Pick<OutputHlsPayload, "hlsUrl" | "startOffsetSeconds">
) {
  const upstream = await fetch(payload.hlsUrl, { cache: "no-store", redirect: "follow" })
  if (!upstream.ok) return renderVlcPlaylist(payload)
  const manifest = await upstream.text()
  const baseUrl = upstream.url || payload.hlsUrl
  const startTime = Math.max(0, Math.floor(payload.startOffsetSeconds))
  const output: string[] = []
  let insertedStart = false
  for (const line of manifest.split(/\r?\n/)) {
    output.push(rewriteManifestLine(line, baseUrl))
    if (!insertedStart && line.trim() === "#EXTM3U") {
      output.push(`#EXT-X-START:TIME-OFFSET=${startTime},PRECISE=NO`)
      output.push(`#EXTVLCOPT:start-time=${startTime}`)
      insertedStart = true
    }
  }
  if (!insertedStart) {
    output.unshift(`#EXTVLCOPT:start-time=${startTime}`)
    output.unshift(`#EXT-X-START:TIME-OFFSET=${startTime},PRECISE=NO`)
    output.unshift("#EXTM3U")
  }
  return `${output.join("\n")}\n`
}

export class OutputHlsError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function getRequestedAsset(assetId: string) {
  return {
    asset: await getMediaAssetById(assetId),
    elapsedInBlock: null
  }
}

async function getActiveAsset() {
  const now = new Date()
  const bundle = await getLiveSchedule(now)
  const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
  const active = findActiveSchedule(bundle, secondsSinceMidnightInTimezone(now, timezone))
  return {
    asset: active.asset ?? null,
    elapsedInBlock: active.block ? active.elapsedInBlock : null
  }
}

function clampStartOffset(elapsedInBlock: number, durationSeconds: number | null) {
  const elapsed = Math.max(0, Math.floor(elapsedInBlock))
  if (!durationSeconds || durationSeconds <= 1) return elapsed
  return Math.min(elapsed, Math.max(0, Math.floor(durationSeconds) - 1))
}

function outputPlaylistUrl(requestUrl: string) {
  const url = new URL(requestUrl)
  const playlist = appUrl("/api/output/hls/playlist.m3u")
  if (process.env.OUTPUT_CAPTURE_TOKEN) {
    playlist.searchParams.set("token", process.env.OUTPUT_CAPTURE_TOKEN)
  }
  if (!process.env.APP_BASE_URL && !process.env.NEXT_PUBLIC_APP_BASE_URL) {
    playlist.protocol = url.protocol
    playlist.host = url.host
  }
  return playlist
}

function rewriteManifestLine(line: string, baseUrl: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return line
  return new URL(trimmed, baseUrl).toString()
}
