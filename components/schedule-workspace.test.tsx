import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScheduleWorkspace } from "./schedule-workspace"

import type { MediaAsset, ProgramBlock, ScheduleBundle } from "@/lib/types"

describe("ScheduleWorkspace", () => {
  it("opens in full-day calendar mode for an empty schedule", () => {
    renderWorkspace({ blocks: [] })

    expect(screen.getByText("Full-day calendar · America/Los_Angeles")).toBeInTheDocument()
    expect(screen.getByText("Empty day. Click any time slot to add a block.")).toBeInTheDocument()
    expect(screen.getByText("00:00")).toBeInTheDocument()
    expect(screen.getByText("23:00")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Choose content and time" })).toBeInTheDocument()
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

    expect(screen.getByLabelText("Start")).toHaveValue("06:00:00")
  })

  it("keeps rundown tab available for existing blocks", () => {
    renderWorkspace({ blocks: [block] })

    fireEvent.click(screen.getByRole("button", { name: /Rundown/i }))

    expect(screen.getByText("A")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Calendar/i })).toBeInTheDocument()
  })
})

function renderWorkspace({ blocks }: { blocks: ProgramBlock[] }) {
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
  slideAssets: []
}
