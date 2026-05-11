import { describe, expect, it } from "vitest"

import { mockSchedule } from "./mock-data"
import { analyzeSchedule, getAssetReadiness } from "./schedule-health"

import type { MediaAsset, ProgramBlock, ScheduledLayer } from "./types"

const firstBlock = mockSchedule.blocks[0] as ProgramBlock
const secondBlock = mockSchedule.blocks[1] as ProgramBlock
const firstLayer = mockSchedule.layers[0] as ScheduledLayer
const firstAsset = mockSchedule.mediaAssets[0] as MediaAsset

describe("schedule health", () => {
  it("detects block overlaps as critical", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [firstBlock, { ...secondBlock, startTimeSeconds: 30, startTime: "00:00:30" }]
    }
    const health = analyzeSchedule(schedule)
    expect(health.overlaps).toHaveLength(1)
    expect(health.criticalCount).toBeGreaterThan(0)
  })

  it("detects missing block assets", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [{ ...firstBlock, assetId: "missing-asset" }]
    }
    const health = analyzeSchedule(schedule)
    expect(health.missingAssets[0]?.kind).toBe("missing_asset")
  })

  it("detects layers that exceed block duration", () => {
    const schedule = {
      ...mockSchedule,
      blocks: [{ ...firstBlock, durationSeconds: 100 }],
      layers: [{ ...firstLayer, startTimeSeconds: 90, durationSeconds: 30 }]
    }
    const health = analyzeSchedule(schedule)
    expect(health.layerIssues.some((issue) => issue.kind === "layer_timing")).toBe(true)
  })

  it("flags unsupported video assets as not ready", () => {
    const asset: MediaAsset = {
      ...firstAsset,
      sourceType: "remote_image",
      mediaKind: "video",
      vimeoId: null
    }
    const readiness = getAssetReadiness(asset)
    expect(readiness.ready).toBe(false)
    expect(readiness.severity).toBe("critical")
  })

  it("flags failed Vimeo playback readiness as critical", () => {
    const asset: MediaAsset = {
      ...firstAsset,
      sourceType: "vimeo",
      mediaKind: "video",
      vimeoId: "123",
      playbackReadinessStatus: "failed",
      playbackError: "Vimeo playback URL unavailable"
    }
    const readiness = getAssetReadiness(asset)
    expect(readiness.ready).toBe(false)
    expect(readiness.severity).toBe("critical")
    expect(readiness.messages).toContain("Vimeo playback URL unavailable")
  })
})
