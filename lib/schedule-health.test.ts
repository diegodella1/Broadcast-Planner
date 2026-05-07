import { describe, expect, it } from "vitest"
import { mockSchedule } from "./mock-data"
import { analyzeSchedule, getAssetReadiness } from "./schedule-health"
import type { MediaAsset } from "./types"

describe("schedule health", () => {
  it("detects block overlaps as critical", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [
        mockSchedule.blocks[0],
        { ...mockSchedule.blocks[1], startTimeSeconds: 30, startTime: "00:00:30" }
      ]
    }
    const health = analyzeSchedule(schedule)
    expect(health.overlaps).toHaveLength(1)
    expect(health.criticalCount).toBeGreaterThan(0)
  })

  it("detects missing block assets", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [{ ...mockSchedule.blocks[0], assetId: "missing-asset" }]
    }
    const health = analyzeSchedule(schedule)
    expect(health.missingAssets[0].kind).toBe("missing_asset")
  })

  it("detects layers that exceed block duration", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [{ ...mockSchedule.blocks[0], durationSeconds: 100 }],
      layers: [{ ...mockSchedule.layers[0], startTimeSeconds: 90, durationSeconds: 30 }]
    }
    const health = analyzeSchedule(schedule)
    expect(health.layerIssues.some((issue) => issue.kind === "layer_timing")).toBe(true)
  })

  it("flags unsupported video assets as not ready", () => {
    const asset: MediaAsset = {
      ...mockSchedule.mediaAssets[0],
      sourceType: "remote_image",
      mediaKind: "video",
      vimeoId: null
    }
    const readiness = getAssetReadiness(asset)
    expect(readiness.ready).toBe(false)
    expect(readiness.severity).toBe("critical")
  })
})
