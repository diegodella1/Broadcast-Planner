import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET as getHlsJson } from "./route"
import { GET as getHlsPlaylist } from "./playlist.m3u/route"

import { requireAdmin } from "@/lib/auth"
import { getLiveSchedule, getMediaAssetById } from "@/lib/data"
import { isOutputRequestAllowed } from "@/lib/output-auth"
import { getVimeoToken } from "@/lib/settings"
import { getVimeoPlayback } from "@/lib/vimeo"

import type { MediaAsset, ScheduleBundle } from "@/lib/types"

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn()
}))

vi.mock("@/lib/data", () => ({
  getLiveSchedule: vi.fn(),
  getMediaAssetById: vi.fn()
}))

vi.mock("@/lib/output-auth", () => ({
  isOutputRequestAllowed: vi.fn(),
  outputAccessDeniedReason: vi.fn(() => "Output capture token required")
}))

vi.mock("@/lib/settings", () => ({
  getVimeoToken: vi.fn()
}))

vi.mock("@/lib/vimeo", () => ({
  getVimeoPlayback: vi.fn()
}))

const originalEnv = { ...process.env }

describe("GET /api/output/hls", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-15T14:30:00Z"))
    vi.resetAllMocks()
    process.env = { ...originalEnv }
    process.env.APP_BASE_URL = "https://rtvtime.example"
    process.env.OUTPUT_CAPTURE_TOKEN = "output-token"
    vi.mocked(requireAdmin).mockResolvedValue(undefined)
    vi.mocked(isOutputRequestAllowed).mockResolvedValue(true)
    vi.mocked(getLiveSchedule).mockResolvedValue(liveSchedule(videoAsset))
    vi.mocked(getVimeoToken).mockResolvedValue("vimeo-token")
    vi.mocked(getVimeoPlayback).mockResolvedValue({
      hlsUrl: "https://player.vimeo.test/live.m3u8",
      title: "Roxom Report",
      durationSeconds: 3600
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns a VLC playlist URL with the current block offset", async () => {
    const response = await getHlsJson(new Request("https://rtvtime.example/api/output/hls"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.startOffsetSeconds).toBe(1800)
    expect(payload.elapsedInBlock).toBe(1800)
    expect(payload.playlistUrl).toBe(
      "https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token"
    )
  })

  it("renders a VLC playlist that starts at the current elapsed time", async () => {
    const response = await getHlsPlaylist(
      new Request("https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token")
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("audio/x-mpegurl")
    expect(body).toContain("#EXTVLCOPT:start-time=1800")
    expect(body).toContain("https://player.vimeo.test/live.m3u8")
  })

  it("clamps the VLC start time near the end of the video", async () => {
    vi.mocked(getVimeoPlayback).mockResolvedValue({
      hlsUrl: "https://player.vimeo.test/live.m3u8",
      title: "Short",
      durationSeconds: 1200
    })

    const response = await getHlsPlaylist(
      new Request("https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token")
    )
    const body = await response.text()

    expect(body).toContain("#EXTVLCOPT:start-time=1199")
  })

  it("returns 404 when no Vimeo asset is active", async () => {
    vi.mocked(getLiveSchedule).mockResolvedValue(liveSchedule(null))

    const response = await getHlsPlaylist(
      new Request("https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token")
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toBe("No active media asset")
  })

  it("returns 400 when the active asset is not Vimeo", async () => {
    vi.mocked(getLiveSchedule).mockResolvedValue(
      liveSchedule({ ...videoAsset, sourceType: "hls", vimeoId: null })
    )

    const response = await getHlsPlaylist(
      new Request("https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token")
    )

    expect(response.status).toBe(400)
  })

  it("returns 400 when Vimeo token is missing", async () => {
    vi.mocked(getVimeoToken).mockResolvedValue(null)

    const response = await getHlsPlaylist(
      new Request("https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token")
    )

    expect(response.status).toBe(400)
  })

  it("supports the existing assetId JSON lookup with zero offset", async () => {
    vi.mocked(getMediaAssetById).mockResolvedValue(videoAsset)

    const response = await getHlsJson(
      new Request("https://rtvtime.example/api/output/hls?assetId=asset-vimeo")
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.assetId).toBe("asset-vimeo")
    expect(payload.startOffsetSeconds).toBe(0)
  })
})

function liveSchedule(asset: MediaAsset | null): ScheduleBundle {
  return {
    day: {
      id: "day-1",
      airDate: "2026-05-15",
      timezone: "America/Los_Angeles",
      status: "active",
      title: "Programming",
      notes: null,
      fallbackAssetId: null,
      createdAt: "",
      updatedAt: ""
    },
    blocks: [
      {
        id: "block-1",
        programDayId: "day-1",
        title: "Roxom Report",
        blockType: "video",
        category: "broadcast",
        assetId: asset?.id ?? null,
        slideId: null,
        startTime: "07:00:00",
        startTimeSeconds: 25200,
        durationSeconds: 3600,
        status: "ready",
        hideOverlays: false,
        fallbackAssetId: null,
        notes: null,
        createdAt: "",
        updatedAt: ""
      }
    ],
    layers: [],
    mediaAssets: asset ? [asset] : [],
    slideAssets: []
  }
}

const videoAsset: MediaAsset = {
  id: "asset-vimeo",
  title: "Roxom Report",
  sourceType: "vimeo",
  mediaKind: "video",
  assetType: "video",
  url: null,
  storageBucket: null,
  storagePath: null,
  thumbnailUrl: null,
  durationSeconds: 3600,
  status: "ready",
  lifecycleState: "reviewed",
  vimeoId: "12345",
  vimeoUri: "/videos/12345",
  vimeoPrivacy: null,
  vimeoEmbedStatus: null,
  playbackReadinessStatus: "ready",
  playbackCheckedAt: null,
  playbackError: null,
  metadata: null,
  createdAt: "",
  updatedAt: ""
}
