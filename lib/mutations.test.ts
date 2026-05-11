import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock next/cache before any module import that uses it
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}))

// ---------------------------------------------------------------------------
// Supabase builder mock
// Every method returns `this` so callers can chain arbitrarily.
// Terminal operations (.single / awaiting the builder) resolve with
// whatever `_result` was last set by the test via `setResult`.
// ---------------------------------------------------------------------------
type MockResult = { data: unknown; error: unknown }

function makeSupabaseMock() {
  let _result: MockResult = { data: null, error: null }

  const builder: Record<string, unknown> & {
    setResult: (r: MockResult) => void
    _result: MockResult
  } = {
    setResult(r: MockResult) {
      _result = r
    },
    get _result() {
      return _result
    },
    // All builder methods return `this` and are also awaitable (then/catch/finally)
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(function () {
      return Promise.resolve(_result)
    }),
    // Make the builder itself thenable so `await supabase.from(...).insert(...)` works
    then: vi.fn().mockImplementation(function (resolve: (value: MockResult) => void) {
      return Promise.resolve(_result).then(resolve)
    })
  }

  return builder
}

const supabaseMock = makeSupabaseMock()

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => supabaseMock)
}))

// ---------------------------------------------------------------------------
// Mock lib/data (getScheduleForDate)
// ---------------------------------------------------------------------------

const mockSchedule: ScheduleBundle = {
  day: {
    id: "day-1",
    airDate: "2026-05-08",
    timezone: "UTC",
    status: "draft",
    title: null,
    createdAt: "",
    updatedAt: ""
  },
  blocks: [],
  layers: [],
  mediaAssets: [],
  slideAssets: []
}

vi.mock("@/lib/data", () => ({
  getScheduleForDate: vi.fn(() => Promise.resolve(mockSchedule))
}))

// ---------------------------------------------------------------------------
// Mock lib/schedule-builder
// ---------------------------------------------------------------------------

const fakeGeneratedBlocks: GeneratedBlock[] = [
  {
    title: "Programa: Test",
    blockType: "video",
    assetId: "asset-1",
    slideId: null,
    startTime: "10:00:00",
    startTimeSeconds: 36000,
    durationSeconds: 1800
  },
  {
    title: "Ad: Banner",
    blockType: "ad",
    assetId: "asset-2",
    slideId: null,
    startTime: "10:30:00",
    startTimeSeconds: 37800,
    durationSeconds: 30
  }
]

vi.mock("@/lib/schedule-builder", () => ({
  buildLongTestSchedule: vi.fn(() => fakeGeneratedBlocks)
}))

// ---------------------------------------------------------------------------
// Mock lib/schedule-health (analyzeSchedule)
// vi.hoisted ensures the fn is available when vi.mock factory is hoisted
// ---------------------------------------------------------------------------
import type { ScheduleHealth } from "./schedule-health"

const { analyzeScheduleMock } = vi.hoisted(() => ({
  analyzeScheduleMock: vi.fn()
}))

vi.mock("@/lib/schedule-health", () => ({
  analyzeSchedule: analyzeScheduleMock
}))

const healthClean: ScheduleHealth = {
  gaps: [],
  overlaps: [],
  missingAssets: [],
  unreadyAssets: [],
  unsupportedAssets: [],
  fallbackIssues: [],
  layerIssues: [],
  issues: [],
  criticalCount: 0,
  warnCount: 0
}

// ---------------------------------------------------------------------------
// Now import the module under test + mocked peer modules (static, for reset)
// ---------------------------------------------------------------------------
import { revalidatePath } from "next/cache"

import { getScheduleForDate } from "@/lib/data"
import { buildLongTestSchedule } from "@/lib/schedule-builder"

import {
  ensureProgramDay,
  createProgramBlock,
  updateProgramDayStatus,
  updateProgramBlock,
  createLongTestSchedule,
  reorderProgramBlocks,
  resizeProgramBlock,
  duplicateProgramBlock,
  bulkUpdateProgramBlockStatus,
  updateRunbookCheck,
  createSlideAsset,
  createScheduledLayer,
  setScheduledLayerEnabled,
  createLowerThirdLayer,
  createMediaAsset,
  updateMediaAsset
} from "./mutations"

