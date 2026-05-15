import { describe, expect, it } from "vitest"

import { resolveUploadedMedia } from "./media-upload"

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
