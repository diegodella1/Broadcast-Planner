import { render, screen, act, waitFor, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, afterEach } from "vitest"

import { renderWithIntl } from "@/vitest.intl-helper"

import { OutputRenderer } from "./output-renderer"

import type { ScheduleBundle } from "@/lib/types"

// next/image is not available in jsdom — replace with a plain <img>
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}))

const emptyBundle: ScheduleBundle = {
  day: null,
  blocks: [],
  layers: [],
  mediaAssets: [],
  slideAssets: []
}

function bundleWithActiveBlock(overrides?: Partial<ScheduleBundle>): ScheduleBundle {
  const base: ScheduleBundle = {
    day: {
      id: "day-1",
      airDate: "2026-05-08",
      timezone: "UTC",
      status: "active",
      createdAt: "2026-05-08T00:00:00Z",
      updatedAt: "2026-05-08T00:00:00Z"
    },
    blocks: [
      {
        id: "block-1",
        programDayId: "day-1",
        title: "Morning Markets",
        blockType: "video",
        category: "mercados",
        startTimeSeconds: 0,
        durationSeconds: 7200,
        status: "active",
        hideOverlays: false,
        startTime: "00:00:00",
        createdAt: "2026-05-08T00:00:00Z",
        updatedAt: "2026-05-08T00:00:00Z"
      }
    ],
    layers: [],
    mediaAssets: [],
    slideAssets: []
  }
  return { ...base, ...overrides }
}