import type { GeneratedBlock } from "./schedule-builder"
import type { ProgramBlock, ScheduleBundle } from "./types"

// Typed references to the mocked functions for easy use in tests
const getScheduleForDateMock = vi.mocked(getScheduleForDate)
const buildLongTestScheduleMock = vi.mocked(buildLongTestSchedule)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetMocks() {
  vi.clearAllMocks()
  supabaseMock.setResult({ data: null, error: null })
  // Re-wire the builder chainable methods after clearAllMocks
  ;(supabaseMock.from as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.select as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.insert as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.update as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.upsert as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.delete as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.eq as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.gte as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.lt as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.in as ReturnType<typeof vi.fn>).mockReturnThis()
  ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve(supabaseMock._result)
  )
  ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
    (resolve: (value: MockResult) => void) => Promise.resolve(supabaseMock._result).then(resolve)
  )
  // Re-wire module mocks
  getScheduleForDateMock.mockResolvedValue(mockSchedule)
  analyzeScheduleMock.mockReturnValue(healthClean)
  buildLongTestScheduleMock.mockReturnValue(fakeGeneratedBlocks)
}

// ---------------------------------------------------------------------------
// ensureProgramDay
// ---------------------------------------------------------------------------
describe("ensureProgramDay", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: upserts program_days and returns the id", async () => {
    supabaseMock.setResult({ data: { id: "day-99" }, error: null })

    const result = await ensureProgramDay("2026-05-08")

    expect(result).toBe("day-99")
    expect(supabaseMock.from).toHaveBeenCalledWith("program_days")
    expect(supabaseMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ air_date: "2026-05-08", status: "draft" }),
      { onConflict: "air_date" }
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
  })

  it("error path: throws when supabase returns an error", async () => {
    supabaseMock.setResult({ data: null, error: new Error("DB down") })

    await expect(ensureProgramDay("2026-05-08")).rejects.toThrow("DB down")
  })
})

describe("rundown editor mutations", () => {
  beforeEach(async () => {
    await resetMocks()
    getScheduleForDateMock.mockResolvedValue({
      ...mockSchedule,
      blocks: [
        testBlock({ id: "block-1", title: "A", startTimeSeconds: 3600, durationSeconds: 900 }),
        testBlock({ id: "block-2", title: "B", startTimeSeconds: 4500, durationSeconds: 600 }),
        testBlock({ id: "block-3", title: "C", startTimeSeconds: 5100, durationSeconds: 300 })
      ]
    })
  })

  it("reorders blocks by moving them through temporary positions first", async () => {
    await reorderProgramBlocks({
      date: "2026-05-08",
      orderedBlockIds: ["block-2", "block-1", "block-3"]
    })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ start_time_seconds: 200000 })
    )
    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ start_time: "01:00:00", start_time_seconds: 3600 })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
  })

  it("resizes a block in 5 minute increments", async () => {
    await resizeProgramBlock({
      date: "2026-05-08",
      blockId: "block-3",
      durationSeconds: 430
    })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 300 })
    )
  })

  it("duplicates a block and shifts following blocks", async () => {
    await duplicateProgramBlock({ date: "2026-05-08", blockId: "block-1" })

    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "A copy",
        start_time: "01:15:00",
        duration_seconds: 900,
        status: "draft"
      })
    )
    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ start_time_seconds: 5400 })
    )
  })

  it("bulk updates selected block status", async () => {
    await bulkUpdateProgramBlockStatus({
      date: "2026-05-08",
      blockIds: ["block-1", "block-3"],
      status: "archived"
    })

    expect(supabaseMock.in).toHaveBeenCalledWith("id", ["block-1", "block-3"])
    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    )
  })
})

