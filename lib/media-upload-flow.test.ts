import { beforeEach, describe, expect, it, vi } from "vitest"

const { createMediaAssetMock, createServiceClientMock } = vi.hoisted(() => ({
  createMediaAssetMock: vi.fn(),
  createServiceClientMock: vi.fn()
}))

vi.mock("./mutations", () => ({
  createMediaAsset: createMediaAssetMock
}))

vi.mock("./supabase/server", () => ({
  createServiceClient: createServiceClientMock
}))

import { uploadMediaFile } from "./media-upload"

describe("uploadMediaFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://rtvtime.diegodella.ar")
    vi.stubEnv("NODE_ENV", "production")
    createMediaAssetMock.mockResolvedValue("asset-1")
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    })
    createServiceClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateMock }),
      storage: {
        listBuckets: vi.fn().mockResolvedValue({ data: [{ id: "small-media-assets" }] }),
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null })
        })
      }
    })
  })

  it("stores a public app proxy URL for uploaded media assets", async () => {
    const result = await uploadMediaFile(
      {
        name: "ad spot.mp4",
        type: "video/mp4",
        size: 1024,
        arrayBuffer: async () =>
          new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
            .buffer
      },
      {
        title: "Ad spot",
        assetType: "ad",
        orientation: "auto",
        detectedDurationSeconds: "30"
      }
    )

    expect(createMediaAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetType: "ad"
      })
    )
    expect(createMediaAssetMock.mock.calls[0]?.[0]).not.toHaveProperty("url")
    expect(result.url).toBe("https://rtvtime.diegodella.ar/api/media/assets/asset-1")
  })
})
