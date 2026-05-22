import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AgendaBlockForm } from "./agenda-block-form"

import type { ScheduleBundle } from "@/lib/types"

describe("AgendaBlockForm", () => {
  it("uses known asset duration and shows calculated end time", () => {
    render(<AgendaBlockForm schedule={schedule()} action={vi.fn()} />)

    expect(screen.getByLabelText("Duration")).toHaveValue(120)
    expect(screen.getByText("Ends")).toBeInTheDocument()
    expect(screen.getByText("00:02 SF")).toBeInTheDocument()
    expect(screen.getByText("Automatic duration: 00:02:00")).toBeInTheDocument()
  })

  it("lets operator enter duration when selected content has no known duration", async () => {
    const user = userEvent.setup()
    render(<AgendaBlockForm schedule={schedule()} action={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText("1. Type"), "slide")
    await user.selectOptions(screen.getByLabelText("Content"), "slide:slide-1")

    expect(screen.getByLabelText("Duration")).toHaveValue(30)
    expect(screen.queryByLabelText("Vimeo Show")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View Slide" })).toHaveAttribute(
      "href",
      "/output/slide/slide-1"
    )
    expect(
      screen.getByText("This content has no duration. Set how many seconds it stays on air.")
    ).toBeInTheDocument()
  })

  it("blocks save when the selected slot overlaps another block", async () => {
    const user = userEvent.setup()
    render(<AgendaBlockForm schedule={schedule({ withConflict: true })} action={vi.fn()} />)

    await user.clear(screen.getByLabelText("3. Clock start (24 h)"))
    await user.type(screen.getByLabelText("3. Clock start (24 h)"), "00:10:00")

    expect(screen.getByRole("button", { name: "Save to schedule" })).toBeDisabled()
    expect(screen.getByText("That time is already occupied")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Use 00:12 SF" })).toBeInTheDocument()
  })

  it("filters ready schedule content by Vimeo show", async () => {
    const user = userEvent.setup()
    render(<AgendaBlockForm schedule={schedule()} action={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText("Vimeo Show"), "Market Wrap")

    expect(screen.getByLabelText("Content")).toHaveDisplayValue(
      "Z Market episode - Market Wrap / video / vimeo / 00:03:00"
    )
    expect(screen.queryByRole("option", { name: /Z Other episode/ })).not.toBeInTheDocument()
    expect(screen.getByText("Showing 1 of 4 ready items")).toBeInTheDocument()
  })
})

function schedule({ withConflict = false }: { withConflict?: boolean } = {}): ScheduleBundle {
  return {
    day: {
      id: "day-1",
      airDate: "2026-05-14",
      timezone: "America/Los_Angeles",
      status: "draft",
      title: "Programming 2026-05-14",
      notes: null,
      fallbackAssetId: null,
      createdAt: "",
      updatedAt: ""
    },
    blocks: withConflict
      ? [
          {
            id: "existing",
            programDayId: "day-1",
            title: "Existing block",
            blockType: "video",
            category: "broadcast",
            assetId: null,
            slideId: null,
            startTime: "00:10:00",
            startTimeSeconds: 600,
            durationSeconds: 120,
            status: "ready",
            hideOverlays: false,
            fallbackAssetId: null,
            notes: null,
            createdAt: "",
            updatedAt: ""
          }
        ]
      : [],
    layers: [],
    mediaAssets: [
      {
        id: "asset-1",
        title: "Morning video",
        sourceType: "remote_mp4",
        mediaKind: "video",
        assetType: "video",
        url: "https://example.com/video.mp4",
        thumbnailUrl: null,
        durationSeconds: 120,
        status: "ready",
        lifecycleState: "reviewed",
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "asset-2",
        title: "Z Market episode",
        sourceType: "vimeo",
        mediaKind: "video",
        assetType: "video",
        url: "https://vimeo.com/1",
        thumbnailUrl: null,
        durationSeconds: 180,
        status: "ready",
        lifecycleState: "reviewed",
        metadata: {
          vimeo_show_name: "Market Wrap",
          vimeo_created_time: "2025-07-01T00:00:00Z"
        },
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "asset-3",
        title: "Z Other episode",
        sourceType: "vimeo",
        mediaKind: "video",
        assetType: "video",
        url: "https://vimeo.com/2",
        thumbnailUrl: null,
        durationSeconds: 180,
        status: "ready",
        lifecycleState: "reviewed",
        metadata: {
          vimeo_show_name: "Other Show",
          vimeo_created_time: "2025-07-02T00:00:00Z"
        },
        createdAt: "",
        updatedAt: ""
      }
    ],
    slideAssets: [
      {
        id: "slide-1",
        title: "Manual slide",
        slideType: "html",
        htmlContent: "<p>Slide</p>",
        defaultDurationSeconds: null,
        status: "ready",
        createdAt: "",
        updatedAt: ""
      }
    ]
  }
}