describe("operator runbook mutations", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("upserts a persisted per-day runbook check", async () => {
    await updateRunbookCheck({
      date: "2026-05-08",
      programDayId: "day-1",
      section: "preflight",
      itemKey: "health-green",
      checked: true,
      notes: "OK"
    })

    expect(supabaseMock.from).toHaveBeenCalledWith("operator_runbook_checks")
    expect(supabaseMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        program_day_id: "day-1",
        section: "preflight",
        item_key: "health-green",
        checked: true,
        notes: "OK"
      }),
      { onConflict: "program_day_id,section,item_key" }
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/runbook/2026-05-08")
  })
})

function testBlock(input: Partial<ProgramBlock>): ProgramBlock {
  return {
    id: input.id ?? "block",
    programDayId: input.programDayId ?? "day-1",
    title: input.title ?? "Block",
    blockType: input.blockType ?? "video",
    category: input.category ?? "broadcast",
    assetId: input.assetId ?? null,
    slideId: input.slideId ?? null,
    startTime: input.startTime ?? formatSeconds(input.startTimeSeconds ?? 0),
    startTimeSeconds: input.startTimeSeconds ?? 0,
    durationSeconds: input.durationSeconds ?? 300,
    status: input.status ?? "ready",
    hideOverlays: input.hideOverlays ?? false,
    fallbackAssetId: input.fallbackAssetId ?? null,
    notes: input.notes ?? null,
    createdAt: "",
    updatedAt: ""
  }
}

function formatSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":")
}

// ---------------------------------------------------------------------------
// createProgramBlock
// ---------------------------------------------------------------------------
describe("createProgramBlock", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: inserts a block for a non-conflicting time slot", async () => {
    // ensureProgramDay needs to succeed first
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })

    await createProgramBlock({
      date: "2026-05-08",
      title: "Mercados en Vivo",
      blockType: "video",
      category: "mercados",
      startTime: "10:00:00",
      durationSeconds: 1800,
      hideOverlays: false
    })

    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mercados en Vivo",
        block_type: "video",
        category: "mercados",
        start_time: "10:00:00",
        duration_seconds: 1800
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
  })

  it("error path: throws when a conflicting block exists", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })
    // Existing block occupying 10:00 - 10:30
    getScheduleForDateMock.mockResolvedValue({
      ...mockSchedule,
      day: mockSchedule.day,
      blocks: [
        {
          id: "block-existing",
          programDayId: "day-1",
          title: "Existing",
          blockType: "video",
          category: "mercados",
          startTime: "10:00:00",
          startTimeSeconds: 36000,
          durationSeconds: 1800,
          status: "ready",
          hideOverlays: false,
          createdAt: "",
          updatedAt: ""
        }
      ]
    })

    await expect(
      createProgramBlock({
        date: "2026-05-08",
        title: "Overlap Block",
        blockType: "video",
        startTime: "10:15:00",
        durationSeconds: 600,
        hideOverlays: false
      })
    ).rejects.toThrow("solapa")
  })

  it("archives conflicting blocks when replacement is explicit", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })
    getScheduleForDateMock.mockResolvedValue({
      ...mockSchedule,
      day: mockSchedule.day,
      blocks: [
        {
          id: "block-existing",
          programDayId: "day-1",
          title: "Existing",
          blockType: "video",
          category: "mercados",
          startTime: "10:00:00",
          startTimeSeconds: 36000,
          durationSeconds: 1800,
          status: "ready",
          hideOverlays: false,
          createdAt: "",
          updatedAt: ""
        }
      ]
    })

    await createProgramBlock({
      date: "2026-05-08",
      title: "Replacement",
      blockType: "video",
      startTime: "10:15:00",
      durationSeconds: 600,
      hideOverlays: false,
      conflictResolution: "archive_conflicts"
    })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    )
    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Replacement" })
    )
  })

  it("error path: throws when supabase insert fails", async () => {
    // ensureProgramDay resolves via .single(); the program_blocks insert is
    // awaited directly on the builder (via .then) — so make single succeed
    // and then always return an error.
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "day-1" },
      error: null
    })
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Insert failed") }).then(resolve)
    )

    await expect(
      createProgramBlock({
        date: "2026-05-08",
        title: "Block",
        blockType: "video",
        startTime: "11:00:00",
        durationSeconds: 600,
        hideOverlays: false
      })
    ).rejects.toThrow("Insert failed")
  })

  it("validation: throws for ad blocks longer than 300s", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })

    await expect(
      createProgramBlock({
        date: "2026-05-08",
        title: "Long Ad",
        blockType: "ad",
        startTime: "12:00:00",
        durationSeconds: 400,
        hideOverlays: false
      })
    ).rejects.toThrow("300 seconds")
  })
})