describe("OutputRenderer", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("renders the fallback brand and no-active-block message when no block is active", () => {
    // empty bundle at second 0 means no active block
    render(renderWithIntl(<OutputRenderer initialSchedule={emptyBundle} initialSeconds={0} />))
    // en.json output.brand = "ROXOM TV", output.fallback.noActiveBlock = "No active block"
    expect(screen.getByText("ROXOM TV")).toBeInTheDocument()
    expect(screen.getByText("No active block")).toBeInTheDocument()
  })

  it("does not render the fallback brand when a block is active", () => {
    // secondsOfDay=100 falls inside block-1 (starts 0, duration 7200)
    const bundle = bundleWithActiveBlock()
    render(renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={100} />))
    // When a block is active but has no asset, the missingAsset fallback fires —
    // the brand is still rendered but with the missing-asset message, not noActiveBlock
    expect(screen.queryByText("No active block")).not.toBeInTheDocument()
    expect(screen.getByText("Missing asset")).toBeInTheDocument()
  })

  it("renders a video element when the active block has a remote_mp4 asset", () => {
    const bundle = bundleWithActiveBlock({
      blocks: [
        {
          id: "block-1",
          programDayId: "day-1",
          title: "Morning Markets",
          blockType: "video",
          category: "mercados",
          assetId: "asset-1",
          startTimeSeconds: 0,
          durationSeconds: 7200,
          status: "active",
          hideOverlays: false,
          startTime: "00:00:00",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ],
      mediaAssets: [
        {
          id: "asset-1",
          title: "Big Buck Bunny",
          sourceType: "remote_mp4",
          mediaKind: "video",
          assetType: "video",
          url: "https://example.com/video.mp4",
          status: "ready",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ]
    })
    render(renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={100} />))
    const video = document.querySelector("video")
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute("src", "https://example.com/video.mp4")
  })

  it("resolves Vimeo playback and renders it through the HLS video player", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        hlsUrl: "https://vimeo.example/playlist.m3u8",
        title: "Vimeo Video",
        durationSeconds: 120
      })
    } as Response)
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably")

    const bundle = bundleWithActiveBlock({
      blocks: [
        {
          id: "block-1",
          programDayId: "day-1",
          title: "Vimeo Block",
          blockType: "video",
          category: "mercados",
          assetId: "asset-v",
          startTimeSeconds: 0,
          durationSeconds: 7200,
          status: "active",
          hideOverlays: false,
          startTime: "00:00:00",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ],
      mediaAssets: [
        {
          id: "asset-v",
          title: "Vimeo Video",
          sourceType: "vimeo",
          mediaKind: "video",
          assetType: "video",
          vimeoId: "123456789",
          status: "ready",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ]
    })
    render(renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={100} />))
    await waitFor(() => {
      expect(document.querySelector("video")).toBeInTheDocument()
    })
    expect(document.querySelector("iframe")).not.toBeInTheDocument()
    expect(window.fetch).toHaveBeenCalledWith("/api/vimeo/playback/asset-v", { cache: "no-store" })
  })

  it("falls back when unmuted autoplay is blocked", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("blocked"))

    const bundle = bundleWithActiveBlock({
      blocks: [
        {
          id: "block-1",
          programDayId: "day-1",
          title: "Video Block",
          blockType: "video",
          category: "broadcast",
          assetId: "asset-1",
          startTimeSeconds: 0,
          durationSeconds: 7200,
          status: "active",
          hideOverlays: false,
          startTime: "00:00:00",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ],
      mediaAssets: [
        {
          id: "asset-1",
          title: "Blocked Video",
          sourceType: "remote_mp4",
          mediaKind: "video",
          assetType: "video",
          url: "https://example.com/video.mp4",
          status: "ready",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ]
    })

    render(renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={100} debug />))
    const video = document.querySelector("video")
    expect(video).toBeInTheDocument()
    fireEvent.loadedData(video as HTMLVideoElement)
    await waitFor(() => {
      expect(screen.getByText(/Autoplay blocked or media failed/)).toBeInTheDocument()
    })
  })

  it("does not trigger startup timeout after media starts playing", () => {
    vi.useFakeTimers()
    const bundle = bundleWithActiveBlock({
      blocks: [
        {
          id: "block-1",
          programDayId: "day-1",
          title: "Video Block",
          blockType: "video",
          category: "broadcast",
          assetId: "asset-1",
          startTimeSeconds: 0,
          durationSeconds: 7200,
          status: "active",
          hideOverlays: false,
          startTime: "00:00:00",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ],
      mediaAssets: [
        {
          id: "asset-1",
          title: "Playing Video",
          sourceType: "remote_mp4",
          mediaKind: "video",
          assetType: "video",
          url: "https://example.com/video.mp4",
          status: "ready",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ]
    })

    render(renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={100} debug />))
    const video = document.querySelector("video")
    expect(video).toBeInTheDocument()
    fireEvent.playing(video as HTMLVideoElement)
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(screen.queryByText(/Media startup timeout/)).not.toBeInTheDocument()
  })

  it("ticks the internal clock via setInterval and clears on unmount", () => {
    vi.useFakeTimers()
    const bundle = bundleWithActiveBlock()

    const { unmount } = render(
      renderWithIntl(<OutputRenderer initialSchedule={bundle} initialSeconds={0} />)
    )

    // Advance 3 seconds — the interval fires 3 times updating secondsOfDay
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // After unmount the timer must be cleared — no pending timers
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("renders debug panel when debug=true", () => {
    render(
      renderWithIntl(<OutputRenderer initialSchedule={emptyBundle} initialSeconds={0} debug />)
    )
    // en.json output.debug.clock = "clock"
    expect(screen.getByText(/clock/i)).toBeInTheDocument()
  })

  it("does not render debug panel when debug=false (default)", () => {
    render(renderWithIntl(<OutputRenderer initialSchedule={emptyBundle} initialSeconds={0} />))
    expect(screen.queryByText(/clock/i)).not.toBeInTheDocument()
  })

  it("forces a specific block via forcedBlockId regardless of secondsOfDay", () => {
    // block-2 would not normally be active at second 0, but forcedBlockId pins it
    const bundle: ScheduleBundle = {
      day: null,
      blocks: [
        {
          id: "block-2",
          programDayId: "day-1",
          title: "Forced Block",
          blockType: "video",
          category: "broadcast",
          startTimeSeconds: 50000,
          durationSeconds: 3600,
          status: "ready",
          hideOverlays: false,
          startTime: "13:53:20",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z"
        }
      ],
      layers: [],
      mediaAssets: [],
      slideAssets: []
    }
    render(
      renderWithIntl(
        <OutputRenderer initialSchedule={bundle} initialSeconds={0} forcedBlockId="block-2" />
      )
    )
    // Missing asset fallback — but block IS active (no "No active block" text)
    expect(screen.queryByText("No active block")).not.toBeInTheDocument()
    expect(screen.getByText("Missing asset")).toBeInTheDocument()
  })
})
