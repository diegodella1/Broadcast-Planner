import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScheduleWorkspace } from "./schedule-workspace"

import type { MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from "@/lib/types"

describe("ScheduleWorkspace", () => {
  it("opens in full-day calendar mode for an empty schedule", () => {
    renderWorkspace({ blocks: [] })

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    expect(
      screen.getByText("Click a time or fallback gap to add content · America/Los_Angeles")
    ).toBeInTheDocument()
    expect(screen.getByText("Empty day. Click any time slot to add a block.")).toBeInTheDocument()
    expect(screen.getByText("00:00")).toBeInTheDocument()
    expect(screen.getByText("23:00")).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: /Fallback loop plays here/i }).length
    ).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Add content to the day" })).toBeInTheDocument()
  })

  it("prefills add block start time from clicked calendar slot", () => {
    renderWorkspace({ blocks: [] })
    const canvas = screen.getByTestId("calendar-schedule-canvas")
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 1728,
      top: 0,
      right: 400,
      bottom: 1728,
      left: 0,
      toJSON: () => ({})
    })

    fireEvent.click(canvas, { clientY: 432 })

    expect(
      screen
        .getAllByLabelText("Starts at")
        .some((input) => (input as HTMLInputElement).value === "06:00:00")
    ).toBe(true)
  })

  it("keeps rundown controls available for existing blocks", () => {
    renderWorkspace({ blocks: [block] })

    expect(screen.getByText("Rundown Controls")).toBeInTheDocument()
    expect(screen.getAllByText("A").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Edit A" })).toBeInTheDocument()
  })

  it("highlights and announces the newly created block", () => {
    Element.prototype.scrollIntoView = vi.fn()
    renderWorkspace({ blocks: [block], createdBlockId: block.id })

    expect(screen.getByText("Block Added")).toBeInTheDocument()
    expect(screen.getAllByText("01:00 SF → 01:15 SF").length).toBeGreaterThan(0)
    expect(screen.getAllByText("15 min").length).toBeGreaterThan(0)
    expect(screen.getByText("New")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "New block: A, 01:00 SF → 01:15 SF" })
    ).toBeInTheDocument()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it("opens add drawer when the page action targets #add-block", () => {
    renderWorkspace({ blocks: [block] })

    expect(screen.getByText("Select a block")).toBeInTheDocument()

    window.location.hash = "#add-block"
    fireEvent(window, new HashChangeEvent("hashchange"))

    expect(screen.getByRole("heading", { name: "Add content to the day" })).toBeInTheDocument()
  })

  it("shows bulk card loop controls for ready slides", () => {
    renderWorkspace({ blocks: [] })

    expect(screen.getByText("Bulk Cards")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create loop" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Add card" }))

    expect(screen.getAllByLabelText("Card")).toHaveLength(2)
  })
})

function renderWorkspace({
  blocks,
  createdBlockId
}: {
  blocks: ProgramBlock[]
  createdBlockId?: string
}) {
  window.history.replaceState(null, "", "/admin/schedule/2026-05-08")
  const schedule = { ...baseSchedule, blocks }
  return render(
    <ScheduleWorkspace
      date="2026-05-08"
      schedule={schedule}
      blocks={blocks}
      createAction={vi.fn()}
      updateAction={vi.fn()}
      reorderAction={vi.fn()}
      resizeAction={vi.fn()}
      duplicateAction={vi.fn()}
      archiveAction={vi.fn()}
      bulkCreateAction={vi.fn()}
      createdBlockId={createdBlockId}
    />
  )
}

const asset: MediaAsset = {
  id: "asset-1",
  title: "Ready Video",
  description: null,
  sourceType: "remote_mp4",
  mediaKind: "video",
  assetType: "video",
  url: "https://example.com/video.mp4",
  storagePath: null,
  durationSeconds: 60,
  status: "ready",
  thumbnailUrl: null,
  vimeoId: null,
  vimeoUri: null,
  playbackReadinessStatus: "ready",
  playbackError: null,
  lifecycleState: "reviewed",
  createdAt: "",
  updatedAt: ""
}

const block: ProgramBlock = {
  id: "block-1",
  programDayId: "day-1",
  title: "A",
  blockType: "video",
  category: "broadcast",
  assetId: asset.id,
  slideId: null,
  startTime: "01:00:00",
  startTimeSeconds: 3600,
  durationSeconds: 900,
  status: "ready",
  hideOverlays: false,
  fallbackAssetId: null,
  notes: null,
  metadata: {},
  createdAt: "",
  updatedAt: ""
}

const baseSchedule: ScheduleBundle = {
  day: {
    id: "day-1",
    airDate: "2026-05-08",
    timezone: "America/Los_Angeles",
    status: "draft",
    title: "Programming 2026-05-08",
    notes: null,
    fallbackAssetId: null,
    createdAt: "",
    updatedAt: ""
  },
  blocks: [],
  layers: [],
  mediaAssets: [asset],
  slideAssets: [
    {
      id: "slide-1",
      title: "Markets Card",
      slideType: "template",
      content: null,
      imageUrl: null,
      htmlContent: null,
      templateId: "markets",
      defaultDurationSeconds: 30,
      status: "ready",
      metadata: null,
      createdAt: "",
      updatedAt: ""
    } satisfies SlideAsset
  ]
}