// ---------------------------------------------------------------------------
// updateProgramDayStatus
// ---------------------------------------------------------------------------
describe("updateProgramDayStatus", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: updates status to ready when schedule is healthy", async () => {
    await updateProgramDayStatus({ date: "2026-05-08", status: "ready" })

    expect(analyzeScheduleMock).toHaveBeenCalledWith(mockSchedule)
    expect(supabaseMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" }))
    expect(revalidatePath).toHaveBeenCalledWith("/admin/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
  })

  it("happy path: allows archiving without health check blocking", async () => {
    analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 2, warnCount: 5 })

    await updateProgramDayStatus({ date: "2026-05-08", status: "archived" })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    )
  })

  it("error path: throws for invalid status", async () => {
    await expect(
      updateProgramDayStatus({ date: "2026-05-08", status: "invalid-status" })
    ).rejects.toThrow("Estado invalido")
  })

  it("error path: throws when schedule has critical issues and status is ready", async () => {
    analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 1, warnCount: 0 })

    await expect(updateProgramDayStatus({ date: "2026-05-08", status: "ready" })).rejects.toThrow(
      "criticas"
    )
  })

  it("error path: throws on warnings without allowWarnings flag", async () => {
    analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 0, warnCount: 2 })

    await expect(updateProgramDayStatus({ date: "2026-05-08", status: "ready" })).rejects.toThrow(
      "advertencias"
    )
  })

  it("happy path: allows ready when warnings present and allowWarnings=true", async () => {
    analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 0, warnCount: 3 })

    await updateProgramDayStatus({ date: "2026-05-08", status: "ready", allowWarnings: true })

    expect(supabaseMock.update).toHaveBeenCalled()
  })

  it("error path: throws when day not found in schedule", async () => {
    getScheduleForDateMock.mockResolvedValue({ ...mockSchedule, day: null })

    await expect(updateProgramDayStatus({ date: "2026-05-08", status: "draft" })).rejects.toThrow(
      "Dia no encontrado"
    )
  })

  it("error path: throws when supabase update fails", async () => {
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Update error") }).then(resolve)
    )

    await expect(updateProgramDayStatus({ date: "2026-05-08", status: "draft" })).rejects.toThrow(
      "Update error"
    )
  })
})

