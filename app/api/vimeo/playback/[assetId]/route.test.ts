import { describe, expect, it, vi, beforeEach } from "vitest"

import { getMediaAssetById } from "@/lib/data"
import { getVimeoToken } from "@/lib/settings"
import { getVimeoPlayback } from "@/lib/vimeo"

import { GET } from "./route"

import type { MediaAsset } from "@/lib/types"

vi.mock("@/lib/data", () => ({
  getMediaAssetById: vi.fn()
}))

vi.mock("@/lib/settings", () => ({
  getVimeoToken: vi.fn()
}))

vi.mock("@/lib/vimeo", () => ({
  getVimeoPlayback: vi.fn()
}))

const vimeoAsset: MediaAsset = {
  id: "asset-1",
  title: "Vimeo Asset",
  sourceType: "vimeo",
  mediaKind: "video",
  assetType: "video",
  status: "ready",
  vimeoId: "123456789",
  durationSeconds: 120,
  createdAt: "2026-05-08T00:00:00Z",
  updatedAt: "2026-05-08T00:00:00Z"
}

describe("GET /api/vimeo/playback/[assetId]", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("returns a Vimeo HLS playback URL without exposing the token", async () => {
    vi.mocked(getMediaAssetById).mockResolvedValue(vimeoAsset)
    vi.mocked(getVimeoToken).mockResolvedValue("secret-token")
    vi.mocked(getVimeoPlayback).mockResolvedValue({
      hlsUrl: "https://vimeo.example/playlist.m3u8",
      title: "Playback Title",
      durationSeconds: 121
    })

    const response = await GET(new Request("http://local"), {
      params: Promise.resolve({ assetId: "asset-1" })
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      hlsUrl: "https://vimeo.example/playlist.m3u8",
      expiresAt: null,
      title: "Playback Title",
      durationSeconds: 121
    })
    expect(JSON.stringify(payload)).not.toContain("secret-token")
    expect(getVimeoPlayback).toHaveBeenCalledWith("secret-token", "123456789")
  })

  it("returns 404 for missing assets", async () => {
    vi.mocked(getMediaAssetById).mockResolvedValue(null)

    const response = await GET(new Request("http://local"), {
      params: Promise.resolve({ assetId: "missing" })
    })

    expect(response.status).toBe(404)
  })

  it("returns 400 for non-Vimeo assets", async () => {
    vi.mocked(getMediaAssetById).mockResolvedValue({
      ...vimeoAsset,
      sourceType: "remote_mp4",
      vimeoId: null
    })

    const response = await GET(new Request("http://local"), {
      params: Promise.resolve({ assetId: "asset-1" })
    })

    expect(response.status).toBe(400)
  })

  it("returns 400 when the Vimeo token is missing", async () => {
    vi.mocked(getMediaAssetById).mockResolvedValue(vimeoAsset)
    vi.mocked(getVimeoToken).mockResolvedValue(null)

    const response = await GET(new Request("http://local"), {
      params: Promise.resolve({ assetId: "asset-1" })
    })

    expect(response.status).toBe(400)
  })

  it("returns 502 when Vimeo playback lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(getMediaAssetById).mockResolvedValue(vimeoAsset)
    vi.mocked(getVimeoToken).mockResolvedValue("secret-token")
    vi.mocked(getVimeoPlayback).mockRejectedValue(new Error("Vimeo playback URL unavailable"))

    const response = await GET(new Request("http://local"), {
      params: Promise.resolve({ assetId: "asset-1" })
    })

    expect(response.status).toBe(502)
  })
})
