import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AgendaBlockForm } from "./agenda-block-form"

import type { ScheduleBundle } from "@/lib/types"

describe("AgendaBlockForm", () => {
  it("uses known asset duration and shows calculated end time", () => {
    render(<AgendaBlockForm schedule={schedule()} action={vi.fn()} />)

    expect(screen.getByLabelText("Duración")).toHaveValue(120)
    expect(screen.getByText("Finaliza")).toBeInTheDocument()
    expect(screen.getByText("00:02 SF")).toBeInTheDocument()
    expect(screen.getByText("Duración automática: 00:02:00")).toBeInTheDocument()
  })

  it("lets operator enter duration when selected content has no known duration", async () => {
    const user = userEvent.setup()
    render(<AgendaBlockForm schedule={schedule()} action={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText("Contenido"), "slide:slide-1")

    expect(screen.getByLabelText("Duración")).toHaveValue(30)
    expect(
      screen.getByText("Este contenido no trae duración. Definí cuántos segundos queda al aire.")
    ).toBeInTheDocument()
  })

  it("blocks save when the selected slot overlaps another block", async () => {
    const user = userEvent.setup()
    render(<AgendaBlockForm schedule={schedule({ withConflict: true })} action={vi.fn()} />)

    await user.clear(screen.getByLabelText("Inicio"))
    await user.type(screen.getByLabelText("Inicio"), "00:10:00")

    expect(screen.getByRole("button", { name: "Guardar en programación" })).toBeDisabled()
    expect(screen.getByText("Ese horario ya está ocupado")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Usar 00:12 SF" })).toBeInTheDocument()
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