// ---------------------------------------------------------------------------
// updateProgramBlock
// ---------------------------------------------------------------------------
describe("updateProgramBlock", () => {
  const baseInput = {
    date: "2026-05-08",
    blockId: "block-1",
    title: "Updated Block",
    blockType: "video" as const,
    category: "mercados" as const,
    startTime: "10:00:00",
    durationSeconds: 1800,
    status: "ready",
    hideOverlays: false
  }

  beforeEach(async () => {
    await resetMocks()
    getScheduleForDateMock.mockResolvedValue({
      ...mockSchedule,
      blocks: [
        {
          id: "block-1",
          programDayId: "day-1",
          title: "Original",
          blockType: "video",
          category: "mercados",
          startTime: "10:00:00",
          startTimeSeconds: 36000,
          durationSeconds: 1800,
          status: "ready",
          hideOverlays: false,
          createdAt: "",
          updatedAt: ""
        }
      ]
    })
  })

  it("happy path: updates block fields", async () => {
    await updateProgramBlock(baseInput)

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated Block",
        block_type: "video",
        start_time: "10:00:00",
        duration_seconds: 1800
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08/blocks/block-1")
  })

  it("includes category in payload when provided", async () => {
    await updateProgramBlock({ ...baseInput, category: "broadcast" })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ category: "broadcast" })
    )
  })

  it("error path: throws for invalid block type", async () => {
    await expect(
      updateProgramBlock({ ...baseInput, blockType: "unknown" as "video" })
    ).rejects.toThrow("Tipo de bloque invalido")
  })

  it("error path: throws for invalid status", async () => {
    await expect(updateProgramBlock({ ...baseInput, status: "invalid" })).rejects.toThrow(
      "Estado invalido"
    )
  })

  it("error path: throws when block not found", async () => {
    await expect(updateProgramBlock({ ...baseInput, blockId: "nonexistent" })).rejects.toThrow(
      "Bloque no encontrado"
    )
  })

  it("error path: throws for ad > 300s", async () => {
    await expect(
      updateProgramBlock({ ...baseInput, blockType: "ad", durationSeconds: 400 })
    ).rejects.toThrow("300 seconds")
  })

  it("error path: throws when supabase update fails", async () => {
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Update block error") }).then(resolve)
    )

    await expect(updateProgramBlock(baseInput)).rejects.toThrow("Update block error")
  })
})

// ---------------------------------------------------------------------------
// createLongTestSchedule
// ---------------------------------------------------------------------------
describe("createLongTestSchedule", () => {
  const baseInput = {
    date: "2026-05-08",
    startTime: "10:00:00",
    totalHours: 1,
    programMinutes: 30,
    adBreakMinutes: 5,
    imageBumperSeconds: 10,
    replaceWindow: false
  }

  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: inserts generated blocks with category broadcast", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })

    await createLongTestSchedule(baseInput)

    const insertCall = (supabaseMock.insert as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0][0]?.category === "broadcast"
    )
    expect(insertCall).toBeDefined()
    const inserted = insertCall![0] as Array<{ category: string; program_day_id: string }>
    expect(inserted.length).toBe(fakeGeneratedBlocks.length)
    inserted.forEach((row) => expect(row.category).toBe("broadcast"))
  })

  it("happy path: calls revalidatePath for schedule and calendar", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })

    await createLongTestSchedule(baseInput)

    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/calendar")
  })

  it("happy path: deletes window blocks when replaceWindow=true", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })

    await createLongTestSchedule({ ...baseInput, replaceWindow: true })

    expect(supabaseMock.delete).toHaveBeenCalled()
    expect(supabaseMock.gte).toHaveBeenCalledWith(
      "start_time_seconds",
      fakeGeneratedBlocks[0]!.startTimeSeconds
    )
  })

  it("error path: throws when buildLongTestSchedule returns empty array", async () => {
    supabaseMock.setResult({ data: { id: "day-1" }, error: null })
    buildLongTestScheduleMock.mockReturnValue([])

    await expect(createLongTestSchedule(baseInput)).rejects.toThrow("No se pudo generar")
  })

  it("error path: throws when supabase insert fails", async () => {
    // ensureProgramDay resolves via .single(); the bulk insert is awaited
    // directly on the builder (via .then) — make single succeed, then fail.
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: "day-1" },
      error: null
    })
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Bulk insert failed") }).then(resolve)
    )

    await expect(createLongTestSchedule(baseInput)).rejects.toThrow("Bulk insert failed")
  })
})

// ---------------------------------------------------------------------------
// createSlideAsset
// ---------------------------------------------------------------------------
describe("createSlideAsset", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: inserts slide_assets and revalidates /admin/slides", async () => {
    await createSlideAsset({
      title: "Breaking News",
      slideType: "html",
      htmlContent: "<p>test</p>",
      defaultDurationSeconds: 15,
      status: "ready"
    })

    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Breaking News",
        slide_type: "html",
        html_content: "<p>test</p>",
        default_duration_seconds: 15
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/slides")
  })

  it("error path: throws when supabase insert fails", async () => {
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Slide insert failed") }).then(resolve)
    )

    await expect(createSlideAsset({ title: "Bad Slide", slideType: "html" })).rejects.toThrow(
      "Slide insert failed"
    )
  })
})

