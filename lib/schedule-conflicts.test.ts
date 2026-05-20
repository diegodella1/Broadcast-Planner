import { describe, expect, it } from "vitest"

import { findNearestSafeStart, findScheduleConflicts } from "./schedule-conflicts"

import type { ProgramBlock } from "./types"

const blocks: ProgramBlock[] = [block("a", 0, 1800), block("b", 3600, 1800), block("c", 7200, 1800)]

describe("schedule conflict helpers", () => {
  it("detects overlapping blocks and suggests the nearest safe start", () => {
    const result = findScheduleConflicts(blocks, {
      programDayId: "day-1",
      startTimeSeconds: 900,
      durationSeconds: 1800
    })

    expect(result.hasConflict).toBe(true)
    expect(result.conflicts.map((conflict) => conflict.blockId)).toEqual(["a"])
    expect(result.suggestedStartSeconds).toBe(1800)
  })

  it("returns no conflict for an exact gap", () => {
    const result = findScheduleConflicts(blocks, {
      programDayId: "day-1",
      startTimeSeconds: 1800,
      durationSeconds: 1800
    })

    expect(result.hasConflict).toBe(false)
    expect(result.suggestedStartSeconds).toBeNull()
    expect(result.maxSafeDurationSeconds).toBe(1800)
  })

  it("ignores archived blocks when detecting conflicts", () => {
    const result = findScheduleConflicts([block("archived", 900, 1800, "archived")], {
      programDayId: "day-1",
      startTimeSeconds: 900,
      durationSeconds: 57
    })

    expect(result.hasConflict).toBe(false)
    expect(result.maxSafeDurationSeconds).toBe(85500)
  })

  it("finds the nearest safe slot when preferred start is occupied", () => {
    expect(findNearestSafeStart(blocks, "day-1", 1200, 3500)).toBe(1800)
  })

  it("returns same-day gap options for conflict resolution", () => {
    const result = findScheduleConflicts(blocks, {
      programDayId: "day-1",
      startTimeSeconds: 900,
      durationSeconds: 1800
    })

    expect(result.gapOptions.slice(0, 3)).toEqual([
      { startTimeSeconds: 1800, durationSeconds: 1800 },
      { startTimeSeconds: 5400, durationSeconds: 1800 },
      { startTimeSeconds: 9000, durationSeconds: 77400 }
    ])
  })
})

function block(
  id: string,
  startTimeSeconds: number,
  durationSeconds: number,
  status: ProgramBlock["status"] = "ready"
): ProgramBlock {
  return {
    id,
    programDayId: "day-1",
    title: `Block ${id}`,
    blockType: "video",
    category: "broadcast",
    assetId: null,
    slideId: null,
    startTime: "00:00:00",
    startTimeSeconds,
    durationSeconds,
    status,
    hideOverlays: false,
    fallbackAssetId: null,
    notes: null,
    createdAt: "",
    updatedAt: ""
  }
}
