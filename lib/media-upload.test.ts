import { describe, expect, it } from "vitest"

import { publicMediaAssetUrl } from "./media-asset-url"
import { assertFileSignature, resolveUploadedMedia } from "./media-upload"

const baseFile = {
  name: "clip.mp4",
  type: "video/mp4",
  size: 1024
}

describe("resolveUploadedMedia", () => {
  it("defaults image uploads to 25 seconds", () => {
    const resolved = resolveUploadedMedia(
      { ...baseFile, name: "still.jpg", type: "image/jpeg" },
      { title: "Still", assetType: "image", orientation: "auto" }
    )

    expect(resolved.mediaKind).toBe("image")
    expect(resolved.durationSeconds).toBe(25)
    expect(resolved.metadata.duration_source).toBe("image_default")
  })

  it("uses detected video duration when manual seconds is blank or zero", () => {
    const resolved = resolveUploadedMedia(baseFile, {
      title: "Clip",
      assetType: "video",
      orientation: "auto",
      durationSeconds: "0",
      detectedDurationSeconds: "9.2",
      detectedWidth: "1920",
      detectedHeight: "1080"
    })

    expect(resolved.durationSeconds).toBe(10)
    expect(resolved.metadata.duration_source).toBe("detected")
    expect(resolved.metadata.aspect_ratio).toBe(1.7778)
  })

  it("lets manual duration override detected duration", () => {
    const resolved = resolveUploadedMedia(baseFile, {
      title: "Clip",
      assetType: "promo",
      orientation: "vertical",
      durationSeconds: "15",
      detectedDurationSeconds: "9"
    })

    expect(resolved.durationSeconds).toBe(15)
    expect(resolved.metadata.duration_source).toBe("manual")
    expect(resolved.metadata.presentation).toBe("vertical_blur")
  })

  it("requires audio or video duration", () => {
    expect(() =>
      resolveUploadedMedia(
        { ...baseFile, name: "track.mp3", type: "audio/mpeg" },
        { title: "Track", assetType: "music", orientation: "auto" }
      )
    ).toThrow("Browser could not read media duration")
  })

  it("stores sanitized music metadata when uploading tracks", () => {
    const resolved = resolveUploadedMedia(
      { ...baseFile, name: "track.mp3", type: "audio/mpeg" },
      {
        title: "Track",
        assetType: "music",
        orientation: "auto",
        detectedDurationSeconds: "184",
        metadataJson: JSON.stringify({
          music_title: "Tagged title",
          artist: "Tagged artist",
          album: "Tagged album",
          ignored: "not stored"
        })
      }
    )

    expect(resolved.durationSeconds).toBe(184)
    expect(resolved.metadata.music).toEqual({
      music_title: "Tagged title",
      artist: "Tagged artist",
      album: "Tagged album"
    })
  })

  it("limits uploaded short videos to 5 minutes", () => {
    expect(() =>
      resolveUploadedMedia(baseFile, {
        title: "Long local clip",
        assetType: "video",
        orientation: "auto",
        detectedDurationSeconds: "301"
      })
    ).toThrow("Uploaded videos cannot be longer than 5 minutes")
  })
})

describe("assertFileSignature", () => {
  it("accepts an MP4 file signature", () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d
    ])

    expect(() => assertFileSignature(baseFile, bytes)).not.toThrow()
  })

  it("rejects files whose bytes do not match their declared MIME type", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38])

    expect(() => assertFileSignature(baseFile, bytes)).toThrow(
      "File content does not match its MIME type"
    )
  })
})

describe("publicMediaAssetUrl", () => {
  it("builds public app proxy URLs without using localhost", () => {
    const url = publicMediaAssetUrl("asset-1", {
      NEXT_PUBLIC_APP_BASE_URL: "https://rtvtime.diegodella.ar",
      NODE_ENV: "production"
    })

    expect(url).toBe("https://rtvtime.diegodella.ar/api/media/assets/asset-1")
  })

  it("prefers an explicit app base URL", () => {
    const url = publicMediaAssetUrl("asset-1", {
      APP_BASE_URL: "https://broadcast.example.com",
      NEXT_PUBLIC_APP_BASE_URL: "https://rtvtime.diegodella.ar",
      NODE_ENV: "production"
    })

    expect(url).toBe("https://broadcast.example.com/api/media/assets/asset-1")
  })

  it("rejects local app URLs in production", () => {
    expect(() =>
      publicMediaAssetUrl("asset-1", {
        NEXT_PUBLIC_APP_BASE_URL: "http://127.0.0.1:3450",
        NODE_ENV: "production"
      })
    ).toThrow("public HTTPS app URL")
  })
})