// ---------------------------------------------------------------------------
// createScheduledLayer
// ---------------------------------------------------------------------------
describe("createScheduledLayer", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: inserts scheduled_layers with correct payload", async () => {
    await createScheduledLayer({
      date: "2026-05-08",
      blockId: "block-1",
      title: "Logo",
      layerType: "logo_bug",
      startTime: "10:05:00",
      durationSeconds: 1740,
      zIndex: 10,
      position: "top_right"
    })

    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        program_block_id: "block-1",
        title: "Logo",
        layer_type: "logo_bug",
        start_time_seconds: 36300,
        duration_seconds: 1740,
        z_index: 10,
        position: "top_right",
        enabled: true
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08/blocks/block-1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
  })

  it("error path: throws when supabase insert fails", async () => {
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Layer insert failed") }).then(resolve)
    )

    await expect(
      createScheduledLayer({
        date: "2026-05-08",
        blockId: "block-1",
        title: "Layer",
        layerType: "overlay",
        startTime: "10:00:00",
        durationSeconds: 60,
        zIndex: 5,
        position: "fullscreen"
      })
    ).rejects.toThrow("Layer insert failed")
  })
})

// ---------------------------------------------------------------------------
// setScheduledLayerEnabled
// ---------------------------------------------------------------------------
describe("setScheduledLayerEnabled", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: enables a layer", async () => {
    await setScheduledLayerEnabled({
      date: "2026-05-08",
      blockId: "block-1",
      layerId: "layer-1",
      enabled: true
    })

    expect(supabaseMock.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
    expect(supabaseMock.eq).toHaveBeenCalledWith("id", "layer-1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08/blocks/block-1")
  })

  it("happy path: disables a layer", async () => {
    await setScheduledLayerEnabled({
      date: "2026-05-08",
      blockId: "block-1",
      layerId: "layer-1",
      enabled: false
    })

    expect(supabaseMock.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it("error path: throws when supabase update fails", async () => {
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Layer update failed") }).then(resolve)
    )

    await expect(
      setScheduledLayerEnabled({ date: "2026-05-08", blockId: "b", layerId: "l", enabled: true })
    ).rejects.toThrow("Layer update failed")
  })
})

// ---------------------------------------------------------------------------
// createLowerThirdLayer
// ---------------------------------------------------------------------------
describe("createLowerThirdLayer", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: creates slide then schedules layer of type lower_third", async () => {
    // .insert(...).select(...).single() must return a slide id
    supabaseMock.setResult({ data: { id: "slide-new" }, error: null })

    await createLowerThirdLayer({
      date: "2026-05-08",
      blockId: "block-1",
      title: "Ticker",
      primaryText: "BTC $100k",
      secondaryText: "24h change +5%",
      startTime: "10:00:00",
      durationSeconds: 30
    })

    // First insert must target slide_assets
    expect(supabaseMock.from).toHaveBeenCalledWith("slide_assets")
    // Audit + scheduled_layers insert follows
    expect(supabaseMock.from).toHaveBeenCalledWith("scheduled_layers")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/slides")
  })

  it("error path: throws when slide insert fails", async () => {
    supabaseMock.setResult({ data: null, error: new Error("Slide create failed") })

    await expect(
      createLowerThirdLayer({
        date: "2026-05-08",
        blockId: "block-1",
        title: "Ticker",
        primaryText: "Test",
        startTime: "10:00:00",
        durationSeconds: 30
      })
    ).rejects.toThrow("Slide create failed")
  })
})

