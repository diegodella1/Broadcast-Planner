import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { VideoSlide, type VideoSlideProps } from "./VideoSlide"

import type { VideoSlideData } from "@/lib/slides/types"

// HTMLVideoElement.play is not implemented in jsdom — stub it to avoid unhandled rejection.
Object.defineProperty(HTMLVideoElement.prototype, "play", {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined)
})
Object.defineProperty(HTMLVideoElement.prototype, "load", {
  writable: true,
  value: vi.fn()
})
Object.defineProperty(HTMLVideoElement.prototype, "pause", {
  writable: true,
  value: vi.fn()
})

const baseData: VideoSlideData = {
  videoUrl: "https://example.com/video.mp4",
  loopCount: 3
}

describe("VideoSlide", () => {
  it("renders a video element with the provided src", () => {
    const props: VideoSlideProps = { data: baseData }
    const { container } = render(<VideoSlide {...props} />)
    const video = container.querySelector("video")
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute("src", "https://example.com/video.mp4")
  })

  it("renders without crashing when loopCount is null (infinite loop mode)", () => {
    const props: VideoSlideProps = {
      data: { ...baseData, loopCount: null }
    }
    const { container } = render(<VideoSlide {...props} />)
    expect(container.querySelector("video")).toBeInTheDocument()
  })
})
