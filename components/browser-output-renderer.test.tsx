import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BrowserOutputRenderer } from "./browser-output-renderer"

vi.mock("hls.js", () => ({
  default: class MockHls {
    static isSupported() {
      return false
    }
    static Events = { ERROR: "error" }
    on() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
}))

describe("BrowserOutputRenderer", () => {
  const play = vi.fn().mockResolvedValue(undefined)
  const pause = vi.fn()
  const load = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.resetAllMocks()
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(play)
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(pause)
    vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(load)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("keeps output armed across an empty gap and auto-plays the next video", async () => {
    const states = [videoState("a", "First"), fallbackState, videoState("b", "Second")]
    global.fetch = vi.fn(async () => jsonResponse(states.shift() ?? videoState("b", "Second")))

    render(<BrowserOutputRenderer debug token="token" />)

    await screen.findByText("Browser output ready")
    fireEvent.click(screen.getByRole("button", { name: /Start Output/i }))

    const video = document.querySelector("video")!
    fireEvent.loadedMetadata(video)
    await waitFor(() => expect(play).toHaveBeenCalled())
    const playsBeforeGap = play.mock.calls.length
    const pausesBeforeGap = pause.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(pause.mock.calls.length).toBeGreaterThan(pausesBeforeGap)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await waitFor(() => expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(3))
    fireEvent.loadedMetadata(video)

    await waitFor(() => expect(play.mock.calls.length).toBeGreaterThan(playsBeforeGap))
    expect(screen.queryByRole("button", { name: /Start Output/i })).not.toBeInTheDocument()
  }, 10000)

  it("plays fallback loop video muted when the state requests it", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        ...videoState("fallback", "Fallback loop"),
        signature: "fallback-loop:asset-fallback",
        reason: "no-active-block",
        muted: true,
        loop: true
      })
    )

    render(<BrowserOutputRenderer token="token" />)

    await screen.findByText("Browser output ready")
    const video = document.querySelector("video")!
    await waitFor(() => expect(video.muted).toBe(true))
    expect(video.loop).toBe(true)
  })
})

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}

function videoState(id: string, title: string) {
  return {
    kind: "mp4",
    signature: `mp4:${id}`,
    blockId: `block-${id}`,
    assetId: `asset-${id}`,
    title,
    url: `https://example.com/${id}.mp4`,
    startOffsetSeconds: 0,
    durationSeconds: 60,
    serverSeconds: 0,
    generatedAt: new Date().toISOString(),
    backgroundMusic: null
  }
}

const fallbackState = {
  kind: "fallback",
  signature: "fallback:no-active-block",
  reason: "no-active-block",
  title: "RTV fallback",
  serverSeconds: 0,
  generatedAt: new Date().toISOString(),
  backgroundMusic: null
}
