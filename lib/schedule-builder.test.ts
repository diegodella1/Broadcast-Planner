import { describe, expect, it } from "vitest"
import { buildLongTestSchedule } from "./schedule-builder"
import type { MediaAsset } from "./types"

const baseAsset = {
  description: null,
  sourceType: "remote_mp4",
  mediaKind: "video",
  thumbnailUrl: null,
  status: "ready",
  createdAt: "2026-05-05T00:00:00Z",
  updatedAt: "2026-05-05T00:00:00Z"
} satisfies Partial<MediaAsset>

describe("buildLongTestSchedule", () => {
  it("generates a contiguous 12 hour schedule", () => {
    const blocks = buildLongTestSchedule({
      mediaAssets: [
        asset("program-1", "Morning", "video", 3600),
        asset("ad-1", "Sponsor", "ad", 30),
        { ...asset("image-1", "Plate", "image", 20), mediaKind: "image", sourceType: "remote_image" }
      ],
      slideAssets: [],
      startTime: "00:00:00",
      totalHours: 12,
      programMinutes: 48,
      adBreakMinutes: 4,
      imageBumperSeconds: 30
    })

    expect(blocks[0]?.startTimeSeconds).toBe(0)
    expect(blocks.at(-1)!.startTimeSeconds + blocks.at(-1)!.durationSeconds).toBe(43200)
    blocks.slice(1).forEach((block, index) => {
      const previous = blocks[index]!
      expect(block.startTimeSeconds).toBe(previous.startTimeSeconds + previous.durationSeconds)
    })
    expect(blocks.some((block) => block.blockType === "ad")).toBe(true)
    expect(blocks.some((block) => block.blockType === "image")).toBe(true)
  })

  it("caps generated ad block durations at 300 seconds", () => {
    const blocks = buildLongTestSchedule({
      mediaAssets: [
        asset("program-1", "Program", "video", 3600),
        asset("ad-1", "Long Ad", "ad", 999)
      ],
      slideAssets: [],
      startTime: "00:00:00",
      totalHours: 2,
      programMinutes: 20,
      adBreakMinutes: 5,
      imageBumperSeconds: 0
    })

    expect(blocks.filter((block) => block.blockType === "ad").every((block) => block.durationSeconds <= 300)).toBe(true)
  })
})

function asset(id: string, title: string, assetType: string, durationSeconds: number): MediaAsset {
  return {
    ...baseAsset,
    id,
    title,
    assetType,
    url: `https://example.com/${id}.mp4`,
    durationSeconds
  } as MediaAsset
}