// ---------------------------------------------------------------------------
// createMediaAsset
// ---------------------------------------------------------------------------
describe("createMediaAsset", () => {
  beforeEach(async () => {
    await resetMocks()
  })

  it("happy path: inserts media_assets and revalidates /admin/assets", async () => {
    supabaseMock.setResult({ data: { id: "asset-1" }, error: null })

    await createMediaAsset({
      title: "Roxom Intro",
      sourceType: "vimeo",
      mediaKind: "video",
      assetType: "video",
      url: "https://vimeo.com/1234",
      durationSeconds: 120
    })

    expect(supabaseMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Roxom Intro",
        source_type: "vimeo",
        media_kind: "video",
        asset_type: "video",
        duration_seconds: 120,
        status: "ready"
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/assets")
  })

  it("validation: throws for ad assets longer than 300s", async () => {
    await expect(
      createMediaAsset({
        title: "Long Ad",
        sourceType: "remote_mp4",
        mediaKind: "video",
        assetType: "ad",
        durationSeconds: 400
      })
    ).rejects.toThrow("300 seconds")
  })

  it("error path: throws when supabase insert fails", async () => {
    supabaseMock.setResult({ data: null, error: new Error("Media insert failed") })

    await expect(
      createMediaAsset({
        title: "Asset",
        sourceType: "vimeo",
        mediaKind: "video",
        assetType: "video"
      })
    ).rejects.toThrow("Media insert failed")
  })
})

// ---------------------------------------------------------------------------
// updateMediaAsset
// ---------------------------------------------------------------------------
describe("updateMediaAsset", () => {
  const baseInput = {
    id: "asset-1",
    title: "Updated Asset",
    sourceType: "vimeo",
    mediaKind: "video" as const,
    assetType: "video" as const,
    status: "ready",
    durationSeconds: 180
  }

  beforeEach(async () => {
    await resetMocks()
    // The first supabase call fetches current metadata via .select().eq().single()
    supabaseMock.setResult({ data: { metadata: { orientation: "horizontal" } }, error: null })
  })

  it("happy path: updates asset and derives orientation metadata", async () => {
    // First single() call returns current asset; subsequent await (update) resolves cleanly
    let singleCallCount = 0
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
      singleCallCount += 1
      if (singleCallCount === 1) {
        return Promise.resolve({ data: { metadata: { orientation: "horizontal" } }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
    )

    await updateMediaAsset({ ...baseInput, orientation: "vertical" })

    expect(supabaseMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated Asset",
        metadata: expect.objectContaining({
          orientation: "vertical",
          presentation: "vertical_blur",
          background: "blur"
        })
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/assets")
  })

  it("happy path: revalidates additional paths when provided", async () => {
    let singleCallCount = 0
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
      singleCallCount += 1
      if (singleCallCount === 1) {
        return Promise.resolve({ data: { metadata: {} }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
    )

    await updateMediaAsset({
      ...baseInput,
      revalidatePaths: ["/admin/schedule/2026-05-08", "/admin/calendar"]
    })

    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule/2026-05-08")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/calendar")
  })

  it("error path: throws when id is missing", async () => {
    await expect(updateMediaAsset({ ...baseInput, id: "" })).rejects.toThrow("Asset missing")
  })

  it("error path: throws for ad > 300s", async () => {
    await expect(
      updateMediaAsset({ ...baseInput, assetType: "ad", durationSeconds: 400 })
    ).rejects.toThrow("300 seconds")
  })

  it("error path: throws when fetching current asset fails", async () => {
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ data: null, error: new Error("Fetch asset failed") })
    )

    await expect(updateMediaAsset(baseInput)).rejects.toThrow("Fetch asset failed")
  })

  it("error path: throws when update fails", async () => {
    ;(supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ data: { metadata: {} }, error: null })
    )
    ;(supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
      (resolve: (value: MockResult) => void) =>
        Promise.resolve({ data: null, error: new Error("Update asset failed") }).then(resolve)
    )

    await expect(updateMediaAsset(baseInput)).rejects.toThrow("Update asset failed")
  })
})
