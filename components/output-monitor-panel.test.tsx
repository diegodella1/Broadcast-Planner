import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OutputMonitorPanel } from "./output-monitor-panel"

const writeText = vi.fn()

describe("OutputMonitorPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    })
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/output/hls") {
        return jsonResponse({
          playlistUrl: "https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token",
          hlsUrl: "https://player.vimeo.test/live.m3u8",
          startOffsetSeconds: 1800
        })
      }
      return jsonResponse(initialPayload)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("copies the VLC playlist URL instead of the raw HLS URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    })
    render(<OutputMonitorPanel initial={initialPayload} />)

    await user.click(screen.getByRole("button", { name: "Copy VLC playlist link" }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://rtvtime.example/api/output/hls/playlist.m3u?token=output-token"
      )
    )
    expect(screen.getByText("Copied. Opens at current block time.")).toBeInTheDocument()
  })
})

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}

const initialPayload = {
  generatedAt: "2026-05-15T14:30:00Z",
  timezone: "America/Los_Angeles",
  serverSeconds: 27000,
  day: { airDate: "2026-05-15", status: "active" },
  block: {
    title: "Roxom Report",
    status: "ready",
    elapsedInBlock: 1800,
    durationSeconds: 3600
  },
  asset: {
    id: "asset-vimeo",
    title: "Roxom Report",
    sourceType: "vimeo",
    status: "ready",
    lifecycleState: "reviewed",
    playbackReadinessStatus: "ready",
    playbackError: null
  },
  fallback: null,
  fallbackReason: null,
  mediaError: null
}
